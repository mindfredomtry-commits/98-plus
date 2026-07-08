import type { QueuedOverlay } from '@/lib/overlay-queue';

export type OwnerQueueMutationSnapshot = {
  source: string;
  reason: string;
  ownerQueueLen: number;
  ownerPendingLen: number;
  at: number;
};

let lastOwnerQueueMutation: OwnerQueueMutationSnapshot | null = null;

export function getLastOwnerQueueMutationSnapshot(): OwnerQueueMutationSnapshot | null {
  return lastOwnerQueueMutation ? { ...lastOwnerQueueMutation } : null;
}

export type OwnerQueuePopulationTracePayload = {
  source: string;
  telegramUserId?: string | null;
  ownerQueueBefore: number;
  ownerQueueAfter: number;
  ownerPendingBefore: number;
  ownerPendingAfter: number;
  reason: string;
  incomingBanId?: string | null;
  resultBanId?: string | null;
  notificationKind?: string | null;
  mutationApplied: boolean;
  mutationSkipped: boolean;
  skipReason?: string | null;
};

export type OwnerQueuePopulationTraceBridge = {
  readOwnerCounts: () => { queue: number; pending: number };
  emit: (
    input: Partial<OwnerQueuePopulationTracePayload> & {
      source: string;
      reason: string;
      ownerQueueBefore: number;
      ownerPendingBefore: number;
      ownerQueueAfter: number;
      ownerPendingAfter: number;
      mutationApplied: boolean;
      mutationSkipped: boolean;
    },
  ) => void;
};

let ownerQueuePopulationTraceBridge: OwnerQueuePopulationTraceBridge | null =
  null;

export function setOwnerQueuePopulationTraceBridge(
  bridge: OwnerQueuePopulationTraceBridge | null,
): void {
  ownerQueuePopulationTraceBridge = bridge;
}

function isOwnerQueuePopulationObservationSource(source: string): boolean {
  return (
    source.includes('QUEUE_API_FETCH_RESULT') ||
    source.includes('INCOMING_POLL_RECEIVED') ||
    source.includes('resolveLobbyBansDrainGateDecision') ||
    source.includes('receiveIncomingBan') ||
    source.includes('enqueueNotification') ||
    source.includes('deferNotificationToPendingStartup') ||
    source.includes('commitPendingQueueViaOwner') ||
    source.includes('resetOverlayQueueState')
  );
}

export function shouldEmitOwnerQueuePopulationTrace(
  payload: OwnerQueuePopulationTracePayload,
): boolean {
  const ownerChanged =
    payload.ownerQueueBefore !== payload.ownerQueueAfter ||
    payload.ownerPendingBefore !== payload.ownerPendingAfter;
  return (
    ownerChanged ||
    payload.mutationApplied ||
    payload.mutationSkipped ||
    isOwnerQueuePopulationObservationSource(payload.source)
  );
}

export function logOwnerQueuePopulationTrace(
  payload: OwnerQueuePopulationTracePayload,
): void {
  if (!shouldEmitOwnerQueuePopulationTrace(payload)) return;
  lastOwnerQueueMutation = {
    source: payload.source,
    reason: payload.reason,
    ownerQueueLen: payload.ownerQueueAfter,
    ownerPendingLen: payload.ownerPendingAfter,
    at: typeof performance !== 'undefined' ? performance.now() : 0,
  };
  console.log('OWNER_QUEUE_POPULATION_TRACE', payload);
}

export function observeOwnerQueuePopulationStackPoint(
  source: string,
  reason: string,
  extra?: Partial<
    Pick<
      OwnerQueuePopulationTracePayload,
      | 'incomingBanId'
      | 'resultBanId'
      | 'notificationKind'
      | 'mutationApplied'
      | 'mutationSkipped'
      | 'skipReason'
      | 'telegramUserId'
    >
  >,
): void {
  const counts =
    ownerQueuePopulationTraceBridge?.readOwnerCounts() ?? {
      queue: -1,
      pending: -1,
    };
  const payload: OwnerQueuePopulationTracePayload = {
    source,
    reason,
    telegramUserId: extra?.telegramUserId ?? null,
    ownerQueueBefore: counts.queue,
    ownerQueueAfter: counts.queue,
    ownerPendingBefore: counts.pending,
    ownerPendingAfter: counts.pending,
    mutationApplied: extra?.mutationApplied ?? false,
    mutationSkipped: extra?.mutationSkipped ?? false,
    skipReason: extra?.skipReason ?? null,
    incomingBanId: extra?.incomingBanId ?? null,
    resultBanId: extra?.resultBanId ?? null,
    notificationKind: extra?.notificationKind ?? null,
  };
  if (ownerQueuePopulationTraceBridge) {
    ownerQueuePopulationTraceBridge.emit(payload);
    return;
  }
  logOwnerQueuePopulationTrace(payload);
}

export function readNotificationFieldsFromOverlay(
  item: QueuedOverlay | null | undefined,
): {
  notificationKind: string | null;
  incomingBanId: string | null;
  resultBanId: string | null;
} {
  if (!item) {
    return {
      notificationKind: null,
      incomingBanId: null,
      resultBanId: null,
    };
  }
  if (item.kind === 'result') {
    return {
      notificationKind: item.kind,
      incomingBanId: null,
      resultBanId: item.result.id,
    };
  }
  return {
    notificationKind: item.kind,
    incomingBanId: item.kind === 'incoming' ? item.ban.id : null,
    resultBanId: null,
  };
}
