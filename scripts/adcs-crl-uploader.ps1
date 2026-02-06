#Requires -Version 7.0
[CmdletBinding()]
param(
    [string]$UploadUri = 'https://aia.example.com/api/v2/crls',
    [string]$SourceDir = 'C:\ProgramData\PKI\crl-uploader\CertEnroll',
    [string]$LogPath   = 'C:\ProgramData\PKI\crl-uploader\upload.log'
)

$ErrorActionPreference = 'Stop'
$ProgressPreference    = 'SilentlyContinue'

# Logging
function Write-Log {
    param(
        [ValidateSet('INFO','WARN','ERROR','SUCCESS')][string]$Level='INFO',
        [Parameter(Mandatory)][string]$Message
    )
    $ts   = (Get-Date).ToString('yyyy-MM-dd HH:mm:ss.fffK')
    $line = "[$ts][$Level] $Message"
    try { New-Item -ItemType Directory -Path (Split-Path -Parent $LogPath) -Force | Out-Null } catch {}
    try { Add-Content -LiteralPath $LogPath -Value $line } catch {}
    $color = switch ($Level) {
        'WARN'    { 'Yellow' }
        'ERROR'   { 'Red'    }
        'SUCCESS' { 'Green'  }
        default   { 'White'  }
    }
    try { Write-Host $line -ForegroundColor $color } catch {}
}

# CRL helpers
function Test-CrlValid {
    param([Parameter(Mandatory)][string]$Path)
    & certutil.exe -dump $Path 2>$null | Out-Null
    return ($LASTEXITCODE -eq 0)
}

function Invoke-PostCrlFile {
    param([Parameter(Mandatory)][string]$Uri,
          [Parameter(Mandatory)][string]$FilePath,
          [int]$TimeoutSec = 60)
    
    $fileName = Split-Path -Leaf $FilePath
    $fileBytes = [System.IO.File]::ReadAllBytes($FilePath)
    $boundary = [System.Guid]::NewGuid().ToString()
    
    $bodyLines = @(
        "--$boundary",
        "Content-Disposition: form-data; name=`"crl`"; filename=`"$fileName`"",
        "Content-Type: application/octet-stream",
        "",
        [System.Text.Encoding]::Latin1.GetString($fileBytes),
        "--$boundary--"
    )
    
    $body = $bodyLines -join "`r`n"
    
    $irm = Get-Command Invoke-RestMethod -ErrorAction SilentlyContinue
    if ($irm -and $irm.Parameters.ContainsKey('SkipHttpErrorCheck')) {
        return Invoke-RestMethod -Method Post -Uri $Uri -ContentType "multipart/form-data; boundary=$boundary" -Body $body -TimeoutSec $TimeoutSec -SkipHttpErrorCheck
    }
    try {
        return Invoke-RestMethod -Method Post -Uri $Uri -ContentType "multipart/form-data; boundary=$boundary" -Body $body -TimeoutSec $TimeoutSec
    } catch {
        $resp = $_.Exception.Response
        if ($resp -and $resp.GetResponseStream) {
            $sr = New-Object System.IO.StreamReader($resp.GetResponseStream())
            $text = $sr.ReadToEnd()
            try { return ($text | ConvertFrom-Json) } catch { return @{ error = "Invalid JSON: $text" } }
        }
        throw
    }
}

# Main
try {
    New-Item -ItemType Directory -Path $SourceDir -Force | Out-Null
    Write-Log INFO ("Startup: UploadUri={0}; SourceDir={1}" -f $UploadUri, $SourceDir)

    $files = @()
    foreach ($pat in @('*.crl','*.dcrl')) {
        $files += Get-ChildItem -LiteralPath $SourceDir -Filter $pat -File -ErrorAction SilentlyContinue
    }
    if (-not $files) {
        Write-Log WARN "No CRL files found"
        return
    }

    foreach ($f in ($files | Sort-Object LastWriteTimeUtc)) {
        try {
            if (-not (Test-CrlValid -Path $f.FullName)) {
                Write-Log WARN ("Invalid CRL skipped: {0}" -f $f.Name)
                continue
            }
            Write-Log INFO ("Uploading: {0}" -f $f.Name)
            $resp = Invoke-PostCrlFile -Uri $UploadUri -FilePath $f.FullName -TimeoutSec 60
            $json = ($resp | ConvertTo-Json -Depth 8)
            if ($resp.data -and $resp.data.id) {
                Write-Log SUCCESS ("Upload successful - ID: {0}" -f $resp.data.id)
            } elseif ($resp.error) {
                Write-Log WARN ("Upload rejected - {0}: {1}" -f $resp.error.code, $resp.error.message)
            } else {
                Write-Log WARN "Upstream response: $json"
            }
        } catch {
            Write-Log ERROR ("{0}: {1}" -f $f.Name, $_.Exception.Message)
        }
    }
    Write-Log SUCCESS "Completed."
} catch {
    Write-Log ERROR $_.Exception.Message
    exit 1
}
