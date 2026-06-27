import type { BanInteraction, BanResult } from '@98plus/shared';
import type { QueuedOverlay } from '@/lib/overlay-queue';
import {
  buildResultPriorityQueue,
  overlayBanId,
  overlayQueueKey,
} from '@/lib/overlay-queue';
import type { HeldUserCardOverlay } from '@/lib/overlay-user-card-guard';
import { normalizeId } from '@/lib/normalize-json';
import {
  isOverkillTerminalOutcome,
  shouldAllowTerminalResultForBan,
} from '@/lib/overkill-terminal-lock';
/** Bounded wait for check-answer final result (matches production constant). */
export const NOTIFICATION_OWNER_CHECK_RESULT_HOLD_MS = 2250;

export type NotificationOverlayActiveSource =
  | 'queue'
  | 'held-restore'
  | 'direct-overboard'
  | null;

export type NotificationOverlayOwnerState = {
  queue: QueuedOverlay[];
  pending: QueuedOverlay[];

  active: {
    kind: 'incoming' | 'check' | 'result' | null;
    banId: string | null;
    payload: BanInteraction | BanResult | null;
    source: NotificationOverlayActiveSource;
  };

  session: {
    lobbyOpen: boolean;
    chainAdvanceWaiting: boolean;
    notificationChainTransitioning: boolean;
    startupHold: boolean;
    overlayVisible: boolean;
    shellKind: 'incoming' | 'check' | 'result' | null;
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
  };

  meta: {
    notificationMode: string | null;
    deeplinkSingleCard: boolean;
    composeBlocking: boolean;
    successCardMounted: boolean;
  };
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
      type: 'STARTUP_INTERACTIONS_RELEASED';
      pendingCount?: number;
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
  /** Step-1 shadow bridge: production committed a full overlay queue replace. */
  | {
      type: 'SHADOW_QUEUE_APPLIED';
      queue: QueuedOverlay[];
    }
  /** Step-1 shadow bridge: align session/holds/meta from production snapshot. */
  | {
      type: 'SHADOW_PRODUCTION_SNAPSHOT';
      snapshot: OwnerProductionSnapshot;
    };

export type NotificationOverlayOwnerEffect =
  | { type: 'APPLY_DISPLAY' }
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
  activeCheckBanId: string | null;
  activeResultBanId: string | null;
  lobbyOpen: boolean;
  chainAdvanceWaiting: boolean;
  notificationChainTransitioning: boolean;
  startupHold: boolean;
  overlayVisible: boolean;
  shellKind: 'incoming' | 'check' | 'result' | null;
  checkResultHoldBanId: string | null;
  heldUserCardKind: HeldUserCardOverlay['kind'] | null;
  heldUserCardBanId: string | null;
  atomicOverboardBanId: string | null;
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
    session: {
      lobbyOpen: true,
      chainAdvanceWaiting: false,
      notificationChainTransitioning: false,
      startupHold: false,
      overlayVisible: false,
      shellKind: null,
    },
    holds: {
      userCard: null,
      checkResultWait: null,
      atomicOverboardBanId: null,
      overkillTerminalBanIds: new Set(),
      resultPriorityBanIds: new Set(),
    },
    meta: {
      notificationMode: null,
      deeplinkSingleCard: false,
      composeBlocking: false,
      successCardMounted: false,
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
    session: { ...state.session },
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
    },
    meta: { ...state.meta },
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
): NotificationOverlayOwnerState {
  const head = state.queue[0];
  if (!head) {
    if (state.active.source === 'direct-overboard') {
      return {
        ...state,
        session: {
          ...state.session,
          shellKind: state.active.kind,
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
      session: {
        ...state.session,
        shellKind: null,
      },
    };
  }

  const banId = normalizeId(overlayBanId(head)) || null;
  const payload =
    head.kind === 'result' ? head.result : (head.ban as BanInteraction);

  return {
    ...state,
    active: {
      kind: head.kind,
      banId,
      payload,
      source: 'queue',
    },
    session: {
      ...state.session,
      shellKind: head.kind,
      overlayVisible: true,
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

function applyProductionSnapshot(
  state: NotificationOverlayOwnerState,
  snapshot: OwnerProductionSnapshot,
): NotificationOverlayOwnerState {
  let next = cloneOwnerState(state);
  next.queue = [...snapshot.queue];
  next.pending = [...snapshot.pending];
  next.session.lobbyOpen = snapshot.lobbyOpen;
  next.session.chainAdvanceWaiting = snapshot.chainAdvanceWaiting;
  next.session.notificationChainTransitioning =
    snapshot.notificationChainTransitioning;
  next.session.startupHold = snapshot.startupHold;
  next.session.overlayVisible = snapshot.overlayVisible;
  next.session.shellKind = snapshot.shellKind;
  next.holds.atomicOverboardBanId = snapshot.atomicOverboardBanId;

  if (snapshot.checkResultHoldBanId) {
    next.holds.checkResultWait = {
      banId: snapshot.checkResultHoldBanId,
      deferredQueue: next.holds.checkResultWait?.deferredQueue ?? [],
      startedAt: next.holds.checkResultWait?.startedAt ?? Date.now(),
      timeoutMs: NOTIFICATION_OWNER_CHECK_RESULT_HOLD_MS,
    };
  } else {
    next.holds.checkResultWait = null;
  }

  if (snapshot.heldUserCardKind && snapshot.heldUserCardBanId) {
    next.holds.userCard = null;
  }

  const activeKind =
    snapshot.activeResultBanId != null
      ? 'result'
      : snapshot.activeCheckBanId != null
        ? 'check'
        : snapshot.activeIncomingBanId != null
          ? 'incoming'
          : snapshot.realHeadKind;

  const activeBanId =
    snapshot.activeResultBanId ??
    snapshot.activeCheckBanId ??
    snapshot.activeIncomingBanId ??
    snapshot.realHeadBanId;

  next.active = {
    kind: activeKind ?? null,
    banId: activeBanId,
    payload: null,
    source: activeKind ? 'queue' : null,
  };

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

export function compareOwnerShadowWithProduction(
  ownerState: NotificationOverlayOwnerState,
  snapshot: OwnerProductionSnapshot,
): string[] {
  const mismatches: string[] = [];
  const ownerHead = resolveOwnerHeadBanId(ownerState.queue);
  const realHeadKind = snapshot.realHeadKind;
  const realHeadBanId = snapshot.realHeadBanId
    ? normalizeId(snapshot.realHeadBanId)
    : null;

  if (ownerState.queue.length !== snapshot.queue.length) {
    mismatches.push(
      `queueLen owner=${ownerState.queue.length} real=${snapshot.queue.length}`,
    );
  }
  if (ownerState.pending.length !== snapshot.pending.length) {
    mismatches.push(
      `pendingLen owner=${ownerState.pending.length} real=${snapshot.pending.length}`,
    );
  }
  if (ownerHead.kind !== realHeadKind) {
    mismatches.push(
      `headKind owner=${ownerHead.kind ?? 'null'} real=${realHeadKind ?? 'null'}`,
    );
  }
  if ((ownerHead.banId ?? null) !== (realHeadBanId ?? null)) {
    mismatches.push(
      `headBanId owner=${ownerHead.banId ?? 'null'} real=${realHeadBanId ?? 'null'}`,
    );
  }
  if (ownerState.session.lobbyOpen !== snapshot.lobbyOpen) {
    mismatches.push(
      `lobbyOpen owner=${ownerState.session.lobbyOpen} real=${snapshot.lobbyOpen}`,
    );
  }
  if (ownerState.session.overlayVisible !== snapshot.overlayVisible) {
    mismatches.push(
      `overlayVisible owner=${ownerState.session.overlayVisible} real=${snapshot.overlayVisible}`,
    );
  }
  if (
    Boolean(ownerState.holds.checkResultWait?.banId) !==
    Boolean(snapshot.checkResultHoldBanId)
  ) {
    mismatches.push(
      `checkResultHold owner=${ownerState.holds.checkResultWait?.banId ?? 'null'} real=${snapshot.checkResultHoldBanId ?? 'null'}`,
    );
  }
  return mismatches;
}

export function notificationOverlayOwnerReducer(
  state: NotificationOverlayOwnerState,
  event: NotificationOverlayOwnerEvent,
): NotificationOverlayOwnerReducerResult {
  const effects: NotificationOverlayOwnerEffect[] = [];
  let next = cloneOwnerState(state);

  switch (event.type) {
    case 'SHADOW_PRODUCTION_SNAPSHOT': {
      next = applyProductionSnapshot(next, event.snapshot);
      effects.push({
        type: 'LOG',
        tag: 'shadow-production-snapshot',
        fields: { queueLen: next.queue.length, pendingLen: next.pending.length },
      });
      break;
    }

    case 'SHADOW_QUEUE_APPLIED': {
      next.queue = [...event.queue];
      next = syncActiveFromQueueHead(next);
      effects.push({ type: 'APPLY_DISPLAY' });
      break;
    }

    case 'NOTIFICATION_ENQUEUED': {
      const scope = event.scope ?? 'queue';
      if (scope === 'pending') {
        next.pending = mergePendingUnique(next.pending, event.item);
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
      next.queue = next.queue.filter(
        (item) => normalizeId(overlayBanId(item)) !== banId,
      );
      next.pending = next.pending.filter(
        (item) => normalizeId(overlayBanId(item)) !== banId,
      );
      next = syncActiveFromQueueHead(next);
      effects.push({ type: 'PREFETCH_CHAIN', skipBanId: banId });
      effects.push({ type: 'APPLY_DISPLAY' });
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
        next = syncActiveFromQueueHead(next);
        effects.push({ type: 'APPLY_DISPLAY' });
      }
      break;
    }

    case 'STARTUP_INTERACTIONS_RELEASED': {
      next.session.startupHold = false;
      if (next.pending.length > 0) {
        next.queue = [...next.queue, ...next.pending];
        next.pending = [];
        next = syncActiveFromQueueHead(next);
        effects.push({ type: 'APPLY_DISPLAY' });
      }
      effects.push({
        type: 'LOG',
        tag: 'startup-released',
        fields: { pendingCount: event.pendingCount ?? 0 },
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

    default: {
      const _exhaustive: never = event;
      effects.push({
        type: 'LOG',
        tag: 'unknown-event',
        fields: { event: (_exhaustive as NotificationOverlayOwnerEvent).type },
      });
    }
  }

  return { state: next, effects };
}

function resolveBanResultOutcome(
  result: Pick<BanResult, 'outcome' | 'status'>,
): string {
  return (result.outcome ?? result.status ?? '').trim().toLowerCase();
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
