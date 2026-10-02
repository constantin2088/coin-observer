param([switch]$CheckOnly, [switch]$NoBrowser, [switch]$PrepareOnly)
$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
. (Join-Path $PSScriptRoot 'launch-utils.ps1')
$logPath = Join-Path $PSScriptRoot '启动诊断.log'
function Log($message) { Add-Content -LiteralPath $logPath -Value "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') $message" -Encoding UTF8 }
try {
  $package = Get-Content -LiteralPath 'package.json' -Raw -Encoding UTF8 | ConvertFrom-Json
  $version = $package.version
  $nodeCommand = Get-Command node.exe -ErrorAction SilentlyContinue
  if (!$nodeCommand) { throw '未找到 Node.js，请安装 Node.js 22.13 或更新版本。' }
  $nodeVersion = (& node.exe --version).Trim().TrimStart('v')
  if ([version]$nodeVersion -lt [version]'22.13.0') { throw 'Node.js 版本过低，需要 22.13 或更新版本。' }
  if (!(Get-Command npm.cmd -ErrorAction SilentlyContinue)) { throw '未找到 npm，请重新安装 Node.js。' }
  $fingerprint = Get-BuildFingerprint $PSScriptRoot
  $statePath = Join-Path $PSScriptRoot '.wrangler\launch-state.json'
  $depsPath = Join-Path $PSScriptRoot '.wrangler\dependencies-hash.txt'
  $state = $null
  try { $state = Get-Content -LiteralPath $statePath -Raw -Encoding UTF8 | ConvertFrom-Json } catch {}
  $lockHash = Get-ContentHash (Join-Path $PSScriptRoot 'package-lock.json')
  $savedHash = ''
  try { $savedHash = (Get-Content -LiteralPath $depsPath -Raw).Trim() } catch {}
  $needsInstall = !(Test-Path -LiteralPath 'node_modules\.bin\wrangler.cmd') -or $savedHash -ne $lockHash
  $needsBuild = !(Test-Path -LiteralPath 'dist\server\wrangler.json') -or !$state -or $state.fingerprint -ne $fingerprint -or $needsInstall
  $preferredPort = if ($state -and $state.port) { [int]$state.port } else { 8787 }
  if ($CheckOnly) { @{version=$version;needsInstall=$needsInstall;needsBuild=$needsBuild;preferredPort=$preferredPort;fingerprint=$fingerprint} | ConvertTo-Json -Compress; exit 0 }
  if (Test-Path -LiteralPath $logPath) { if ((Get-Item -LiteralPath $logPath).Length -gt 2MB) { Move-Item -LiteralPath $logPath -Destination (Join-Path $PSScriptRoot '启动诊断.previous.log') -Force } }
  Log "启动币观 $version"
  if (!$needsBuild) { try { $health = Invoke-RestMethod "http://127.0.0.1:$preferredPort/api/health" -TimeoutSec 1; if ($health.app -eq 'coin-observer' -and $health.version -eq $version -and $health.ready) { Log '复用当前版本'; if (!$NoBrowser) { Start-Process "http://127.0.0.1:$preferredPort" }; exit 0 } } catch {} }
  $usedPorts = @([Net.NetworkInformation.IPGlobalProperties]::GetIPGlobalProperties().GetActiveTcpListeners() | Where-Object { $_.Port -ge 8787 -and $_.Port -le 8797 } | ForEach-Object { $_.Port })
  $port = Select-AppPort $preferredPort $usedPorts
  if ($port -ne $preferredPort) { Write-Host "原端口被占用，本次使用端口 $port。不同端口的浏览器数据独立，可使用备份导入原有自选和提醒。" }
  New-Item -ItemType Directory -Path (Join-Path $PSScriptRoot '.wrangler') -Force | Out-Null
  if ($needsInstall) {
    Write-Host '首次启动或依赖更新，正在准备运行环境…'
    & npm.cmd ci --no-audit --no-fund
    if ($LASTEXITCODE -ne 0) { throw '运行环境准备失败，请检查网络后重试；具体错误见上方。' }
    Set-Content -LiteralPath $depsPath -Value $lockHash -Encoding ASCII
  }
  if ($needsBuild) {
    Write-Host '检测到版本或文件更新，正在准备界面…'; Log '开始构建'
    & npm.cmd run build
    if ($LASTEXITCODE -ne 0) { throw '界面准备失败，请保留此窗口和诊断日志。' }
  }
  @{version=$version;fingerprint=$fingerprint;port=$port} | ConvertTo-Json | Set-Content -LiteralPath $statePath -Encoding UTF8
  if ($PrepareOnly) { Write-Host "币观 $version 准备完成。"; exit 0 }
  Write-Host "币观 $version 正在启动，请保留此窗口。地址：http://127.0.0.1:$port"
  if (!$NoBrowser) { $openScript = Join-Path $PSScriptRoot 'open-dashboard.ps1'; Start-Process powershell.exe -WindowStyle Hidden -ArgumentList @('-NoProfile','-ExecutionPolicy','Bypass','-File',('"'+$openScript+'"'),'-Port',[string]$port,'-Version',$version) }
  Log "启动本地服务，端口 $port"
  & node.exe 'node_modules/wrangler/bin/wrangler.js' dev --config dist/server/wrangler.json --ip 127.0.0.1 --port $port --log-level error
  if ($LASTEXITCODE -ne 0) { throw '本地服务意外停止，请查看上方错误和启动诊断日志。' }
} catch {
  if (!$CheckOnly) { Log $_.Exception.Message }
  Write-Host "`n启动失败：$($_.Exception.Message)" -ForegroundColor Red
  Write-Host "诊断日志：$logPath"
  exit 1
}
