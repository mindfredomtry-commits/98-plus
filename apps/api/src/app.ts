import express from 'express';
import cors from 'cors';
import { authRouter } from './routes/auth';
import { bansRouter } from './routes/bans';
import { usersRouter } from './routes/users';
import { adminRouter } from './routes/admin';
import { analyticsRouter } from './routes/analytics';
import { friendsRouter } from './routes/friends';
import { invitesRouter } from './routes/invites';
import { spikeNativePickerRouter } from './routes/spike-native-picker';
import { productsRouter } from './routes/products';
import { meRouter } from './routes/me';
import { paymentProvidersRouter } from './routes/payment-providers';
import { paymentsRouter } from './routes/payments';
import { internalMonetizationRouter } from './routes/internal-monetization';

/** Explicit local dev frontends (safe to allow against Railway API). */
const LOCAL_DEV_PORTS = ['3000', '3001', '3002'] as const;

const LOCAL_DEV_ORIGINS = [
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'http://localhost:3001',
  'http://127.0.0.1:3001',
  'http://localhost:3002',
  'http://127.0.0.1:3002',
  'http://192.168.100.8:3000',
] as const;

/** Private LAN IP on Next.js dev ports — mobile / same-WiFi local testing. */
function isLocalLanDevOrigin(origin: string): boolean {
  try {
    const url = new URL(origin);
    if (url.protocol !== 'http:') return false;
    const port = url.port || '80';
    if (!LOCAL_DEV_PORTS.includes(port as (typeof LOCAL_DEV_PORTS)[number])) {
      return false;
    }
    const host = url.hostname;
    if (host === 'localhost' || host === '127.0.0.1') return true;
    if (/^192\.168\.\d{1,3}\.\d{1,3}$/.test(host)) return true;
    if (/^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host)) return true;
    if (/^172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}$/.test(host)) return true;
    return false;
  } catch {
    return false;
  }
}

function parseAllowedOrigins(): string[] {
  const raw = process.env.CORS_ORIGIN ?? process.env.CORS_ORIGINS ?? '';
  const list = raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (list.length === 0 && process.env.WEBAPP_URL) {
    list.push(process.env.WEBAPP_URL.replace(/\/$/, ''));
  }
  return [...new Set([...list, ...LOCAL_DEV_ORIGINS])];
}

const allowedOrigins = parseAllowedOrigins();

function isOriginAllowed(origin: string | undefined): boolean {
  if (!origin) return true;
  if (allowedOrigins.includes(origin)) return true;
  if (isLocalLanDevOrigin(origin)) return true;
  if (origin.includes('trycloudflare.com')) return true;
  if (origin.includes('ngrok')) return true;
  if (origin.includes('web.telegram.org')) return true;
  if (process.env.CORS_ALLOW_ALL === 'true') return true;
  if (process.env.NODE_ENV !== 'production') return true;
  return false;
}

export function createApp() {
  const app = express();

  const corsMiddleware = cors({
    origin(origin, callback) {
      if (isOriginAllowed(origin)) {
        callback(null, origin ?? true);
      } else {
        console.warn('[cors] blocked origin:', origin);
        callback(null, false);
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept'],
  });

  app.use(corsMiddleware);
  app.options('*', corsMiddleware);

  app.use(express.json());

  app.get('/health', (_req, res) => {
    res.json({
      ok: true,
      service: '98plus-api',
      cors: allowedOrigins.length ? allowedOrigins : 'dynamic',
    });
  });

  app.use('/auth', authRouter);
  app.use('/users', usersRouter);
  app.use('/bans', bansRouter);
  app.use('/admin', adminRouter);
  app.use('/analytics', analyticsRouter);
  app.use('/friends', friendsRouter);
  app.use('/invites', invitesRouter);
  app.use('/spike/native-picker', spikeNativePickerRouter);
  app.use('/products', productsRouter);
  app.use('/me', meRouter);
  app.use('/payment-providers', paymentProvidersRouter);
  app.use('/payments', paymentsRouter);
  app.use('/internal/monetization', internalMonetizationRouter);

  app.use(
    (
      err: Error,
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction,
    ) => {
      console.error('[api] unhandled', err);
      if (!res.headersSent) {
        res.status(500).json({ error: err.message || 'Internal error' });
      }
    },
  );

  return app;
}
