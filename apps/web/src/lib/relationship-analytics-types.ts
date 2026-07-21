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

export type RelationshipDirection =
  | 'VIEWER'
  | 'OTHER'
  | 'BALANCED'
  | 'LOW_DATA'
  | 'NOT_AVAILABLE';

export type RelationshipRing = 'OUTER' | 'MIDDLE' | 'INNER';

/** Known ORB dimension codes (soft — unknown codes still accepted). */
export type RelationshipOrbDimensionCode =
  | 'INITIATIVE'
  | 'RESPONSIVENESS'
  | 'RESPECT';

export type RelationshipDimension = {
  code: string;
  ring: RelationshipRing | null;
  available: boolean;
  publishable: boolean;
  viewerShare: number | null;
  otherShare: number | null;
  displayValue: string | null;
  direction: RelationshipDirection;
  title: string;
  description: string | null;
  confidenceCode: string | null;
  confidenceScore: number | null;
  sampleSize: number | null;
  metricCode: string;
  resultCode: string | null;
  resultName?: string | null;
  supportingFacts?: Record<string, unknown> | null;
};

/** Soft ORB dimension — accepts legacy / extra API fields. */
export type RelationshipOrbDimension = RelationshipDimension & {
  /** Optional per-side samples (legacy RESPECT fields). */
  viewerSampleSize?: number | null;
  otherSampleSize?: number | null;
  [key: string]: unknown;
};

export type RelationshipScreenPeer = {
  userId?: string;
  displayName?: string | null;
  avatarUrl?: string | null;
  [key: string]: unknown;
};

export type RelationshipOrbPayload = {
  centerLabel?: string | null;
  dimensions?: RelationshipOrbDimension[];
  [key: string]: unknown;
};

export type RelationshipScreenDimensionsPayload = {
  relationshipOrb: {
    dimensions: RelationshipDimension[];
  };
  allDimensions?: RelationshipDimension[];
};

export type RelationshipScreenRecommendation = {
  title?: string | null;
  summary?: string | null;
  description?: string | null;
  action?: {
    code?: string;
    label?: string | null;
    [key: string]: unknown;
  } | null;
  [key: string]: unknown;
};

export type RelationshipScreenPrimaryAction = {
  code?: string;
  label?: string | null;
  [key: string]: unknown;
};

export type RelationshipScreenPayload = {
  contractVersion?: string | number;
  title?: string | null;
  peer?: RelationshipScreenPeer;
  summary?: string | null;
  status?: string | null;
  relationshipOrb?: RelationshipOrbPayload;
  allDimensions?: RelationshipDimension[];
  recommendation?: RelationshipScreenRecommendation | null;
  primaryAction?: RelationshipScreenPrimaryAction | null;
  weeklyDynamics?: unknown;
  meta?: Record<string, unknown>;
  [key: string]: unknown;
};

export type RelationshipDashboardPayload = {
  dashboardVersion?: string | number;
  relationshipScreen?: RelationshipScreenPayload;
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

/** Day analytics payload from GET .../day?date=YYYY-MM-DD */
export type RelationshipDayPayload = {
  relationshipScreen?: RelationshipScreenPayload;
  dayAnalytics?: unknown;
  meta?: Record<string, unknown>;
  [key: string]: unknown;
};

export const RELATIONSHIP_PERIOD_RANGE_CODES = [
  '1D',
  '1W',
  '1M',
  '1Y',
] as const;

export type RelationshipPeriodRangeCode =
  (typeof RELATIONSHIP_PERIOD_RANGE_CODES)[number];

/** Period analytics payload from GET .../period?range=1W */
export type RelationshipPeriodPayload = {
  relationshipScreen?: RelationshipScreenPayload;
  periodAnalytics?: unknown;
  meta?: Record<string, unknown>;
  [key: string]: unknown;
};

export type WeeklyDynamicsDayOption = {
  date: string;
  label: string;
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

export function isRelationshipScreenPayload(
  value: unknown,
): value is RelationshipScreenPayload {
  if (!isPlainObject(value)) return false;
  if (!isPlainObject(value.peer)) return false;
  if (!isPlainObject(value.relationshipOrb)) return false;
  const dims = value.relationshipOrb.dimensions;
  if (dims != null && !Array.isArray(dims)) return false;
  return true;
}

/**
 * Soft dashboard guard — accepts Dashboard v6/v7 without rejecting future fields.
 */
export function isRelationshipDashboardPayload(
  value: unknown,
): value is RelationshipDashboardPayload {
  if (!isPlainObject(value)) return false;

  const hasMarker =
    value.dashboardVersion != null ||
    isPlainObject(value.relationshipScreen) ||
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

/**
 * Soft day-payload guard — relationshipScreen / dayAnalytics / meta.selectedDate.
 */
export function isRelationshipDayPayload(
  value: unknown,
): value is RelationshipDayPayload {
  if (!isPlainObject(value)) return false;
  return (
    isPlainObject(value.relationshipScreen) ||
    value.dayAnalytics != null ||
    isPlainObject(value.meta)
  );
}

/**
 * Soft period-payload guard — relationshipScreen / periodAnalytics / meta.selectedRange.
 */
export function isRelationshipPeriodPayload(
  value: unknown,
): value is RelationshipPeriodPayload {
  if (!isPlainObject(value)) return false;
  return (
    isPlainObject(value.relationshipScreen) ||
    value.periodAnalytics != null ||
    isPlainObject(value.meta)
  );
}

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function readIsoDate(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return ISO_DATE_RE.test(trimmed) ? trimmed : null;
}

function chipLabelFromIso(iso: string): string {
  const day = Number(iso.slice(8, 10));
  return Number.isFinite(day) ? String(day) : iso;
}

/** Parse weeklyDynamics strip into selectable YYYY-MM-DD options. */
export function parseWeeklyDynamicsOptions(
  raw: unknown,
): WeeklyDynamicsDayOption[] {
  if (!Array.isArray(raw)) return [];

  const out: WeeklyDynamicsDayOption[] = [];
  const seen = new Set<string>();

  for (const item of raw) {
    let date: string | null = null;
    let label: string | null = null;

    if (typeof item === 'string') {
      date = readIsoDate(item);
    } else {
      const obj = asPlainObject(item);
      if (!obj) continue;
      date =
        readIsoDate(obj.date) ??
        readIsoDate(obj.activityDate) ??
        readIsoDate(obj.selectedDate) ??
        readIsoDate(obj.day);
      if (typeof obj.label === 'string' && obj.label.trim()) {
        label = obj.label.trim();
      } else if (typeof obj.dayLabel === 'string' && obj.dayLabel.trim()) {
        label = obj.dayLabel.trim();
      }
    }

    if (!date || seen.has(date)) continue;
    seen.add(date);
    out.push({ date, label: label ?? chipLabelFromIso(date) });
  }

  return out;
}

export function readRelationshipScreenStatus(
  screen: RelationshipScreenPayload | null | undefined,
): string | null {
  if (!screen) return null;
  const status = screen.status;
  return typeof status === 'string' && status.trim() ? status.trim() : null;
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

/**
 * Prefer human-readable UI keys. Callers must pass only safe keys
 * (never code/state as defaults). No enum→text dictionary.
 */
export function readUiText(
  obj: Record<string, unknown> | null | undefined,
  ...keys: string[]
): string | null {
  return readString(obj, ...keys);
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

/** Presentation-only ORB value. Does not mutate payload or invent meaning. */
export function formatOrbDisplayValue(
  orb: Record<string, unknown> | null | undefined,
): string | null {
  const ready = readUiText(
    orb,
    'displayValue',
    'formattedValue',
    'percentageLabel',
  );
  if (ready) return ready;

  const value = readNumber(orb, 'value');
  if (value == null) return null;
  if (value >= 0 && value <= 1) {
    return `${Math.round(value * 100)}%`;
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

const RING_ORDER: RelationshipRing[] = ['OUTER', 'MIDDLE', 'INNER'];

export function ringSortIndex(ring: string | null | undefined): number {
  const i = RING_ORDER.indexOf(ring as RelationshipRing);
  return i >= 0 ? i : 99;
}
