$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
$appUrl = 'http://127.0.0.1:8787'
$healthUrl = "$appUrl/api/health"
$logPath = Join-Path $PSScriptRoot '启动诊断.log'
function Log($message) { Add-Content -LiteralPath $logPath -Value "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') $message" -Encoding UTF8 }
try {
  Log 'Launcher started'
  $nodeCommand = Get-Command node.exe -ErrorAction SilentlyContinue
  if (!$nodeCommand) { throw 'Node.js not found. Please install Node.js 22 or newer.' }
  $nodeVersion = (& node.exe --version).Trim().TrimStart('v')
  if ([version]$nodeVersion -lt [version]'22.13.0') { throw 'Node.js 22 or newer is required.' }
  if (!(Get-Command npm.cmd -ErrorAction SilentlyContinue)) { throw 'npm was not found. Please reinstall Node.js.' }
  try {
    $health = Invoke-RestMethod $healthUrl -TimeoutSec 1
    if ($health.app -eq 'coin-observer' -and $health.ready) { Log 'Reused running server'; Start-Process $appUrl; exit 0 }
  } catch {}
  if (Get-NetTCPConnection -LocalPort 8787 -State Listen -ErrorAction SilentlyContinue) { throw 'Port 8787 is occupied by another app or an older Coin Observer. Close that app/window and retry.' }
  if (!(Test-Path -LiteralPath 'node_modules\.bin\wrangler.cmd')) {
    Write-Host 'Preparing packages for first launch...'
    & npm.cmd install --no-audit --no-fund
    if ($LASTEXITCODE -ne 0) { throw 'Package installation failed. Check your network.' }
  }
  $buildFile = Join-Path $PSScriptRoot 'dist\server\wrangler.json'
  $needsBuild = !(Test-Path -LiteralPath $buildFile)
  if (!$needsBuild) {
    $builtAt = (Get-Item -LiteralPath $buildFile).LastWriteTimeUtc
    foreach ($folder in @('app','lib')) {
      if (Get-ChildItem -LiteralPath $folder -Recurse -File | Where-Object { $_.LastWriteTimeUtc -gt $builtAt } | Select-Object -First 1) { $needsBuild = $true }
    }
  }
  if ($needsBuild) {
    Write-Host 'Updating app files (only after source changes)...'; Log 'Building app'
    & npm.cmd run build
    if ($LASTEXITCODE -ne 0) { throw 'Build failed. Keep this window open and report the error above.' }
  }
  Write-Host 'Starting Coin Observer. Keep this window open while using the app.'
  $openScript = Join-Path $PSScriptRoot 'open-dashboard.ps1'
  Start-Process powershell.exe -WindowStyle Hidden -ArgumentList @('-NoProfile','-ExecutionPolicy','Bypass','-File',('"' + $openScript + '"'))
  Log 'Starting local server'
  & node.exe 'node_modules/wrangler/bin/wrangler.js' dev --config dist/server/wrangler.json --ip 127.0.0.1 --port 8787 --log-level error
  if ($LASTEXITCODE -ne 0) { throw 'Local server stopped unexpectedly. Check the error above and the launch log.' }
} catch {
  Log $_.Exception.Message
  Write-Host "`nStartup failed: $($_.Exception.Message)" -ForegroundColor Red
  Write-Host "Diagnostic log: $logPath"
  exit 1
}
