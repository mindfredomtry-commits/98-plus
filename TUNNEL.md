# Cloudflare tunnel setup

## Your tunnels

| Service | URL |
|---------|-----|
| Frontend | `https://san-buried-postcard-dresses.trycloudflare.com` |
| Backend | `https://identify-pope-along-casa.trycloudflare.com` |

## 1. API `.env` (root)

```env
CORS_ORIGIN=https://san-buried-postcard-dresses.trycloudflare.com
WEBAPP_URL=https://san-buried-postcard-dresses.trycloudflare.com
TELEGRAM_BOT_TOKEN=...
```

Restart API after change.

## 2. Web `apps/web/.env.local`

```env
NEXT_PUBLIC_API_URL=https://identify-pope-along-casa.trycloudflare.com
NEXT_PUBLIC_WS_URL=wss://identify-pope-along-casa.trycloudflare.com/ws
```

**Restart Next.js** — `NEXT_PUBLIC_*` is baked in at dev server start.

```bash
npm run dev:web
```

## 3. Quick test (browser console)

Open frontend tunnel → should log:

```
[98+] API https://identify-pope-along-casa.trycloudflare.com
```

## 4. One-time fix without restart

Open Mini App with query param (saved to localStorage):

```
https://san-buried-postcard-dresses.trycloudflare.com?api_url=https://identify-pope-along-casa.trycloudflare.com
```

## 5. Verify backend

```bash
curl https://identify-pope-along-casa.trycloudflare.com/health
```

## 6. BotFather

Menu button Web App URL = frontend tunnel HTTPS URL.
