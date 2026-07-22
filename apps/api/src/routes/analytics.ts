import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, type AuthRequest } from '../middleware/auth';
import { requirePremium } from '../middleware/premium';
import { trackEvent } from '../services/analytics.service';
import {
  executeTrackV2OpenPremium,
  mapTrackV2StudioError,
  validateTrackV2Request,
} from '../services/analytics-track-v2';
import {
  RELATIONSHIP_ACTION_CODES,
  getRelationshipAction,
  getRelationshipDashboard,
  getRelationshipDay,
  getRelationshipOverview,
  getRelationshipPeriod,
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

/**
 * Tracker V2 dual-write endpoint. Currently open_premium only.
 * Actor userId always comes from JWT (requireAuth).
 */
analyticsRouter.post('/track-v2', async (req: AuthRequest, res) => {
  const validated = validateTrackV2Request(
    (req.body ?? {}) as { eventCode?: unknown; meta?: unknown },
  );
  if (!validated.ok) {
    res.status(validated.status).json({
      ok: false,
      code: validated.code,
      error: validated.error,
    });
    return;
  }

  try {
    await executeTrackV2OpenPremium(req.userId!, validated.meta);
    res.json({ ok: true });
  } catch (err) {
    console.error('[analytics/track-v2]', validated.eventCode, err);
    const mapped = mapTrackV2StudioError(err);
    res.status(mapped.status).json({
      ok: false,
      code: mapped.code,
      error: mapped.error,
    });
  }
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

const ACTIVITY_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Validate required YYYY-MM-DD activity date (calendar-valid, not Invalid Date). */
function parseActivityDate(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const date = raw.trim();
  if (!ACTIVITY_DATE_RE.test(date)) return null;

  const [yearStr, monthStr, dayStr] = date.split('-');
  const year = Number(yearStr);
  const month = Number(monthStr);
  const day = Number(dayStr);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (Number.isNaN(parsed.getTime())) return null;
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    return null;
  }
  return date;
}

const PERIOD_RANGE_CODES = ['1D', '1W', '1M', '1Y'] as const;
type PeriodRangeCode = (typeof PERIOD_RANGE_CODES)[number];

function parsePeriodRange(raw: unknown): PeriodRangeCode | null {
  if (typeof raw !== 'string') return null;
  const range = raw.trim().toUpperCase();
  return (PERIOD_RANGE_CODES as readonly string[]).includes(range)
    ? (range as PeriodRangeCode)
    : null;
}

const OVERVIEW_RANGE_CODES = ['1D', '1W', '1M', '1Y', 'ALL'] as const;
type OverviewRangeCode = (typeof OVERVIEW_RANGE_CODES)[number];

function parseOverviewRange(raw: unknown): OverviewRangeCode | null {
  if (typeof raw !== 'string') return null;
  const range = raw.trim().toUpperCase();
  return (OVERVIEW_RANGE_CODES as readonly string[]).includes(range)
    ? (range as OverviewRangeCode)
    : null;
}

// GET /analytics/relationships/overview?range=1W&anchorDate=YYYY-MM-DD
analyticsRouter.get(
  '/relationships/overview',
  async (req: AuthRequest, res) => {
    const range = parseOverviewRange(req.query.range);
    if (!range) {
      res.status(400).json({ error: 'Invalid range' });
      return;
    }

    const anchorDateRaw = req.query.anchorDate;
    const anchorDate =
      anchorDateRaw == null || anchorDateRaw === ''
        ? null
        : parseActivityDate(anchorDateRaw);
    if (anchorDateRaw != null && anchorDateRaw !== '' && !anchorDate) {
      res.status(400).json({ error: 'Invalid anchorDate' });
      return;
    }

    try {
      const overviewPayload = await getRelationshipOverview(
        req.userId!,
        range,
        anchorDate,
      );
      if (!overviewPayload) {
        res.status(404).json({ error: 'Not found' });
        return;
      }
      res.json(overviewPayload);
    } catch (err) {
      console.error('Failed to load relationship overview analytics', err);
      res.status(500).json({ error: 'Internal error' });
    }
  },
);

// GET /analytics/relationships/:otherUserId/dashboard
analyticsRouter.get(
  '/relationships/:otherUserId/dashboard',
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

// GET /analytics/relationships/:otherUserId/day?date=YYYY-MM-DD
analyticsRouter.get(
  '/relationships/:otherUserId/day',
  async (req: AuthRequest, res) => {
    const otherUserId = parseOtherUserId(req.params.otherUserId);
    if (!otherUserId) {
      res.status(400).json({ error: 'Invalid otherUserId' });
      return;
    }

    const activityDate = parseActivityDate(req.query.date);
    if (!activityDate) {
      res.status(400).json({ error: 'Invalid date' });
      return;
    }

    try {
      const dayPayload = await getRelationshipDay(
        req.userId!,
        otherUserId,
        activityDate,
      );
      // SQL function returns NO_ACTIVITY as JSON; only treat missing/non-object as 404.
      if (!dayPayload) {
        res.status(404).json({ error: 'Not found' });
        return;
      }
      res.json(dayPayload);
    } catch (err) {
      console.error('Failed to load relationship day analytics', err);
      res.status(500).json({ error: 'Internal error' });
    }
  },
);

// GET /analytics/relationships/:otherUserId/period?range=1W&anchorDate=YYYY-MM-DD
analyticsRouter.get(
  '/relationships/:otherUserId/period',
  async (req: AuthRequest, res) => {
    const otherUserId = parseOtherUserId(req.params.otherUserId);
    if (!otherUserId) {
      res.status(400).json({ error: 'Invalid otherUserId' });
      return;
    }

    const range = parsePeriodRange(req.query.range);
    if (!range) {
      res.status(400).json({ error: 'Invalid range' });
      return;
    }

    const anchorDateRaw = req.query.anchorDate;
    const anchorDate =
      anchorDateRaw == null || anchorDateRaw === ''
        ? null
        : parseActivityDate(anchorDateRaw);
    if (anchorDateRaw != null && anchorDateRaw !== '' && !anchorDate) {
      res.status(400).json({ error: 'Invalid anchorDate' });
      return;
    }

    try {
      const periodPayload = await getRelationshipPeriod(
        req.userId!,
        otherUserId,
        range,
        anchorDate,
      );
      if (!periodPayload) {
        res.status(404).json({ error: 'Not found' });
        return;
      }
      res.json(periodPayload);
    } catch (err) {
      console.error('Failed to load relationship period analytics', err);
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
