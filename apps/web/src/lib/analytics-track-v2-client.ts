import { api } from './api';
import { getAnalyticsSessionId } from './analytics-session';

export const TRACKER_V2_SCHEMA_VERSION = '98plus.analytics.v1' as const;
export const TRACKER_V2_SOURCE_TYPE = 'analytics_event' as const;
export const OPEN_PREMIUM_EVENT_CODE = 'open_premium' as const;
export const OPEN_PREMIUM_ENTRY_POINT = 'relationship_analytics' as const;
export const OPEN_PREMIUM_EVENT_ID_PREFIX = 'evt_open_premium_' as const;

export type OpenPremiumV2Meta = {
  schemaVersion: typeof TRACKER_V2_SCHEMA_VERSION;
  eventId: string;
  sourceType: typeof TRACKER_V2_SOURCE_TYPE;
  sessionId: string;
  entryPoint: typeof OPEN_PREMIUM_ENTRY_POINT;
};

export type OpenPremiumV2RequestBody = {
  eventCode: typeof OPEN_PREMIUM_EVENT_CODE;
  meta: OpenPremiumV2Meta;
};

/** Create eventId at click time only — never in render. */
export function newOpenPremiumEventId(): string {
  try {
    if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
      return `${OPEN_PREMIUM_EVENT_ID_PREFIX}${crypto.randomUUID()}`;
    }
  } catch {
    // fall through
  }
  return `${OPEN_PREMIUM_EVENT_ID_PREFIX}${Date.now().toString(16)}_${Math.random().toString(36).slice(2, 12)}`;
}

export function buildOpenPremiumV2Request(
  sessionId: string,
  eventId: string = newOpenPremiumEventId(),
): OpenPremiumV2RequestBody {
  return {
    eventCode: OPEN_PREMIUM_EVENT_CODE,
    meta: {
      schemaVersion: TRACKER_V2_SCHEMA_VERSION,
      eventId,
      sourceType: TRACKER_V2_SOURCE_TYPE,
      sessionId,
      entryPoint: OPEN_PREMIUM_ENTRY_POINT,
    },
  };
}

/**
 * Dual-write Tracker V2 companion for open_premium.
 * Fire-and-forget. Skips when token or analytics session is missing.
 * Never throws into UI / never blocks Premium navigation.
 */
export function trackOpenPremiumV2(
  token: string | null | undefined,
): void {
  if (!token) return;

  const sessionId = getAnalyticsSessionId();
  if (sessionId == null) return;

  const body = buildOpenPremiumV2Request(sessionId, newOpenPremiumEventId());

  void api('/analytics/track-v2', {
    method: 'POST',
    token,
    body: JSON.stringify(body),
    retries: 0,
  }).catch(() => {
    // analytics is best-effort
  });
}
