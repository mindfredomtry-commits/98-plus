import {
  compareOwnerShadowWithProduction,
  createInitialNotificationOverlayOwnerState,
  notificationOverlayOwnerReducer,
  resolveOwnerHeadBanId,
  type NotificationOverlayOwnerEvent,
  type NotificationOverlayOwnerState,
  type OwnerProductionSnapshot,
} from '@/lib/notification-overlay-owner';
import {
  logApplyQueueCommitTrace,
  queueOverlaySnapshotChanged,
} from '@/lib/apply-queue-commit-trace';
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
import {
  logActiveResultClearDecision,
  type ActiveResultClearDecisionPayload,
} from '@/lib/active-result-stuck-debug';
import {
  buildQueueHeadAfterGoToBansTracePayload,
  logQueueHeadAfterGoToBansTrace,
  QUEUE_HEAD_AFTER_GO_TO_BANS_TRACE_WINDOW_MS,
} from '@/lib/queue-head-after-go-to-bans-trace-debug';
import { recordGoToBansSessionTrace } from '@/lib/go-to-bans-session-trace-debug';
import { tracePendingResultAddAfterDispatch } from '@/lib/pending-result-source-trace-debug';
import { traceResultEnqueuedOwnerAfterDispatch } from '@/lib/result-enqueued-owner-trace-debug';
import { normalizeId } from '@/lib/normalize-json';

const QUEUE_AUTHORITY_EVENT_TYPES = new Set<NotificationOverlayOwnerEvent['type']>([
  'QUEUE_APPLIED',
  'QUEUE_SILENT_UPDATED',
  'PENDING_QUEUE_APPLIED',
  'NOTIFICATION_ENQUEUED',
]);

const ACTIVE_DISPLAY_AUTHORITY_EVENT_TYPES = new Set<
  NotificationOverlayOwnerEvent['type']
>(['ACTIVE_DISPLAY_SYNC']);

const QUEUE_HEAD_AFTER_GO_TO_BANS_EVENTS = new Set<
  NotificationOverlayOwnerEvent['type']
>([
  'QUEUE_APPLIED',
  'QUEUE_SILENT_UPDATED',
  'PENDING_QUEUE_APPLIED',
  'STARTUP_INTERACTIONS_RELEASED',
]);

type LastGoToBansTrace = {
  banId: string;
  resultId: string;
  at: number;
};

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
  let lastGoToBansTrace: LastGoToBansTrace | null = null;

  const traceQueueHeadAfterGoToBansIfRecent = (
    event: NotificationOverlayOwnerEvent,
    source: string,
    state: NotificationOverlayOwnerState,
  ) => {
    if (!lastGoToBansTrace) return;
    if (!QUEUE_HEAD_AFTER_GO_TO_BANS_EVENTS.has(event.type)) return;
    const elapsed = performance.now() - lastGoToBansTrace.at;
    if (elapsed > QUEUE_HEAD_AFTER_GO_TO_BANS_TRACE_WINDOW_MS) return;
    logQueueHeadAfterGoToBansTrace(
      buildQueueHeadAfterGoToBansTracePayload({
        source,
        event: event.type,
        lastGoToBansBanId: lastGoToBansTrace.banId,
        lastGoToBansResultId: lastGoToBansTrace.resultId,
        queue: state.queue,
        activeKind: state.active.kind,
        activeBanId: state.active.banId,
        display: state.display,
      }),
    );
  };

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
      if (effect.type === 'LOG' && effect.tag === 'active-result-clear-decision') {
        logActiveResultClearDecision(
          effect.fields as ActiveResultClearDecisionPayload,
        );
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
      if (event.type === 'RESULT_GO_TO_BANS') {
        const banId = normalizeId(event.banId);
        if (banId) {
          recordGoToBansSessionTrace(
            banId,
            `RESULT_GO_TO_BANS:notification-overlay-owner-shadow:${source}`,
          );
          lastGoToBansTrace = {
            banId,
            resultId: banId,
            at: performance.now(),
          };
        }
      }
      const previousWriteTrace = buildOwnerDisplayWriteTraceSnapshot(state);
      const isQueueAuthorityEvent =
        event.type === 'QUEUE_APPLIED' || event.type === 'QUEUE_SILENT_UPDATED';
      if (isQueueAuthorityEvent) {
        logApplyQueueCommitTrace({
          source: `owner-shadow-dispatch:${source}:before-reducer:${event.type}`,
          beforeQueueLength: state.queue.length,
          afterQueueLength: event.queue.length,
          dispatchExecuted: true,
          dispatchSkipped: false,
          finalizeCommitEntered: true,
          finalizeCommitReturned: false,
          applyOverlayQueueReturnedNull: false,
          applyOverlayQueueReturnedSameReference: false,
          queueChanged: queueOverlaySnapshotChanged(state.queue, event.queue),
          queueIdentityChanged: state.queue === event.queue,
          reducerExecuted: false,
          reducerSkipped: true,
          reason: `shadow-dispatch-before-reducer:${event.type}`,
        });
      }
      const result = notificationOverlayOwnerReducer(state, event);
      if (isQueueAuthorityEvent) {
        logApplyQueueCommitTrace({
          source: `owner-shadow-dispatch:${source}:after-reducer:${event.type}`,
          beforeQueueLength: state.queue.length,
          afterQueueLength: result.state.queue.length,
          dispatchExecuted: true,
          dispatchSkipped: false,
          finalizeCommitEntered: true,
          finalizeCommitReturned: true,
          applyOverlayQueueReturnedNull: false,
          applyOverlayQueueReturnedSameReference: state.queue === event.queue,
          queueChanged: queueOverlaySnapshotChanged(
            state.queue,
            result.state.queue,
          ),
          queueIdentityChanged: state.queue === result.state.queue,
          reducerExecuted: true,
          reducerSkipped: !queueOverlaySnapshotChanged(
            state.queue,
            result.state.queue,
          ),
          reason: `shadow-dispatch-after-reducer:${event.type}`,
          skipReason: queueOverlaySnapshotChanged(
            state.queue,
            result.state.queue,
          )
            ? null
            : 'reducer-ran-but-owner-queue-unchanged',
        });
      }
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
      traceQueueHeadAfterGoToBansIfRecent(event, source, nextState);
      traceResultEnqueuedOwnerAfterDispatch({
        event,
        source,
        before: state,
        after: nextState,
        lastGoToBansAt: lastGoToBansTrace?.at ?? null,
        lastGoToBansBanId: lastGoToBansTrace?.banId ?? null,
        lastGoToBansResultId: lastGoToBansTrace?.resultId ?? null,
      });
      tracePendingResultAddAfterDispatch({
        event,
        source,
        before: state,
        after: nextState,
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
