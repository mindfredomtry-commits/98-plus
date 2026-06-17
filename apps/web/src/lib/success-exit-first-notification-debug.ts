'use client';

export type SuccessExitDebugSnapshot = {
  banId: string | null;
  queueLen: number;
  pendingLen: number;
  notificationSessionActive: boolean;
  hasPendingNotificationChain: boolean;
  latch: boolean;
  successExitDraining: boolean;
};

let snapshotReader: (() => SuccessExitDebugSnapshot) | null = null;
let instrumentationActive = false;
let successExitDrainingExtra = false;

export function registerSuccessExitDebugSnapshot(
  reader: (() => SuccessExitDebugSnapshot) | null,
): void {
  snapshotReader = reader;
}

export function setSuccessExitDrainingForDebug(active: boolean): void {
  successExitDrainingExtra = active;
}

export function readSuccessExitDebugSnapshot(): SuccessExitDebugSnapshot {
  const base =
    snapshotReader?.() ?? {
      banId: null,
      queueLen: 0,
      pendingLen: 0,
      notificationSessionActive: false,
      hasPendingNotificationChain: false,
      latch: false,
      successExitDraining: false,
    };
  return {
    ...base,
    successExitDraining: successExitDrainingExtra,
  };
}

export function beginSuccessExitInstrumentation(): void {
  instrumentationActive = true;
}

export function endSuccessExitInstrumentation(): void {
  instrumentationActive = false;
}

export function isSuccessExitInstrumentationActive(): boolean {
  return instrumentationActive;
}

function emit(event: string, data?: Record<string, unknown>): void {
  const payload = { t: performance.now(), ...data };
  console.log(event, payload);
  window.__debug98log?.(event, payload);
}

export function logSuccessExitClick(
  extra?: Partial<SuccessExitDebugSnapshot>,
): void {
  beginSuccessExitInstrumentation();
  emit('[SUCCESS EXIT CLICK]', {
    ...readSuccessExitDebugSnapshot(),
    ...extra,
  });
}

export function logSuccessExitStart(data: {
  phase: 'handle-success-exit-complete' | 'commit-send-success-exit';
  lobbySource?: string;
}): void {
  emit('[SUCCESS EXIT START]', {
    ...readSuccessExitDebugSnapshot(),
    ...data,
  });
}

export function logSuccessExitLobbyOpenAttempt(data: {
  source: string;
  via: 'openLobby' | 'setLobbyOpen(true)' | 'beginCtaSpringIn';
  blocked?: string | null;
}): void {
  if (!instrumentationActive) return;
  emit('[SUCCESS EXIT LOBBY OPEN ATTEMPT]', {
    ...readSuccessExitDebugSnapshot(),
    ...data,
  });
}

export function logSuccessExitDrainStart(): void {
  emit('[SUCCESS EXIT DRAIN START]', {
    ...readSuccessExitDebugSnapshot(),
  });
}

export function logSuccessExitDrainResult(data: {
  drained: boolean;
  queueLenAfter: number;
  pendingLenAfter: number;
  selectedKind?: string | null;
  selectedBanId?: string | null;
  reason?: string;
}): void {
  emit('[SUCCESS EXIT DRAIN RESULT]', data);
}

export function logFirstNotificationSelected(data: {
  kind: string | null;
  banId: string | null;
  source: string;
}): void {
  emit('[FIRST NOTIFICATION SELECTED]', data);
}

export function logFirstNotificationMounted(data: {
  kind: string;
  banId: string;
}): void {
  emit('[FIRST NOTIFICATION MOUNTED]', data);
  endSuccessExitInstrumentation();
}
