#Requires -Version 7.0
[CmdletBinding()]
param(
    [string]$UploadUri = 'https://aia.example.com/api/v1/crls',
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

function Convert-CrlToPem {
    param([Parameter(Mandatory)][string]$Path)
    $head = Get-Content -LiteralPath $Path -TotalCount 2 -ErrorAction Stop
    if ($head -match '-----BEGIN\s+X509\s+CRL-----') {
        return (Get-Content -Raw -LiteralPath $Path -Encoding ASCII)
    }
    $tmp = [System.IO.Path]::GetTempFileName()
    try {
        & certutil.exe -f -encode $Path $tmp | Out-Null
        if ($LASTEXITCODE -ne 0) { throw "certutil -encode failed: $Path" }
        Get-Content -Raw -LiteralPath $tmp -Encoding ASCII
    } finally { Remove-Item -LiteralPath $tmp -ErrorAction SilentlyContinue }
}

function Invoke-PostJsonPermissive {
    param([Parameter(Mandatory)][string]$Uri,
          [Parameter(Mandatory)][string]$Body,
          [int]$TimeoutSec = 60)
    $irm = Get-Command Invoke-RestMethod -ErrorAction SilentlyContinue
    if ($irm -and $irm.Parameters.ContainsKey('SkipHttpErrorCheck')) {
        return Invoke-RestMethod -Method Post -Uri $Uri -ContentType 'text/plain' -Body $Body -TimeoutSec $TimeoutSec -SkipHttpErrorCheck
    }
    try {
        return Invoke-RestMethod -Method Post -Uri $Uri -ContentType 'text/plain' -Body $Body -TimeoutSec $TimeoutSec
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
    foreach ($pat in @('*.crl','*.pem')) {
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
            $pem = Convert-CrlToPem -Path $f.FullName
            Write-Log INFO ("Uploading: {0}" -f $f.Name)
            $resp = Invoke-PostJsonPermissive -Uri $UploadUri -Body $pem -TimeoutSec 60
            $json = ($resp | ConvertTo-Json -Depth 8)
            if ($resp.status -eq 'ok' -or $resp.stored -or $resp.byAki) {
                Write-Log SUCCESS "Upstream response: $json"
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
