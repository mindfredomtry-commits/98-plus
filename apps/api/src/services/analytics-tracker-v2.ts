import { prisma } from '../lib/prisma';

/**
 * Studio Tracker V2 write adapter.
 *
 * Source of truth:
 * - studio.track_analytics_event_v1
 * - studio.normalize_analytics_event_meta_v1
 * - studio.validate_analytics_event_meta_v1
 *
 * Not wired to production callsites yet. Do not replace Legacy trackEvent
 * until each event payload satisfies its Studio contract (p_enforce_priority
 * defaults to true and throws on incomplete priority-1 payloads).
 */
export const TRACK_ANALYTICS_EVENT_V1_FN =
  'studio.track_analytics_event_v1' as const;

export const ANALYTICS_TRACKER_V2_SOURCE_TYPE = 'analytics_event' as const;

export const ANALYTICS_TRACKER_V2_SCHEMA_VERSION =
  '98plus.analytics.v1' as const;

/**
 * Tracker V2 meta shape. Requiredness of optional fields is defined per
 * event contract in Studio — not all fields are globally mandatory.
 */
export type AnalyticsTrackerV2Meta = {
  schemaVersion: '98plus.analytics.v1';
  eventId: string;
  sourceType: 'analytics_event';
  sessionId: string;
  entryPoint?: string;
  relationshipId?: string;
  threadId?: string;
  banId?: string;
  tone?: string;
  emotion?: string;
  paymentIntentId?: string;
  paymentId?: string;
  provider?: string;
  recoveryReason?: string;
  dedupeKey?: string;
  [key: string]: unknown;
};

export type TrackAnalyticsEventV2Options = {
  /** Defaults to `analytics_event`. */
  sourceType?: string;
  /**
   * Defaults to `true`. Do not set `false` to bypass Studio validation —
   * incomplete priority-1 payloads must fail closed.
   */
  enforcePriority?: boolean;
};

export type TrackAnalyticsEventV2Call = {
  eventCode: string;
  userId: string | null;
  metaJson: string;
  sourceType: string;
  enforcePriority: boolean;
};

/** Resolve SQL args for studio.track_analytics_event_v1 (5 parameters). */
export function buildTrackAnalyticsEventV2Call(
  eventCode: string,
  userId: string | null | undefined,
  meta: AnalyticsTrackerV2Meta,
  options?: TrackAnalyticsEventV2Options,
): TrackAnalyticsEventV2Call {
  return {
    eventCode,
    userId: userId ?? null,
    metaJson: JSON.stringify(meta),
    sourceType: options?.sourceType ?? ANALYTICS_TRACKER_V2_SOURCE_TYPE,
    enforcePriority: options?.enforcePriority ?? true,
  };
}

/**
 * Strict Tracker V2 write. Calls Studio with enforcePriority=true by default.
 * Intentionally separate from Legacy `trackEvent`.
 */
export async function trackAnalyticsEventV2(
  eventCode: string,
  userId: string | null | undefined,
  meta: AnalyticsTrackerV2Meta,
  options?: TrackAnalyticsEventV2Options,
): Promise<void> {
  const call = buildTrackAnalyticsEventV2Call(
    eventCode,
    userId,
    meta,
    options,
  );

  await prisma.$queryRaw`
    SELECT studio.track_analytics_event_v1(
      ${call.eventCode},
      ${call.userId},
      CAST(${call.metaJson} AS jsonb),
      ${call.sourceType},
      ${call.enforcePriority}
    ) AS tracked
  `;
}
