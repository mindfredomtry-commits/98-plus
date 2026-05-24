# 98+ — Telegram Mini App

Социальная механика «запретов» между людьми. Вирусный interaction engine внутри Telegram.

## Архитектура

```
98plus/
├── apps/
│   ├── api/          # Express + Prisma + WebSocket + Telegraf bot
│   └── web/          # Next.js 15 Mini App UI
├── packages/
│   └── shared/       # Energy economy, types, constants
├── docker-compose.yml
└── .env.example
```

| Слой | Технологии |
|------|------------|
| Frontend | Next.js, TypeScript, Tailwind, Framer Motion, Telegram WebApp SDK |
| Backend | Express, Prisma, PostgreSQL |
| Realtime | WebSocket (`/ws`) |
| Cache / anti-spam | Redis (cooldowns, daily limits) |
| Bot | Telegraf (уведомления + `/start`) |

## Быстрый старт

### 1. Инфраструктура

```bash
docker compose up -d
cp .env.example .env
# Заполни TELEGRAM_BOT_TOKEN, JWT_SECRET
```

### 2. Установка

```bash
npm install
npm run db:generate
npm run db:push
```

### 3. Запуск

```bash
# Терминал 1 — API + bot + scheduler + WS
npm run dev:api

# Терминал 2 — Mini App UI
npm run dev:web
```

- API: http://localhost:4000  
- Web: http://localhost:3000  
- WS: `ws://localhost:4000/ws?token=JWT`

В dev без Telegram UI авторизуется через `POST /auth/dev` (или `GET /auth/dev`).
На API: `DEV_AUTH_ENABLED=true` или `NODE_ENV` не `production`. Локальный web на `localhost:3000` вызывает dev-auth автоматически.

### 4. Telegram Bot

1. Создай бота у [@BotFather](https://t.me/BotFather)
2. `/setdomain` — укажи домен Mini App (production)
3. Menu Button → Web App → `WEBAPP_URL`
4. `TELEGRAM_BOT_TOKEN` в `.env`

Пользователь должен нажать `/start` у бота (регистрация + push).

## API (основное)

| Method | Path | Описание |
|--------|------|----------|
| POST | `/auth/telegram` | `{ initData }` → JWT |
| GET | `/users/me` | Профиль + aura |
| POST | `/bans/send` | Отправить запрет |
| POST | `/bans/:id/counter` | Ответный запрет |
| POST | `/bans/:id/overboard` | ⚠️ Перебор (−8 обоим) |
| POST | `/bans/:id/check` | ✅/❌ проверка |
| POST | `/users/self-bans` | Self-ban |

## WebSocket events

- `ban:incoming` — fullscreen card
- `check:due` — «Запрет выполнен?»
- `energy:popup` — transient `+4 ⚡` / `−8 ⚡`
- `ban:updated`

## Экономика

Реализована в `packages/shared/src/energy.ts` + `apps/api/src/services/energy.service.ts`:

- Отправка: sender −2
- ✅✅: sender +6, receiver +4
- ❌❌: sender 0, receiver −2
- Split: sender −4, receiver −6
- Перебор: оба −8
- Anti-farm: 3 success/пара/сутки → награды 0, interaction продолжается
- Low energy: множители наград 0.75 / 0.5 / 0.25, штрафы полные

## Production

1. PostgreSQL + Redis (managed или Docker)
2. Deploy API (Railway, Fly.io, VPS) — `npm run build -w @98plus/api && npm start -w @98plus/api`
3. Deploy Web (Vercel) — `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_WS_URL` (wss)
4. `prisma migrate deploy` на production DB
5. HTTPS обязателен для Telegram WebApp

## Social loop (deep links)

| `start_param` | Действие |
|---------------|----------|
| `u_username` | Открыть отправку запрета другу |
| `b_banId` | Fullscreen входящий запрет |
| `c_banId` | Проверка «Выполнил?» |
| `r_banId` | Shared result screen |

Примеры:
- Приглашение: `https://t.me/BOT?startapp=u_username`
- Результат: `https://t.me/BOT?startapp=r_CLxxx`

После проверки обоим — push «Смотреть результат» + WebSocket `check:completed`.

## Голос системы

Константы в `packages/shared/src/constants.ts` → `SYSTEM_VOICE`.
