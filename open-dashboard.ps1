param([int]$Port=8787, [string]$Version='1.1.0')
$appUrl = "http://127.0.0.1:$Port"
for ($attempt=0; $attempt -lt 90; $attempt++) {
  try { $health = Invoke-RestMethod "$appUrl/api/health" -TimeoutSec 1; if ($health.app -eq 'coin-observer' -and $health.version -eq $Version -and $health.ready) { Start-Process $appUrl; exit 0 } } catch {}
  Start-Sleep -Milliseconds 700
}
Add-Content -LiteralPath (Join-Path $PSScriptRoot '启动诊断.log') -Value '浏览器打开等待超时，请检查启动窗口。' -Encoding UTF8
exit 1
