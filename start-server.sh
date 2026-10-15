#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PID_FILE="${ROOT_DIR}/server.pid"
LOG_DIR="${ROOT_DIR}/logs"
LOG_FILE="${LOG_DIR}/server.log"

if [[ -f "$PID_FILE" ]]; then
  EXISTING_PID="$(cat "$PID_FILE")"
  if kill -0 "$EXISTING_PID" 2>/dev/null; then
    echo "Сервер уже запущен. PID: ${EXISTING_PID}"
    exit 0
  fi
  rm -f "$PID_FILE"
fi

mkdir -p "$LOG_DIR"
nohup node "$ROOT_DIR/server.js" >> "$LOG_FILE" 2>&1 < /dev/null &
SERVER_PID=$!
echo "$SERVER_PID" > "$PID_FILE"
sleep 1

if ! kill -0 "$SERVER_PID" 2>/dev/null; then
  echo "Не удалось запустить сервер. Проверьте лог: ${LOG_FILE}"
  rm -f "$PID_FILE"
  exit 1
fi

echo "Сервер запущен в фоне. PID: ${SERVER_PID}"
echo "Лог: ${LOG_FILE}"
