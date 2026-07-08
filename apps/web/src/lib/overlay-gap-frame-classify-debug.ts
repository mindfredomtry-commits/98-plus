'use client';

export type OverlayGapFrameReason =
  | 'no-gap-card-visible'
  | 'gap-covered-by-backdrop'
  | 'gap-backdrop-not-mounted'
  | 'gap-backdrop-transparent'
  | 'gap-backdrop-under-lobby'
  | 'gap-direct-overboard-cleanup'
  | 'gap-queue-head-null'
  | 'gap-unknown';

export type OverlayGapFrameClassified = {
  timestamp: number;
  ownerQueueLen: number;
  ownerPendingLen: number;
  queueHeadKind: string | null;
  activeKind: string | null;
  shellKind: string | null;
  mountedCardVisible: boolean;
  mountedCardHasContent: boolean;
  globalOverlayHostActive: boolean;
  notificationOverlayVisible: boolean;
  visualQueueDimSessionLive: boolean;
  backdropMounted: boolean;
  backdropActive: boolean;
  backdropComputedOpacity: string | null;
  backdropZIndex: string | null;
  hostZIndex: string | null;
  lobbyZIndex: string | null;
  directOverboardMounted: boolean;
  directOverboardActive: boolean;
  resultOverlayMounted: boolean;
  incomingOverlayMounted: boolean;
  checkOverlayMounted: boolean;
  isGoToBansPath: boolean;
  sendFlowOpening: boolean;
  reason: OverlayGapFrameReason;
};

export type OverlayGapFrameClassifyInput = Omit<
  OverlayGapFrameClassified,
  'timestamp' | 'reason'
> & {
  /** True when DirectOverboard was mounted on the previous classify frame. */
  prevDirectOverboardMounted?: boolean;
};

function parseZIndex(value: string | null): number | null {
  if (value == null || value === '' || value === 'auto') return null;
  const n = Number.parseFloat(value);
  return Number.isFinite(n) ? n : null;
}

function opacityIsTransparent(opacity: string | null): boolean {
  if (opacity == null) return true;
  const n = Number.parseFloat(opacity);
  return !Number.isFinite(n) || n <= 0;
}

/**
 * Classify whether the lobby can flash through a notification-queue card gap.
 * Pure — no side effects.
 */
export function classifyOverlayGapFrame(
  input: OverlayGapFrameClassifyInput,
): OverlayGapFrameReason {
  const cardShowing =
    input.mountedCardVisible && input.mountedCardHasContent;

  if (cardShowing) {
    return 'no-gap-card-visible';
  }

  // Direct-overboard portal still paints above lobby — not a lobby flash gap.
  if (input.directOverboardMounted || input.directOverboardActive) {
    return 'no-gap-card-visible';
  }

  const backdropZ = parseZIndex(input.backdropZIndex);
  const hostZ = parseZIndex(input.hostZIndex);
  const lobbyZ = parseZIndex(input.lobbyZIndex);
  const coveringZ = backdropZ ?? hostZ;
  const underLobby =
    coveringZ != null && lobbyZ != null && coveringZ <= lobbyZ;

  if (input.backdropMounted && input.backdropActive) {
    if (underLobby) {
      return 'gap-backdrop-under-lobby';
    }
    if (opacityIsTransparent(input.backdropComputedOpacity)) {
      return 'gap-backdrop-transparent';
    }
    return 'gap-covered-by-backdrop';
  }

  if (input.backdropMounted && !input.backdropActive) {
    return 'gap-backdrop-transparent';
  }

  // Card gap with DirectOverboard just torn down and no dim/host yet.
  if (
    input.prevDirectOverboardMounted === true &&
    !input.directOverboardMounted &&
    !input.backdropMounted &&
    !input.visualQueueDimSessionLive
  ) {
    return 'gap-direct-overboard-cleanup';
  }

  if (input.queueHeadKind == null) {
    return 'gap-queue-head-null';
  }

  if (!input.backdropMounted) {
    return 'gap-backdrop-not-mounted';
  }

  return 'gap-unknown';
}

export type OverlayGapFrameDomSnapshot = Pick<
  OverlayGapFrameClassifyInput,
  | 'backdropMounted'
  | 'backdropActive'
  | 'backdropComputedOpacity'
  | 'backdropZIndex'
  | 'hostZIndex'
  | 'lobbyZIndex'
>;

export function readOverlayGapFrameDom(): OverlayGapFrameDomSnapshot {
  if (typeof document === 'undefined') {
    return {
      backdropMounted: false,
      backdropActive: false,
      backdropComputedOpacity: null,
      backdropZIndex: null,
      hostZIndex: null,
      lobbyZIndex: null,
    };
  }

  const host = document.querySelector('[data-notification-layer]');
  const backdrop =
    document.querySelector('[data-overlay-backdrop]') ??
    document.querySelector('.app-notification-layer__session-backdrop');
  const lobby = document.querySelector('.instant-ban-flow');
  const hostStyle = host ? getComputedStyle(host) : null;
  const backdropStyle = backdrop ? getComputedStyle(backdrop) : null;
  const lobbyStyle = lobby ? getComputedStyle(lobby) : null;
  const computedOpacity = backdropStyle?.opacity ?? null;
  const backdropActive =
    backdrop != null &&
    backdropStyle != null &&
    backdropStyle.visibility !== 'hidden' &&
    backdropStyle.display !== 'none' &&
    !opacityIsTransparent(computedOpacity);

  return {
    backdropMounted: backdrop != null,
    backdropActive,
    backdropComputedOpacity: computedOpacity,
    backdropZIndex: backdropStyle?.zIndex ?? null,
    hostZIndex: hostStyle?.zIndex ?? null,
    lobbyZIndex: lobbyStyle?.zIndex ?? null,
  };
}

export function shouldEmitOverlayGapFrameClassified(input: {
  ownerQueueLen: number;
  ownerPendingLen: number;
}): boolean {
  return input.ownerQueueLen > 0 || input.ownerPendingLen > 0;
}

export function logOverlayGapFrameClassified(
  input: OverlayGapFrameClassifyInput,
  reason: OverlayGapFrameReason,
): void {
  const {
    prevDirectOverboardMounted: _prev,
    ...fields
  } = input;
  const payload: OverlayGapFrameClassified = {
    timestamp: performance.now(),
    ...fields,
    reason,
  };
  console.log('OVERLAY_GAP_FRAME_CLASSIFIED', payload);
  window.__debug98log?.('OVERLAY_GAP_FRAME_CLASSIFIED', payload);
}
