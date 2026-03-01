#Requires -Version 7.0
[CmdletBinding()]
param(
    [string]$UploadUri = 'https://aia.example.com/api/v2/crls',
    [string]$SourceDir = 'C:\ProgramData\PKI\crl-uploader\CertEnroll',
    [string]$LogPath = 'C:\ProgramData\PKI\crl-uploader\upload.log'
)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

# Logging
function Write-Log {
    param(
        [ValidateSet('INFO', 'WARN', 'ERROR', 'SUCCESS')][string]$Level = 'INFO',
        [Parameter(Mandatory)][string]$Message
    )
    $ts = (Get-Date).ToString('yyyy-MM-dd HH:mm:ss.fffK')
    $line = "[$ts][$Level] $Message"
    try { New-Item -ItemType Directory -Path (Split-Path -Parent $LogPath) -Force | Out-Null } catch {}
    try { Add-Content -LiteralPath $LogPath -Value $line } catch {}
    $color = switch ($Level) {
        'WARN' { 'Yellow' }
        'ERROR' { 'Red' }
        'SUCCESS' { 'Green' }
        default { 'White' }
    }
    try { Write-Host $line -ForegroundColor $color } catch {}
}

# CRL helpers
function Test-CrlValid {
    param([Parameter(Mandatory)][string]$Path)
    
    # Try using certutil on Windows if available
    $certutilPath = Get-Command certutil.exe -ErrorAction SilentlyContinue
    if ($certutilPath) {
        try {
            & certutil.exe -dump $Path 2>$null | Out-Null
            return ($LASTEXITCODE -eq 0)
        }
        catch {
            return $false
        }
    }
    
    # Fallback: validate the file has basic CRL structure
    try {
        $bytes = [System.IO.File]::ReadAllBytes($Path)
        if ($bytes.Length -lt 10) {
            return $false
        }
        
        # Check for DER or PEM signature
        # DER starts with SEQUENCE tag (0x30)
        # PEM starts with "-----BEGIN"
        if ($bytes[0] -eq 0x30) {
            # Valid DER CRL would have proper ASN.1 structure
            return $true
        }
        
        # Check for PEM
        $text = [System.Text.Encoding]::UTF8.GetString($bytes)
        if ($text.Contains('-----BEGIN X509 CRL-----') -and $text.Contains('-----END X509 CRL-----')) {
            return $true
        }
        
        return $false
    }
    catch {
        return $false
    }
}

function Detect-CrlFormat {
    param([Parameter(Mandatory)][byte[]]$Data,
        [Parameter(Mandatory)][string]$FileName)
    
    # Check filename extension first
    $lowerName = $FileName.ToLower()
    if ($lowerName.EndsWith('.pem')) {
        return 'pem'
    }
    
    # Try to detect PEM format from content
    try {
        $text = [System.Text.Encoding]::UTF8.GetString($Data)
        if ($text.Contains('-----BEGIN X509 CRL-----')) {
            return 'pem'
        }
    }
    catch {
        # If decoding fails, it's likely binary DER
    }
    
    # Default to DER for .crl and .der files
    return 'der'
}

function Invoke-PostCrlFile {
    param([Parameter(Mandatory)][string]$Uri,
        [Parameter(Mandatory)][string]$FilePath,
        [int]$TimeoutSec = 60)
    
    $fileName = Split-Path -Leaf $FilePath
    $fileBytes = [System.IO.File]::ReadAllBytes($FilePath)
    
    # Detect CRL format (PEM or DER)
    $crlFormat = Detect-CrlFormat -Data $fileBytes -FileName $fileName
    
    # Build multipart/form-data body with proper binary handling
    $boundary = [System.Guid]::NewGuid().ToString()
    $boundaryBytes = [System.Text.Encoding]::UTF8.GetBytes("--$boundary`r`n")
    $crlfBytes = [System.Text.Encoding]::UTF8.GetBytes("`r`n")
    
    # Content-Type for the file field (depends on detected format)
    $fileContentType = if ($crlFormat -eq 'pem') { 'text/plain' } else { 'application/octet-stream' }
    
    # Build the body as byte array for proper binary handling
    $memStream = New-Object System.IO.MemoryStream
    
    # First boundary
    $memStream.Write($boundaryBytes, 0, $boundaryBytes.Length)
    
    # Content-Disposition header
    $disposition = "Content-Disposition: form-data; name=`"crl`"; filename=`"$fileName`"`r`n"
    $dispBytes = [System.Text.Encoding]::UTF8.GetBytes($disposition)
    $memStream.Write($dispBytes, 0, $dispBytes.Length)
    
    # Content-Type header
    $contentTypeHeader = "Content-Type: $fileContentType`r`n"
    $ctBytes = [System.Text.Encoding]::UTF8.GetBytes($contentTypeHeader)
    $memStream.Write($ctBytes, 0, $ctBytes.Length)
    
    # Empty line to separate headers from content
    $memStream.Write($crlfBytes, 0, $crlfBytes.Length)
    
    # File content (binary data as-is)
    $memStream.Write($fileBytes, 0, $fileBytes.Length)
    
    # CRLF before closing boundary
    $memStream.Write($crlfBytes, 0, $crlfBytes.Length)
    
    # Closing boundary
    $closingBoundary = "--$boundary--`r`n"
    $closingBytes = [System.Text.Encoding]::UTF8.GetBytes($closingBoundary)
    $memStream.Write($closingBytes, 0, $closingBytes.Length)
    
    $memStream.Position = 0
    
    try {
        # Use Invoke-RestMethod with the byte stream as body
        $irm = Get-Command Invoke-RestMethod -ErrorAction SilentlyContinue
        
        $invokeParams = @{
            Method      = 'Post'
            Uri         = $Uri
            ContentType = "multipart/form-data; boundary=$boundary"
            Body        = $memStream.ToArray()
            TimeoutSec  = $TimeoutSec
        }
        
        if ($irm -and $irm.Parameters.ContainsKey('SkipHttpErrorCheck')) {
            $invokeParams['SkipHttpErrorCheck'] = $true
            $response = Invoke-RestMethod @invokeParams
        }
        else {
            $response = Invoke-RestMethod @invokeParams
        }
        
        return $response
    }
    catch {
        # Try to parse error response as JSON
        $resp = $_.Exception.Response
        if ($resp -and $resp.GetResponseStream) {
            try {
                $sr = New-Object System.IO.StreamReader($resp.GetResponseStream())
                $text = $sr.ReadToEnd()
                $sr.Dispose()
                try {
                    return ($text | ConvertFrom-Json)
                }
                catch {
                    return @{ error = @{ code = 'parse_error'; message = $text } }
                }
            }
            catch {}
        }
        throw
    }
    finally {
        $memStream.Dispose()
    }
}

# Main
try {
    New-Item -ItemType Directory -Path $SourceDir -Force | Out-Null
    Write-Log INFO ("Startup: UploadUri={0}; SourceDir={1}" -f $UploadUri, $SourceDir)

    $files = @()
    foreach ($pat in @('*.crl', '*.dcrl', '*.pem')) {
        $files += Get-ChildItem -LiteralPath $SourceDir -Filter $pat -File -ErrorAction SilentlyContinue
    }
    if (-not $files) {
        Write-Log WARN "No CRL files found"
        return
    }

    $successCount = 0
    $skipCount = 0
    $failCount = 0
    
    foreach ($f in ($files | Sort-Object LastWriteTimeUtc)) {
        try {
            # Skip PEM variants if we have the corresponding DER file
            if ($f.Name.EndsWith('.pem')) {
                $baseName = $f.Name -replace '\.pem$', ''
                if ($files | Where-Object { $_.Name -eq $baseName }) {
                    Write-Log INFO ("Skipping PEM variant: {0} (will upload as DER and auto-generate PEM)" -f $f.Name)
                    $skipCount++
                    continue
                }
            }
            
            if (-not (Test-CrlValid -Path $f.FullName)) {
                Write-Log WARN ("Invalid CRL skipped: {0}" -f $f.Name)
                $failCount++
                continue
            }
            
            $crlFormat = Detect-CrlFormat -Data ([System.IO.File]::ReadAllBytes($f.FullName)) -FileName $f.Name
            Write-Log INFO ("Uploading: {0} (Format: {1})" -f $f.Name, $crlFormat)
            
            $resp = Invoke-PostCrlFile -Uri $UploadUri -FilePath $f.FullName -TimeoutSec 60
            
            # Handle response
            if ($resp -is [object] -and $resp.data) {
                if ($resp.data.id) {
                    $id = $resp.data.id
                    $replaced = if ($resp.data.replaced) { " [replaced CRL #{0}]" -f $resp.data.replaced.crlNumber } else { "" }
                    Write-Log SUCCESS ("Upload successful - ID: {0}{1}" -f $id, $replaced)
                    $successCount++
                }
                else {
                    Write-Log WARN ("Upload response missing id: {0}" -f ($resp | ConvertTo-Json -Depth 2))
                    $failCount++
                }
            }
            elseif ($resp.error) {
                $errCode = if ($resp.error -is [object]) { $resp.error.code } else { 'unknown' }
                $errMsg = if ($resp.error -is [object]) { $resp.error.message } else { $resp.error }
                Write-Log WARN ("Upload rejected - {0}: {1}" -f $errCode, $errMsg)
                $failCount++
            }
            else {
                $json = ($resp | ConvertTo-Json -Depth 8)
                Write-Log WARN "Upstream response: $json"
                $failCount++
            }
        }
        catch {
            Write-Log ERROR ("{0}: {1}" -f $f.Name, $_.Exception.Message)
            $failCount++
        }
    }
    
    Write-Log SUCCESS ("Completed. Success: {0}, Skipped: {1}, Failed: {2}" -f $successCount, $skipCount, $failCount)
}
catch {
    Write-Log ERROR $_.Exception.Message
    exit 1
}
