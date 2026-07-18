import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, type AuthRequest } from '../middleware/auth';
import { requirePremium } from '../middleware/premium';
import { trackEvent } from '../services/analytics.service';
import {
  RELATIONSHIP_ACTION_CODES,
  getRelationshipAction,
  getRelationshipDashboard,
  type RelationshipActionCode,
} from '../services/relationship-analytics.service';

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

const relationshipActionSchema = z.object({
  actionCode: z.enum(
    RELATIONSHIP_ACTION_CODES as unknown as [
      RelationshipActionCode,
      ...RelationshipActionCode[],
    ],
  ),
});

function parseOtherUserId(raw: string | string[] | undefined): string | null {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (typeof value !== 'string') return null;
  const otherUserId = value.trim();
  return otherUserId.length > 0 ? otherUserId : null;
}

// GET /analytics/relationships/:otherUserId/dashboard
analyticsRouter.get(
  '/relationships/:otherUserId/dashboard',
  requirePremium,
  async (req: AuthRequest, res) => {
    const otherUserId = parseOtherUserId(req.params.otherUserId);
    if (!otherUserId) {
      res.status(400).json({ error: 'Invalid otherUserId' });
      return;
    }

    try {
      const dashboardPayload = await getRelationshipDashboard(
        req.userId!,
        otherUserId,
      );
      if (!dashboardPayload) {
        res.status(404).json({ error: 'Not found' });
        return;
      }
      res.json(dashboardPayload);
    } catch (err) {
      console.error('Failed to load relationship dashboard', err);
      res.status(500).json({ error: 'Internal error' });
    }
  },
);

// POST /analytics/relationships/:otherUserId/actions
analyticsRouter.post(
  '/relationships/:otherUserId/actions',
  requirePremium,
  async (req: AuthRequest, res) => {
    const otherUserId = parseOtherUserId(req.params.otherUserId);
    if (!otherUserId) {
      res.status(400).json({ error: 'Invalid otherUserId' });
      return;
    }

    const parsed = relationshipActionSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid actionCode' });
      return;
    }

    try {
      const actionPayload = await getRelationshipAction(
        req.userId!,
        otherUserId,
        parsed.data.actionCode,
      );
      if (!actionPayload) {
        res.status(404).json({ error: 'Not found' });
        return;
      }
      res.json(actionPayload);
    } catch (err) {
      console.error('Failed to load relationship action', err);
      res.status(500).json({ error: 'Internal error' });
    }
  },
);
