export const RELATIONSHIP_ACTION_CODES = [
  'OPEN_TIMELINE_RECENT_14_DAYS',
] as const;

export type RelationshipActionCode =
  (typeof RELATIONSHIP_ACTION_CODES)[number];

export function isRelationshipActionCode(
  value: unknown,
): value is RelationshipActionCode {
  return (
    typeof value === 'string' &&
    (RELATIONSHIP_ACTION_CODES as readonly string[]).includes(value)
  );
}

/** Peer selected for relationship analytics (registered friend only). */
export type AnalyticsPeer = {
  userId: string;
  displayName: string;
  avatarUrl?: string | null;
};

export type RelationshipDashboardPayload = {
  dashboardVersion?: string | number;
  ui?: Record<string, unknown>;
  header?: Record<string, unknown>;
  hero?: Record<string, unknown>;
  orb?: Record<string, unknown>;
  insights?: unknown[];
  patterns?: unknown;
  recommendations?: unknown;
  meta?: Record<string, unknown>;
  [key: string]: unknown;
};

export type RelationshipTimelineActivity = {
  interactionCount?: number;
  banSentCount?: number;
  banReceivedCount?: number;
  replySentCount?: number;
  replyReceivedCount?: number;
  [key: string]: unknown;
};

export type RelationshipTimelineResults = {
  count?: number;
  overboardCount?: number;
  bothYesCount?: number;
  bothNoCount?: number;
  splitCount?: number;
  timeoutCount?: number;
  expiredCount?: number;
  [key: string]: unknown;
};

export type RelationshipTimelineOrb = {
  state?: string;
  value?: number | string;
  [key: string]: unknown;
};

export type RelationshipTimelineDay = {
  date: string;
  activity?: RelationshipTimelineActivity;
  orb?: RelationshipTimelineOrb;
  results?: RelationshipTimelineResults;
  [key: string]: unknown;
};

export type RelationshipTimelinePayload = {
  action?: Record<string, unknown>;
  ui?: Record<string, unknown>;
  range?: Record<string, unknown>;
  timeline: RelationshipTimelineDay[];
  meta?: Record<string, unknown>;
  [key: string]: unknown;
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Soft dashboard guard — accepts Dashboard v6 without rejecting future fields.
 * Requires a plain object plus at least one known root marker.
 */
export function isRelationshipDashboardPayload(
  value: unknown,
): value is RelationshipDashboardPayload {
  if (!isPlainObject(value)) return false;

  const hasMarker =
    value.dashboardVersion != null ||
    isPlainObject(value.hero) ||
    isPlainObject(value.orb) ||
    isPlainObject(value.ui) ||
    isPlainObject(value.header) ||
    isPlainObject(value.meta) ||
    Array.isArray(value.insights) ||
    value.recommendations != null ||
    value.patterns != null;

  if (!hasMarker) return false;

  if (value.insights != null && !Array.isArray(value.insights)) return false;
  if (
    value.recommendations != null &&
    !isPlainObject(value.recommendations) &&
    !Array.isArray(value.recommendations)
  ) {
    return false;
  }

  return true;
}

export function isRelationshipTimelinePayload(
  value: unknown,
): value is RelationshipTimelinePayload {
  if (!isPlainObject(value)) return false;
  if (!isPlainObject(value.ui)) return false;
  if (!Array.isArray(value.timeline)) return false;

  for (const day of value.timeline) {
    if (!isPlainObject(day)) return false;
    if (typeof day.date !== 'string' || !day.date.trim()) return false;
    if (day.activity != null && !isPlainObject(day.activity)) return false;
  }

  return true;
}

export function asPlainObject(
  value: unknown,
): Record<string, unknown> | null {
  return isPlainObject(value) ? value : null;
}

export function readString(
  obj: Record<string, unknown> | null | undefined,
  ...keys: string[]
): string | null {
  if (!obj) return null;
  for (const key of keys) {
    const v = obj[key];
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return null;
}

export function readNumber(
  obj: Record<string, unknown> | null | undefined,
  ...keys: string[]
): number | null {
  if (!obj) return null;
  for (const key of keys) {
    const v = obj[key];
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    if (typeof v === 'string' && v.trim() && Number.isFinite(Number(v))) {
      return Number(v);
    }
  }
  return null;
}

export function formatAnalyticsDate(iso: string): string {
  try {
    return new Intl.DateTimeFormat('ru-RU', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}
