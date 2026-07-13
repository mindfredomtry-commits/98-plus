import { Router } from 'express';
import { processPendingMonetizationEvents } from '../services/monetization-event-processor';

export const internalMonetizationRouter = Router();

function isInternalMonetizationAuthorized(req: {
  header(name: string): string | undefined;
}): boolean {
  const secret = process.env.MONETIZATION_INTERNAL_SECRET;
  if (!secret) return false;
  const header = req.header('x-monetization-internal-secret');
  return Boolean(header && header === secret);
}

/**
 * POST /internal/monetization/process-events
 * Protected batch processor for DB-backed monetization outbox events.
 * Disabled when MONETIZATION_INTERNAL_SECRET is unset.
 */
internalMonetizationRouter.post('/process-events', async (req, res) => {
  if (!isInternalMonetizationAuthorized(req)) {
    res.status(404).json({ error: 'Not found' });
    return;
  }

  const rawLimit = Number(req.query.limit ?? req.body?.limit);
  const limit =
    Number.isFinite(rawLimit) && rawLimit > 0 && rawLimit <= 100
      ? Math.floor(rawLimit)
      : undefined;

  try {
    const result = await processPendingMonetizationEvents(limit);
    res.json(result);
  } catch (e) {
    console.error('[internal/monetization] process-events failed', e);
    res.status(500).json({ error: 'Internal error' });
  }
});
