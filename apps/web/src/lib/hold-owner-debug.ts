'use client';

export type HoldOwner =
  | 'queue-card-hold'
  | 'confirm-hold-protection'
  | 'result-shell-guard'
  | 'reply-compose-guard'
  | 'unknown';

export type HoldOwnerScreenContext = {
  route: string;
  screen: string;
  queueLen: number;
  pendingLen: number;
};

function emit(event: string, data?: Record<string, unknown>): void {
  const payload = { t: performance.now(), ...data };
  console.log(event, payload);
  window.__debug98log?.(event, payload);
}

export function readHoldOwnerRoute(): string {
  return typeof window !== 'undefined' ? window.location.pathname : '';
}

export function buildHoldOwnerScreenLabel(input: {
  sendComposePhase?: string;
  activeOverlayKind?: string | null;
  replyComposeActive?: boolean;
  lobbyOpen?: boolean;
  notificationChainAwaitingUser?: boolean;
}): string {
  const phase = input.sendComposePhase?.trim() ?? '';
  if (phase && phase !== 'idle') return `compose:${phase}`;
  if (input.replyComposeActive) return 'reply-compose';
  if (input.activeOverlayKind) return `overlay:${input.activeOverlayKind}`;
  if (input.notificationChainAwaitingUser) return 'notification-queue';
  if (input.lobbyOpen) return 'lobby';
  return 'home';
}

export function inferHoldOwner(
  source: string,
  opts?: {
    kind?: string | null;
    composePhase?: string;
    replyComposeActive?: boolean;
  },
): HoldOwner {
  const src = source.toLowerCase();
  const phase = opts?.composePhase?.trim() ?? '';

  if (
    phase === 'confirming' ||
    src.includes('confirm') ||
    src.includes('compose-state-change')
  ) {
    return 'confirm-hold-protection';
  }
  if (opts?.replyComposeActive || src.includes('reply-compose')) {
    return 'reply-compose-guard';
  }
  if (
    src.includes('result-shell') ||
    src.includes('passive-result') ||
    src.includes('result-priority')
  ) {
    return 'result-shell-guard';
  }
  if (
    src.includes('syncdisplay') ||
    src.includes('applyoverlay') ||
    src.includes('shownext') ||
    src.includes('capture') ||
    src.includes('pruneandsync') ||
    src.includes('chain') ||
    src.includes('overlayqueue') ||
    opts?.kind === 'incoming' ||
    opts?.kind === 'check' ||
    opts?.kind === 'result'
  ) {
    return 'queue-card-hold';
  }
  return 'unknown';
}

export function logHoldOwnerSet(
  data: HoldOwnerScreenContext & {
    owner: HoldOwner;
    source: string;
    kind: string;
    banId: string;
    reason: string;
  },
): void {
  emit('[HOLD OWNER SET]', data);
}

export function logHoldOwnerBlock(
  data: HoldOwnerScreenContext & {
    owner: HoldOwner;
    source: string;
    kind: string;
    banId: string;
    requestedNextKind: string | null;
    requestedNextBanId: string | null;
    reason: string;
  },
): void {
  emit('[HOLD OWNER BLOCK]', data);
}

export function logConfirmHoldProtectionActive(
  data: HoldOwnerScreenContext & {
    hasConfirmHoldButton: boolean;
    selectedReplyBanId: string | null;
    owner: HoldOwner;
    banId: string | null;
    kind: string | null;
    reason: string;
  },
): void {
  emit('[CONFIRM HOLD PROTECTION ACTIVE]', data);
}

export function logQueueHoldActive(
  data: HoldOwnerScreenContext & {
    activeKind: string | null;
    activeBanId: string | null;
    owner: HoldOwner;
    source: string;
    reason: string;
  },
): void {
  emit('[QUEUE HOLD ACTIVE]', data);
}
