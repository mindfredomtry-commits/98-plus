/**
 * Vertical 1 — production queue ingest + atomic dismiss bridge.
 *
 * Sole advance authority: notification-runtime reducer.
 * Vertical 8: Legacy sinks must not decide next card, lobby, or badge.
 * Vertical 9: RuntimeLegacySinks are empty no-ops in production (no dual-store /
 * projection engine). Callers must pass EMPTY_RUNTIME_LEGACY_SINKS.
 */
import type { OwnerActiveDisplayPatch } from '@/lib/notification-overlay-owner';
import { overlayQueueKey, type QueuedOverlay } from '@/lib/overlay-queue';
import {
  mapDismissReasonToCardReason,
  projectRuntimeAdvanceSnapshot,
  projectRuntimeDisplayToLegacy,
  projectRuntimeQueueToLegacy,
} from './notification-runtime.adapters';
import {
  dismissRuntimeHead,
  nextRuntimeTransitionId,
  notificationItemId,
  syncRuntimeQueue,
  type NotificationRuntimeStore,
} from './notification-runtime.store';
import type {
  NotificationItem,
  NotificationRuntimeState,
  RuntimeEffect,
  RuntimeSource,
} from './notification-runtime.types';

/** TEMP V1–V2: sinks that project runtime → legacy UI/owner mirrors. */
export type RuntimeLegacySinks = {
  /** Replace legacy queue mirror (owner + React). Must not decide next. */
  writeQueue: (queue: QueuedOverlay[], source: string) => void;
  /** Replace legacy display mirror. Must not clear-before-next independently. */
  writeDisplay: (patch: OwnerActiveDisplayPatch, source: string) => void;
  /** Optional side-effect adapter (MARK_CONSUMED / PREFETCH / ANALYTICS only). */
  runEffects?: (effects: RuntimeEffect[]) => void;
};

export function mapProvidersSourceToRuntime(source: string): RuntimeSource {
  const s = source.toLowerCase();
  if (s.includes('bootstrap') || s.includes('startup') || s.includes('hydrate')) {
    return 'bootstrap';
  }
  if (s.includes('drain')) return 'drain';
  if (s.includes('deeplink')) return 'deeplink';
  if (s.includes('websocket') || s.includes(':ws') || s.endsWith('-ws') || s.includes('ws-')) {
    return 'websocket';
  }
  if (s.includes('poll')) return 'poll';
  if (s.includes('recover')) return 'recovery';
  if (
    s.includes('dismiss') ||
    s.includes('user-answer') ||
    s.includes('user') ||
    s.includes('go-to-bans') ||
    s.includes('result-cta')
  ) {
    return 'user';
  }
  if (s.includes('test')) return 'test';
  return 'system';
}

export function toQueuedOverlayItems(
  queue: readonly QueuedOverlay[],
): NotificationItem[] {
  return queue.map((item) => {
    if (item.kind === 'result') return { kind: 'result', result: item.result };
    if (item.kind === 'check') return { kind: 'check', ban: item.ban };
    return { kind: 'incoming', ban: item.ban };
  });
}

/** TEMP V1–V2: exclusive display patch from runtime (no partial clear gap). */
export function buildExclusiveDisplayPatchFromRuntime(
  state: NotificationRuntimeState,
): OwnerActiveDisplayPatch {
  const display = projectRuntimeDisplayToLegacy(state);
  return {
    incomingBan: display.incomingBan,
    checkBan: display.checkBan,
    result: display.result,
    directResultOverlay: display.directResultOverlay,
    directResultOverlayActive: display.directResultOverlayActive,
    // Clear presentation pins so exclusive card owns the shell.
    stableIncomingBan: null,
    replyIncomingBan: null,
    scopedIncomingBan: null,
  };
}

/**
 * Ingest / replace production queue via ITEMS_RECEIVED (sole queue authority).
 * Then TEMP-project to legacy sinks.
 */
export function ingestProductionQueue(
  store: NotificationRuntimeStore,
  queue: readonly QueuedOverlay[],
  source: string,
  sinks: RuntimeLegacySinks,
  options?: { projectLegacy?: boolean; transitionId?: string },
): NotificationRuntimeState {
  const runtimeSource = mapProvidersSourceToRuntime(source);
  const state = syncRuntimeQueue(
    store,
    toQueuedOverlayItems(queue),
    runtimeSource,
    options?.transitionId,
  );
  if (options?.projectLegacy !== false) {
    sinks.writeQueue(projectRuntimeQueueToLegacy(state), `v1-runtime-ingest:${source}`);
    if (state.items.queue.length > 0) {
      sinks.writeDisplay(
        buildExclusiveDisplayPatchFromRuntime(state),
        `v1-runtime-ingest-display:${source}`,
      );
    }
  }
  return state;
}

export type AtomicDismissResult = {
  ok: boolean;
  state: NotificationRuntimeState;
  snapshot: ReturnType<typeof projectRuntimeAdvanceSnapshot>;
  effects: RuntimeEffect[];
  /** True when next card exists after dismiss (no lobby). */
  hasNext: boolean;
};

/**
 * Atomic A→B (or A→empty) via CARD_DISMISS_REQUESTED.
 * Projects queue+display together; never leaves display=null while hasNext.
 */
export function dismissProductionHeadAtomic(
  store: NotificationRuntimeStore,
  args: {
    /** Full queue before dismiss (must include current head). */
    queueBefore: readonly QueuedOverlay[];
    targetItemId: string;
    reason: string;
    source: string;
    transitionId?: string;
  },
  sinks: RuntimeLegacySinks,
): AtomicDismissResult {
  const runtimeSource = mapProvidersSourceToRuntime(args.source);
  // Align runtime queue with production snapshot before dismiss.
  syncRuntimeQueue(
    store,
    toQueuedOverlayItems(args.queueBefore),
    runtimeSource,
    args.transitionId ? `${args.transitionId}:align` : undefined,
  );

  const cardReason = mapDismissReasonToCardReason(args.reason);
  const result = dismissRuntimeHead(
    store,
    args.targetItemId,
    cardReason,
    runtimeSource,
    args.transitionId,
  );
  const snapshot = projectRuntimeAdvanceSnapshot(result.state);
  const hasNext = snapshot.queue.length > 0;

  // Single projection flush: queue + display from the same reducer state.
  sinks.writeQueue(snapshot.queue, `v1-runtime-dismiss:${args.reason}`);
  sinks.writeDisplay(
    buildExclusiveDisplayPatchFromRuntime(result.state),
    `v1-runtime-dismiss-display:${args.reason}`,
  );
  sinks.runEffects?.(result.effects);

  return {
    ok: true,
    state: result.state,
    snapshot,
    effects: result.effects,
    hasNext,
  };
}

export function runtimeHeadItemId(
  queue: readonly QueuedOverlay[],
): string | null {
  const head = queue[0];
  if (!head) return null;
  return overlayQueueKey(head);
}

export type ReconcilePresentationOutcome =
  | 'presentation-active'
  | 'show-head'
  | 'normalized-idle'
  | 'wait-drain'
  | 'wait-boot';

/**
 * Resolve stable `queue.length > 0 && display = null` (and empty-queue overlay
 * orphans) exactly once at the runtime boundary. Never call from InstantBanFlow.
 */
export function reconcileRuntimeQueuePresentation(
  store: NotificationRuntimeStore,
  sinks: RuntimeLegacySinks,
  source: string = 'reconcile-presentation',
): ReconcilePresentationOutcome {
  const state = store.getState();
  if (state.display.kind != null && state.display.payload != null) {
    return 'presentation-active';
  }

  const lifecycle = state.lifecycle.status;
  if (lifecycle === 'booting' || lifecycle === 'recovering') {
    return 'wait-boot';
  }
  // Active SUCCESS/drain materialize owns this transition — do not steal it.
  if (lifecycle === 'draining' && state.lifecycle.transitionId) {
    return 'wait-drain';
  }

  const runtimeSource = mapProvidersSourceToRuntime(source);

  if (state.items.queue.length === 0) {
    if (
      lifecycle === 'showing' ||
      lifecycle === 'draining' ||
      lifecycle === 'submitting' ||
      lifecycle === 'completing'
    ) {
      store.dispatch({
        type: 'RUNTIME_NORMALIZE_IDLE',
        transitionId: state.lifecycle.transitionId,
        reason: 'queue-empty-without-display',
        source: runtimeSource,
      });
      if (store.getState().lifecycle.status !== 'idle') {
        store.dispatch({
          type: 'ITEMS_RECEIVED',
          transitionId: nextRuntimeTransitionId('reconcile-idle'),
          items: [],
          replaceQueue: true,
          source: runtimeSource,
        });
      }
      const after = store.getState();
      sinks.writeQueue(projectRuntimeQueueToLegacy(after), `v1-${source}:idle`);
      sinks.writeDisplay(
        buildExclusiveDisplayPatchFromRuntime(after),
        `v1-${source}:idle-display`,
      );
    }
    return 'normalized-idle';
  }

  // Queue head exists, display null — materialize head via ITEMS_RECEIVED.
  store.dispatch({
    type: 'ITEMS_RECEIVED',
    transitionId: nextRuntimeTransitionId('reconcile-show-head'),
    items: state.items.queue,
    replaceQueue: true,
    source: runtimeSource,
  });
  const after = store.getState();
  sinks.writeQueue(projectRuntimeQueueToLegacy(after), `v1-${source}:show-head`);
  sinks.writeDisplay(
    buildExclusiveDisplayPatchFromRuntime(after),
    `v1-${source}:show-head-display`,
  );
  if (after.display.kind != null && after.display.payload != null) {
    return 'show-head';
  }

  // Materialize failed — settle idle, preserve queue items (do not consume).
  store.dispatch({
    type: 'RUNTIME_NORMALIZE_IDLE',
    transitionId: after.lifecycle.transitionId,
    reason: 'show-head-rejected-preserve-queue',
    source: runtimeSource,
  });
  return 'normalized-idle';
}
