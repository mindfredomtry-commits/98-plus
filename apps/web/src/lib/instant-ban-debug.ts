'use client';

/** Dev diagnostics + ?liteInstantBan=1 GPU/layout experiments */

const isDev = process.env.NODE_ENV === 'development';

let liteCached: boolean | null = null;

export function isInstantBanLiteMode(): boolean {
  if (typeof window === 'undefined') return false;
  if (liteCached !== null) return liteCached;
  liteCached =
    new URLSearchParams(window.location.search).get('liteInstantBan') === '1';
  return liteCached;
}

/** Production + lite: uncontrolled input (no setState per keystroke). */
export function isInstantBanUncontrolledInput(): boolean {
  return true;
}

/** Lite only: swap textarea → input for A/B. */
export function isInstantBanUseInputElement(): boolean {
  return isDev && isInstantBanLiteMode();
}

export function instantBanDebug(
  tag: string,
  data?: Record<string, unknown>,
): void {
  if (!isDev) return;
  console.debug(`[instant-ban:${tag}]`, {
    t: Date.now(),
    ...data,
  });
}

export function instantBanSendBeforeDebug(data: {
  banText: string;
  selectedUserId: string | null;
  durationMinutes: number;
  payoffPhase: string;
  sendTriggered: boolean;
}): void {
  if (!isDev) return;
  console.debug('[instant-ban:send-before]', data);
}

export function instantBanSendErrorDebug(data: {
  message: string;
  error: unknown;
  response?: unknown;
}): void {
  if (!isDev) return;
  console.debug('[instant-ban:send-error]', data);
}

export type InstantBanViewportDiagRefs = {
  resizeCount: number;
  vvResizeCount: number;
};

export function logInstantBanViewport(
  source: string,
  counts: InstantBanViewportDiagRefs,
): void {
  if (!isDev) return;
  const vv = typeof window !== 'undefined' ? window.visualViewport : null;
  instantBanDebug('viewport', {
    source,
    innerHeight: typeof window !== 'undefined' ? window.innerHeight : null,
    innerWidth: typeof window !== 'undefined' ? window.innerWidth : null,
    vvHeight: vv?.height ?? null,
    vvWidth: vv?.width ?? null,
    vvOffsetTop: vv?.offsetTop ?? null,
    resizeCount: counts.resizeCount,
    vvResizeCount: counts.vvResizeCount,
  });
}
