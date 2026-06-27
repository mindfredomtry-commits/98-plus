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
  logOwnerShadowEffect,
  logOwnerShadowEvent,
  logOwnerShadowMismatch,
  logOwnerShadowState,
} from '@/lib/notification-overlay-owner-debug';

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

export function createNotificationOverlayOwnerShadow(): NotificationOverlayOwnerShadowHandle {
  let state = createInitialNotificationOverlayOwnerState();

  const logSnapshotFields = (
    eventType: string,
    source: string,
    snapshot?: OwnerProductionSnapshot,
  ) => {
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
        ...(effect.type === 'LOG' ? { tag: effect.tag, ...effect.fields } : {}),
      });
    }
  };

  const compareWithProduction = (
    snapshot: OwnerProductionSnapshot,
    source: string,
  ) => {
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

  return {
    getState: () => state,
    dispatch(event, source, snapshot) {
      logSnapshotFields(event.type, source, snapshot);
      const result = notificationOverlayOwnerReducer(state, event);
      state = result.state;
      logStateAndEffects(result.effects);
      if (snapshot) {
        compareWithProduction(snapshot, source);
      }
      return state;
    },
    syncFromProduction(snapshot, source) {
      return this.dispatch(
        { type: 'SHADOW_PRODUCTION_SNAPSHOT', snapshot },
        source,
        snapshot,
      );
    },
  };
}
