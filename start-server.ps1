$rootPath = Split-Path -Parent $MyInvocation.MyCommand.Path
$pidPath = Join-Path $rootPath 'server.pid'
$logPath = Join-Path $rootPath 'server.log'
$errorLogPath = Join-Path $rootPath 'server-error.log'

if (Test-Path $pidPath) {
  $existingPid = [int](Get-Content $pidPath)
  if (Get-Process -Id $existingPid -ErrorAction SilentlyContinue) {
    Write-Output "Сервер уже запущен. PID: $existingPid"
    exit 0
  }
  Remove-Item -LiteralPath $pidPath -Force
}

$process = Start-Process -FilePath 'node.exe' -ArgumentList 'server.js' -WorkingDirectory $rootPath -WindowStyle Hidden -RedirectStandardOutput $logPath -RedirectStandardError $errorLogPath -PassThru
$process.Id | Set-Content -LiteralPath $pidPath -Encoding utf8
Start-Sleep -Milliseconds 700

if (Get-Process -Id $process.Id -ErrorAction SilentlyContinue) {
  Write-Output "Сервер запущен в фоне. PID: $($process.Id)"
  Write-Output "Лог: $logPath"
} else {
  Write-Error "Не удалось запустить сервер. Проверьте лог: $errorLogPath"
  Remove-Item -LiteralPath $pidPath -Force -ErrorAction SilentlyContinue
  exit 1
}
