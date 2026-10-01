$ProgressPreference = 'SilentlyContinue'
$started = Get-Date
$deadline = $started.AddSeconds(45)
while ((Get-Date) -lt $deadline) {
  try {
    $health = Invoke-RestMethod 'http://127.0.0.1:8787/api/health' -TimeoutSec 1
    if ($health.app -eq 'coin-observer' -and $health.ready) {
      Add-Content -LiteralPath (Join-Path $PSScriptRoot '启动诊断.log') -Value "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') Browser ready after $([math]::Round(((Get-Date)-$started).TotalSeconds,1)) seconds" -Encoding UTF8
      Start-Process 'http://127.0.0.1:8787'
      exit 0
    }
  } catch {}
  Start-Sleep -Milliseconds 250
}
Add-Content -LiteralPath (Join-Path $PSScriptRoot '启动诊断.log') -Value "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') Timed out waiting for local server. Open the launch window to view errors." -Encoding UTF8
