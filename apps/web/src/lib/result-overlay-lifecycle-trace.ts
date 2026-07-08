'use client';

import { logDirectOverboardGapTrace } from '@/lib/direct-overboard-gap-trace-debug';

type ResultOverlayLifecycleBase = {
  resultId: string;
  banId?: string | null;
  status?: string | null;
  outcome?: string | null;
  embedded?: boolean;
  contentOnly?: boolean;
  directPaint?: boolean;
  showable?: boolean;
  visible?: boolean;
  visibilityReason?: string | null;
};

function emit(event: string, payload: Record<string, unknown>): void {
  const entry = { t: performance.now(), ...payload };
  console.log(event, entry);
  if (typeof window !== 'undefined') {
    window.__debug98log?.(event, entry);
  }
}

export function logResultOverlayMount(
  payload: ResultOverlayLifecycleBase & Record<string, unknown>,
): void {
  emit('RESULT_OVERLAY_MOUNT', payload);
}

export function logResultOverlayLayoutEffect(
  payload: ResultOverlayLifecycleBase & {
    effectName: string;
    phase: 'run' | 'cleanup';
  } & Record<string, unknown>,
): void {
  emit('RESULT_OVERLAY_LAYOUT_EFFECT', payload);
}

export function logResultOverlayEffect(
  payload: ResultOverlayLifecycleBase & {
    effectName: string;
    phase: 'run' | 'cleanup';
  } & Record<string, unknown>,
): void {
  emit('RESULT_OVERLAY_EFFECT', payload);
}

export function logResultOverlayPaint(
  payload: ResultOverlayLifecycleBase & Record<string, unknown>,
): void {
  emit('RESULT_OVERLAY_PAINT', payload);
}

export function logResultOverlayUnmount(
  payload: ResultOverlayLifecycleBase & {
    dismissSource?: string | null;
    closeReason?: string | null;
    dismissInitiated?: boolean;
  } & Record<string, unknown>,
): void {
  emit('RESULT_OVERLAY_UNMOUNT', payload);
}

export function logResultOverlayCleanup(
  payload: ResultOverlayLifecycleBase & {
    effectName: string;
    phase?: string;
  } & Record<string, unknown>,
): void {
  const gapExtra = {
    resultId: payload.resultId ?? null,
    banId: payload.banId ?? null,
    outcome: payload.outcome ?? null,
    directOverboardMounted: false,
    directOverboardActive: false,
  };
  if (payload.directPaint) {
    logDirectOverboardGapTrace('result-overlay-cleanup-before', gapExtra);
  }
  emit('RESULT_OVERLAY_CLEANUP', payload);
  if (payload.directPaint) {
    logDirectOverboardGapTrace('result-overlay-cleanup-after', gapExtra);
  }
}

export function logResultOverlayDismissSource(
  payload: ResultOverlayLifecycleBase & {
    source: string;
    initiator: string;
    closeReason?: string | null;
  } & Record<string, unknown>,
): void {
  emit('RESULT_OVERLAY_DISMISS_SOURCE', payload);
}

export function logResultOverlayCloseReason(
  payload: ResultOverlayLifecycleBase & {
    reason: string;
    source: string;
  } & Record<string, unknown>,
): void {
  emit('RESULT_OVERLAY_CLOSE_REASON', payload);
}

export function logResultOverlayVisibleState(
  payload: ResultOverlayLifecycleBase & {
    previousVisible: boolean;
    nextVisible: boolean;
    changedBy: string;
    closeReason?: string | null;
  } & Record<string, unknown>,
): void {
  emit('RESULT_OVERLAY_VISIBLE_STATE', payload);
}

export function logResultOverlayActiveProps(
  payload: ResultOverlayLifecycleBase & {
    changedFields: string[];
  } & Record<string, unknown>,
): void {
  emit('RESULT_OVERLAY_ACTIVE_PROPS', payload);
}

export function logResultOverlayUnmountWithoutDismiss(
  payload: ResultOverlayLifecycleBase & Record<string, unknown>,
): void {
  emit('RESULT_OVERLAY_UNMOUNT_WITHOUT_DISMISS', payload);
}

export function logResultOverlayUnmountRootTrace(
  payload: ResultOverlayLifecycleBase & {
    dismissInitiated?: boolean;
    closeReason?: string | null;
    queueHeadKind?: string | null;
    activeKind?: string | null;
    notificationSessionActive?: boolean;
    queueClaimsNotificationScreen?: boolean | null;
  } & Record<string, unknown>,
): void {
  const entry = {
    t: performance.now(),
    ...payload,
    stack: new Error().stack ?? '',
  };
  console.log('[RESULT_OVERLAY_UNMOUNT_ROOT_TRACE]', entry);
  if (typeof window !== 'undefined') {
    window.__debug98log?.('[RESULT_OVERLAY_UNMOUNT_ROOT_TRACE]', entry);
  }
}

export function buildResultOverlayLifecycleBase(input: {
  result: { id: string; outcome?: string | null; status?: string | null };
  resultStatus?: string | null;
  embedded?: boolean;
  contentOnly?: boolean;
  directPaint?: boolean;
  showable?: boolean;
  visible?: boolean;
  visibilityReason?: string | null;
}): ResultOverlayLifecycleBase {
  const status =
    input.resultStatus ??
    (input.result as { status?: string | null }).status ??
    null;
  return {
    resultId: input.result.id,
    banId: input.result.id,
    status,
    outcome: input.result.outcome ?? null,
    embedded: input.embedded,
    contentOnly: input.contentOnly,
    directPaint: input.directPaint,
    showable: input.showable,
    visible: input.visible,
    visibilityReason: input.visibilityReason ?? null,
  };
}
