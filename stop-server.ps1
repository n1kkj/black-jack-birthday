$rootPath = Split-Path -Parent $MyInvocation.MyCommand.Path
$pidPath = Join-Path $rootPath 'server.pid'

if (-not (Test-Path $pidPath)) {
  Write-Output 'Файл PID не найден. Сервер уже остановлен или запущен вручную.'
  exit 0
}

$serverPid = [int](Get-Content $pidPath)
$process = Get-Process -Id $serverPid -ErrorAction SilentlyContinue
if ($process) {
  Stop-Process -Id $serverPid
  Write-Output "Сервер остановлен. PID: $serverPid"
} else {
  Write-Output 'Процесс уже завершён.'
}

Remove-Item -LiteralPath $pidPath -Force
