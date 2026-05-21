import express from 'express';
import cors from 'cors';
import { authRouter } from './routes/auth';
import { bansRouter } from './routes/bans';
import { usersRouter } from './routes/users';
import { adminRouter } from './routes/admin';
import { analyticsRouter } from './routes/analytics';
import { friendsRouter } from './routes/friends';
import { invitesRouter } from './routes/invites';

function parseAllowedOrigins(): string[] {
  const raw = process.env.CORS_ORIGIN ?? process.env.CORS_ORIGINS ?? '';
  const list = raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (list.length === 0 && process.env.WEBAPP_URL) {
    list.push(process.env.WEBAPP_URL.replace(/\/$/, ''));
  }
  return list;
}

const allowedOrigins = parseAllowedOrigins();

function isOriginAllowed(origin: string | undefined): boolean {
  if (!origin) return true;
  if (allowedOrigins.includes(origin)) return true;
  if (origin.includes('trycloudflare.com')) return true;
  if (origin.includes('ngrok')) return true;
  if (origin.includes('web.telegram.org')) return true;
  if (process.env.CORS_ALLOW_ALL === 'true') return true;
  if (process.env.NODE_ENV !== 'production') return true;
  return false;
}

export function createApp() {
  const app = express();

  app.use(
    cors({
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
    }),
  );

  app.options('*', cors());

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
