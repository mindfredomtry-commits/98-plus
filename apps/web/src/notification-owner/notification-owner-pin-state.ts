/**
 * Notification-owner product-pin state.
 *
 * Queue/pending/display paint are 100% owned by notification-runtime
 * (NotificationOwnerHost). This module owns exactly the handful of fields
 * that are NOT runtime-authority: product pins (stableIncomingBan,
 * replyIncomingBan, scopedIncomingBan, held user card), session gates
 * (lobbyOpen / notificationChainTransitioning / startupHold / drainActive),
 * and misc holds/meta used by legacy React call sites that have not yet
 * been fully migrated onto notification-runtime selectors.
 *
 * There is no dual-store / shadow / mirror architecture here: this is the
 * single, real, in-memory source of truth for these specific fields.
 */
import type { BanInteraction, BanResult } from '@98plus/shared';
import type { QueuedOverlay } from '@/lib/overlay-queue';
import {
  buildResultPriorityQueue,
  overlayBanId,
  overlayQueueKey,
} from '@/lib/overlay-queue';
import type { HeldUserCardOverlay } from '@/lib/overlay-user-card-guard';
import { heldUserCardBanId } from '@/lib/overlay-user-card-guard';
import { normalizeId } from '@/lib/normalize-json';
import {
  isOverkillTerminalOutcome,
  shouldAllowTerminalResultForBan,
} from '@/lib/overkill-terminal-lock';
import { logNextPayloadSelectionFromOwnerSync } from '@/lib/go-to-bans-payload-switch-trace';
import {
  logApplyQueueCommitTrace,
  queueOverlaySnapshotChanged,
} from '@/lib/apply-queue-commit-trace';
import {
  buildResultGoToBansFilterItemTrace,
  logResultGoToBansReducerTrace,
} from '@/lib/result-go-to-bans-reducer-trace-debug';
import {
  logOwnerDirectWriteDetected,
  logOwnerFunctionTrackedFieldWrite,
  logOwnerReducerTrackedFieldAssignments,
} from '@/lib/owner-direct-write-detect-debug';
import { noteOverboardFlashWriter } from '@/lib/overboard-flash-origin-v1';
import type { OwnerActiveDisplayPatch } from '@/notification-runtime/notification-runtime.display-patch';

export type { OwnerActiveDisplayPatch };

/** Bounded wait for check-answer final result (matches production constant). */
export const NOTIFICATION_OWNER_CHECK_RESULT_HOLD_MS = 2250;

export type NotificationOverlayActiveSource =
  | 'queue'
  | 'held-restore'
  | 'direct-overboard'
  | null;

export type NotificationOwnerComposePhase =
  | 'idle'
  | 'selectingTarget'
  | 'composingBan'
  | 'confirming';

export type NotificationOwnerDeeplinkSingleCardContext = {
  kind: 'check' | 'reply' | 'incoming' | 'result';
  banId: string;
};

export type NotificationOwnerFreshDeeplinkEntry = {
  banId: string;
  launchSource: string;
  openedAt: number;
  consumed: boolean;
};

export type NotificationOwnerDisplayState = {
  incomingBan: BanInteraction | null;
  /** Pinned incoming overlay ban. */
  stableIncomingBan: BanInteraction | null;
  /** Reply deeplink incoming display ban. */
  replyIncomingBan: BanInteraction | null;
  /** User-data scoped incoming display. */
  scopedIncomingBan: BanInteraction | null;
  checkBan: BanInteraction | null;
  result: BanResult | null;
  directResultOverlay: boolean;
  directResultOverlayActive: boolean;
};

export type OwnerDisplayMirrorPatch = {
  stableIncomingBan?: BanInteraction | null;
  replyIncomingBan?: BanInteraction | null;
  scopedIncomingBan?: BanInteraction | null;
};

export type NotificationOverlayOwnerState = {
  queue: QueuedOverlay[];
  pending: QueuedOverlay[];

  active: {
    kind: 'incoming' | 'check' | 'result' | null;
    banId: string | null;
    payload: BanInteraction | BanResult | null;
    source: NotificationOverlayActiveSource;
  };

  /** Source of truth for mounted display payloads (pins only — see module doc). */
  display: NotificationOwnerDisplayState;

  session: {
    lobbyOpen: boolean;
    chainAdvanceWaiting: boolean;
    notificationChainTransitioning: boolean;
    startupHold: boolean;
    overlayVisible: boolean;
    shellKind: 'incoming' | 'check' | 'result' | null;
    chainAdvanceExplicit: boolean;
    awaitingUser: boolean;
    chainHandoff: boolean;
    drainActive: boolean;
    goToBansAdvancePending: boolean;
    shownOverlayKeys: Set<string>;
    dismissedIncomingIds: Set<string>;
    dismissedCheckIds: Set<string>;
    answeredCheckIds: Set<string>;
    checkAnswerPendingResultShowIds: Set<string>;
  };

  holds: {
    userCard: HeldUserCardOverlay | null;
    checkResultWait: {
      banId: string;
      deferredQueue: QueuedOverlay[];
      startedAt: number;
      timeoutMs: number;
    } | null;
    atomicOverboardBanId: string | null;
    overkillTerminalBanIds: Set<string>;
    resultPriorityBanIds: Set<string>;
    checkAnswerInFlight: Set<string>;
    overboardInFlightBanId: string | null;
  };

  meta: {
    notificationMode: string | null;
    deeplinkSingleCard: boolean;
    composeBlocking: boolean;
    successCardMounted: boolean;
    composePhase: NotificationOwnerComposePhase;
    replyComposeActive: boolean;
    notificationChainReplyComposeActive: boolean;
    chainReplyParentBanId: string | null;
    activeTimerMounted: boolean;
    deeplinkSingleCardContext: NotificationOwnerDeeplinkSingleCardContext | null;
    freshDeeplinkEntry: NotificationOwnerFreshDeeplinkEntry | null;
  };
};

export type OwnerSessionMirrorPatch = {
  startupHold?: boolean;
  chainAdvanceExplicit?: boolean;
  awaitingUser?: boolean;
  chainHandoff?: boolean;
  drainActive?: boolean;
  goToBansAdvancePending?: boolean;
  lobbyOpen?: boolean;
  chainAdvanceWaiting?: boolean;
  notificationChainTransitioning?: boolean;
  shownOverlayKeys?: ReadonlySet<string>;
  dismissedIncomingIds?: ReadonlySet<string>;
  dismissedCheckIds?: ReadonlySet<string>;
  answeredCheckIds?: ReadonlySet<string>;
  checkAnswerPendingResultShowIds?: ReadonlySet<string>;
};

export type OwnerHoldsMirrorPatch = {
  checkAnswerInFlight?: ReadonlySet<string>;
  overkillTerminalBanIds?: ReadonlySet<string>;
  resultPriorityBanIds?: ReadonlySet<string>;
  atomicOverboardBanId?: string | null;
  overboardInFlightBanId?: string | null;
  userCard?: HeldUserCardOverlay | null;
  checkResultWait?: NotificationOverlayOwnerState['holds']['checkResultWait'];
};

export type OwnerMetaMirrorPatch = {
  notificationMode?: string | null;
  composePhase?: NotificationOwnerComposePhase;
  replyComposeActive?: boolean;
  notificationChainReplyComposeActive?: boolean;
  chainReplyParentBanId?: string | null;
  successCardMounted?: boolean;
  activeTimerMounted?: boolean;
  deeplinkSingleCard?: boolean;
  deeplinkSingleCardContext?: NotificationOwnerDeeplinkSingleCardContext | null;
  freshDeeplinkEntry?: NotificationOwnerFreshDeeplinkEntry | null;
  composeBlocking?: boolean;
};

export type NotificationOverlayOwnerEvent =
  | {
      type: 'NOTIFICATION_ENQUEUED';
      item: QueuedOverlay;
      scope?: 'queue' | 'pending';
    }
  | {
      type: 'NOTIFICATION_DISMISSED';
      banId?: string | null;
      reason?: string;
    }
  | {
      type: 'CHECK_ANSWER_SUBMITTED';
      banId: string;
      deferredQueue?: QueuedOverlay[];
    }
  | {
      type: 'CHECK_RESULT_ARRIVED';
      banId: string;
      result: BanResult;
    }
  | {
      type: 'RESULT_GO_TO_BANS';
      banId: string;
    }
  | {
      type: 'CHAIN_CONTINUE_REQUESTED';
      source: string;
    }
  | {
      type: 'CHAIN_TRANSITIONING_SET';
      active: boolean;
      source?: string;
    }
  | {
      type: 'STARTUP_INTERACTIONS_RELEASED';
      pendingCount?: number;
      source?: string;
    }
  | {
      type: 'QUEUE_UNLOCK_REQUESTED';
      reason: string;
    }
  | {
      type: 'DRAIN_REQUESTED';
      source?: string;
    }
  | {
      type: 'OVERBOARD_CLICKED';
      banId: string;
    }
  | {
      type: 'DEEPLINK_OPENED';
      kind: 'incoming' | 'check' | 'result';
      banId: string;
    }
  | {
      type: 'LOBBY_OPEN_REQUESTED';
      source: string;
    }
  | {
      type: 'OVERLAY_RENDERED';
      kind: 'incoming' | 'check' | 'result';
      banId: string;
    }
  | {
      type: 'OVERLAY_USER_ACTION';
      kind: string;
      banId?: string | null;
    }
  | {
      type: 'LATE_RESULT_ARRIVED';
      banId: string;
      result: BanResult;
    }
  | {
      type: 'TERMINAL_OVERBOARD_LOCKED';
      banId: string;
    }
  | {
      type: 'STALE_RESULT_REJECTED';
      banId: string;
      reason?: string;
    }
  /** Owner authority: sync active display payload from syncDisplayFromQueue. */
  | {
      type: 'ACTIVE_DISPLAY_SYNC';
      patch: OwnerActiveDisplayPatch;
      source?: string;
    }
  /** Owner authority: full overlay queue replace (display path). */
  | {
      type: 'QUEUE_APPLIED';
      queue: QueuedOverlay[];
      source?: string;
    }
  /** Owner authority: silent full overlay queue replace. */
  | {
      type: 'QUEUE_SILENT_UPDATED';
      queue: QueuedOverlay[];
      source?: string;
    }
  /** Owner authority: full pending startup queue replace. */
  | {
      type: 'PENDING_QUEUE_APPLIED';
      pending: QueuedOverlay[];
      source?: string;
    }
  /** Reverse-sync bridge: production committed a full overlay queue replace. */
  | {
      type: 'PRODUCTION_QUEUE_APPLIED';
      queue: QueuedOverlay[];
    }
  /** Reverse-sync bridge: align session/holds/meta from production snapshot. */
  | {
      type: 'PRODUCTION_SNAPSHOT_SYNC';
      snapshot: OwnerProductionSnapshot;
    }
  /** Patch session fields without touching queue/display authority. */
  | {
      type: 'SESSION_FIELDS_PATCH';
      patch: OwnerSessionMirrorPatch;
      source?: string;
    }
  /** Patch holds fields without touching queue/display authority. */
  | {
      type: 'HOLDS_FIELDS_PATCH';
      patch: OwnerHoldsMirrorPatch;
      source?: string;
    }
  /** Patch meta fields without touching queue/display authority. */
  | {
      type: 'META_FIELDS_PATCH';
      patch: OwnerMetaMirrorPatch;
      source?: string;
    }
  | {
      type: 'PRODUCTION_DISPLAY_PATCH_REJECTED';
      patch: OwnerDisplayMirrorPatch;
      source?: string;
    };

export type NotificationOverlayOwnerEffect =
  | { type: 'APPLY_DISPLAY' }
  | {
      type: 'PRODUCTION_QUEUE_MIRROR';
      queue: QueuedOverlay[];
      source: string;
      silent: boolean;
    }
  | {
      type: 'PRODUCTION_PENDING_MIRROR';
      pending: QueuedOverlay[];
      source: string;
    }
  | {
      type: 'PRODUCTION_ACTIVE_MIRROR';
      display: NotificationOwnerDisplayState;
      source: string;
    }
  | {
      type: 'SESSION_FIELDS_APPLIED';
      session: NotificationOverlayOwnerState['session'];
      source: string;
    }
  | { type: 'SCHEDULE_HOLD_TIMEOUT'; banId: string; ms: number }
  | { type: 'CLEAR_HOLD_TIMEOUT'; banId: string }
  | { type: 'OPEN_LOBBY'; source: string }
  | { type: 'PREFETCH_CHAIN'; skipBanId?: string }
  | { type: 'LOG'; tag: string; fields: Record<string, unknown> };

export type OwnerProductionSnapshot = {
  queue: QueuedOverlay[];
  pending: QueuedOverlay[];
  realHeadKind: QueuedOverlay['kind'] | null;
  realHeadBanId: string | null;
  activeIncomingBanId: string | null;
  stableIncomingBanId: string | null;
  replyIncomingBanId: string | null;
  scopedIncomingBanId: string | null;
  activeCheckBanId: string | null;
  activeResultBanId: string | null;
  directResultOverlay: boolean;
  directResultOverlayActive: boolean;
  lobbyOpen: boolean;
  chainAdvanceWaiting: boolean;
  notificationChainTransitioning: boolean;
  startupHold: boolean;
  overlayVisible: boolean;
  shellKind: 'incoming' | 'check' | 'result' | null;
  checkResultHoldBanId: string | null;
  checkResultHoldDeferredQueue: readonly QueuedOverlay[];
  heldUserCardKind: HeldUserCardOverlay['kind'] | null;
  heldUserCardBanId: string | null;
  atomicOverboardBanId: string | null;
  chainAdvanceExplicit: boolean;
  awaitingUser: boolean;
  chainHandoff: boolean;
  drainActive: boolean;
  goToBansAdvancePending: boolean;
  shownOverlayKeys: ReadonlySet<string>;
  dismissedIncomingIds: ReadonlySet<string>;
  dismissedCheckIds: ReadonlySet<string>;
  answeredCheckIds: ReadonlySet<string>;
  checkAnswerPendingResultShowIds: ReadonlySet<string>;
  checkAnswerInFlight: ReadonlySet<string>;
  overkillTerminalBanIds: ReadonlySet<string>;
  resultPriorityBanIds: ReadonlySet<string>;
  overboardInFlightBanId: string | null;
  composePhase: NotificationOwnerComposePhase;
  replyComposeActive: boolean;
  notificationChainReplyComposeActive: boolean;
  chainReplyParentBanId: string | null;
  successCardMounted: boolean;
  activeTimerMounted: boolean;
  notificationMode: string | null;
  deeplinkSingleCard: boolean;
  deeplinkSingleCardContext: NotificationOwnerDeeplinkSingleCardContext | null;
  freshDeeplinkEntry: NotificationOwnerFreshDeeplinkEntry | null;
  composeBlocking: boolean;
};

export type NotificationOverlayOwnerReducerResult = {
  state: NotificationOverlayOwnerState;
  effects: NotificationOverlayOwnerEffect[];
};

export function createInitialNotificationOverlayOwnerState(): NotificationOverlayOwnerState {
  return {
    queue: [],
    pending: [],
    active: {
      kind: null,
      banId: null,
      payload: null,
      source: null,
    },
    display: {
      incomingBan: null,
      stableIncomingBan: null,
      replyIncomingBan: null,
      scopedIncomingBan: null,
      checkBan: null,
      result: null,
      directResultOverlay: false,
      directResultOverlayActive: false,
    },
    session: {
      lobbyOpen: true,
      chainAdvanceWaiting: false,
      notificationChainTransitioning: false,
      startupHold: false,
      overlayVisible: false,
      shellKind: null,
      chainAdvanceExplicit: false,
      awaitingUser: false,
      chainHandoff: false,
      drainActive: false,
      goToBansAdvancePending: false,
      shownOverlayKeys: new Set(),
      dismissedIncomingIds: new Set(),
      dismissedCheckIds: new Set(),
      answeredCheckIds: new Set(),
      checkAnswerPendingResultShowIds: new Set(),
    },
    holds: {
      userCard: null,
      checkResultWait: null,
      atomicOverboardBanId: null,
      overkillTerminalBanIds: new Set(),
      resultPriorityBanIds: new Set(),
      checkAnswerInFlight: new Set(),
      overboardInFlightBanId: null,
    },
    meta: {
      notificationMode: null,
      deeplinkSingleCard: false,
      composeBlocking: false,
      successCardMounted: false,
      composePhase: 'idle',
      replyComposeActive: false,
      notificationChainReplyComposeActive: false,
      chainReplyParentBanId: null,
      activeTimerMounted: false,
      deeplinkSingleCardContext: null,
      freshDeeplinkEntry: null,
    },
  };
}

function cloneOwnerState(
  state: NotificationOverlayOwnerState,
): NotificationOverlayOwnerState {
  return {
    queue: [...state.queue],
    pending: [...state.pending],
    active: { ...state.active },
    display: { ...state.display },
    session: {
      ...state.session,
      shownOverlayKeys: new Set(state.session.shownOverlayKeys),
      dismissedIncomingIds: new Set(state.session.dismissedIncomingIds),
      dismissedCheckIds: new Set(state.session.dismissedCheckIds),
      answeredCheckIds: new Set(state.session.answeredCheckIds),
      checkAnswerPendingResultShowIds: new Set(
        state.session.checkAnswerPendingResultShowIds,
      ),
    },
    holds: {
      userCard: state.holds.userCard,
      checkResultWait: state.holds.checkResultWait
        ? {
            ...state.holds.checkResultWait,
            deferredQueue: [...state.holds.checkResultWait.deferredQueue],
          }
        : null,
      atomicOverboardBanId: state.holds.atomicOverboardBanId,
      overkillTerminalBanIds: new Set(state.holds.overkillTerminalBanIds),
      resultPriorityBanIds: new Set(state.holds.resultPriorityBanIds),
      checkAnswerInFlight: new Set(state.holds.checkAnswerInFlight),
      overboardInFlightBanId: state.holds.overboardInFlightBanId,
    },
    meta: {
      ...state.meta,
      deeplinkSingleCardContext: state.meta.deeplinkSingleCardContext
        ? { ...state.meta.deeplinkSingleCardContext }
        : null,
      freshDeeplinkEntry: state.meta.freshDeeplinkEntry
        ? { ...state.meta.freshDeeplinkEntry }
        : null,
    },
  };
}

function cloneStringSet(source?: ReadonlySet<string>): Set<string> {
  return new Set(source ?? []);
}

function applySessionMirrorPatch(
  session: NotificationOverlayOwnerState['session'],
  patch: OwnerSessionMirrorPatch,
): NotificationOverlayOwnerState['session'] {
  // notificationChainTransitioning + startupHold are owner-event only.
  // Reverse SESSION_FIELDS_PATCH patches may still carry them for compat
  // callers; strip silently (never apply).
  return {
    ...session,
    ...(patch.chainAdvanceExplicit !== undefined
      ? { chainAdvanceExplicit: patch.chainAdvanceExplicit }
      : {}),
    ...(patch.awaitingUser !== undefined ? { awaitingUser: patch.awaitingUser } : {}),
    ...(patch.chainHandoff !== undefined ? { chainHandoff: patch.chainHandoff } : {}),
    ...(patch.drainActive !== undefined ? { drainActive: patch.drainActive } : {}),
    ...(patch.goToBansAdvancePending !== undefined
      ? { goToBansAdvancePending: patch.goToBansAdvancePending }
      : {}),
    ...(patch.lobbyOpen !== undefined ? { lobbyOpen: patch.lobbyOpen } : {}),
    ...(patch.chainAdvanceWaiting !== undefined
      ? { chainAdvanceWaiting: patch.chainAdvanceWaiting }
      : {}),
    ...(patch.shownOverlayKeys !== undefined
      ? { shownOverlayKeys: cloneStringSet(patch.shownOverlayKeys) }
      : {}),
    ...(patch.dismissedIncomingIds !== undefined
      ? { dismissedIncomingIds: cloneStringSet(patch.dismissedIncomingIds) }
      : {}),
    ...(patch.dismissedCheckIds !== undefined
      ? { dismissedCheckIds: cloneStringSet(patch.dismissedCheckIds) }
      : {}),
    ...(patch.answeredCheckIds !== undefined
      ? { answeredCheckIds: cloneStringSet(patch.answeredCheckIds) }
      : {}),
    ...(patch.checkAnswerPendingResultShowIds !== undefined
      ? {
          checkAnswerPendingResultShowIds: cloneStringSet(
            patch.checkAnswerPendingResultShowIds,
          ),
        }
      : {}),
  };
}

function applyHoldsMirrorPatch(
  holds: NotificationOverlayOwnerState['holds'],
  patch: OwnerHoldsMirrorPatch,
): NotificationOverlayOwnerState['holds'] {
  return {
    ...holds,
    ...(patch.checkAnswerInFlight !== undefined
      ? { checkAnswerInFlight: cloneStringSet(patch.checkAnswerInFlight) }
      : {}),
    ...(patch.overkillTerminalBanIds !== undefined
      ? { overkillTerminalBanIds: cloneStringSet(patch.overkillTerminalBanIds) }
      : {}),
    ...(patch.resultPriorityBanIds !== undefined
      ? { resultPriorityBanIds: cloneStringSet(patch.resultPriorityBanIds) }
      : {}),
    ...(patch.atomicOverboardBanId !== undefined
      ? { atomicOverboardBanId: patch.atomicOverboardBanId }
      : {}),
    ...(patch.overboardInFlightBanId !== undefined
      ? { overboardInFlightBanId: patch.overboardInFlightBanId }
      : {}),
    ...(patch.userCard !== undefined ? { userCard: patch.userCard } : {}),
    ...(patch.checkResultWait !== undefined
      ? {
          checkResultWait: patch.checkResultWait
            ? {
                ...patch.checkResultWait,
                deferredQueue: [...patch.checkResultWait.deferredQueue],
              }
            : null,
        }
      : {}),
  };
}

function applyMetaMirrorPatch(
  meta: NotificationOverlayOwnerState['meta'],
  patch: OwnerMetaMirrorPatch,
): NotificationOverlayOwnerState['meta'] {
  return {
    ...meta,
    ...(patch.notificationMode !== undefined
      ? { notificationMode: patch.notificationMode }
      : {}),
    ...(patch.composePhase !== undefined ? { composePhase: patch.composePhase } : {}),
    ...(patch.replyComposeActive !== undefined
      ? { replyComposeActive: patch.replyComposeActive }
      : {}),
    ...(patch.notificationChainReplyComposeActive !== undefined
      ? {
          notificationChainReplyComposeActive:
            patch.notificationChainReplyComposeActive,
        }
      : {}),
    ...(patch.chainReplyParentBanId !== undefined
      ? { chainReplyParentBanId: patch.chainReplyParentBanId }
      : {}),
    ...(patch.successCardMounted !== undefined
      ? { successCardMounted: patch.successCardMounted }
      : {}),
    ...(patch.activeTimerMounted !== undefined
      ? { activeTimerMounted: patch.activeTimerMounted }
      : {}),
    ...(patch.deeplinkSingleCard !== undefined
      ? { deeplinkSingleCard: patch.deeplinkSingleCard }
      : {}),
    ...(patch.deeplinkSingleCardContext !== undefined
      ? {
          deeplinkSingleCardContext: patch.deeplinkSingleCardContext
            ? { ...patch.deeplinkSingleCardContext }
            : null,
        }
      : {}),
    ...(patch.freshDeeplinkEntry !== undefined
      ? {
          freshDeeplinkEntry: patch.freshDeeplinkEntry
            ? { ...patch.freshDeeplinkEntry }
            : null,
        }
      : {}),
    ...(patch.composeBlocking !== undefined
      ? { composeBlocking: patch.composeBlocking }
      : {}),
  };
}

function mergePendingUnique(
  pending: QueuedOverlay[],
  item: QueuedOverlay,
): QueuedOverlay[] {
  const key = overlayQueueKey(item);
  const without = pending.filter((entry) => overlayQueueKey(entry) !== key);
  return [...without, item];
}

function syncActiveFromQueueHead(
  state: NotificationOverlayOwnerState,
  eventType?: string,
): NotificationOverlayOwnerState {
  const head = state.queue[0];
  if (!head) {
    if (state.active.source === 'direct-overboard') {
      const next = {
        ...state,
        session: {
          ...state.session,
          shellKind: state.active.kind,
        },
      };
      logOwnerFunctionTrackedFieldWrite({
        previousState: state,
        nextState: next,
        file: 'notification-owner-pin-state.ts',
        function: 'syncActiveFromQueueHead',
        eventType,
      });
      logNextPayloadSelectionFromOwnerSync(state, next, eventType);
      return next;
    }
    const next = {
      ...state,
      active: {
        kind: null,
        banId: null,
        payload: null,
        source: null,
      },
      session: {
        ...state.session,
        shellKind: null,
      },
    };
    logOwnerFunctionTrackedFieldWrite({
      previousState: state,
      nextState: next,
      file: 'notification-owner-pin-state.ts',
      function: 'syncActiveFromQueueHead',
      eventType,
    });
    logNextPayloadSelectionFromOwnerSync(state, next, eventType);
    return next;
  }

  const banId = normalizeId(overlayBanId(head)) || null;
  const payload =
    head.kind === 'result' ? head.result : (head.ban as BanInteraction);

  const next = {
    ...state,
    active: {
      kind: head.kind,
      banId,
      payload,
      source: 'queue' as const,
    },
    session: {
      ...state.session,
      shellKind: head.kind,
      overlayVisible: true,
    },
  };
  logOwnerFunctionTrackedFieldWrite({
    previousState: state,
    nextState: next,
    file: 'notification-owner-pin-state.ts',
    function: 'syncActiveFromQueueHead',
    eventType,
  });
  logNextPayloadSelectionFromOwnerSync(state, next, eventType);
  return next;
}

function resolveOwnerDisplayKindForLog(
  display: NotificationOwnerDisplayState,
): string | null {
  if (display.directResultOverlayActive || display.directResultOverlay) {
    return 'result-direct';
  }
  if (display.result?.id) return 'result';
  if (display.checkBan?.id) return 'check';
  if (display.incomingBan?.id) return 'incoming';
  return null;
}

function applyOwnerDisplayFromQueueHead(
  state: NotificationOverlayOwnerState,
): NotificationOverlayOwnerState {
  const head = state.queue[0];
  if (!head) {
    return state;
  }
  const clearedDisplay: NotificationOwnerDisplayState = {
    ...state.display,
    directResultOverlay: false,
    directResultOverlayActive: false,
    incomingBan: null,
    stableIncomingBan: null,
    replyIncomingBan: null,
    scopedIncomingBan: null,
    checkBan: null,
    result: null,
  };
  if (head.kind === 'result') {
    return {
      ...state,
      display: {
        ...clearedDisplay,
        result: head.result,
      },
    };
  }
  if (head.kind === 'check') {
    return {
      ...state,
      display: {
        ...clearedDisplay,
        checkBan: head.ban,
      },
    };
  }
  return {
    ...state,
    display: {
      ...clearedDisplay,
      incomingBan: head.ban,
    },
  };
}

function popQueueHeadForBan(
  queue: QueuedOverlay[],
  banId?: string | null,
): QueuedOverlay[] {
  if (queue.length === 0) return queue;
  const head = queue[0];
  const headBanId = normalizeId(overlayBanId(head));
  const target = banId ? normalizeId(banId) : headBanId;
  if (target && headBanId !== target) {
    return queue;
  }
  return queue.slice(1);
}

function applyActiveDisplayPatch(
  display: NotificationOwnerDisplayState,
  patch: OwnerActiveDisplayPatch,
): NotificationOwnerDisplayState {
  const previousResultId = display.result?.id ?? null;
  const next = {
    incomingBan:
      patch.incomingBan !== undefined ? patch.incomingBan : display.incomingBan,
    stableIncomingBan:
      patch.stableIncomingBan !== undefined
        ? patch.stableIncomingBan
        : display.stableIncomingBan,
    replyIncomingBan:
      patch.replyIncomingBan !== undefined
        ? patch.replyIncomingBan
        : display.replyIncomingBan,
    scopedIncomingBan:
      patch.scopedIncomingBan !== undefined
        ? patch.scopedIncomingBan
        : display.scopedIncomingBan,
    checkBan: patch.checkBan !== undefined ? patch.checkBan : display.checkBan,
    result: patch.result !== undefined ? patch.result : display.result,
    directResultOverlay:
      patch.directResultOverlay !== undefined
        ? patch.directResultOverlay
        : display.directResultOverlay,
    directResultOverlayActive:
      patch.directResultOverlayActive !== undefined
        ? patch.directResultOverlayActive
        : display.directResultOverlayActive,
  };
  const nextResultId = next.result?.id ?? null;
  if (previousResultId !== nextResultId) {
    logOwnerDirectWriteDetected({
      file: 'notification-owner-pin-state.ts',
      function: 'applyActiveDisplayPatch',
      field: 'displayResultBanId',
      oldValue: previousResultId,
      newValue: nextResultId,
      writePath: 'reducer-draft',
    });
  }
  return next;
}

/**
 * Reverse sync must not write owner.queue / owner.pending.
 * Dev/test: throw. Production: structured warning without payload PII.
 */
export function reportReverseQueuePendingBlocked(source: string): void {
  const message = `[OWNER PIN-STATE] reverse sync blocked from writing queue/pending (${source})`;
  if (
    process.env.NODE_ENV === 'test' ||
    process.env.NODE_ENV === 'development'
  ) {
    throw new Error(message);
  }
  console.warn(message);
}

/**
 * Reverse sync must not write owner.display / owner.active.
 * Dev/test: throw. Production: structured warning without payload PII.
 */
export function reportReverseDisplayActiveBlocked(source: string): void {
  const message = `[OWNER PIN-STATE] reverse sync blocked from writing display/active (${source})`;
  if (
    process.env.NODE_ENV === 'test' ||
    process.env.NODE_ENV === 'development'
  ) {
    throw new Error(message);
  }
  console.warn(message);
}

/**
 * Align owner.active from owner.display after an authoritative display event.
 * Only called from ACTIVE_DISPLAY_SYNC (not reverse sync).
 */
function syncActiveFromDisplay(
  state: NotificationOverlayOwnerState,
  patch: OwnerActiveDisplayPatch,
): NotificationOverlayOwnerState {
  const touchesMainDisplay =
    patch.incomingBan !== undefined ||
    patch.checkBan !== undefined ||
    patch.result !== undefined ||
    patch.directResultOverlay !== undefined ||
    patch.directResultOverlayActive !== undefined;
  if (!touchesMainDisplay) {
    return state;
  }

  const display = state.display;
  if (
    display.directResultOverlayActive ||
    display.directResultOverlay ||
    display.result?.id
  ) {
    const banId = display.result?.id ? normalizeId(display.result.id) : null;
    return {
      ...state,
      active: {
        kind: 'result',
        banId,
        payload: display.result,
        source:
          display.directResultOverlayActive || display.directResultOverlay
            ? 'direct-overboard'
            : 'queue',
      },
    };
  }
  if (display.checkBan?.id) {
    return {
      ...state,
      active: {
        kind: 'check',
        banId: normalizeId(display.checkBan.id),
        payload: display.checkBan,
        source: 'queue',
      },
    };
  }
  if (display.incomingBan?.id) {
    return {
      ...state,
      active: {
        kind: 'incoming',
        banId: normalizeId(display.incomingBan.id),
        payload: display.incomingBan,
        source: 'queue',
      },
    };
  }
  return {
    ...state,
    active: {
      kind: null,
      banId: null,
      payload: null,
      source: null,
    },
  };
}

function applyProductionSnapshot(
  state: NotificationOverlayOwnerState,
  snapshot: OwnerProductionSnapshot,
): NotificationOverlayOwnerState {
  let next = cloneOwnerState(state);

  // queue/pending/display/active are owner-authority only and are never
  // patched from production snapshots (session/holds/meta only, below).
  next.session.lobbyOpen = snapshot.lobbyOpen;
  next.session.chainAdvanceWaiting = snapshot.chainAdvanceWaiting;
  next.session.overlayVisible = snapshot.overlayVisible;
  next.session.shellKind = snapshot.shellKind;
  next.session.chainAdvanceExplicit = snapshot.chainAdvanceExplicit;
  next.session.awaitingUser = snapshot.awaitingUser;
  next.session.chainHandoff = snapshot.chainHandoff;
  next.session.drainActive = snapshot.drainActive;
  next.session.goToBansAdvancePending = snapshot.goToBansAdvancePending;
  next.session.shownOverlayKeys = cloneStringSet(snapshot.shownOverlayKeys);
  next.session.dismissedIncomingIds = cloneStringSet(snapshot.dismissedIncomingIds);
  next.session.dismissedCheckIds = cloneStringSet(snapshot.dismissedCheckIds);
  next.session.answeredCheckIds = cloneStringSet(snapshot.answeredCheckIds);
  next.session.checkAnswerPendingResultShowIds = cloneStringSet(
    snapshot.checkAnswerPendingResultShowIds,
  );
  next.holds.atomicOverboardBanId = snapshot.atomicOverboardBanId;
  next.holds.checkAnswerInFlight = cloneStringSet(snapshot.checkAnswerInFlight);
  next.holds.overkillTerminalBanIds = cloneStringSet(snapshot.overkillTerminalBanIds);
  next.holds.resultPriorityBanIds = cloneStringSet(snapshot.resultPriorityBanIds);
  next.holds.overboardInFlightBanId = snapshot.overboardInFlightBanId;
  next.meta.notificationMode = snapshot.notificationMode;
  next.meta.composePhase = snapshot.composePhase;
  next.meta.replyComposeActive = snapshot.replyComposeActive;
  next.meta.notificationChainReplyComposeActive =
    snapshot.notificationChainReplyComposeActive;
  next.meta.chainReplyParentBanId = snapshot.chainReplyParentBanId;
  next.meta.successCardMounted = snapshot.successCardMounted;
  next.meta.activeTimerMounted = snapshot.activeTimerMounted;
  next.meta.deeplinkSingleCard = snapshot.deeplinkSingleCard;
  next.meta.deeplinkSingleCardContext = snapshot.deeplinkSingleCardContext
    ? { ...snapshot.deeplinkSingleCardContext }
    : null;
  next.meta.freshDeeplinkEntry = snapshot.freshDeeplinkEntry
    ? { ...snapshot.freshDeeplinkEntry }
    : null;
  next.meta.composeBlocking = snapshot.composeBlocking;

  if (snapshot.checkResultHoldBanId) {
    next.holds.checkResultWait = {
      banId: snapshot.checkResultHoldBanId,
      deferredQueue: [...snapshot.checkResultHoldDeferredQueue],
      startedAt: next.holds.checkResultWait?.startedAt ?? Date.now(),
      timeoutMs: NOTIFICATION_OWNER_CHECK_RESULT_HOLD_MS,
    };
  } else {
    next.holds.checkResultWait = null;
  }

  if (snapshot.heldUserCardKind && snapshot.heldUserCardBanId) {
    next.holds.userCard = null;
  }

  logOwnerFunctionTrackedFieldWrite({
    previousState: state,
    nextState: next,
    file: 'notification-owner-pin-state.ts',
    function: 'applyProductionSnapshot',
  });

  return next;
}

export function resolveOwnerHeadBanId(
  queue: QueuedOverlay[],
): { kind: QueuedOverlay['kind'] | null; banId: string | null } {
  const head = queue[0];
  if (!head) return { kind: null, banId: null };
  return {
    kind: head.kind,
    banId: normalizeId(overlayBanId(head)) || null,
  };
}

export function notificationOverlayOwnerReducer(
  state: NotificationOverlayOwnerState,
  event: NotificationOverlayOwnerEvent,
): NotificationOverlayOwnerReducerResult {
  const effects: NotificationOverlayOwnerEffect[] = [];
  let next = cloneOwnerState(state);

  switch (event.type) {
    case 'PRODUCTION_SNAPSHOT_SYNC': {
      // Compat only: session / holds / meta (via applyProductionSnapshot).
      // Queue/pending/display/active are never patched from snapshots.
      next = applyProductionSnapshot(next, event.snapshot);
      effects.push({
        type: 'LOG',
        tag: 'production-snapshot-sync',
        fields: { queueLen: next.queue.length, pendingLen: next.pending.length },
      });
      break;
    }

    case 'QUEUE_APPLIED': {
      const queueRefBeforeAssign = next.queue;
      const queueBeforeReducer = [...next.queue];
      next.queue = [...event.queue];
      logApplyQueueCommitTrace({
        source: `notification-owner-pin-state-reducer:QUEUE_APPLIED`,
        beforeQueueLength: queueBeforeReducer.length,
        afterQueueLength: next.queue.length,
        dispatchExecuted: true,
        dispatchSkipped: false,
        finalizeCommitEntered: true,
        finalizeCommitReturned: true,
        queueApplyReturnedNull: false,
        queueApplyReturnedSameReference: queueRefBeforeAssign === event.queue,
        queueChanged: queueOverlaySnapshotChanged(
          queueBeforeReducer,
          next.queue,
        ),
        queueIdentityChanged: queueRefBeforeAssign === event.queue,
        reducerExecuted: true,
        reducerSkipped: !queueOverlaySnapshotChanged(
          queueBeforeReducer,
          next.queue,
        ),
        reason: 'reducer-QUEUE_APPLIED-mutation',
        skipReason: queueOverlaySnapshotChanged(queueBeforeReducer, next.queue)
          ? null
          : 'reducer-QUEUE_APPLIED-no-length-or-key-change',
      });
      next = syncActiveFromQueueHead(next);
      effects.push({
        type: 'PRODUCTION_QUEUE_MIRROR',
        queue: [...next.queue],
        source: event.source ?? 'QUEUE_APPLIED',
        silent: false,
      });
      effects.push({
        type: 'LOG',
        tag: 'queue-applied',
        fields: {
          source: event.source ?? null,
          queueLen: next.queue.length,
        },
      });
      break;
    }

    case 'QUEUE_SILENT_UPDATED': {
      const queueRefBeforeAssign = next.queue;
      const queueBeforeReducer = [...next.queue];
      next.queue = [...event.queue];
      logApplyQueueCommitTrace({
        source: `notification-owner-pin-state-reducer:QUEUE_SILENT_UPDATED`,
        beforeQueueLength: queueBeforeReducer.length,
        afterQueueLength: next.queue.length,
        dispatchExecuted: true,
        dispatchSkipped: false,
        finalizeCommitEntered: true,
        finalizeCommitReturned: true,
        queueApplyReturnedNull: false,
        queueApplyReturnedSameReference: queueRefBeforeAssign === event.queue,
        queueChanged: queueOverlaySnapshotChanged(
          queueBeforeReducer,
          next.queue,
        ),
        queueIdentityChanged: queueRefBeforeAssign === event.queue,
        reducerExecuted: true,
        reducerSkipped: !queueOverlaySnapshotChanged(
          queueBeforeReducer,
          next.queue,
        ),
        reason: 'reducer-QUEUE_SILENT_UPDATED-mutation',
        skipReason: queueOverlaySnapshotChanged(queueBeforeReducer, next.queue)
          ? null
          : 'reducer-QUEUE_SILENT_UPDATED-no-length-or-key-change',
      });
      next = syncActiveFromQueueHead(next);
      effects.push({
        type: 'PRODUCTION_QUEUE_MIRROR',
        queue: [...next.queue],
        source: event.source ?? 'QUEUE_SILENT_UPDATED',
        silent: true,
      });
      effects.push({
        type: 'LOG',
        tag: 'queue-silent-updated',
        fields: {
          source: event.source ?? null,
          queueLen: next.queue.length,
        },
      });
      break;
    }

    case 'PENDING_QUEUE_APPLIED': {
      next.pending = [...event.pending];
      effects.push({
        type: 'PRODUCTION_PENDING_MIRROR',
        pending: [...next.pending],
        source: event.source ?? 'PENDING_QUEUE_APPLIED',
      });
      effects.push({
        type: 'LOG',
        tag: 'pending-queue-applied',
        fields: {
          source: event.source ?? null,
          pendingLen: next.pending.length,
        },
      });
      break;
    }

    case 'ACTIVE_DISPLAY_SYNC': {
      next.display = applyActiveDisplayPatch(next.display, event.patch);
      next = syncActiveFromDisplay(next, event.patch);
      effects.push({
        type: 'PRODUCTION_ACTIVE_MIRROR',
        display: { ...next.display },
        source: event.source ?? 'ACTIVE_DISPLAY_SYNC',
      });
      effects.push({
        type: 'LOG',
        tag: 'active-display-sync',
        fields: {
          source: event.source ?? null,
          incomingBanId: next.display.incomingBan?.id ?? null,
          checkBanId: next.display.checkBan?.id ?? null,
          resultBanId: next.display.result?.id ?? null,
          activeKind: next.active.kind,
          activeBanId: next.active.banId,
          directResultOverlay: next.display.directResultOverlay,
          directResultOverlayActive: next.display.directResultOverlayActive,
        },
      });
      break;
    }

    case 'PRODUCTION_QUEUE_APPLIED': {
      // Legacy reverse queue write path — refuse mutation (owner is queue authority).
      reportReverseQueuePendingBlocked('PRODUCTION_QUEUE_APPLIED');
      effects.push({
        type: 'LOG',
        tag: 'production-queue-applied-blocked',
        fields: { queueLen: next.queue.length },
      });
      break;
    }

    case 'NOTIFICATION_ENQUEUED': {
      const scope = event.scope ?? 'queue';
      if (scope === 'pending') {
        next.pending = mergePendingUnique(next.pending, event.item);
        effects.push({
          type: 'PRODUCTION_PENDING_MIRROR',
          pending: [...next.pending],
          source: 'NOTIFICATION_ENQUEUED:pending',
        });
        effects.push({
          type: 'LOG',
          tag: 'enqueued-pending',
          fields: { key: overlayQueueKey(event.item) },
        });
        break;
      }

      const key = overlayQueueKey(event.item);
      const withoutDup = next.queue.filter(
        (entry) => overlayQueueKey(entry) !== key,
      );
      if (withoutDup.length === 0) {
        next.queue = [event.item];
      } else {
        next.queue = [...withoutDup, event.item];
      }
      next = syncActiveFromQueueHead(next);
      effects.push({
        type: 'PRODUCTION_QUEUE_MIRROR',
        queue: [...next.queue],
        source: 'NOTIFICATION_ENQUEUED:queue',
        silent: false,
      });
      effects.push({ type: 'APPLY_DISPLAY' });
      break;
    }

    case 'NOTIFICATION_DISMISSED': {
      next.queue = popQueueHeadForBan(next.queue, event.banId);
      if (
        event.banId &&
        normalizeId(event.banId) === normalizeId(next.active.banId ?? '')
      ) {
        next.active = {
          kind: null,
          banId: null,
          payload: null,
          source: null,
        };
      }
      next = syncActiveFromQueueHead(next);
      effects.push({ type: 'APPLY_DISPLAY' });
      break;
    }

    case 'CHECK_ANSWER_SUBMITTED': {
      const banId = normalizeId(event.banId);
      if (!banId) break;
      const deferred = event.deferredQueue ?? next.queue;
      next.holds.checkResultWait = {
        banId,
        deferredQueue: [...deferred],
        startedAt: Date.now(),
        timeoutMs: NOTIFICATION_OWNER_CHECK_RESULT_HOLD_MS,
      };
      next.queue = [];
      next.session.chainAdvanceWaiting = true;
      next.session.notificationChainTransitioning = true;
      next.session.overlayVisible = true;
      next.session.shellKind = 'check';
      next.holds.resultPriorityBanIds.add(banId);
      effects.push({
        type: 'SESSION_FIELDS_APPLIED',
        session: { ...next.session },
        source: 'CHECK_ANSWER_SUBMITTED',
      });
      effects.push({
        type: 'SCHEDULE_HOLD_TIMEOUT',
        banId,
        ms: NOTIFICATION_OWNER_CHECK_RESULT_HOLD_MS,
      });
      break;
    }

    case 'CHECK_RESULT_ARRIVED': {
      const banId = normalizeId(event.banId);
      if (!banId) break;
      const deferred = next.holds.checkResultWait?.deferredQueue ?? next.queue;
      next.holds.checkResultWait = null;
      next.holds.resultPriorityBanIds.add(banId);
      const resultItem: QueuedOverlay = {
        kind: 'result',
        result: event.result,
      };
      next.queue = buildResultPriorityQueue(deferred, banId, resultItem);
      next.session.chainAdvanceWaiting = false;
      next = syncActiveFromQueueHead(next);
      effects.push({ type: 'CLEAR_HOLD_TIMEOUT', banId });
      effects.push({ type: 'APPLY_DISPLAY' });
      break;
    }

    case 'RESULT_GO_TO_BANS': {
      const banId = normalizeId(event.banId);
      if (!banId) break;
      const actionBanId = banId;
      const stateQueueSnapshot = [...next.queue];
      const statePendingSnapshot = [...next.pending];
      const filterItemTrace = buildResultGoToBansFilterItemTrace(
        stateQueueSnapshot,
        actionBanId,
      );
      logResultGoToBansReducerTrace({
        stage: 'entry',
        actionBanId,
        banId,
        stateQueue: stateQueueSnapshot,
        statePending: statePendingSnapshot,
        ...filterItemTrace,
      });
      const overlayKey = `result:${banId}`;
      const queueLenBefore = next.queue.length;
      const previousActiveKind = next.active.kind;
      const previousActiveBanId = next.active.banId;
      const previousDisplayResultId = next.display.result?.id ?? null;
      const previousDirectActive = next.display.directResultOverlayActive;
      const previousDirectOverlay = next.display.directResultOverlay;

      logResultGoToBansReducerTrace({
        stage: 'before-filter',
        actionBanId,
        banId,
        stateQueue: stateQueueSnapshot,
        statePending: statePendingSnapshot,
        ...filterItemTrace,
      });

      const nextQueueAfterFilter = next.queue.filter(
        (item) => normalizeId(overlayBanId(item)) !== banId,
      );
      const nextPendingAfterFilter = next.pending.filter(
        (item) => normalizeId(overlayBanId(item)) !== banId,
      );
      const removedQueue = stateQueueSnapshot.filter(
        (item) => normalizeId(overlayBanId(item)) === banId,
      );
      const keptQueue = stateQueueSnapshot.filter(
        (item) => normalizeId(overlayBanId(item)) !== banId,
      );
      logResultGoToBansReducerTrace({
        stage: 'after-filter',
        actionBanId,
        banId,
        stateQueue: stateQueueSnapshot,
        statePending: statePendingSnapshot,
        nextQueue: nextQueueAfterFilter,
        nextPending: nextPendingAfterFilter,
        removedQueue,
        keptQueue,
        ...filterItemTrace,
        includeStack:
          stateQueueSnapshot.length > 0 && nextQueueAfterFilter.length === 0,
      });

      next.queue = nextQueueAfterFilter;
      next.pending = nextPendingAfterFilter;

      const shownKeys = new Set(next.session.shownOverlayKeys);
      shownKeys.add(overlayKey);
      next.session.shownOverlayKeys = shownKeys;

      const closesDisplayedResult =
        normalizeId(next.display.result?.id ?? '') === banId;
      const closesDirectLayer =
        closesDisplayedResult ||
        next.display.directResultOverlayActive ||
        next.display.directResultOverlay;
      if (closesDisplayedResult || closesDirectLayer) {
        next.display = {
          ...next.display,
          result: closesDisplayedResult ? null : next.display.result,
          directResultOverlay: false,
          directResultOverlayActive: false,
        };
      }

      if (
        next.active.kind === 'result' &&
        normalizeId(next.active.banId ?? '') === banId
      ) {
        next.active = {
          kind: null,
          banId: null,
          payload: null,
          source: null,
        };
      }

      next = syncActiveFromQueueHead(next, 'RESULT_GO_TO_BANS');

      const queueLenAfter = next.queue.length;
      const pendingLenAfter = next.pending.length;
      const ownerHead = next.queue[0] ?? null;
      const hasNextOverlayHead = ownerHead != null;
      if (hasNextOverlayHead) {
        next = applyOwnerDisplayFromQueueHead(next);
      }
      const showedBansLayer =
        !hasNextOverlayHead && queueLenAfter === 0 && pendingLenAfter === 0;
      effects.push({
        type: 'LOG',
        tag: 'go-to-bans-next-overlay-atomic-commit',
        fields: {
          consumedResultKey: overlayKey,
          nextKey: ownerHead ? overlayQueueKey(ownerHead) : null,
          nextKind: ownerHead?.kind ?? null,
          queueLenBefore,
          queueLenAfter,
          displayKindAfter: resolveOwnerDisplayKindForLog(next.display),
          activeKindAfter: next.active.kind,
          showedBansLayer,
        },
      });
      effects.push({
        type: 'LOG',
        tag: 'result-go-to-bans-owner-transition',
        fields: {
          banId,
          overlayKey,
          previousActiveKind,
          previousActiveBanId,
          previousDisplayResultId,
          previousDirectActive,
          previousDirectOverlay,
          nextActiveKind: next.active.kind,
          nextActiveBanId: next.active.banId,
          nextDisplayResultId: next.display.result?.id ?? null,
          nextDirectActive: next.display.directResultOverlayActive,
          ownerQueueLen: next.queue.length,
          ownerPendingLen: next.pending.length,
          ownerQueueHeadKind: ownerHead?.kind ?? null,
          ownerQueueHeadBanId: ownerHead
            ? normalizeId(overlayBanId(ownerHead)) || null
            : null,
          shownOverlayKeysLen: next.session.shownOverlayKeys.size,
          displayResultCleared: closesDisplayedResult,
          directLayerCleared: closesDirectLayer,
        },
      });
      effects.push({
        type: 'LOG',
        tag: 'active-result-clear-decision',
        fields: {
          source: 'RESULT_GO_TO_BANS',
          action: 'RESULT_GO_TO_BANS',
          beforeActiveKind: previousActiveKind,
          afterActiveKind: next.active.kind,
          beforeQueueLen: queueLenBefore,
          afterQueueLen: queueLenAfter,
          didClearActive:
            previousActiveKind === 'result' &&
            normalizeId(previousActiveBanId ?? '') === banId &&
            next.active.kind !== 'result',
          didClearDisplay: closesDisplayedResult || closesDirectLayer,
          didMarkConsumed: true,
          skipReason: null,
        },
      });
      effects.push({
        type: 'PRODUCTION_QUEUE_MIRROR',
        queue: [...next.queue],
        source: 'RESULT_GO_TO_BANS',
        silent: false,
      });
      effects.push({
        type: 'PRODUCTION_PENDING_MIRROR',
        pending: [...next.pending],
        source: 'RESULT_GO_TO_BANS',
      });
      effects.push({ type: 'PREFETCH_CHAIN', skipBanId: banId });
      effects.push({ type: 'APPLY_DISPLAY' });
      logResultGoToBansReducerTrace({
        stage: 'before-return',
        actionBanId,
        banId,
        stateQueue: stateQueueSnapshot,
        statePending: statePendingSnapshot,
        nextQueue: [...next.queue],
        nextPending: [...next.pending],
        removedQueue,
        keptQueue,
        ...filterItemTrace,
        includeStack:
          stateQueueSnapshot.length > 0 && next.queue.length === 0,
      });
      break;
    }

    case 'CHAIN_CONTINUE_REQUESTED': {
      if (next.holds.checkResultWait) {
        effects.push({
          type: 'LOG',
          tag: 'chain-continue-blocked-hold',
          fields: { source: event.source },
        });
        break;
      }
      if (next.queue.length === 0 && next.pending.length === 0) {
        next.session.lobbyOpen = true;
        effects.push({ type: 'OPEN_LOBBY', source: event.source });
      } else {
        next = syncActiveFromQueueHead(next, 'CHAIN_CONTINUE_REQUESTED');
        effects.push({ type: 'APPLY_DISPLAY' });
      }
      break;
    }

    case 'CHAIN_TRANSITIONING_SET': {
      next.session.notificationChainTransitioning = event.active;
      if (event.active) {
        next.session.lobbyOpen = false;
      }
      effects.push({
        type: 'SESSION_FIELDS_APPLIED',
        session: { ...next.session },
        source: event.source ?? 'CHAIN_TRANSITIONING_SET',
      });
      effects.push({
        type: 'LOG',
        tag: 'chain-transitioning-set',
        fields: {
          source: event.source ?? null,
          active: event.active,
          lobbyOpen: next.session.lobbyOpen,
        },
      });
      break;
    }

    case 'STARTUP_INTERACTIONS_RELEASED': {
      // Session hold authority only. Pending->queue promotion stays with
      // notification-runtime queue APIs in the release adapter.
      next.session.startupHold = false;
      effects.push({
        type: 'SESSION_FIELDS_APPLIED',
        session: { ...next.session },
        source: event.source ?? 'STARTUP_INTERACTIONS_RELEASED',
      });
      effects.push({
        type: 'LOG',
        tag: 'startup-released',
        fields: { pendingCount: event.pendingCount ?? 0 },
      });
      break;
    }

    case 'QUEUE_UNLOCK_REQUESTED': {
      next.session.startupHold = false;
      effects.push({
        type: 'SESSION_FIELDS_APPLIED',
        session: { ...next.session },
        source: `QUEUE_UNLOCK_REQUESTED:${event.reason}`,
      });
      effects.push({
        type: 'LOG',
        tag: 'queue-unlock-requested',
        fields: { reason: event.reason },
      });
      break;
    }

    case 'DRAIN_REQUESTED': {
      next.session.drainActive = true;
      next.session.notificationChainTransitioning = true;
      next.session.startupHold = false;
      next.session.lobbyOpen = false;
      effects.push({
        type: 'SESSION_FIELDS_APPLIED',
        session: { ...next.session },
        source: event.source ?? 'DRAIN_REQUESTED',
      });
      effects.push({
        type: 'LOG',
        tag: 'drain-requested',
        fields: { source: event.source ?? null },
      });
      break;
    }

    case 'OVERBOARD_CLICKED': {
      const banId = normalizeId(event.banId);
      if (!banId) break;
      next.holds.atomicOverboardBanId = banId;
      next.holds.overkillTerminalBanIds.add(banId);
      effects.push({
        type: 'LOG',
        tag: 'overboard-clicked',
        fields: { banId },
      });
      break;
    }

    case 'DEEPLINK_OPENED': {
      next.meta.deeplinkSingleCard = true;
      effects.push({
        type: 'LOG',
        tag: 'deeplink-opened',
        fields: { kind: event.kind, banId: event.banId },
      });
      break;
    }

    case 'LOBBY_OPEN_REQUESTED': {
      next.session.lobbyOpen = true;
      effects.push({ type: 'OPEN_LOBBY', source: event.source });
      break;
    }

    case 'OVERLAY_RENDERED': {
      effects.push({
        type: 'LOG',
        tag: 'overlay-rendered',
        fields: { kind: event.kind, banId: event.banId },
      });
      break;
    }

    case 'OVERLAY_USER_ACTION': {
      effects.push({
        type: 'LOG',
        tag: 'overlay-user-action',
        fields: { kind: event.kind, banId: event.banId ?? null },
      });
      break;
    }

    case 'LATE_RESULT_ARRIVED': {
      const banId = normalizeId(event.banId);
      if (!banId) break;
      const terminal = shouldAllowTerminalResultForBan(
        banId,
        resolveBanResultOutcome(event.result),
        next.holds.overkillTerminalBanIds,
      );
      if (!terminal.allowed) {
        effects.push({
          type: 'LOG',
          tag: 'late-result-blocked-terminal-lock',
          fields: { banId, reason: terminal.reason },
        });
        break;
      }
      if (next.queue.length === 0) {
        next.queue = [{ kind: 'result', result: event.result }];
      } else {
        const resultItem: QueuedOverlay = {
          kind: 'result',
          result: event.result,
        };
        next.queue = [next.queue[0], resultItem, ...next.queue.slice(1)];
      }
      next = syncActiveFromQueueHead(next);
      effects.push({ type: 'APPLY_DISPLAY' });
      break;
    }

    case 'TERMINAL_OVERBOARD_LOCKED': {
      const banId = normalizeId(event.banId);
      if (!banId) break;
      next.holds.overkillTerminalBanIds.add(banId);
      effects.push({
        type: 'LOG',
        tag: 'terminal-overboard-locked',
        fields: { banId },
      });
      break;
    }

    case 'STALE_RESULT_REJECTED': {
      const banId = normalizeId(event.banId);
      if (!banId) break;
      if (
        next.queue[0]?.kind === 'result' &&
        normalizeId(next.queue[0].result.id) === banId
      ) {
        next.queue = next.queue.slice(1);
      }
      next = syncActiveFromQueueHead(next);
      effects.push({ type: 'APPLY_DISPLAY' });
      break;
    }

    case 'SESSION_FIELDS_PATCH': {
      next.session = applySessionMirrorPatch(next.session, event.patch);
      effects.push({
        type: 'LOG',
        tag: 'session-fields-patch',
        fields: {
          source: event.source ?? null,
          patchKeys: Object.keys(event.patch),
        },
      });
      break;
    }

    case 'HOLDS_FIELDS_PATCH': {
      next.holds = applyHoldsMirrorPatch(next.holds, event.patch);
      effects.push({
        type: 'LOG',
        tag: 'holds-fields-patch',
        fields: {
          source: event.source ?? null,
          patchKeys: Object.keys(event.patch),
        },
      });
      break;
    }

    case 'META_FIELDS_PATCH': {
      next.meta = applyMetaMirrorPatch(next.meta, event.patch);
      effects.push({
        type: 'LOG',
        tag: 'meta-fields-patch',
        fields: {
          source: event.source ?? null,
          patchKeys: Object.keys(event.patch),
        },
      });
      break;
    }

    case 'PRODUCTION_DISPLAY_PATCH_REJECTED': {
      // display fields are owner-authority only (ACTIVE_DISPLAY_SYNC).
      reportReverseDisplayActiveBlocked('PRODUCTION_DISPLAY_PATCH_REJECTED');
      effects.push({
        type: 'LOG',
        tag: 'production-display-patch-rejected',
        fields: {
          source: event.source ?? null,
          patchKeys: Object.keys(event.patch),
        },
      });
      break;
    }

    default: {
      const _exhaustive: never = event;
      effects.push({
        type: 'LOG',
        tag: 'unknown-event',
        fields: { event: (_exhaustive as NotificationOverlayOwnerEvent).type },
      });
    }
  }

  logOwnerReducerTrackedFieldAssignments({
    previous: state,
    next,
    function: 'notificationOverlayOwnerReducer',
    eventType: event.type,
  });

  return { state: next, effects };
}

function resolveBanResultOutcome(
  result: Pick<BanResult, 'outcome' | 'status'>,
): string {
  return (result.outcome ?? result.status ?? '').trim().toLowerCase();
}

/**
 * Stage 4A invariant: reverse sync / direct legacy writers must not own
 * notificationChainTransitioning (and related transition authority fields).
 * Dev/test: throw. Production: structured warning without payload PII.
 */
export function reportReverseTransitionBlocked(source: string): void {
  const message = `[OWNER STAGE4A] reverse/direct transition write blocked (${source})`;
  if (
    process.env.NODE_ENV === 'test' ||
    process.env.NODE_ENV === 'development'
  ) {
    throw new Error(message);
  }
  console.warn(message);
}

export function shouldOwnerRejectNormalResultAfterOverboard(
  banId: string,
  outcome: string | null | undefined,
  lockedBanIds: ReadonlySet<string>,
): boolean {
  const decision = shouldAllowTerminalResultForBan(
    banId,
    outcome,
    lockedBanIds,
  );
  return !decision.allowed && !isOverkillTerminalOutcome(outcome);
}

const QUEUE_AUTHORITY_EVENT_TYPES = new Set<NotificationOverlayOwnerEvent['type']>([
  'QUEUE_APPLIED',
  'QUEUE_SILENT_UPDATED',
  'PENDING_QUEUE_APPLIED',
  'NOTIFICATION_ENQUEUED',
]);

export type NotificationOwnerPinStateHandle = {
  getState: () => NotificationOverlayOwnerState;
  dispatch: (
    event: NotificationOverlayOwnerEvent,
    source: string,
    snapshot?: OwnerProductionSnapshot,
  ) => NotificationOverlayOwnerState;
  syncFromProduction: (
    snapshot: OwnerProductionSnapshot,
    source: string,
  ) => NotificationOverlayOwnerState;
};

/**
 * Runtime host for the fields owned by this module (pins/session/holds/meta).
 *
 * `onSessionFieldsApplied` is invoked whenever the reducer produces a
 * SESSION_FIELDS_APPLIED effect (real session-gate transitions); callers use
 * it to project session authority onto whatever legacy refs still read it.
 * Queue/pending/display-paint authority events are intentionally no-ops here
 * (notification-runtime owns them); see QUEUE_AUTHORITY_EVENT_TYPES /
 * ACTIVE_DISPLAY_AUTHORITY_EVENT_TYPES below.
 */
export function createNotificationOwnerPinStateHost(
  onSessionFieldsApplied?: (
    session: NotificationOverlayOwnerState['session'],
    source: string,
  ) => void,
): NotificationOwnerPinStateHandle {
  let state = createInitialNotificationOverlayOwnerState();

  const runEffects = (
    effects: NotificationOverlayOwnerEffect[],
  ): void => {
    for (const effect of effects) {
      if (effect.type === 'SESSION_FIELDS_APPLIED') {
        onSessionFieldsApplied?.(effect.session, effect.source);
        continue;
      }
      if (effect.type === 'APPLY_DISPLAY') {
        const resultId = state.display.result?.id ?? null;
        if (
          resultId &&
          resolveBanResultOutcome(state.display.result) === 'overboard'
        ) {
          noteOverboardFlashWriter('APPLY_DISPLAY', resultId);
        }
        onSessionFieldsApplied?.(state.session, 'APPLY_DISPLAY');
        continue;
      }
    }
  };

  return {
    getState: () => state,
    dispatch(event, source) {
      if (QUEUE_AUTHORITY_EVENT_TYPES.has(event.type)) {
        throw new Error(
          `notification-owner-pin-state must not accept queue authority event ${event.type} — use notification-owner ingest`,
        );
      }
      if (event.type === 'ACTIVE_DISPLAY_SYNC') {
        // Notification card display paint is runtime-only
        // (v9-display-authority-noop). Product pins (stableIncomingBan /
        // replyIncomingBan / scopedIncomingBan) are still owned here, so
        // patches that touch ONLY pin fields proceed.
        const patch = event.patch;
        const hasPinFields =
          patch.stableIncomingBan !== undefined ||
          patch.replyIncomingBan !== undefined ||
          patch.scopedIncomingBan !== undefined;
        const isNotificationCardPaint =
          patch.incomingBan !== undefined ||
          patch.checkBan !== undefined ||
          patch.result !== undefined ||
          patch.directResultOverlay !== undefined ||
          patch.directResultOverlayActive !== undefined;
        if (isNotificationCardPaint && !hasPinFields) {
          throw new Error(
            'notification-owner-pin-state must not accept card-paint ACTIVE_DISPLAY_SYNC — NotificationOwnerHost owns display',
          );
        }
      }
      const result = notificationOverlayOwnerReducer(state, event);
      state = result.state;
      runEffects(result.effects);
      return state;
    },
    syncFromProduction(snapshot, source) {
      return this.dispatch(
        { type: 'PRODUCTION_SNAPSHOT_SYNC', snapshot },
        source,
        snapshot,
      );
    },
  };
}
