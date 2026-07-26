/**
 * Vertical V4 — post-notification presentation fully released.
 *
 * CTA restore must wait until BOTH:
 *   1) notification runtime is idle + empty (no card authority), AND
 *   2) every host presentation layer (mount / result / dim / SUCCESS exit
 *      latches) has actually released.
 *
 * Runtime-idle alone is not enough (V3 early edge). This module is pure:
 * it never dispatches, never mutates queue/display, never opens results.
 */

import type { NotificationRuntimeState } from '@/notification-runtime/notification-runtime.types';
import { selectOverlayVisible } from '@/notification-runtime/notification-runtime.selectors';

export type PostNotificationPresentationSnapshot = {
  /** Runtime lifecycle.status */
  runtimeLifecycle: NotificationRuntimeState['lifecycle']['status'];
  /** Runtime display.kind */
  runtimeDisplayKind: NotificationRuntimeState['display']['kind'];
  /** Runtime display.payload == null */
  runtimeDisplayPayloadNull: boolean;
  /** Runtime items.queue.length */
  runtimeQueueLength: number;
  /** Runtime action.status */
  runtimeActionStatus: NotificationRuntimeState['action']['status'];
  /** Derived selectOverlayVisible(runtime) */
  runtimeOverlayVisible: boolean;
  /** Providers notificationOverlayMounted (rendered host shell) */
  notificationOverlayMounted: boolean;
  /** InstantBanFlow notificationQueueUiLock (= notificationOverlayMounted) */
  notificationQueueUiLock: boolean;
  /** ResultOverlay / queue result payload still painted */
  hostResultActive: boolean;
  /** DirectOverboardResultLayer / direct overboard host layer */
  directOverboardActive: boolean;
  /** Providers notificationChainTransitioning */
  notificationChainTransitioning: boolean;
  /** Providers visualQueueDimSession (live dim claim) */
  visualQueueDimSession: boolean;
  /** InstantBanFlow orbOverlayDim */
  orbOverlayDim: boolean;
  /** InstantBanFlow postSuccessHandoffBlocking */
  postSuccessHandoffBlocking: boolean;
  /** InstantBanFlow successExitDraining */
  successExitDraining: boolean;
};

export type PostNotificationPresentationChecks = {
  runtimeLifecycleIdle: boolean;
  runtimeDisplayKindNull: boolean;
  runtimeDisplayPayloadNull: boolean;
  runtimeQueueEmpty: boolean;
  runtimeActionIdle: boolean;
  runtimeOverlayNotVisible: boolean;
  notificationOverlayNotMounted: boolean;
  notificationQueueUiUnlocked: boolean;
  noHostResult: boolean;
  noDirectOverboard: boolean;
  chainNotTransitioning: boolean;
  visualQueueDimReleased: boolean;
  orbNotDimmed: boolean;
  postSuccessHandoffClear: boolean;
  successExitNotDraining: boolean;
};

/** Exact product boundary: all host + runtime presentation layers gone. */
export function isPostNotificationPresentationFullyReleased(
  snap: PostNotificationPresentationSnapshot,
): boolean {
  return explainPostNotificationPresentationRelease(snap).released;
}

export function explainPostNotificationPresentationRelease(
  snap: PostNotificationPresentationSnapshot,
): {
  released: boolean;
  reason: string | null;
  checks: PostNotificationPresentationChecks;
} {
  const checks: PostNotificationPresentationChecks = {
    runtimeLifecycleIdle: snap.runtimeLifecycle === 'idle',
    runtimeDisplayKindNull: snap.runtimeDisplayKind == null,
    runtimeDisplayPayloadNull: snap.runtimeDisplayPayloadNull,
    runtimeQueueEmpty: snap.runtimeQueueLength === 0,
    runtimeActionIdle: snap.runtimeActionStatus === 'idle',
    runtimeOverlayNotVisible: !snap.runtimeOverlayVisible,
    notificationOverlayNotMounted: !snap.notificationOverlayMounted,
    notificationQueueUiUnlocked: !snap.notificationQueueUiLock,
    noHostResult: !snap.hostResultActive,
    noDirectOverboard: !snap.directOverboardActive,
    chainNotTransitioning: !snap.notificationChainTransitioning,
    visualQueueDimReleased: !snap.visualQueueDimSession,
    orbNotDimmed: !snap.orbOverlayDim,
    postSuccessHandoffClear: !snap.postSuccessHandoffBlocking,
    successExitNotDraining: !snap.successExitDraining,
  };

  const failed = (
    Object.entries(checks) as [keyof PostNotificationPresentationChecks, boolean][]
  ).find(([, ok]) => !ok);

  return {
    released: failed == null,
    reason: failed ? failed[0] : null,
    checks,
  };
}

/** Build snapshot from runtime state + host presentation flags. */
export function buildPostNotificationPresentationSnapshot(
  runtime: NotificationRuntimeState,
  host: {
    notificationOverlayMounted: boolean;
    notificationQueueUiLock: boolean;
    hostResultActive: boolean;
    directOverboardActive: boolean;
    notificationChainTransitioning: boolean;
    visualQueueDimSession: boolean;
    orbOverlayDim: boolean;
    postSuccessHandoffBlocking: boolean;
    successExitDraining: boolean;
  },
): PostNotificationPresentationSnapshot {
  return {
    runtimeLifecycle: runtime.lifecycle.status,
    runtimeDisplayKind: runtime.display.kind,
    runtimeDisplayPayloadNull: runtime.display.payload == null,
    runtimeQueueLength: runtime.items.queue.length,
    runtimeActionStatus: runtime.action.status,
    runtimeOverlayVisible: selectOverlayVisible(runtime),
    notificationOverlayMounted: host.notificationOverlayMounted,
    notificationQueueUiLock: host.notificationQueueUiLock,
    hostResultActive: host.hostResultActive,
    directOverboardActive: host.directOverboardActive,
    notificationChainTransitioning: host.notificationChainTransitioning,
    visualQueueDimSession: host.visualQueueDimSession,
    orbOverlayDim: host.orbOverlayDim,
    postSuccessHandoffBlocking: host.postSuccessHandoffBlocking,
    successExitDraining: host.successExitDraining,
  };
}

/**
 * Idempotent false→true edge detector (pure). Caller owns persistence of
 * `previousReleased`. Seed with `null` so the first observation never fires.
 */
export function detectPostNotificationPresentationReleaseEdge(
  previousReleased: boolean | null,
  nextReleased: boolean,
): { edge: boolean; nextPrevious: boolean } {
  if (previousReleased === null) {
    return { edge: false, nextPrevious: nextReleased };
  }
  const edge = previousReleased === false && nextReleased === true;
  return { edge, nextPrevious: nextReleased };
}
