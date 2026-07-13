import { Router } from 'express';
import { requireAuth, type AuthRequest } from '../middleware/auth';
import { getEntitlementsSummary } from '../services/entitlement.service';

export const meRouter = Router();
meRouter.use(requireAuth);

// GET /me/entitlements — current premium status (Entitlement-based, never Payment).
meRouter.get('/entitlements', async (req: AuthRequest, res) => {
  const summary = await getEntitlementsSummary(req.userId!);
  res.json(summary);
});
