import {
  compareOwnerShadowWithProduction,
  createInitialNotificationOverlayOwnerState,
  notificationOverlayOwnerReducer,
  resolveOwnerHeadBanId,
  type NotificationOverlayOwnerEvent,
  type NotificationOverlayOwnerState,
  type OwnerProductionSnapshot,
} from '@/lib/notification-overlay-owner';
import type { NotificationOwnerDisplayState } from '@/lib/notification-overlay-owner';
import { overlayQueueKey } from '@/lib/overlay-queue';
import {
  logOwnerPhase8LegacyMirror,
  logOwnerPhase8QueueDispatch,
  logOwnerPhase8QueueMismatch,
  logOwnerPhase9ActiveDispatch,
  logOwnerPhase9ActiveMirror,
  logOwnerPhase9ActiveMismatch,
  logOwnerPhase11BPendingMirror,
  logOwnerShadowEffect,
  logOwnerShadowEvent,
  logOwnerShadowMismatch,
  logOwnerShadowState,
} from '@/lib/notification-overlay-owner-debug';
import {
  buildOwnerDisplayWriteTraceSnapshot,
  logOwnerDisplayWriteTrace,
} from '@/lib/owner-display-write-trace-debug';
import {
  attachOwnerStateWriteDetect,
  type OwnerStateWriteDetectHandle,
} from '@/lib/owner-direct-write-detect-debug';
import { traceGoToBansOwnerDisplayWriteLazy } from '@/lib/browser-go-to-bans-next-card-debug';
import {
  logGoToBansNextOverlayAtomicCommit,
  logResultGoToBansOwnerTransition,
} from '@/lib/go-to-bans-payload-switch-trace';

const QUEUE_AUTHORITY_EVENT_TYPES = new Set<NotificationOverlayOwnerEvent['type']>([
  'QUEUE_APPLIED',
  'QUEUE_SILENT_UPDATED',
  'PENDING_QUEUE_APPLIED',
  'NOTIFICATION_ENQUEUED',
]);

const ACTIVE_DISPLAY_AUTHORITY_EVENT_TYPES = new Set<
  NotificationOverlayOwnerEvent['type']
>(['ACTIVE_DISPLAY_SYNC']);

export type NotificationOverlayOwnerShadowMirrorHandlers = {
  mirrorLegacyQueue?: (
    queue: NotificationOverlayOwnerState['queue'],
    source: string,
    silent: boolean,
  ) => void;
  mirrorLegacyPending?: (
    pending: NotificationOverlayOwnerState['pending'],
    source: string,
  ) => void;
  mirrorLegacyActive?: (
    display: NotificationOwnerDisplayState,
    source: string,
  ) => void;
  compareQueueIntegrity?: (
    source: string,
    ownerQueue: NotificationOverlayOwnerState['queue'],
    ownerPending: NotificationOverlayOwnerState['pending'],
  ) => void;
  compareActiveDisplayIntegrity?: (
    source: string,
    display: NotificationOwnerDisplayState,
  ) => void;
  mirrorLegacySession?: (
    session: NotificationOverlayOwnerState['session'],
    source: string,
  ) => void;
};

export type NotificationOverlayOwnerShadowHandle = {
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

export function createNotificationOverlayOwnerShadow(
  mirrorHandlers?: NotificationOverlayOwnerShadowMirrorHandlers,
): NotificationOverlayOwnerShadowHandle {
  let stateHandle: OwnerStateWriteDetectHandle = attachOwnerStateWriteDetect(
    createInitialNotificationOverlayOwnerState(),
    {
      file: 'notification-overlay-owner-shadow.ts',
      function: 'createNotificationOverlayOwnerShadow',
      writePath: 'shadow-state-in-place',
    },
  );
  const currentState = () => stateHandle.unwrap();

  const logSnapshotFields = (
    eventType: string,
    source: string,
    snapshot?: OwnerProductionSnapshot,
  ) => {
    const state = currentState();
    const ownerHead = resolveOwnerHeadBanId(state.queue);
    logOwnerShadowEvent({
      eventType,
      source,
      activeKind: state.active.kind,
      activeBanId: state.active.banId,
      queueLen: state.queue.length,
      pendingLen: state.pending.length,
      overlayVisible: state.session.overlayVisible,
      lobbyOpen: state.session.lobbyOpen,
      realHeadKind: snapshot?.realHeadKind ?? null,
      realHeadBanId: snapshot?.realHeadBanId ?? null,
      ownerHeadKind: ownerHead.kind,
      ownerHeadBanId: ownerHead.banId,
    });
  };

  const logStateAndEffects = (
    effects: ReturnType<typeof notificationOverlayOwnerReducer>['effects'],
  ) => {
    const state = currentState();
    const ownerHead = resolveOwnerHeadBanId(state.queue);
    logOwnerShadowState({
      activeKind: state.active.kind,
      activeBanId: state.active.banId,
      queueLen: state.queue.length,
      pendingLen: state.pending.length,
      overlayVisible: state.session.overlayVisible,
      lobbyOpen: state.session.lobbyOpen,
      chainAdvanceWaiting: state.session.chainAdvanceWaiting,
      notificationChainTransitioning: state.session.notificationChainTransitioning,
      shellKind: state.session.shellKind,
      ownerHeadKind: ownerHead.kind,
      ownerHeadBanId: ownerHead.banId,
    });
    for (const effect of effects) {
      logOwnerShadowEffect({
        effectType: effect.type,
        ...(effect.type === 'OPEN_LOBBY' ? { source: effect.source } : {}),
        ...(effect.type === 'SCHEDULE_HOLD_TIMEOUT'
          ? { banId: effect.banId, ms: effect.ms }
          : {}),
        ...(effect.type === 'CLEAR_HOLD_TIMEOUT' ? { banId: effect.banId } : {}),
        ...(effect.type === 'PREFETCH_CHAIN'
          ? { skipBanId: effect.skipBanId ?? null }
          : {}),
        ...(effect.type === 'MIRROR_LEGACY_QUEUE'
          ? {
              mirrorTarget: 'queue',
              queueLen: effect.queue.length,
              silent: effect.silent,
              mirrorSource: effect.source,
            }
          : {}),
        ...(effect.type === 'MIRROR_LEGACY_PENDING'
          ? {
              mirrorTarget: 'pending',
              pendingLen: effect.pending.length,
              mirrorSource: effect.source,
            }
          : {}),
        ...(effect.type === 'MIRROR_LEGACY_ACTIVE'
          ? {
              mirrorTarget: 'active-display',
              incomingBanId: effect.display.incomingBan?.id ?? null,
              checkBanId: effect.display.checkBan?.id ?? null,
              resultBanId: effect.display.result?.id ?? null,
              directResultOverlay: effect.display.directResultOverlay,
              directResultOverlayActive: effect.display.directResultOverlayActive,
              mirrorSource: effect.source,
            }
          : {}),
        ...(effect.type === 'LOG' ? { tag: effect.tag, ...effect.fields } : {}),
      });
    }
  };

  const compareWithProduction = (
    snapshot: OwnerProductionSnapshot,
    source: string,
  ) => {
    const state = currentState();
    const mismatches = compareOwnerShadowWithProduction(state, snapshot);
    if (mismatches.length === 0) return;
    const ownerHead = resolveOwnerHeadBanId(state.queue);
    logOwnerShadowMismatch({
      source,
      mismatches,
      activeKind: state.active.kind,
      activeBanId: state.active.banId,
      queueLen: state.queue.length,
      pendingLen: state.pending.length,
      overlayVisible: state.session.overlayVisible,
      lobbyOpen: state.session.lobbyOpen,
      realHeadKind: snapshot.realHeadKind,
      realHeadBanId: snapshot.realHeadBanId,
      ownerHeadKind: ownerHead.kind,
      ownerHeadBanId: ownerHead.banId,
    });
  };

  const runMirrorEffects = (
    effects: ReturnType<typeof notificationOverlayOwnerReducer>['effects'],
    source: string,
  ) => {
    const state = currentState();
    for (const effect of effects) {
      if (effect.type === 'MIRROR_LEGACY_QUEUE') {
        logOwnerPhase8LegacyMirror({
          target: 'queue',
          source: effect.source,
          queueLen: effect.queue.length,
          silent: effect.silent,
          headKey: effect.queue[0] ? overlayQueueKey(effect.queue[0]) : null,
        });
        mirrorHandlers?.mirrorLegacyQueue?.(
          effect.queue,
          effect.source,
          effect.silent,
        );
        mirrorHandlers?.compareQueueIntegrity?.(
          effect.source,
          state.queue,
          state.pending,
        );
        continue;
      }
      if (effect.type === 'MIRROR_LEGACY_PENDING') {
        const pendingHead = effect.pending[0] ?? null;
        logOwnerPhase8LegacyMirror({
          target: 'pending',
          source: effect.source,
          pendingLen: effect.pending.length,
        });
        logOwnerPhase11BPendingMirror({
          source: effect.source,
          pendingLenAfter: effect.pending.length,
          nextHeadKind: pendingHead?.kind ?? null,
          nextHeadBanId: pendingHead
            ? pendingHead.kind === 'result'
              ? pendingHead.result.id
              : pendingHead.ban.id
            : null,
        });
        mirrorHandlers?.mirrorLegacyPending?.(effect.pending, effect.source);
        mirrorHandlers?.compareQueueIntegrity?.(
          effect.source,
          state.queue,
          state.pending,
        );
        continue;
      }
      if (effect.type === 'MIRROR_LEGACY_ACTIVE') {
        logOwnerPhase9ActiveMirror({
          source: effect.source,
          incomingBanId: effect.display.incomingBan?.id ?? null,
          checkBanId: effect.display.checkBan?.id ?? null,
          resultBanId: effect.display.result?.id ?? null,
          directResultOverlay: effect.display.directResultOverlay,
          directResultOverlayActive: effect.display.directResultOverlayActive,
        });
        mirrorHandlers?.mirrorLegacyActive?.(effect.display, effect.source);
        mirrorHandlers?.compareActiveDisplayIntegrity?.(
          effect.source,
          effect.display,
        );
        continue;
      }
      if (effect.type === 'APPLY_DISPLAY') {
        const ownerState = currentState();
        logOwnerPhase9ActiveMirror({
          source: 'APPLY_DISPLAY',
          incomingBanId: ownerState.display.incomingBan?.id ?? null,
          checkBanId: ownerState.display.checkBan?.id ?? null,
          resultBanId: ownerState.display.result?.id ?? null,
          directResultOverlay: ownerState.display.directResultOverlay,
          directResultOverlayActive: ownerState.display.directResultOverlayActive,
        });
        mirrorHandlers?.mirrorLegacyActive?.(
          { ...ownerState.display },
          'APPLY_DISPLAY',
        );
        mirrorHandlers?.compareActiveDisplayIntegrity?.(
          'APPLY_DISPLAY',
          ownerState.display,
        );
        mirrorHandlers?.mirrorLegacySession?.(ownerState.session, 'APPLY_DISPLAY');
        continue;
      }
      if (effect.type === 'LOG' && effect.tag === 'result-go-to-bans-owner-transition') {
        logResultGoToBansOwnerTransition(effect.fields);
      }
      if (
        effect.type === 'LOG' &&
        effect.tag === 'go-to-bans-next-overlay-atomic-commit'
      ) {
        logGoToBansNextOverlayAtomicCommit(
          effect.fields as Parameters<typeof logGoToBansNextOverlayAtomicCommit>[0],
        );
      }
    }
  };

  return {
    getState: () => stateHandle.unwrap(),
    dispatch(event, source, snapshot) {
      const state = currentState();
      if (QUEUE_AUTHORITY_EVENT_TYPES.has(event.type)) {
        logOwnerPhase8QueueDispatch({
          eventType: event.type,
          source,
          ...(event.type === 'QUEUE_APPLIED' ||
          event.type === 'QUEUE_SILENT_UPDATED' ||
          event.type === 'SHADOW_QUEUE_APPLIED'
            ? { queueLen: event.queue.length }
            : {}),
          ...(event.type === 'PENDING_QUEUE_APPLIED'
            ? { pendingLen: event.pending.length }
            : {}),
          ...(event.type === 'NOTIFICATION_ENQUEUED'
            ? {
                scope: event.scope ?? 'queue',
                key: overlayQueueKey(event.item),
              }
            : {}),
        });
      }
      if (ACTIVE_DISPLAY_AUTHORITY_EVENT_TYPES.has(event.type)) {
        logOwnerPhase9ActiveDispatch({
          eventType: event.type,
          source,
          patchKeys: Object.keys(event.patch),
          incomingBanId:
            event.patch.incomingBan !== undefined
              ? (event.patch.incomingBan?.id ?? null)
              : undefined,
          checkBanId:
            event.patch.checkBan !== undefined
              ? (event.patch.checkBan?.id ?? null)
              : undefined,
          resultBanId:
            event.patch.result !== undefined
              ? (event.patch.result?.id ?? null)
              : undefined,
          directResultOverlay: event.patch.directResultOverlay,
          directResultOverlayActive: event.patch.directResultOverlayActive,
        });
      }
      logSnapshotFields(event.type, source, snapshot);
      const previousWriteTrace = buildOwnerDisplayWriteTraceSnapshot(state);
      const result = notificationOverlayOwnerReducer(state, event);
      stateHandle = attachOwnerStateWriteDetect(result.state, {
        file: 'notification-overlay-owner-shadow.ts',
        function: 'dispatch',
        writePath: 'shadow-state-in-place',
      });
      const nextState = stateHandle.unwrap();
      logOwnerDisplayWriteTrace({
        previous: previousWriteTrace,
        next: buildOwnerDisplayWriteTraceSnapshot(nextState),
        reason: event.type,
        source,
        eventType: event.type,
      });
      traceGoToBansOwnerDisplayWriteLazy({
        previous: previousWriteTrace,
        next: buildOwnerDisplayWriteTraceSnapshot(nextState),
        source,
        eventType: event.type,
      });
      runMirrorEffects(result.effects, source);
      logStateAndEffects(result.effects);
      if (snapshot) {
        compareWithProduction(snapshot, source);
      }
      return stateHandle.unwrap();
    },
    syncFromProduction(snapshot, source) {
      return this.dispatch(
        { type: 'SHADOW_PRODUCTION_SNAPSHOT', snapshot },
        source,
        snapshot,
      );
    },
  };
};
