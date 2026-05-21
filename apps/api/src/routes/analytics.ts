import { Router } from 'express';
import { requireAuth, type AuthRequest } from '../middleware/auth';
import { trackEvent } from '../services/analytics.service';

export const analyticsRouter = Router();
analyticsRouter.use(requireAuth);

analyticsRouter.post('/track', async (req: AuthRequest, res) => {
  const { name, meta } = req.body as {
    name?: string;
    meta?: Record<string, unknown>;
  };
  if (!name) {
    res.status(400).json({ error: 'name required' });
    return;
  }
  await trackEvent(name, req.userId!, meta);
  res.json({ ok: true });
});
