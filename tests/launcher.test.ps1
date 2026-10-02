$ErrorActionPreference='Stop'
. (Join-Path (Split-Path $PSScriptRoot -Parent) 'launch-utils.ps1')
$testRoot=Join-Path ([IO.Path]::GetTempPath()) ('coin-launch-test-'+[guid]::NewGuid().ToString())
New-Item -ItemType Directory -Path (Join-Path $testRoot 'components') -Force | Out-Null
New-Item -ItemType Directory -Path (Join-Path $testRoot 'app') -Force | Out-Null
Set-Content -LiteralPath (Join-Path $testRoot 'package-lock.json') -Value '{}'
$file=Join-Path $testRoot 'components\sample.tsx'
Set-Content -LiteralPath $file -Value 'before'
$oldTime=(Get-Item -LiteralPath $file).LastWriteTimeUtc
$first=Get-BuildFingerprint $testRoot
Set-Content -LiteralPath $file -Value 'after'
(Get-Item -LiteralPath $file).LastWriteTimeUtc=$oldTime
$second=Get-BuildFingerprint $testRoot
if($first -eq $second){throw 'Component content changes must invalidate builds even when timestamps are unchanged.'}
Set-Content -LiteralPath (Join-Path $testRoot 'package-lock.json') -Value '{"version":2}'
if($second -eq (Get-BuildFingerprint $testRoot)){throw 'Lockfile changes must invalidate builds.'}
if((Select-AppPort 8787 @(8787,8788)) -ne 8789){throw 'Port fallback failed.'}
$blocked=$false;try{Select-AppPort 8787 @(8787..8797)|Out-Null}catch{$blocked=$true}
if(!$blocked){throw 'All occupied ports must fail clearly.'}
Write-Host 'PASS: component and dependency content changes, timestamp preservation, port fallback and exhaustion.'
