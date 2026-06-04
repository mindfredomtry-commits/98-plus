'use client';

import { ApiError } from '@/lib/api';

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

/** ?probeSwipeHint=1 — outlines + console DOM probe (works in prod builds). */
export function isInstantBanSwipeHintProbe(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    new URLSearchParams(window.location.search).get('probeSwipeHint') === '1'
  );
}

export function instantBanSwipeHintDomDebug(
  build: string,
  nodes: Record<string, HTMLElement | null>,
): void {
  const probeOn = isInstantBanSwipeHintProbe();
  const isDevBuild = process.env.NODE_ENV === 'development';
  if (!probeOn && !isDevBuild) return;

  const pick = (el: HTMLElement | null) => {
    if (!el) return null;
    const s = getComputedStyle(el);
    return {
      tag: el.tagName,
      className: el.className,
      display: s.display,
      position: s.position,
      top: s.top,
      left: s.left,
      width: s.width,
      height: s.height,
      transform: s.transform,
      zIndex: s.zIndex,
      overflow: s.overflow,
      clipPath: s.clipPath,
    };
  };

  const picked = Object.fromEntries(
    Object.entries(nodes).map(([key, el]) => [key, pick(el)]),
  );

  const hintNodes = document.querySelectorAll('[data-what-swipe-hint]');

  console.log('[what-swipe-hint-dom]', {
    build,
    probeOn,
    hintNodeCount: hintNodes.length,
    hintBuilds: Array.from(hintNodes).map((el) =>
      el.getAttribute('data-hint-build'),
    ),
    ...picked,
  });
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

export type InstantBanSendBeforePayload = {
  banText: string;
  selectedUserId: string | null;
  selectedUsername: string | null;
  durationMinutes: number;
  senderUserId: string | null;
  currentUserId: string | null;
  payoffPhase: string;
  sendTriggered: boolean;
  inFlight: boolean;
  sharing: boolean;
  hasToken: boolean;
  receiverUserId: string | null;
  receiverTelegramId: string | null;
  devAuth: boolean;
  devPeerResolved: boolean;
  instantDirectSend: boolean;
  isRegistered: boolean;
};

export function instantBanSendBeforeDebug(data: InstantBanSendBeforePayload): void {
  if (!isDev) return;
  console.debug('[instant-ban:send-before]', data);
}

export function instantBanSendSuccessDebug(data: Record<string, unknown>): void {
  if (!isDev) return;
  console.debug('[instant-ban:send-success]', data);
}

export function instantBanPayoffArmDebug(data: Record<string, unknown>): void {
  if (!isDev) return;
  console.debug('[instant-ban:payoff-arm]', data);
}

export function instantBanPayoffStartDebug(data: Record<string, unknown>): void {
  if (!isDev) return;
  console.debug('[instant-ban:payoff-start]', data);
}

export function instantBanPayoffPhaseDebug(
  phase: string,
  className: string,
  el: HTMLElement,
): void {
  if (!isDev) return;
  const style = getComputedStyle(el);
  console.debug('[instant-ban:payoff-phase]', {
    phase,
    className,
    width: style.width,
    height: style.height,
    borderRadius: style.borderRadius,
    clipPath: style.clipPath,
    mask: style.mask || style.webkitMask,
    transform: style.transform,
    left: style.left,
    top: style.top,
  });
}

export function serializeInstantBanSendError(error: unknown): {
  message: string;
  status?: number;
  response?: unknown;
  stack?: string;
} {
  if (error instanceof ApiError) {
    return {
      message: error.message,
      status: error.status,
      response: { url: error.url ?? null },
      stack: error.stack,
    };
  }
  if (error instanceof Error) {
    return {
      message: error.message,
      stack: error.stack,
      status: (error as Error & { status?: number }).status,
      response: (error as Error & { response?: unknown }).response,
    };
  }
  return { message: String(error) };
}

export function instantBanSendErrorDebug(data: {
  message: string;
  error: unknown;
  response?: unknown;
  status?: number;
  stack?: string;
}): void {
  if (!isDev) return;
  const serialized = serializeInstantBanSendError(data.error);
  console.debug('[instant-ban:send-error]', {
    message: data.message || serialized.message,
    status: data.status ?? serialized.status,
    response: data.response ?? serialized.response,
    stack: data.stack ?? serialized.stack,
    error: data.error,
  });
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
