# 98+ Closed Alpha

## Запуск (10–20 тестеров)

```bash
docker compose up -d
cp .env.example .env
# TELEGRAM_BOT_TOKEN, JWT_SECRET, TELEGRAM_BOT_USERNAME, WEBAPP_URL
# ADMIN_TELEGRAM_IDS=your_telegram_id

npm install
npm run db:push -w @98plus/api
npm run dev:api
npm run dev:web
```

BotFather: Menu Button → Web App → `WEBAPP_URL` (HTTPS в проде).

Каждый тестер: `/start` у бота → открыть Mini App.

## Social loop

1. **Отправить** запрет (`PENDING` у получателя)
2. Получатель: **Принять** / **Ответить** / **Перебор**
3. Таймер: **3 / 10 / 30 / 60 мин** (с момента принятия)
4. Push + WS: **«Ты выдержал?»**
5. Оба отвечают → **Result screen** + share
6. **Запретить в ответ** → новый цикл

## Deep links (`startapp`)

| Param | Экран |
|-------|--------|
| `u_username` | Отправка другу |
| `b_banId` | Входящий запрет |
| `c_banId` | Проверка |
| `r_banId` | Результат |

## Recovery

- `GET /bans/session` — полное состояние после reload
- WS `sync:session` после reconnect
- Visibility API → refetch session

## Debug (`?debug=1` или кнопка `dbg`)

- Active bans, timers, WS log
- Admin: expire / reset / complete ban, clear Redis
- Требует `ADMIN_TELEGRAM_IDS` (в dev без IDs — все админы)

## Analytics (7 дней)

`ban_sent`, `ban_accepted`, `ban_counter`, `check_answered`, `check_timeout`, `result_shared`, `session_recovered`

`GET /admin/debug` → counts

## Alpha timers only

3м · 10м · 30м · 1ч — не 24ч.

## Checklist перед раздачей ссылок

- [ ] Postgres + Redis up
- [ ] Bot token + WebApp URL
- [ ] HTTPS на Mini App
- [ ] 2 тестовых аккаунта: send → accept → wait timer → check → result
- [ ] Уведомления приходят при закрытом приложении
- [ ] Reload не теряет pending ban
