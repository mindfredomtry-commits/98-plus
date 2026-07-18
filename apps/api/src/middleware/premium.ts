import type { Response, NextFunction } from 'express';
import { getActiveEntitlement } from '../services/entitlement.service';
import type { AuthRequest } from './auth';

/**
 * Requires an active PREMIUM entitlement.
 * Must run after requireAuth (expects req.userId from JWT).
 */
export async function requirePremium(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const userId = req.userId;
  if (!userId) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  try {
    const entitlement = await getActiveEntitlement(userId, 'PREMIUM');
    if (!entitlement) {
      res.status(403).json({ error: 'Premium required' });
      return;
    }
    next();
  } catch (err) {
    console.error('[premium] entitlement check failed', err);
    res.status(500).json({ error: 'Internal error' });
  }
}
