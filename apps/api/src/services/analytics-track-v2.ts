import {
  ANALYTICS_TRACKER_V2_SCHEMA_VERSION,
  ANALYTICS_TRACKER_V2_SOURCE_TYPE,
  trackAnalyticsEventV2,
  type AnalyticsTrackerV2Meta,
} from './analytics-tracker-v2';

export const TRACK_V2_SUPPORTED_EVENT_CODES = ['open_premium'] as const;
export type TrackV2SupportedEventCode =
  (typeof TRACK_V2_SUPPORTED_EVENT_CODES)[number];

export const OPEN_PREMIUM_ENTRY_POINT = 'relationship_analytics' as const;
export const OPEN_PREMIUM_EVENT_ID_PREFIX = 'evt_open_premium_' as const;
export const ANALYTICS_SESSION_ID_PREFIX = 'ses_' as const;

export type TrackV2RequestBody = {
  eventCode?: unknown;
  meta?: unknown;
};

export type TrackV2ValidationOk = {
  ok: true;
  eventCode: TrackV2SupportedEventCode;
  meta: AnalyticsTrackerV2Meta;
};

export type TrackV2ValidationErr = {
  ok: false;
  status: 400;
  code: string;
  error: string;
};

export type TrackV2ValidationResult =
  | TrackV2ValidationOk
  | TrackV2ValidationErr;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function fail(code: string, error: string): TrackV2ValidationErr {
  return { ok: false, status: 400, code, error };
}

/**
 * Lightweight gateway validation for POST /analytics/track-v2.
 * Studio remains the source of truth for full contract enforcement.
 */
export function validateTrackV2Request(
  body: TrackV2RequestBody,
): TrackV2ValidationResult {
  const eventCode =
    typeof body.eventCode === 'string' ? body.eventCode.trim() : '';

  if (!eventCode) {
    return fail('INVALID_EVENT_CODE', 'eventCode required');
  }

  if (
    !(TRACK_V2_SUPPORTED_EVENT_CODES as readonly string[]).includes(eventCode)
  ) {
    return fail(
      'UNSUPPORTED_EVENT_CODE',
      `Unsupported eventCode: ${eventCode}`,
    );
  }

  if (!isPlainObject(body.meta)) {
    return fail('INVALID_META', 'meta object required');
  }

  const meta = body.meta;

  if (meta.schemaVersion !== ANALYTICS_TRACKER_V2_SCHEMA_VERSION) {
    return fail('INVALID_SCHEMA_VERSION', 'Invalid schemaVersion');
  }

  if (meta.sourceType !== ANALYTICS_TRACKER_V2_SOURCE_TYPE) {
    return fail('INVALID_SOURCE_TYPE', 'Invalid sourceType');
  }

  if (
    typeof meta.eventId !== 'string' ||
    !meta.eventId.startsWith(OPEN_PREMIUM_EVENT_ID_PREFIX) ||
    meta.eventId.length <= OPEN_PREMIUM_EVENT_ID_PREFIX.length
  ) {
    return fail('INVALID_EVENT_ID', 'Invalid eventId');
  }

  if (
    typeof meta.sessionId !== 'string' ||
    !meta.sessionId.startsWith(ANALYTICS_SESSION_ID_PREFIX) ||
    meta.sessionId.length <= ANALYTICS_SESSION_ID_PREFIX.length
  ) {
    return fail('INVALID_SESSION_ID', 'Invalid sessionId');
  }

  if (meta.entryPoint !== OPEN_PREMIUM_ENTRY_POINT) {
    return fail('INVALID_ENTRY_POINT', 'Invalid entryPoint');
  }

  return {
    ok: true,
    eventCode: eventCode as TrackV2SupportedEventCode,
    meta: {
      schemaVersion: ANALYTICS_TRACKER_V2_SCHEMA_VERSION,
      eventId: meta.eventId,
      sourceType: ANALYTICS_TRACKER_V2_SOURCE_TYPE,
      sessionId: meta.sessionId,
      entryPoint: OPEN_PREMIUM_ENTRY_POINT,
    },
  };
}

/** Map Studio / DB failures to a client-safe payload (no SQL stack). */
export function mapTrackV2StudioError(err: unknown): {
  status: number;
  code: string;
  error: string;
} {
  const message =
    err instanceof Error
      ? err.message
      : typeof err === 'string'
        ? err
        : 'Analytics tracking failed';

  const lower = message.toLowerCase();
  if (
    lower.includes('validat') ||
    lower.includes('priority') ||
    lower.includes('contract') ||
    lower.includes('schema')
  ) {
    return {
      status: 400,
      code: 'STUDIO_VALIDATION_FAILED',
      error: 'Event failed Studio validation',
    };
  }

  return {
    status: 500,
    code: 'TRACK_V2_FAILED',
    error: 'Failed to track analytics event',
  };
}

export async function executeTrackV2OpenPremium(
  userId: string,
  meta: AnalyticsTrackerV2Meta,
): Promise<void> {
  await trackAnalyticsEventV2('open_premium', userId, meta, {
    sourceType: ANALYTICS_TRACKER_V2_SOURCE_TYPE,
    enforcePriority: true,
  });
}
