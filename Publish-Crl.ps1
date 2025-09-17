<#
Watch a dedicated CRL folder, POST PEM CRL to Worker, and verify by fetching returned URLs.
- English-only messages
- Colored output: INFO=White, WARN=Yellow, ERROR=Red, SUCCESS=Green
- Skip delta CRLs
- Robust parsing of certutil -dump across locales/variants
- Treat 4xx/409 as valid responses; parse JSON anyway
#>

[CmdletBinding()]
param(
  [string]$UploadUri        = 'https://pki.acha.top/crl',
  [string]$BaseUri          = 'https://pki.acha.top/',
  [string]$WatchPath        = 'C:\ProgramData\AchaPKI\crl-uploader\CertEnroll',
  [string]$FilePattern      = '*.crl',
  [bool]  $ExcludeDelta     = $true,
  [string]$StatePath        = 'C:\ProgramData\AchaPKI\crl-uploader\state.json',
  [string]$LogPath          = 'C:\ProgramData\AchaPKI\crl-uploader\upload.log',
  [int]   $HeartbeatSeconds = 36000,                 # 0 = disabled
  [switch]$Once
)

$ErrorActionPreference = 'Stop'
$ProgressPreference    = 'SilentlyContinue'

function Ensure-Path { param([string]$Path)
  if (-not (Test-Path -LiteralPath $Path)) { New-Item -ItemType Directory -Path $Path -Force | Out-Null }
}

function Write-Log {
  param([ValidateSet('INFO','WARN','ERROR','SUCCESS')][string]$Level='INFO',[Parameter(Mandatory)][string]$Message)
  $ts = (Get-Date).ToString('yyyy-MM-dd HH:mm:ss.fffK')
  $line = "[$ts][$Level] $Message"
  Add-Content -LiteralPath $LogPath -Value $line
  $color = switch($Level){'WARN'{'Yellow'} 'ERROR'{'Red'} 'SUCCESS'{'Green'} default{'White'}}
  try { Write-Host $line -ForegroundColor $color } catch {}
}

function Load-State {
  if (Test-Path -LiteralPath $StatePath) { try { return Get-Content -Raw -LiteralPath $StatePath | ConvertFrom-Json } catch {} }
  [pscustomobject]@{ LastCrlNumber=$null; LastThisUpdate=$null }
}
function Save-State { param([object]$State) $State | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $StatePath -Encoding UTF8 }

function Wait-FileReady { param([string]$Path,[int]$Retries=20,[int]$DelayMs=500)
  for ($i=0;$i -lt $Retries;$i++){ try{ $fs=[System.IO.File]::Open($Path,'Open','Read','ReadWrite');$fs.Close();return $true }catch{ Start-Sleep -Milliseconds $DelayMs } }
  return $false
}

# Robust parsing for certutil -dump (handles "CRL Number: 05" or "CRL Number=05", "This Update:" or "ThisUpdate:")
function Get-CrlMeta {
  param([Parameter(Mandatory)][string]$CrlPath)
  $dump = & certutil.exe -dump $CrlPath 2>$null
  if ($LASTEXITCODE -ne 0) { throw "certutil -dump failed: $CrlPath" }

  $rxCrlNum   = '(?im)^\s*CRL\s*Number\s*[:=]\s*(\S+)\s*$'
  $rxThisUp   = '(?im)^\s*This\s*Update\s*[:=]\s*(.+)$'
  $rxThisUp2  = '(?im)^\s*ThisUpdate\s*[:=]\s*(.+)$'
  $rxNextUp   = '(?im)^\s*Next\s*Update\s*[:=]\s*(.+)$'
  $rxNextUp2  = '(?im)^\s*NextUpdate\s*[:=]\s*(.+)$'

  $crlNumber = ($dump | Select-String -Pattern $rxCrlNum).Matches | Select-Object -Last 1 | ForEach-Object { $_.Groups[1].Value }
  if ($crlNumber) {
    if ($crlNumber -match '^0x[0-9A-Fa-f]+$'){ $crlNumber = [int64]$crlNumber } else { [void][int64]::TryParse($crlNumber,[ref]([long]0)) }
  }

  $thisUpdate = ($dump | Select-String -Pattern $rxThisUp, $rxThisUp2).Matches | Select-Object -Last 1 | ForEach-Object { $_.Groups[1].Value.Trim() }
  $nextUpdate = ($dump | Select-String -Pattern $rxNextUp, $rxNextUp2).Matches | Select-Object -Last 1 | ForEach-Object { $_.Groups[1].Value.Trim() }

  $thisIso = $null; $nextIso = $null
  if ($thisUpdate){ $thisIso = (Get-Date $thisUpdate).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ss.fffZ') }
  if ($nextUpdate){ $nextIso = (Get-Date $nextUpdate).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ss.fffZ') }

  [pscustomobject]@{ CrlNumber="$crlNumber"; ThisUpdate=$thisIso; NextUpdate=$nextIso }
}

function Convert-CrlToPem {
  param([Parameter(Mandatory)][string]$CrlPath)
  $tmp=[System.IO.Path]::GetTempFileName()
  try {
    & certutil.exe -f -encode $CrlPath $tmp | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "certutil -encode failed: $CrlPath" }
    Get-Content -Raw -LiteralPath $tmp -Encoding ASCII
  } finally { Remove-Item -LiteralPath $tmp -ErrorAction SilentlyContinue }
}

function Join-Url { param([string]$Base,[string]$Rel) $u=[System.Uri]::new($Base); ([System.Uri]::new($u,$Rel)).AbsoluteUri }

# POST JSON even for non-2xx (PS7 uses -SkipHttpErrorCheck; PS5.1 fallback reads the response stream)
function Invoke-PostJsonPermissive {
  param([Parameter(Mandatory)][string]$Uri,[Parameter(Mandatory)][string]$Body,[int]$TimeoutSec=60)
  $irm = Get-Command Invoke-RestMethod -ErrorAction SilentlyContinue
  if ($irm -and $irm.Parameters.ContainsKey('SkipHttpErrorCheck')) {
    return Invoke-RestMethod -Method Post -Uri $Uri -ContentType 'text/plain' -Body $Body -TimeoutSec $TimeoutSec -SkipHttpErrorCheck
  } else {
    try {
      return Invoke-RestMethod -Method Post -Uri $Uri -ContentType 'text/plain' -Body $Body -TimeoutSec $TimeoutSec
    } catch {
      $resp = $_.Exception.Response
      if ($resp -and $resp.GetResponseStream){
        $sr = New-Object System.IO.StreamReader($resp.GetResponseStream())
        $text = $sr.ReadToEnd()
        try { return ($text | ConvertFrom-Json) } catch { return @{ error = "Invalid JSON: $text" } }
      } else {
        throw
      }
    }
  }
}

function Is-DeltaCrlName { param([string]$Name) return ($Name -match '\+' -or $Name -match '(?i)delta') }

function Invoke-UploadCrl {
  param([Parameter(Mandatory)][string]$CrlPath)

  if (-not (Wait-FileReady -Path $CrlPath)) { Write-Log WARN "File is still locked, skipping: $CrlPath"; return }

  $meta = Get-CrlMeta -CrlPath $CrlPath
  Write-Log INFO ("Detected CRL: {0}; CrlNumber={1}; ThisUpdate={2}; NextUpdate={3}" -f `
                  [System.IO.Path]::GetFileName($CrlPath), $meta.CrlNumber, $meta.ThisUpdate, $meta.NextUpdate)

  $state = Load-State
  $isNew = $true
  if ($state.LastCrlNumber) {
    if ($meta.CrlNumber -and ($meta.CrlNumber -le $state.LastCrlNumber)) { $isNew = $false }
  } elseif ($state.LastThisUpdate -and $meta.ThisUpdate -le $state.LastThisUpdate) {
    $isNew = $false
  }
  if (-not $isNew) { Write-Log INFO "No change detected (CRL Number / ThisUpdate not increased); skip upload."; return }

  $pem = Convert-CrlToPem -CrlPath $CrlPath

  try {
    Write-Log INFO "Uploading to $UploadUri ..."
    $resp = Invoke-PostJsonPermissive -Uri $UploadUri -Body $pem -TimeoutSec 60
  } catch {
    Write-Log ERROR "Upload failed with no parsable response: $($_.Exception.Message)"; return
  }

  $json = ($resp | ConvertTo-Json -Depth 8)
  Write-Log INFO "Upstream response: $json"

  if ($resp.error)  { Write-Log ERROR  "Server error: $($resp.error)"; return }
  if ($resp.status -eq 'ignored') { Write-Log WARN "Server ignored upload: $($resp.reason)"; return }
  if ($resp.status -ne 'ok') { Write-Log WARN "Non-ok status: $($resp.status) — proceeding to verify if URLs are provided." }

  # Quick echo checks (do not fail hard if format differs)
  if ($resp.crlNumber -and ("$($resp.crlNumber)" -ne "$($meta.CrlNumber)")) { Write-Log WARN ("Server crlNumber ({0}) != local ({1})" -f $resp.crlNumber,$meta.CrlNumber) }
  if ($resp.thisUpdate -and ("$($resp.thisUpdate)" -ne "$($meta.ThisUpdate)")) { Write-Log WARN ("Server thisUpdate ({0}) != local ({1})" -f $resp.thisUpdate,$meta.ThisUpdate) }

  # Back-fetch verification
  $targets = @()
  if ($resp.stored -and $resp.stored.pem){ $targets += (Join-Url -Base $BaseUri -Rel $resp.stored.pem) }
  if ($resp.stored -and $resp.stored.der){ $targets += (Join-Url -Base $BaseUri -Rel $resp.stored.der) }
  if ($resp.byAki)                      { $targets += (Join-Url -Base $BaseUri -Rel $resp.byAki) }

  $okCount = 0
  foreach ($url in ($targets | Select-Object -Unique)) {
    try {
      Write-Log INFO "Verifying by GET: $url"
      $tmpFile = [System.IO.Path]::GetTempFileName()
      try {
        Invoke-WebRequest -Uri $url -TimeoutSec 60 -OutFile $tmpFile -UseBasicParsing | Out-Null
        $remote = Get-CrlMeta -CrlPath $tmpFile
        $bothNumbersPresent = ([string]::IsNullOrWhiteSpace($remote.CrlNumber) -eq $false) -and ([string]::IsNullOrWhiteSpace($meta.CrlNumber) -eq $false)
        $bothThisUpdPresent = ([string]::IsNullOrWhiteSpace($remote.ThisUpdate) -eq $false) -and ([string]::IsNullOrWhiteSpace($meta.ThisUpdate) -eq $false)

        if ($bothNumbersPresent -and $bothThisUpdPresent -and
            $remote.CrlNumber -eq $meta.CrlNumber -and $remote.ThisUpdate -eq $meta.ThisUpdate) {
          Write-Log SUCCESS ("Verified: CrlNumber/ThisUpdate match ({0} / {1})" -f $remote.CrlNumber, $remote.ThisUpdate)
          $okCount++
        } else {
          Write-Log WARN ("Mismatch or empty meta: local(CN={0},TU={1}) vs remote(CN={2},TU={3})" -f `
                          $meta.CrlNumber, $meta.ThisUpdate, $remote.CrlNumber, $remote.ThisUpdate)
        }
      } finally { Remove-Item -LiteralPath $tmpFile -ErrorAction SilentlyContinue }
    } catch {
      Write-Log WARN "Verification error: $($_.Exception.Message)"
    }
  }

  if ($okCount -gt 0) {
    $state.LastCrlNumber  = $meta.CrlNumber
    $state.LastThisUpdate = $meta.ThisUpdate
    Save-State -State $state
    Write-Log SUCCESS ("State updated: LastCrlNumber={0}, LastThisUpdate={1}" -f $state.LastCrlNumber,$state.LastThisUpdate)
  } else {
    Write-Log WARN "No successful verification target; state NOT updated."
  }
}

# -------------------- Main --------------------
try {
  Ensure-Path (Split-Path -Parent $LogPath)
  Ensure-Path (Split-Path -Parent $StatePath)
  Ensure-Path $WatchPath

  $transcriptPath = [System.IO.Path]::ChangeExtension($LogPath, '.transcript.log')
  try { Start-Transcript -Path $transcriptPath -Append -ErrorAction SilentlyContinue | Out-Null } catch {}

  Write-Log INFO ("Startup: UploadUri={0}; BaseUri={1}; WatchPath={2}; FilePattern={3}; ExcludeDelta={4}" -f `
                  $UploadUri,$BaseUri,$WatchPath,$FilePattern,$ExcludeDelta)

  # Optional heartbeat
  if ($HeartbeatSeconds -gt 0) {
    $timer = New-Object System.Timers.Timer
    $timer.Interval = [double]($HeartbeatSeconds * 1000)
    $timer.AutoReset = $true
    Register-ObjectEvent -InputObject $timer -EventName Elapsed -Action { Write-Log INFO "Heartbeat: still listening ..." } | Out-Null
    $timer.Start()
  }

  if ($Once) {
    $latest = Get-ChildItem -LiteralPath $WatchPath -Filter $FilePattern -File -ErrorAction Stop |
              Where-Object { -not ($ExcludeDelta -and (Is-DeltaCrlName -Name $_.Name)) } |
              Sort-Object LastWriteTimeUtc -Descending | Select-Object -First 1
    if ($latest) {
      Write-Log INFO ("Once mode: processing latest CRL => {0}" -f $latest.FullName)
      Invoke-UploadCrl -CrlPath $latest.FullName
    } else {
      Write-Log WARN "Once mode: no matching base CRL found."
    }
    Write-Log INFO "Once mode completed."
    return
  }

  # Event handler (no $Using:, capture closure variables)
  $excludeDeltaLocal = $ExcludeDelta
  $handler = {
    param($sender,$eventArgs)
    $path = $eventArgs.FullPath
    Start-Sleep -Milliseconds 1500
    try {
      if (Test-Path -LiteralPath $path) {
        $name = [System.IO.Path]::GetFileName($path)
        if ($excludeDeltaLocal -and (Is-DeltaCrlName -Name $name)) {
          Write-Log INFO ("Skip delta CRL: {0}" -f $name)
          Write-Log INFO "Listening for the next events ..."
          return
        }
        Write-Log INFO ("File event: {0} {1}" -f $eventArgs.ChangeType,$path)
        Invoke-UploadCrl -CrlPath $path
      }
    } catch {
      Write-Log ERROR ("Error handling {0}: {1}" -f $path, $_.Exception.Message)
    }
    Write-Log INFO "Listening for the next events ..."
  }

  $fsw = New-Object System.IO.FileSystemWatcher
  $fsw.Path = $WatchPath
  $fsw.Filter = $FilePattern
  $fsw.IncludeSubdirectories = $false
  $fsw.EnableRaisingEvents = $true
  $fsw.NotifyFilter = [IO.NotifyFilters]'FileName, LastWrite, Size'

  Register-ObjectEvent -InputObject $fsw -EventName Created -Action $handler | Out-Null
  Register-ObjectEvent -InputObject $fsw -EventName Changed -Action $handler | Out-Null
  Register-ObjectEvent -InputObject $fsw -EventName Renamed -Action $handler | Out-Null

  Write-Log INFO "File watcher armed; waiting for events ... (Ctrl+C to stop)"
  while ($true) { Wait-Event | Out-Null }
}
finally {
  try { Stop-Transcript | Out-Null } catch {}
}
