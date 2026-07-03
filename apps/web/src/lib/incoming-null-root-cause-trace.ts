'use client';

export type IncomingNullDiagSnapshot = {
  reason?: string | null;
  queueHeadKind?: string | null;
  activeKind?: string | null;
  activeOverlayKind?: string | null;
  resultId?: string | null;
  resultBanId?: string | null;
  selectedBanId?: string | null;
  incomingBanId?: string | null;
  queueLen?: number;
  pendingLen?: number;
  overlayQueueLength?: number;
  notificationSessionActive?: boolean;
  notificationChainTransitioning?: boolean;
  queueClaimsNotificationScreen?: boolean;
  queueLobbyGuardActive?: boolean;
  showLobby?: boolean;
  showLobbyOrb?: boolean | null;
  hasResult?: boolean;
  hasResultOverlay?: boolean;
  hasNotificationOverlay?: boolean;
  hasIncomingOverlay?: boolean;
  shouldRenderIncoming?: boolean;
  shouldRenderResult?: boolean;
  shouldRenderQueueShell?: boolean;
  shouldRenderDirectLayer?: boolean;
  source?: string | null;
};

export type IncomingNullGuardTrace = {
  guardName: string;
  guardValue: unknown;
  reason?: string | null;
  queueHeadKind?: string | null;
  activeKind?: string | null;
  resultId?: string | null;
  selectedBanId?: string | null;
  incomingBanId?: string | null;
  queueLen?: number;
  pendingLen?: number;
  notificationSessionActive?: boolean;
  queueClaimsNotificationScreen?: boolean;
};

function withStack<T extends Record<string, unknown>>(payload: T): T & { stack: string } {
  return {
    ...payload,
    t: performance.now(),
    stack: new Error().stack ?? '',
  };
}

export function logIncomingNullRootCauseTrace(
  snapshot: IncomingNullDiagSnapshot,
): void {
  console.log('[INCOMING_NULL_ROOT_CAUSE_TRACE]', withStack(snapshot));
}

export function logIncomingNullGuardTrace(payload: IncomingNullGuardTrace): void {
  console.log('[INCOMING_NULL_GUARD_TRACE]', withStack(payload));
}

export function logIncomingNullGuardBundle(
  snapshot: IncomingNullDiagSnapshot,
  guards: ReadonlyArray<{
    guardName: string;
    guardValue: unknown;
    reason?: string;
  }>,
): void {
  for (const guard of guards) {
    logIncomingNullGuardTrace({
      guardName: guard.guardName,
      guardValue: guard.guardValue,
      reason: guard.reason ?? snapshot.reason ?? null,
      queueHeadKind: snapshot.queueHeadKind,
      activeKind: snapshot.activeKind ?? snapshot.activeOverlayKind,
      resultId: snapshot.resultId,
      selectedBanId: snapshot.selectedBanId,
      incomingBanId: snapshot.incomingBanId,
      queueLen: snapshot.queueLen,
      pendingLen: snapshot.pendingLen,
      notificationSessionActive: snapshot.notificationSessionActive,
      queueClaimsNotificationScreen: snapshot.queueClaimsNotificationScreen,
    });
  }
}

type OverlayDiagSnapshotReader = () => Partial<IncomingNullDiagSnapshot>;

let overlayDiagSnapshotReader: OverlayDiagSnapshotReader | null = null;

/** Dev-only: Providers registers a reader so ResultOverlay unmount traces can see queue state. */
export function setOverlayDiagSnapshotReader(
  reader: OverlayDiagSnapshotReader | null,
): void {
  overlayDiagSnapshotReader = reader;
}

export function readOverlayDiagSnapshot(): Partial<IncomingNullDiagSnapshot> {
  return overlayDiagSnapshotReader?.() ?? {};
}

export function logIncomingNullDecisionTrace(
  snapshot: IncomingNullDiagSnapshot,
  input: {
    shouldRenderIncomingOverlay: boolean;
    showIncomingShellBranch: boolean;
    queueShellShowsResult: boolean;
    notificationQueueShellDisplayKind?: string | null;
    effectiveIncomingOverlayDisplayKind?: string | null;
    effectiveShouldRenderIncoming: boolean;
    showDirectOverboardLayer: boolean;
    incomingCardDisplayBan: boolean;
    nullReason: string;
  },
): void {
  logIncomingNullRootCauseTrace({
    ...snapshot,
    reason: input.nullReason,
  });
  logIncomingNullGuardBundle(
    snapshot,
    buildIncomingNullDiagnosticGuards({
      effectiveShouldRenderIncoming: input.effectiveShouldRenderIncoming,
      shouldRenderIncomingOverlay: input.shouldRenderIncomingOverlay,
      incomingJsxWillRender: snapshot.hasIncomingOverlay ?? false,
      queueHeadKind: snapshot.queueHeadKind,
      notificationQueueShellDisplayKind: input.notificationQueueShellDisplayKind,
      queueShellShowsResult: input.queueShellShowsResult,
      effectiveIncomingOverlayDisplayKind:
        input.effectiveIncomingOverlayDisplayKind,
      showIncomingShellBranch: input.showIncomingShellBranch,
    }),
  );
  logIncomingNullGuardBundle(
    snapshot,
    buildIncomingNullReasonGuards({
      effectiveShouldRenderIncoming: input.effectiveShouldRenderIncoming,
      showDirectOverboardLayer: input.showDirectOverboardLayer,
      effectiveIncomingOverlayDisplayKind:
        input.effectiveIncomingOverlayDisplayKind,
      incomingCardDisplayBan: input.incomingCardDisplayBan,
      nullReason: input.nullReason,
    }),
  );
}

export function buildIncomingNullShouldRenderIncomingGuards(input: {
  showDirectOverboardLayer: boolean;
  notificationShellSuppressedForBansLobby: boolean;
  incomingBlockedAfterAnswer: boolean;
  notificationChainReplyComposePaused: boolean;
  replyParentActivePriorityActive: boolean;
  ownerPrimaryStableIncomingBanId?: string | null;
  heldUserCardKind?: string | null;
  displayActiveOverlayKind?: string | null;
  activeOverlayKind?: string | null;
  queueHeadKind?: string | null;
  replyFastIncomingActive: boolean;
  replyDeepLinkBanId?: string | null;
  replyDeeplinkFastShell: boolean;
  replyHandoffLock: boolean;
  incomingReplyComposeDismissed: boolean;
  shouldRenderIncomingOverlay: boolean;
}): Array<{ guardName: string; guardValue: unknown; reason: string }> {
  return [
    {
      guardName: 'showDirectOverboardLayer',
      guardValue: input.showDirectOverboardLayer,
      reason: 'blocks-shouldRenderIncomingOverlay',
    },
    {
      guardName: 'notificationShellSuppressedForBansLobby',
      guardValue: input.notificationShellSuppressedForBansLobby,
      reason: 'blocks-shouldRenderIncomingOverlay',
    },
    {
      guardName: 'incomingBlockedAfterAnswer',
      guardValue: input.incomingBlockedAfterAnswer,
      reason: 'blocks-shouldRenderIncomingOverlay',
    },
    {
      guardName: 'notificationChainReplyComposePaused',
      guardValue: input.notificationChainReplyComposePaused,
      reason: 'blocks-shouldRenderIncomingOverlay',
    },
    {
      guardName: 'replyParentActivePriorityActive',
      guardValue: input.replyParentActivePriorityActive,
      reason: 'blocks-shouldRenderIncomingOverlay',
    },
    {
      guardName: 'ownerPrimaryStableIncomingBanId',
      guardValue: input.ownerPrimaryStableIncomingBanId ?? null,
      reason: 'enables-shouldRenderIncomingOverlay',
    },
    {
      guardName: 'heldUserCardKind-incoming',
      guardValue: input.heldUserCardKind === 'incoming',
      reason: 'enables-shouldRenderIncomingOverlay',
    },
    {
      guardName: 'displayActiveOverlayKind-incoming',
      guardValue: input.displayActiveOverlayKind === 'incoming',
      reason: 'enables-shouldRenderIncomingOverlay',
    },
    {
      guardName: 'activeOverlayKind-incoming',
      guardValue: input.activeOverlayKind === 'incoming',
      reason: 'enables-shouldRenderIncomingOverlay',
    },
    {
      guardName: 'queueHeadKind-incoming',
      guardValue: input.queueHeadKind === 'incoming',
      reason: 'enables-shouldRenderIncomingOverlay',
    },
    {
      guardName: 'replyFastIncomingActive',
      guardValue: input.replyFastIncomingActive,
      reason: 'enables-shouldRenderIncomingOverlay',
    },
    {
      guardName: 'replyDeeplinkFastPath',
      guardValue:
        input.replyDeepLinkBanId != null &&
        (input.replyDeeplinkFastShell || input.replyHandoffLock) &&
        !input.incomingReplyComposeDismissed,
      reason: 'enables-shouldRenderIncomingOverlay',
    },
    {
      guardName: 'shouldRenderIncomingOverlay',
      guardValue: input.shouldRenderIncomingOverlay,
      reason: 'aggregate-shouldRenderIncomingOverlay',
    },
  ];
}

export function buildIncomingNullJsxWillRenderGuards(input: {
  queueShellShowsResult: boolean;
  composeBlocksNotificationHost: boolean;
  showDirectOverboardLayer: boolean;
  replyComposeActive: boolean;
  incomingCardDisplayBanId?: string | null;
  ownerPrimaryStableIncomingBanId?: string | null;
  showReplyIncomingOverlayDirect: boolean;
  notificationQueueShellKind?: string | null;
  replyIncomingDirectPath: boolean;
  incomingJsxWillRender: boolean;
}): Array<{ guardName: string; guardValue: unknown; reason: string }> {
  return [
    {
      guardName: 'queueShellShowsResult',
      guardValue: input.queueShellShowsResult,
      reason: 'blocks-incomingJsxWillRender',
    },
    {
      guardName: 'composeBlocksNotificationHost',
      guardValue: input.composeBlocksNotificationHost,
      reason: 'blocks-incomingJsxWillRender',
    },
    {
      guardName: 'showDirectOverboardLayer',
      guardValue: input.showDirectOverboardLayer,
      reason: 'blocks-incomingJsxWillRender',
    },
    {
      guardName: 'replyComposeActive',
      guardValue: input.replyComposeActive,
      reason: 'blocks-incomingJsxWillRender',
    },
    {
      guardName: 'incomingCardDisplayBanId',
      guardValue: input.incomingCardDisplayBanId ?? null,
      reason: 'enables-incomingJsxWillRender',
    },
    {
      guardName: 'ownerPrimaryStableIncomingBanId',
      guardValue: input.ownerPrimaryStableIncomingBanId ?? null,
      reason: 'enables-incomingJsxWillRender',
    },
    {
      guardName: 'showReplyIncomingOverlayDirect',
      guardValue: input.showReplyIncomingOverlayDirect,
      reason: 'enables-incomingJsxWillRender',
    },
    {
      guardName: 'notificationQueueShellKind-incoming',
      guardValue: input.notificationQueueShellKind === 'incoming',
      reason: 'enables-incomingJsxWillRender',
    },
    {
      guardName: 'replyIncomingDirectPath',
      guardValue: input.replyIncomingDirectPath,
      reason: 'blocks-queue-shell-incoming-branch',
    },
    {
      guardName: 'incomingJsxWillRender',
      guardValue: input.incomingJsxWillRender,
      reason: 'aggregate-incomingJsxWillRender',
    },
  ];
}

export function buildIncomingNullDiagnosticGuards(input: {
  effectiveShouldRenderIncoming: boolean;
  shouldRenderIncomingOverlay: boolean;
  incomingJsxWillRender: boolean;
  queueHeadKind?: string | null;
  notificationQueueShellDisplayKind?: string | null;
  queueShellShowsResult: boolean;
  effectiveIncomingOverlayDisplayKind?: string | null;
  showIncomingShellBranch: boolean;
}): Array<{ guardName: string; guardValue: unknown; reason: string }> {
  return [
    {
      guardName: 'incoming-overlay-not-requested',
      guardValue: !input.effectiveShouldRenderIncoming,
      reason: !input.effectiveShouldRenderIncoming
        ? 'incoming-overlay-not-requested'
        : 'pass',
    },
    {
      guardName: 'shouldRenderIncoming',
      guardValue: input.shouldRenderIncomingOverlay,
      reason: !input.shouldRenderIncomingOverlay
        ? '!shouldRenderIncoming'
        : 'pass',
    },
    {
      guardName: 'showIncoming',
      guardValue: input.showIncomingShellBranch,
      reason: !input.showIncomingShellBranch ? '!showIncoming' : 'pass',
    },
    {
      guardName: 'incomingRequested',
      guardValue: input.shouldRenderIncomingOverlay,
      reason: !input.shouldRenderIncomingOverlay
        ? '!incomingRequested'
        : 'pass',
    },
    {
      guardName: 'queueHeadKind-incoming',
      guardValue: input.queueHeadKind === 'incoming',
      reason:
        input.queueHeadKind !== 'incoming'
          ? 'queueHeadKind-not-incoming'
          : 'pass',
    },
    {
      guardName: 'selectedKind-mismatch',
      guardValue:
        input.queueHeadKind === 'result' &&
        input.effectiveIncomingOverlayDisplayKind === 'incoming',
      reason:
        input.queueHeadKind === 'result' &&
        input.effectiveIncomingOverlayDisplayKind === 'incoming'
          ? 'selectedKind-mismatch'
          : 'pass',
    },
    {
      guardName: 'result-branch-blocked-by-incoming-branch',
      guardValue:
        input.queueHeadKind === 'result' &&
        input.notificationQueueShellDisplayKind === 'incoming' &&
        !input.queueShellShowsResult,
      reason:
        input.queueHeadKind === 'result' &&
        input.notificationQueueShellDisplayKind === 'incoming' &&
        !input.queueShellShowsResult
          ? 'result-branch-blocked-by-incoming-branch'
          : 'pass',
    },
    {
      guardName: 'incomingJsxWillRender',
      guardValue: input.incomingJsxWillRender,
      reason: !input.incomingJsxWillRender
        ? '!incomingJsxWillRender'
        : 'pass',
    },
  ];
}

export function buildIncomingNullReasonGuards(input: {
  effectiveShouldRenderIncoming: boolean;
  showDirectOverboardLayer: boolean;
  effectiveIncomingOverlayDisplayKind?: string | null;
  incomingCardDisplayBan: boolean;
  nullReason: string;
}): Array<{ guardName: string; guardValue: unknown; reason: string }> {
  return [
    {
      guardName: 'effectiveShouldRenderIncoming',
      guardValue: input.effectiveShouldRenderIncoming,
      reason: input.effectiveShouldRenderIncoming
        ? 'pass'
        : 'incoming-overlay-not-requested',
    },
    {
      guardName: 'showDirectOverboardLayer',
      guardValue: input.showDirectOverboardLayer,
      reason: input.showDirectOverboardLayer
        ? 'direct-overboard-active'
        : 'pass',
    },
    {
      guardName: 'effectiveIncomingOverlayDisplayKind-incoming',
      guardValue: input.effectiveIncomingOverlayDisplayKind === 'incoming',
      reason:
        input.effectiveIncomingOverlayDisplayKind !== 'incoming'
          ? 'display-kind-not-incoming'
          : 'pass',
    },
    {
      guardName: 'incomingCardDisplayBan',
      guardValue: input.incomingCardDisplayBan,
      reason: !input.incomingCardDisplayBan ? 'incoming-card-not-ready' : 'pass',
    },
    {
      guardName: 'nullReason',
      guardValue: input.nullReason,
      reason: input.nullReason,
    },
  ];
}
