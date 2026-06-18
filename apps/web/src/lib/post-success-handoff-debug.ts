'use client';

export type PostSuccessHandoffSelectedNext = {
  kind: string;
  banId: string | null;
};

let handoffInProgress = false;
let selectedNext: PostSuccessHandoffSelectedNext | null = null;
const listeners = new Set<() => void>();

function notify(): void {
  for (const listener of listeners) {
    listener();
  }
}

function emit(event: string, data?: Record<string, unknown>): void {
  const payload = { t: performance.now(), ...data };
  console.log(event, payload);
  window.__debug98log?.(event, payload);
}

export function subscribePostSuccessHandoff(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getPostSuccessHandoffSnapshot(): boolean {
  return handoffInProgress;
}

export function isPostSuccessHandoffInProgress(): boolean {
  return handoffInProgress;
}

export function getPostSuccessHandoffSelectedNext(): PostSuccessHandoffSelectedNext | null {
  return selectedNext;
}

export function beginPostSuccessHandoff(data: Record<string, unknown>): void {
  handoffInProgress = true;
  selectedNext = null;
  emit('[POST SUCCESS HANDOFF START]', data);
  notify();
}

export function setPostSuccessHandoffSelectedNext(
  kind: string | null,
  banId: string | null,
  extra?: Record<string, unknown>,
): void {
  if (!handoffInProgress) return;
  selectedNext =
    kind != null ? { kind, banId: banId?.trim() ? banId : null } : null;
  emit('[POST SUCCESS HANDOFF NEXT SELECTED]', {
    kind: selectedNext?.kind ?? null,
    banId: selectedNext?.banId ?? null,
    ...extra,
  });
  notify();
}

export function shouldBlockLobbyOpenForPostSuccessHandoff(
  queueLen: number,
  pendingLen: number,
  source?: string,
): boolean {
  if (!handoffInProgress) return false;
  const hasSelected = selectedNext != null;
  const hasQueue = queueLen > 0 || pendingLen > 0;
  if (hasSelected || hasQueue) {
    emit('[POST SUCCESS HANDOFF PREVENT LOBBY]', {
      source: source ?? null,
      queueLen,
      pendingLen,
      selectedKind: selectedNext?.kind ?? null,
      selectedBanId: selectedNext?.banId ?? null,
    });
    emit('[LOBBY OPEN BLOCKED BY POST SUCCESS HANDOFF]', {
      source: source ?? null,
      queueLen,
      pendingLen,
      selectedKind: selectedNext?.kind ?? null,
      selectedBanId: selectedNext?.banId ?? null,
    });
    return true;
  }
  return false;
}

export function logPostSuccessHandoffWaitingMount(
  data: Record<string, unknown>,
): void {
  if (!handoffInProgress) return;
  emit('[POST SUCCESS HANDOFF WAITING MOUNT]', {
    selectedKind: selectedNext?.kind ?? null,
    selectedBanId: selectedNext?.banId ?? null,
    ...data,
  });
}

export function logPostSuccessHandoffLostBug(
  data: Record<string, unknown>,
): void {
  if (!handoffInProgress) return;
  emit('[POST SUCCESS HANDOFF LOST BUG]', {
    selectedKind: selectedNext?.kind ?? null,
    selectedBanId: selectedNext?.banId ?? null,
    ...data,
  });
}

export function completePostSuccessHandoffOnCardMounted(
  kind: string,
  banId: string,
  extra?: Record<string, unknown>,
): void {
  if (!handoffInProgress) return;
  emit('[POST SUCCESS HANDOFF CARD MOUNTED]', {
    kind,
    banId,
    ...extra,
  });
  handoffInProgress = false;
  selectedNext = null;
  notify();
}

export function completePostSuccessHandoffEmptyOpenLobby(
  data: Record<string, unknown>,
): void {
  if (!handoffInProgress) return;
  emit('[POST SUCCESS HANDOFF EMPTY OPEN LOBBY]', data);
  handoffInProgress = false;
  selectedNext = null;
  notify();
}

export function abortPostSuccessHandoff(source: string): void {
  if (!handoffInProgress) return;
  handoffInProgress = false;
  selectedNext = null;
  notify();
  emit('[POST SUCCESS HANDOFF LOST BUG]', { source, reason: 'aborted' });
}
