import { Router } from 'express';
import { z } from 'zod';
import {
  BAN_DURATIONS_MINUTES as BAN_DURATIONS,
  ANALYTICS_EVENTS,
  isValidDurationMinutes,
} from '@98plus/shared';
import { requireAuth, type AuthRequest } from '../middleware/auth';
import {
  sendBan,
  acceptBan,
  rejectBan,
  replyToIncomingBan,
  counterBan,
  markOverboard,
  submitCheckAnswer,
  getActiveInteractions,
  getPendingIncoming,
  getPendingCheck,
  getWaitingCheck,
  getCheckState,
  getBanResult,
  acknowledgeBanResult,
  acknowledgeIncomingBan,
  backfillStaleIncomingForUser,
  resolveDeepLinkBan,
} from '../services/ban.service';
import { getSessionState } from '../services/session.service';
import { trackEvent } from '../services/analytics.service';
import { inviteLinkForUser } from '../lib/deeplink';
import { prisma } from '../lib/prisma';

export const bansRouter = Router();

function paramId(req: AuthRequest): string {
  const id = req.params.id;
  return Array.isArray(id) ? id[0] : id;
}

bansRouter.use(requireAuth);

const sendSchema = z.object({
  text: z.string().min(3).max(280),
  durationMinutes: z.coerce
    .number()
    .refine((m) => isValidDurationMinutes(m)),
  durationHours: z.number().optional(),
  receiverTelegramId: z.string().optional(),
  receiverUserId: z.string().optional(),
  receiverUsername: z.string().optional(),
});

bansRouter.get('/active', async (req: AuthRequest, res) => {
  const items = await getActiveInteractions(req.userId!);
  res.json({ items });
});

bansRouter.get('/pending/incoming', async (req: AuthRequest, res) => {
  const ban = await getPendingIncoming(req.userId!);
  res.json({ ban });
});

bansRouter.get('/pending/check', async (req: AuthRequest, res) => {
  const ban = await getPendingCheck(req.userId!);
  const waiting = await getWaitingCheck(req.userId!);
  res.json({ ban, waiting });
});

bansRouter.post('/incoming/backfill-ack', async (req: AuthRequest, res) => {
  const body = (req.body ?? {}) as { banIds?: unknown };
  const banIds = Array.isArray(body.banIds)
    ? body.banIds.filter((id): id is string => typeof id === 'string')
    : [];
  const count = await backfillStaleIncomingForUser(req.userId!, banIds);
  res.json({ ok: true, count });
});

bansRouter.get('/session', async (req: AuthRequest, res) => {
  const t0 = Date.now();
  try {
    const user = await prisma.user.findUnique({ where: { id: req.userId } });
    const ackHeader = req.headers['x-acked-incoming'];
    const clientAckedIncomingIds =
      typeof ackHeader === 'string' && ackHeader.trim()
        ? ackHeader.split(',').map((s) => s.trim()).filter(Boolean)
        : [];
    const session = await getSessionState(
      req.userId!,
      user?.username ?? null,
      clientAckedIncomingIds,
    );
    console.log(`[98+] /bans/session in ${Date.now() - t0}ms`);
    res.json(session);
  } catch (e) {
    console.error('[bans] session failed', e);
    res.status(503).json({
      error: 'Temporary database overload',
      retry: true,
    });
  }
});

bansRouter.get('/invite-link', async (req: AuthRequest, res) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.userId } });
    const link = inviteLinkForUser(user?.username ?? null);
    res.json({
      link,
      startParam: user?.username ? `u_${user.username}` : null,
    });
  } catch (e) {
    console.error('[bans] invite-link failed', e);
    res.status(503).json({
      error: 'Temporary database overload',
      retry: true,
    });
  }
});

bansRouter.get('/:id/result', async (req: AuthRequest, res) => {
  const result = await getBanResult(paramId(req), req.userId!);
  if (!result) {
    res.status(404).json({ error: 'Результат ещё не готов' });
    return;
  }
  res.json({ result });
});

bansRouter.post('/:id/result/ack', async (req: AuthRequest, res) => {
  const ok = await acknowledgeBanResult(paramId(req), req.userId!);
  if (!ok) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  res.json({ ok: true });
});

bansRouter.post('/:id/incoming/ack', async (req: AuthRequest, res) => {
  const ban = await acknowledgeIncomingBan(paramId(req), req.userId!);
  if (!ban) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  res.json({ ok: true, ban });
});

bansRouter.get('/:id/check-state', async (req: AuthRequest, res) => {
  res.json({ checkState: await getCheckState(paramId(req), req.userId!) });
});

bansRouter.get('/:id/open', async (req: AuthRequest, res) => {
  const ban = await resolveDeepLinkBan(paramId(req), req.userId!);
  if (!ban) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  res.json({ ban });
});

bansRouter.post('/send', async (req: AuthRequest, res) => {
  const parsed = sendSchema.safeParse(req.body);
  if (!parsed.success) {
    console.warn('[98+] /bans/send validation failed', {
      userId: req.userId,
      body: req.body,
      issues: parsed.error.flatten(),
    });
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { text, receiverTelegramId, receiverUsername } = parsed.data;
  const durationMinutes =
    parsed.data.durationMinutes ?? parsed.data.durationHours ?? 30;

  const { receiverUserId } = parsed.data;

  if (!receiverTelegramId && !receiverUsername && !receiverUserId) {
    res.status(400).json({ error: 'Укажи получателя' });
    return;
  }

  const t0 = Date.now();
  try {
    const result = await sendBan({
      senderId: req.userId!,
      text,
      durationMinutes,
      receiverUserId,
      receiverTelegramId: receiverTelegramId
        ? BigInt(receiverTelegramId)
        : undefined,
      receiverUsername,
    });
    console.log(`[98+] /bans/send in ${Date.now() - t0}ms`);
    res.json(result);
  } catch (e) {
    const reason = (e as Error).message;
    console.warn('[98+] /bans/send rejected', {
      userId: req.userId,
      receiverUserId: parsed.data.receiverUserId,
      receiverUsername: parsed.data.receiverUsername,
      receiverTelegramId: parsed.data.receiverTelegramId,
      durationMinutes,
      reason,
    });
    res.status(400).json({ error: reason });
  }
});

bansRouter.post('/:id/accept', async (req: AuthRequest, res) => {
  try {
    const ban = await acceptBan(paramId(req), req.userId!);
    const { getSessionState } = await import('../services/session.service');
    const user = await prisma.user.findUnique({ where: { id: req.userId } });
    const session = await getSessionState(req.userId!, user?.username ?? null);
    res.json({ ban, session });
  } catch (e) {
    res.status(400).json({ error: (e as Error).message });
  }
});

bansRouter.post('/:id/reject', async (req: AuthRequest, res) => {
  try {
    await rejectBan(paramId(req), req.userId!);
    const { getSessionState } = await import('../services/session.service');
    const user = await prisma.user.findUnique({ where: { id: req.userId } });
    const session = await getSessionState(req.userId!, user?.username ?? null);
    res.json({ ok: true, session });
  } catch (e) {
    res.status(400).json({ error: (e as Error).message });
  }
});

bansRouter.post('/:id/reply', async (req: AuthRequest, res) => {
  const { text, durationMinutes, durationHours } = req.body as {
    text?: string;
    durationMinutes?: number;
    durationHours?: number;
  };
  const mins = durationMinutes ?? durationHours ?? 30;
  if (!text?.trim()) {
    res.status(400).json({ error: 'text required' });
    return;
  }
  if (!BAN_DURATIONS.includes(mins as (typeof BAN_DURATIONS)[number])) {
    res.status(400).json({ error: 'Invalid duration' });
    return;
  }

  try {
    const result = await replyToIncomingBan({
      banId: paramId(req),
      userId: req.userId!,
      text: text.trim(),
      durationMinutes: mins,
    });
    res.json(result);
  } catch (e) {
    console.error('[bans] reply failed', e);
    res.status(400).json({ error: (e as Error).message });
  }
});

bansRouter.post('/:id/counter', async (req: AuthRequest, res) => {
  const { text, durationMinutes, durationHours } = req.body as {
    text?: string;
    durationMinutes?: number;
    durationHours?: number;
  };
  const mins = durationMinutes ?? durationHours ?? 30;
  if (!text?.trim()) {
    res.status(400).json({ error: 'text required' });
    return;
  }
  if (!BAN_DURATIONS.includes(mins as (typeof BAN_DURATIONS)[number])) {
    res.status(400).json({ error: 'Invalid duration' });
    return;
  }

  try {
    const ban = await counterBan({
      banId: paramId(req),
      userId: req.userId!,
      text: text.trim(),
      durationMinutes: mins,
    });
    res.json({ ban });
  } catch (e) {
    console.error('[bans] counter failed', e);
    res.status(400).json({ error: (e as Error).message });
  }
});

bansRouter.post('/:id/overboard', async (req: AuthRequest, res) => {
  try {
    const ban = await markOverboard(paramId(req), req.userId!);
    res.json({ ban });
  } catch (e) {
    res.status(400).json({ error: (e as Error).message });
  }
});

bansRouter.post('/:id/check', async (req: AuthRequest, res) => {
  const { completed } = req.body as { completed?: boolean };
  if (typeof completed !== 'boolean') {
    res.status(400).json({ error: 'completed required' });
    return;
  }

  try {
    const result = await submitCheckAnswer(
      paramId(req),
      req.userId!,
      completed,
    );
    if (result.result) {
      await trackEvent(ANALYTICS_EVENTS.RESULT_VIEWED, req.userId!, {
        banId: paramId(req),
      });
    }
    res.json(result);
  } catch (e) {
    res.status(400).json({ error: (e as Error).message });
  }
});
