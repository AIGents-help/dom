$ErrorActionPreference = "Stop"
$workerDir = Split-Path -Parent $PSScriptRoot
$lockPath = Join-Path $env:TEMP "dominic-processing-node.lock"

if (Test-Path $lockPath) {
  try {
    $existingPid = [int](Get-Content $lockPath -ErrorAction Stop)
    if (Get-Process -Id $existingPid -ErrorAction SilentlyContinue) { exit 0 }
  } catch {}
  Remove-Item $lockPath -Force -ErrorAction SilentlyContinue
}

Set-Content -Path $lockPath -Value $PID
try {
  Set-Location $workerDir
  npm start
} finally {
  Remove-Item $lockPath -Force -ErrorAction SilentlyContinue
}
