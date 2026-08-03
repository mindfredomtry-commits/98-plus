/**
 * Notifications Sync HTTP — Contract V1.
 * Not yet wired to the production web Notifications Mapper/Transport.
 */
import { Router } from 'express';
import { requireAuth, type AuthRequest } from '../middleware/auth';
import { getNotificationsSyncV1 } from '../notifications/notifications-sync.service';
import { parseNotificationsSyncResponseV1 } from '../notifications/notifications-contract-v1.schema';

export const notificationsRouter = Router();

notificationsRouter.get('/sync', requireAuth, async (req: AuthRequest, res) => {
  const userId = req.userId!;
  const afterRevisionRaw = req.query.afterRevision;
  const afterRevision =
    typeof afterRevisionRaw === 'string' ? afterRevisionRaw : undefined;

  try {
    const sync = await getNotificationsSyncV1({ userId, afterRevision });
    const body = parseNotificationsSyncResponseV1(sync);
    res.json(body);
  } catch (e) {
    console.error('[notifications/sync]', (e as Error).message);
    res.status(500).json({ error: 'Notifications sync failed' });
  }
});
