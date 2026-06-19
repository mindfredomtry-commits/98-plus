'use client';

function emit(event: string, data?: Record<string, unknown>): void {
  const payload = { t: performance.now(), ...data };
  console.log(event, payload);
  window.__debug98log?.(event, payload);
}

export type DeeplinkBanSourceSnapshotFields = {
  source: string;
  telegramUserId: string | null;
  banId: string;
  kind: string;
  apiEndpoint: string | null;
  loadedFrom: string;
  hasBan: boolean;
  senderId: string | null;
  receiverId: string | null;
  status: string | null;
  isIncomingForViewer: boolean;
  isCheckForViewer: boolean;
  isResultForViewer: boolean;
};

export type QueueSourceComparisonSnapshotFields = {
  source: string;
  telegramUserId: string | null;
  queueLen: number;
  pendingLen: number;
  incomingLen: number;
  checkLen: number;
  resultLen: number;
  bufferedIncomingLen: number;
  lastSessionIncomingLen: number;
  hasIncomingBanRef: boolean;
  incomingBanRefId: string | null;
  resultRefId: string | null;
  checkRefId: string | null;
  hasPendingNotificationChain: boolean;
  hasLobbyBansAttentionHint: boolean;
  needAttention: boolean;
  restoreStateFound: boolean;
};

export type LobbyBansCtaClickTraceFields = {
  telegramUserId: string | null;
  clicked: boolean;
  clickSurface?: string;
  ctaState: string;
  showLobbyCta: boolean;
  showLobbyTopNav?: boolean;
  lobbyOpen: boolean;
  instantBanOpen: boolean;
  notificationChainTransitioning: boolean;
  notificationQueueUiLock: boolean;
  activeOverlayKind: string | null;
  willCallStartLobbyBansNotificationDrain: boolean;
  blockedReason: string | null;
  bansNeedAttention?: boolean;
};

export type LobbyBansDrainEnteredFields = {
  telegramUserId: string | null;
  source: string;
  pendingSnapshotLen: number;
  queueLenBefore: number;
  pendingLenBefore: number;
  incomingLen: number;
  checkLen: number;
  resultLen: number;
  needAttention: boolean;
  hasLobbyIndicator: boolean;
  hasPendingNotificationChain: boolean;
  hasLobbyBansAttentionHint: boolean;
};

export type LobbyBansDrainNotEnteredFields = {
  reason: string;
  telegramUserId?: string | null;
  source?: string;
  queueLen?: number;
  pendingLen?: number;
  hasPendingNotificationChain?: boolean;
  hasLobbyBansAttentionHint?: boolean;
  needAttention?: boolean;
  restoreStateFound?: boolean;
};

export function logDeeplinkBanSourceSnapshot(
  data: DeeplinkBanSourceSnapshotFields,
): void {
  emit('[DEEPLINK BAN SOURCE SNAPSHOT]', data);
}

export function logQueueSourceComparisonSnapshot(
  data: QueueSourceComparisonSnapshotFields,
): void {
  emit('[QUEUE SOURCE COMPARISON SNAPSHOT]', data);
}

export function logLobbyBansCtaClickTrace(
  data: LobbyBansCtaClickTraceFields,
): void {
  emit('[LOBBY BANS CTA CLICK TRACE]', data);
}

export function logLobbyBansDrainEntered(
  data: LobbyBansDrainEnteredFields,
): void {
  emit('[LOBBY BANS DRAIN ENTERED]', data);
}

export function logLobbyBansDrainNotEntered(
  data: LobbyBansDrainNotEnteredFields,
): void {
  emit('[LOBBY BANS DRAIN NOT ENTERED]', data);
}

export function buildBanViewerRoleFlags(
  ban: {
    id?: string;
    status?: string | null;
    sender?: { id?: string | null } | null;
    receiver?: { id?: string | null } | null;
    checkDueAt?: string | null;
    result?: unknown | null;
  },
  viewerId: string | null | undefined,
): Pick<
  DeeplinkBanSourceSnapshotFields,
  | 'hasBan'
  | 'senderId'
  | 'receiverId'
  | 'status'
  | 'isIncomingForViewer'
  | 'isCheckForViewer'
  | 'isResultForViewer'
> {
  const vid = viewerId?.trim() ?? '';
  const senderId = ban.sender?.id?.trim() ?? null;
  const receiverId = ban.receiver?.id?.trim() ?? null;
  const status = ban.status ?? null;
  const isReceiver = Boolean(vid && receiverId === vid);
  const isSender = Boolean(vid && senderId === vid);
  return {
    hasBan: Boolean(ban.id?.trim()),
    senderId,
    receiverId,
    status,
    isIncomingForViewer:
      isReceiver &&
      status === 'active' &&
      !ban.checkDueAt &&
      ban.result == null,
    isCheckForViewer: isReceiver && Boolean(ban.checkDueAt),
    isResultForViewer: isSender && ban.result != null,
  };
}
