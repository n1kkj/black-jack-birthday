#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PID_FILE="${ROOT_DIR}/server.pid"

if [[ ! -f "$PID_FILE" ]]; then
  echo "Файл PID не найден. Сервер уже остановлен или запущен вручную."
  exit 0
fi

SERVER_PID="$(cat "$PID_FILE")"
if kill -0 "$SERVER_PID" 2>/dev/null; then
  kill "$SERVER_PID"
  echo "Сервер остановлен. PID: ${SERVER_PID}"
else
  echo "Процесс уже завершён."
fi

rm -f "$PID_FILE"
