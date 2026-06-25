'use client';

function emit(event: string, data?: Record<string, unknown>): void {
  const payload = { t: performance.now(), ...data };
  console.log(event, payload);
  window.__debug98log?.(event, payload);
}

export type QueueOverlayLifecycleBase = {
  overlayKind?: string | null;
  overlayId?: string | null;
  queueHeadKind?: string | null;
  queueHeadId?: string | null;
  overlayQueueRefLen?: number;
  pendingNotificationCount?: number;
  hasPendingNotificationChain?: boolean;
};

export function logQueueOverlayMounted(
  data: QueueOverlayLifecycleBase & {
    notificationId: string;
    overlayKind: string;
    queueHeadId?: string | null;
  },
): void {
  emit('[QUEUE OVERLAY MOUNTED]', data);
}

export function logQueueOverlayUnmountRequest(
  data: QueueOverlayLifecycleBase & {
    reason: string;
    caller: string;
    currentHeadId?: string | null;
    currentHeadKind?: string | null;
    mountedOverlayId?: string | null;
  },
): void {
  emit('[QUEUE OVERLAY UNMOUNT REQUEST]', data);
}

export function logQueueOverlayCleared(
  data: QueueOverlayLifecycleBase & {
    reason: string;
    caller: string;
    activeOverlayIdBefore?: string | null;
    activeOverlayKindBefore?: string | null;
  },
): void {
  emit('[QUEUE OVERLAY CLEARED]', data);
}

export function logQueueOverlayReplaced(
  data: QueueOverlayLifecycleBase & {
    reason: string;
    caller: string;
    previousOverlay: { kind: string; id: string };
    newOverlay: { kind: string; id: string };
  },
): void {
  emit('[QUEUE OVERLAY REPLACED]', data);
}

export function logQueueOverlayNoMountFallback(
  data: QueueOverlayLifecycleBase & {
    caller: string;
    why: string;
    pendingNotificationState?: {
      hasPendingNotificationChain?: boolean;
      pendingLen?: number;
      queueLen?: number;
    };
    mountedOverlayState?: {
      kind?: string | null;
      id?: string | null;
    };
  },
): void {
  emit('[QUEUE OVERLAY NO MOUNT FALLBACK]', data);
}
