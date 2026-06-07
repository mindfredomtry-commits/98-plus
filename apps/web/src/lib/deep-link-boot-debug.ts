/** Read-only deep link boot diagnostics — does not affect routing. */

export type DeepLinkBootDebugSnapshot = {
  startParamRaw: string | null;
  startParamResolved: string | null;
  parsedType: string | null;
  parsedBanId: string | null;
  deepLinkDetected: boolean;
  deepLinkConsumed: boolean;
  bootBlocker: string | null;
  lastHandler: string | null;
};

const EMPTY: DeepLinkBootDebugSnapshot = {
  startParamRaw: null,
  startParamResolved: null,
  parsedType: null,
  parsedBanId: null,
  deepLinkDetected: false,
  deepLinkConsumed: false,
  bootBlocker: null,
  lastHandler: null,
};

let snapshot: DeepLinkBootDebugSnapshot = { ...EMPTY };
const listeners = new Set<() => void>();

export function readStartParamRawFromLocation(): string | null {
  if (typeof window === 'undefined') return null;
  const search = new URLSearchParams(window.location.search);
  const fromQuery =
    search.get('tgWebAppStartParam') ??
    search.get('startapp') ??
    search.get('start_param');
  if (fromQuery?.trim()) return fromQuery.trim();

  const hash = window.location.hash.replace(/^#/, '');
  if (!hash) return null;
  const hashParams = new URLSearchParams(hash);
  const fromHash =
    hashParams.get('tgWebAppStartParam') ??
    hashParams.get('startapp') ??
    hashParams.get('start_param');
  return fromHash?.trim() || null;
}

export function patchDeepLinkBootDebug(
  patch: Partial<DeepLinkBootDebugSnapshot>,
): void {
  snapshot = { ...snapshot, ...patch };
  listeners.forEach((listener) => listener());
}

export function getDeepLinkBootDebug(): DeepLinkBootDebugSnapshot {
  return snapshot;
}

export function subscribeDeepLinkBootDebug(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function noteDeepLinkHandlerOpened(
  handler: string,
  banId?: string | null,
): void {
  patchDeepLinkBootDebug({
    lastHandler: banId ? `${handler}:${banId}` : handler,
  });
}
