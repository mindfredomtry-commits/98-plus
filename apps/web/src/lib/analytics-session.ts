/**
 * Analytics Tracker V2 client session identity.
 *
 * Not wired to production callsites yet. Anonymous tab-scoped correlation only —
 * never derives from auth tokens, Telegram identity, or init payloads.
 */

export const ANALYTICS_SESSION_STORAGE_KEY = '98plus_analytics_session_v1';

/** Rotate after 24h so a long-lived Telegram Web tab is not one endless session. */
export const ANALYTICS_SESSION_TTL_MS = 24 * 60 * 60 * 1000;

export const ANALYTICS_SESSION_VERSION = 1 as const;

/** Allow small clock skew when validating createdAt is not "in the future". */
const FUTURE_SKEW_MS = 5 * 60 * 1000;

type AnalyticsSessionRecord = {
  id: string;
  createdAt: string;
  version: typeof ANALYTICS_SESSION_VERSION;
};

let moduleCacheId: string | null = null;

/** Test-only: clear in-memory cache (simulates module re-init after reload). */
export function __resetAnalyticsSessionCacheForTests(): void {
  moduleCacheId = null;
}

/** Test-only: override "now" for TTL checks. */
let nowOverrideMs: number | null = null;

export function __setAnalyticsSessionNowForTests(ms: number | null): void {
  nowOverrideMs = ms;
}

function nowMs(): number {
  return nowOverrideMs ?? Date.now();
}

function isBrowser(): boolean {
  return typeof window !== 'undefined';
}

function generateAnalyticsSessionId(): string {
  try {
    if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
      return `ses_${crypto.randomUUID()}`;
    }
  } catch {
    // fall through
  }

  try {
    if (typeof crypto !== 'undefined' && 'getRandomValues' in crypto) {
      const bytes = new Uint8Array(16);
      crypto.getRandomValues(bytes);
      const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join(
        '',
      );
      return `ses_${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
    }
  } catch {
    // fall through
  }

  // Last-resort fallback: time + entropy (not used when crypto.randomUUID exists).
  return `ses_${Date.now().toString(16)}_${Math.random().toString(36).slice(2, 12)}`;
}

function isValidIdShape(id: unknown): id is string {
  if (typeof id !== 'string') return false;
  if (!id.startsWith('ses_')) return false;
  const uuidPart = id.slice('ses_'.length);
  return uuidPart.length > 0;
}

function parseStoredRecord(
  raw: string,
  now: number,
): AnalyticsSessionRecord | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    return null;
  }

  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    Array.isArray(parsed)
  ) {
    return null;
  }

  const obj = parsed as Record<string, unknown>;
  if (obj.version !== ANALYTICS_SESSION_VERSION) return null;
  if (!isValidIdShape(obj.id)) return null;
  if (typeof obj.createdAt !== 'string') return null;

  const created = Date.parse(obj.createdAt);
  if (Number.isNaN(created)) return null;
  if (created > now + FUTURE_SKEW_MS) return null;
  if (now - created > ANALYTICS_SESSION_TTL_MS) return null;

  return {
    id: obj.id,
    createdAt: obj.createdAt,
    version: ANALYTICS_SESSION_VERSION,
  };
}

function readSessionStorageRaw(): string | null {
  try {
    return window.sessionStorage.getItem(ANALYTICS_SESSION_STORAGE_KEY);
  } catch {
    return null;
  }
}

function writeSessionStorage(record: AnalyticsSessionRecord): boolean {
  try {
    window.sessionStorage.setItem(
      ANALYTICS_SESSION_STORAGE_KEY,
      JSON.stringify(record),
    );
    return true;
  } catch {
    return false;
  }
}

function createAndCache(): string {
  const id = generateAnalyticsSessionId();
  const record: AnalyticsSessionRecord = {
    id,
    createdAt: new Date(nowMs()).toISOString(),
    version: ANALYTICS_SESSION_VERSION,
  };
  moduleCacheId = id;
  if (isBrowser()) {
    writeSessionStorage(record);
  }
  return id;
}

/**
 * Lazy analytics session id for Tracker V2 (`meta.sessionId`).
 * Returns `null` on SSR / when `window` is unavailable.
 */
export function getAnalyticsSessionId(): string | null {
  if (!isBrowser()) return null;

  if (moduleCacheId && isValidIdShape(moduleCacheId)) {
    return moduleCacheId;
  }

  const now = nowMs();
  const raw = readSessionStorageRaw();
  if (raw != null) {
    const existing = parseStoredRecord(raw, now);
    if (existing) {
      moduleCacheId = existing.id;
      return existing.id;
    }
  }

  return createAndCache();
}
