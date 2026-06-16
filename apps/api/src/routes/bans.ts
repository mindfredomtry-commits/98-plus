import { Router } from 'express';
import { z } from 'zod';
import {
  ANALYTICS_EVENTS,
  DAILY_BAN_LIMIT_ERROR_CODE,
  INSUFFICIENT_ENERGY_ERROR,
  isValidDurationMinutes,
} from '@98plus/shared';
import { requireAuth, type AuthRequest } from '../middleware/auth';
import { isInsufficientEnergyError, isDailyBanLimitError } from '../lib/ban-send-errors';
import {
  sendBan,
  acceptBan,
  rejectBan,
  replyToIncomingBan,
  createReplyApiStepLogger,
  counterBan,
  markOverboard,
  submitCheckAnswer,
  getActiveInteractions,
  getHistoryInteractions,
  getSavedInteractions,
  saveBanForUser,
  unsaveBanForUser,
  getPendingIncoming,
  getPendingIncomingForPoll,
  getAllPendingIncomingForPoll,
  getPendingCheck,
  getPendingCheckForPoll,
  getPendingResultForPoll,
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

function respondBanSendError(res: import('express').Response, e: unknown): void {
  if (isInsufficientEnergyError(e)) {
    res.status(402).json({
      error: INSUFFICIENT_ENERGY_ERROR,
      redirectToLobby: true,
      message: e.message,
    });
    return;
  }
  if (isDailyBanLimitError(e)) {
    res.status(400).json({
      error: DAILY_BAN_LIMIT_ERROR_CODE,
      redirectToLobby: true,
      message: e.message,
    });
    return;
  }
  res.status(400).json({ error: (e as Error).message });
}

function paramId(req: AuthRequest): string {
  const id = req.params.id;
  return Array.isArray(id) ? id[0] : id;
}

bansRouter.use(requireAuth);

const sendSchema = z.object({
  text: z.string().min(3).max(280),
  durationMinutes: z.coerce
    .number()
    .int()
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

bansRouter.get('/history', async (req: AuthRequest, res) => {
  const items = await getHistoryInteractions(req.userId!);
  res.json({ items });
});

bansRouter.get('/saved', async (req: AuthRequest, res) => {
  const items = await getSavedInteractions(req.userId!);
  res.json({ items });
});

bansRouter.get('/pending/incoming', async (req: AuthRequest, res) => {
  const ban = await getPendingIncoming(req.userId!);
  res.json({ ban });
});

bansRouter.get('/incoming/pending', async (req: AuthRequest, res) => {
  const ban = await getPendingIncomingForPoll(req.userId!);
  res.json({ ban });
});

bansRouter.get('/incoming/pending-all', async (req: AuthRequest, res) => {
  const bans = await getAllPendingIncomingForPoll(req.userId!);
  res.json({ bans });
});

bansRouter.get('/pending/check', async (req: AuthRequest, res) => {
  const ban = await getPendingCheck(req.userId!);
  const waiting = await getWaitingCheck(req.userId!);
  res.json({ ban, waiting });
});

bansRouter.get('/check/pending', async (req: AuthRequest, res) => {
  const ban = await getPendingCheckForPoll(req.userId!);
  res.json({ ban });
});

bansRouter.get('/result/pending', async (req: AuthRequest, res) => {
  const result = await getPendingResultForPoll(req.userId!);
  res.json({ result });
});

bansRouter.post('/incoming/backfill-ack', async (req: AuthRequest, res) => {
  const body = (req.body ?? {}) as { banIds?: unknown };
  const banIds = Array.isArray(body.banIds)
    ? body.banIds.filter((id): id is string => typeof id === 'string')
    : [];
  const count = await backfillStaleIncomingForUser(req.userId!, banIds);
  console.log('[incoming-api]', {
    route: 'POST /bans/incoming/backfill-ack',
    userId: req.userId,
    clientAckCount: banIds.length,
    acked: count,
  });
  res.json({ ok: true, count });
});

bansRouter.get('/session', async (req: AuthRequest, res) => {
  const t0 = Date.now();
  try {
    const user = await prisma.user.findUnique({ where: { id: req.userId } });
    const session = await getSessionState(req.userId!, user?.username ?? null);
    console.log(`[98+] /bans/session in ${Date.now() - t0}ms`);
    console.log('[incoming-api]', {
      route: '/bans/session',
      userId: req.userId,
      pendingIncomingId: session.incoming?.id ?? null,
      receiverId: session.incoming?.receiver?.id ?? null,
      status: session.incoming?.status ?? null,
      incomingAcknowledged: session.incoming?.incomingAcknowledged ?? null,
      reason: session.incoming ? 'returned-in-session' : 'no-incoming-in-session',
    });
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

bansRouter.post('/:id/save', async (req: AuthRequest, res) => {
  try {
    await saveBanForUser(req.userId!, paramId(req));
    res.json({ ok: true, saved: true });
  } catch (e) {
    res.status(404).json({ error: (e as Error).message });
  }
});

bansRouter.delete('/:id/save', async (req: AuthRequest, res) => {
  try {
    await unsaveBanForUser(req.userId!, paramId(req));
    res.json({ ok: true, saved: false });
  } catch (e) {
    res.status(404).json({ error: (e as Error).message });
  }
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
  const rawBody = req.body as Record<string, unknown>;
  console.info('[98+] /bans/send received', {
    userId: req.userId,
    receiverUserId: rawBody?.receiverUserId,
    receiverTelegramId: rawBody?.receiverTelegramId,
    receiverUsername: rawBody?.receiverUsername,
    durationMinutes: rawBody?.durationMinutes,
    textLength:
      typeof rawBody?.text === 'string' ? rawBody.text.length : undefined,
  });

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
      code: isInsufficientEnergyError(e)
        ? INSUFFICIENT_ENERGY_ERROR
        : isDailyBanLimitError(e)
          ? DAILY_BAN_LIMIT_ERROR_CODE
          : undefined,
    });
    respondBanSendError(res, e);
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
  const banId = paramId(req);
  const replyLog = createReplyApiStepLogger({
    banId,
    userId: req.userId ?? 'unknown',
  });
  replyLog.step('route entered');

  if (!req.userId) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  replyLog.step('auth ok');

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
  if (!Number.isInteger(mins) || !isValidDurationMinutes(mins)) {
    res.status(400).json({ error: 'Invalid duration' });
    return;
  }

  try {
    const result = await replyToIncomingBan({
      banId,
      userId: req.userId,
      text: text.trim(),
      durationMinutes: mins,
      replyLog,
    });
    replyLog.step('response sent');
    res.json(result);
  } catch (e) {
    replyLog.step('reply failed', { error: (e as Error).message });
    console.error('[bans] reply failed', e);
    respondBanSendError(res, e);
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
  if (!Number.isInteger(mins) || !isValidDurationMinutes(mins)) {
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
  const banId = paramId(req);
  const userId = req.userId!;

  const banRow = await prisma.ban.findUnique({ where: { id: banId } });
  const isReceiver = banRow?.receiverId === userId;
  const alreadyOverboard =
    banRow?.status === 'OVERBOARD' || banRow?.isOverboard === true;
  let alreadyResultExists = false;
  if (banRow && isReceiver) {
    const existing = await getBanResult(banId, userId);
    alreadyResultExists =
      existing?.outcome === 'overboard' || alreadyOverboard;
  }

  console.log('[OVERBOARD API] start', { banId, userId });
  console.log('[OVERBOARD API] banId=', banId);
  console.log('[OVERBOARD API] userId=', userId);
  console.log('[OVERBOARD API] ban.status=', banRow?.status ?? null);
  console.log('[OVERBOARD API] isReceiver=', isReceiver);
  console.log('[OVERBOARD API] alreadyOverboard=', alreadyOverboard);
  console.log('[OVERBOARD API] alreadyResultExists=', alreadyResultExists);

  try {
    const outcome = await markOverboard(banId, userId);
    console.log('[OVERBOARD API] markOverboard done', {
      banId,
      hasBan: !!outcome.ban,
      hasResult: !!outcome.result,
      outcome: outcome.result?.outcome ?? null,
      idempotent: outcome.idempotent === true,
    });
    const payload = {
      ban: outcome.ban,
      result: outcome.result,
      ok: true,
      status: 'OVERBOARD' as const,
      ...(outcome.idempotent ? { idempotent: true as const } : {}),
    };
    res.json(payload);
  } catch (e) {
    const reason = (e as Error).message;
    console.log('[OVERBOARD API] 400 reason=', reason);
    console.log('[OVERBOARD API] banId=', banId);
    console.log('[OVERBOARD API] userId=', userId);
    console.log('[OVERBOARD API] ban.status=', banRow?.status ?? null);
    console.log('[OVERBOARD API] isReceiver=', isReceiver);
    console.log('[OVERBOARD API] alreadyOverboard=', alreadyOverboard);
    console.log('[OVERBOARD API] alreadyResultExists=', alreadyResultExists);
    res.status(400).json({ error: reason });
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
      void trackEvent(ANALYTICS_EVENTS.RESULT_VIEWED, req.userId!, {
        banId: paramId(req),
      });
    }
    res.json({
      done: result.done,
      outcome: result.outcome ?? null,
      result: result.result ?? null,
      waiting: 'waiting' in result ? !!result.waiting : false,
      checkState: 'checkState' in result ? result.checkState : undefined,
      farmSkipped: 'farmSkipped' in result ? result.farmSkipped : undefined,
    });
  } catch (e) {
    res.status(400).json({ error: (e as Error).message });
  }
});
