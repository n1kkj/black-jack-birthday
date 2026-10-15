# Blackjack Birthday

Локальный мобильный лидерборд для вечеринки: регистрация, аватар с загрузкой фото или селфи, публичное табло и админка для изменения очков.

## Запуск

```powershell
node server.js
```

Откройте `http://127.0.0.1:4173`.

Для фонового запуска на Linux VPS:

```bash
chmod +x start-server.sh stop-server.sh
./start-server.sh
```

Лог будет в `logs/server.log`, PID — в `server.pid`. Остановка:

```bash
./stop-server.sh
```

Для Windows можно запустить `start-server.ps1`, а остановить через `stop-server.ps1`.

Данные участников хранятся в `data/participants.json`, а загруженные аватары — в `uploads/`. Страница лидерборда и админка запрашивают актуальное состояние раз в 2 секунды.

Маршруты:

- `/#leaderboard` — публичный лидерборд
- `/#register` — регистрация
- `/#admin` — админка
# black-jack-birthday
