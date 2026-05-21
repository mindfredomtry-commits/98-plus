import { Router } from 'express';
import { requireAuth, type AuthRequest } from '../middleware/auth';
import { prisma } from '../lib/prisma';
import { redis } from '../lib/redis';
import {
  adminExpireBan,
  adminResetBan,
  adminForceComplete,
  getActiveInteractions,
} from '../services/ban.service';
import { getAlphaStats } from '../services/analytics.service';
import { getConnectedUserIds } from '../websocket/hub';
import { getSessionState } from '../services/session.service';

export const adminRouter = Router();
adminRouter.use(requireAuth);

function isAdmin(req: AuthRequest): boolean {
  const ids = (process.env.ADMIN_TELEGRAM_IDS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (ids.length === 0 && process.env.NODE_ENV !== 'production') return true;
  return ids.includes(req.telegramId ?? '');
}

adminRouter.use((req: AuthRequest, res, next) => {
  if (!isAdmin(req)) {
    res.status(403).json({ error: 'Admin only' });
    return;
  }
  next();
});

adminRouter.get('/debug', async (req: AuthRequest, res) => {
  const userId = req.userId!;
  const [session, active, stats, wsUsers] = await Promise.all([
    getSessionState(userId),
    getActiveInteractions(userId, 50),
    getAlphaStats(),
    Promise.resolve(getConnectedUserIds()),
  ]);
  res.json({
    userId,
    telegramId: req.telegramId,
    session,
    activeBans: active,
    analytics: stats,
    wsConnectedUsers: wsUsers.length,
    wsUsers,
  });
});

adminRouter.post('/bans/:id/expire', async (req, res) => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  await adminExpireBan(id);
  res.json({ ok: true });
});

adminRouter.post('/bans/:id/reset', async (req, res) => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  await adminResetBan(id);
  res.json({ ok: true });
});

adminRouter.post('/bans/:id/complete', async (req, res) => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const { bothYes } = req.body as { bothYes?: boolean };
  await adminForceComplete(id, bothYes !== false);
  res.json({ ok: true });
});

adminRouter.post('/redis/clear', async (_req, res) => {
  await redis.flushdb();
  res.json({ ok: true });
});

adminRouter.get('/users', async (_req, res) => {
  const users = await prisma.user.findMany({
    orderBy: { createdAt: 'desc' },
    take: 50,
    select: {
      id: true,
      telegramId: true,
      username: true,
      firstName: true,
      energy: true,
      createdAt: true,
    },
  });
  res.json({ users });
});
