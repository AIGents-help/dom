$ErrorActionPreference = "Stop"

$workerDir = Split-Path -Parent $PSScriptRoot
Write-Host "Installing DOMINIC Processing Node..."
Push-Location $workerDir
npm install
Pop-Location

$starter = Join-Path $PSScriptRoot "start-agent.ps1"
$taskName = "DOMINIC Processing Node"
$action = 'powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "' + $starter + '"'
schtasks /Create /TN $taskName /TR $action /SC ONLOGON /RL LIMITED /F | Out-Null

$protocolKey = "HKCU:\Software\Classes\dominic"
New-Item -Path $protocolKey -Force | Out-Null
Set-ItemProperty -Path $protocolKey -Name "(default)" -Value "URL:DOMINIC Processing Node"
New-ItemProperty -Path $protocolKey -Name "URL Protocol" -Value "" -PropertyType String -Force | Out-Null
$commandKey = Join-Path $protocolKey "shell\open\command"
New-Item -Path $commandKey -Force | Out-Null
$protocolCommand = 'powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "' + $starter + '"'
Set-ItemProperty -Path $commandKey -Name "(default)" -Value $protocolCommand

Start-Process powershell.exe -ArgumentList "-NoProfile","-ExecutionPolicy","Bypass","-WindowStyle","Hidden","-File",$starter
Write-Host "DOMINIC Processing Node installed. It will start automatically at Windows sign-in."
