import { Router } from 'express';
import { requireAuth, type AuthRequest } from '../middleware/auth';
import {
  beginWhoFirstContact,
  cancelWhoFirstContact,
  consumeWhoFirstContact,
  getWhoFirstContact,
} from '../services/who-first-contact.service';

export const whoFirstContactRouter = Router();
whoFirstContactRouter.use(requireAuth);

whoFirstContactRouter.post('/begin', async (req: AuthRequest, res) => {
  try {
    if (!req.userId || !req.telegramId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    const result = await beginWhoFirstContact({
      ownerUserId: req.userId,
      ownerTelegramId: req.telegramId,
    });
    res.json(result);
  } catch (err) {
    const code = (err as { code?: string })?.code;
    if (code === 'rate_limited') {
      res.status(429).json({ error: 'rate_limited', code: 'rate_limited' });
      return;
    }
    console.error('[who-first-contact] begin failed', err);
    res.status(500).json({
      error: err instanceof Error ? err.message : 'begin failed',
    });
  }
});

/** Must be registered before `/:id` so `consume` is not treated as an id. */
whoFirstContactRouter.post('/consume', async (req: AuthRequest, res) => {
  const token =
    typeof (req.body as { token?: unknown })?.token === 'string'
      ? (req.body as { token: string }).token
      : '';
  if (!token) {
    res.status(400).json({ error: 'token required' });
    return;
  }
  const result = await consumeWhoFirstContact({
    ownerUserId: req.userId!,
    token,
  });
  res.json(result);
});

whoFirstContactRouter.post('/:id/cancel', async (req: AuthRequest, res) => {
  await cancelWhoFirstContact(req.userId!, String(req.params.id));
  res.json({ ok: true });
});

whoFirstContactRouter.get('/:id', async (req: AuthRequest, res) => {
  const row = await getWhoFirstContact(req.userId!, String(req.params.id));
  if (!row) {
    res.status(404).json({ error: 'not found' });
    return;
  }
  res.json({
    request: {
      id: row.id,
      token: row.token,
      status: row.status,
      selectedTelegramId: row.selectedTelegramId?.toString() ?? null,
      selectedUsername: row.selectedUsername,
      friend: row.friendCardJson ?? null,
      expiresAt: row.expiresAt.toISOString(),
    },
  });
});
