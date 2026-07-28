import { Router } from 'express';
import { requireAuth, type AuthRequest } from '../middleware/auth';
import {
  beginNativePickerSpike,
  getNativePickerSpikeForOwner,
  recordSpikeRequestChatCallback,
} from '../services/native-picker-spike.service';

/**
 * SPIKE ONLY — Telegram native request_users / WebApp.requestChat probe.
 * Gated by SPIKE_NATIVE_PICKER=1 on the API service.
 */
export const spikeNativePickerRouter = Router();

function spikeEnabled(): boolean {
  return process.env.SPIKE_NATIVE_PICKER === '1';
}

spikeNativePickerRouter.use(requireAuth);

spikeNativePickerRouter.use((_req, res, next) => {
  if (!spikeEnabled()) {
    res.status(404).json({ error: 'spike disabled' });
    return;
  }
  next();
});

spikeNativePickerRouter.post('/begin', async (req: AuthRequest, res) => {
  try {
    if (!req.userId || !req.telegramId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    const result = await beginNativePickerSpike({
      ownerUserId: req.userId,
      ownerTelegramId: req.telegramId,
    });
    if (result.request.status === 'error' || !result.preparedId) {
      res.status(502).json({
        error: result.request.errorMessage ?? 'prepare failed',
        request: result.request,
      });
      return;
    }
    res.json({
      preparedId: result.preparedId,
      request: result.request,
      /** Hint for clients: WebApp.requestChat(preparedId, cb) — cb is boolean only */
      miniAppCall: 'Telegram.WebApp.requestChat(preparedId, callback)',
      botApiMethod: 'savePreparedKeyboardButton',
    });
  } catch (err) {
    console.error('[spike-native-picker] begin failed', err);
    res.status(500).json({
      error: err instanceof Error ? err.message : 'begin failed',
    });
  }
});

spikeNativePickerRouter.get('/:id', async (req: AuthRequest, res) => {
  const view = await getNativePickerSpikeForOwner(
    req.userId!,
    String(req.params.id),
  );
  if (!view) {
    res.status(404).json({ error: 'not found' });
    return;
  }
  res.json({ request: view });
});

spikeNativePickerRouter.post('/:id/callback', async (req: AuthRequest, res) => {
  const ok = (req.body as { ok?: unknown })?.ok === true;
  const view = await recordSpikeRequestChatCallback(
    req.userId!,
    String(req.params.id),
    ok,
  );
  if (!view) {
    res.status(404).json({ error: 'not found' });
    return;
  }
  res.json({ request: view });
});
