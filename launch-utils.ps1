function Get-ContentHash([string]$LiteralPath) {
  $sha = [System.Security.Cryptography.SHA256]::Create()
  $stream = [IO.File]::OpenRead($LiteralPath)
  try { return ([BitConverter]::ToString($sha.ComputeHash($stream))).Replace('-','') } finally { $stream.Dispose(); $sha.Dispose() }
}
function Get-BuildFingerprint([string]$ProjectRoot) {
  $paths = @()
  foreach ($folder in @('app','lib','components','hooks','public')) {
    $path = Join-Path $ProjectRoot $folder
    if (Test-Path -LiteralPath $path) { $paths += Get-ChildItem -LiteralPath $path -Recurse -File | Select-Object -ExpandProperty FullName }
  }
  foreach ($name in @('package.json','package-lock.json','vite.config.ts','next.config.ts','tsconfig.json','components.json')) {
    $path = Join-Path $ProjectRoot $name
    if (Test-Path -LiteralPath $path) { $paths += $path }
  }
  $rows = foreach ($path in ($paths | Sort-Object)) { $relative = $path.Substring($ProjectRoot.TrimEnd('\').Length).Replace('\','/'); "$relative`:$(Get-ContentHash $path)" }
  $sha = [System.Security.Cryptography.SHA256]::Create()
  try { return ([BitConverter]::ToString($sha.ComputeHash([Text.Encoding]::UTF8.GetBytes(($rows -join "`n"))))).Replace('-','').ToLowerInvariant() } finally { $sha.Dispose() }
}
function Select-AppPort([int]$PreferredPort = 8787, [int[]]$UsedPorts = @()) {
  foreach ($port in @($PreferredPort) + @(8787..8797)) { if ($port -ge 8787 -and $port -le 8797 -and $port -notin $UsedPorts) { return $port } }
  throw '8787～8797 端口均被占用，请关闭不需要的程序后重试。'
}
