/** Reply deep-link flow diagnostics. */

export type ReplyFlowStage =
  | 'telegram-open-start'
  | 'incoming-loading'
  | 'incoming-visible'
  | 'card-reply-click'
  | 'reply-compose-open'
  | 'overlay-dismissed'
  | 'phase-set-composingBan'
  | 'what-visible'
  | 'lock-released'
  | 'lobby-render-blocked';

export type ReplyHandoffDebugSnapshot = {
  stage: ReplyFlowStage | null;
  banId: string | null;
  lockActive: boolean;
  activeOverlayKind: string | null;
  selectedBanId: string | null;
  instantBanOpen: boolean;
  phase: string | null;
  selectedUserId: string | null;
  lobbyOpen: boolean;
  acceptPending: boolean;
  acceptDone: boolean;
  delayMs: number | null;
};

const EMPTY: ReplyHandoffDebugSnapshot = {
  stage: null,
  banId: null,
  lockActive: false,
  activeOverlayKind: null,
  selectedBanId: null,
  instantBanOpen: false,
  phase: null,
  selectedUserId: null,
  lobbyOpen: false,
  acceptPending: false,
  acceptDone: false,
  delayMs: null,
};

let snapshot: ReplyHandoffDebugSnapshot = { ...EMPTY };
let stageStartedAt: number | null = null;
const listeners = new Set<() => void>();

export function getReplyHandoffDebug(): ReplyHandoffDebugSnapshot {
  return snapshot;
}

export function subscribeReplyHandoffDebug(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function logReplyFlowLoopGuard(reason: string): void {
  console.log('[REPLY FLOW LOOP GUARD]', reason);
}

export function logReplyFlow(
  stage: ReplyFlowStage,
  patch: Partial<ReplyHandoffDebugSnapshot> = {},
): void {
  const now = Date.now();
  const delayMs =
    stageStartedAt != null ? Math.max(0, now - stageStartedAt) : null;
  stageStartedAt = now;
  snapshot = {
    ...snapshot,
    stage,
    delayMs,
    ...patch,
  };
  console.log('[REPLY FLOW]', snapshot);
  listeners.forEach((listener) => listener());
}

/** @deprecated Prefer logReplyFlow */
export function logReplyHandoffDebug(
  stage: ReplyFlowStage,
  patch: Partial<ReplyHandoffDebugSnapshot> = {},
): void {
  logReplyFlow(stage, patch);
}

export function patchReplyHandoffDebug(
  patch: Partial<ReplyHandoffDebugSnapshot>,
): void {
  snapshot = { ...snapshot, ...patch };
  listeners.forEach((listener) => listener());
}

export function resetReplyHandoffDebug(): void {
  snapshot = { ...EMPTY };
  stageStartedAt = null;
  listeners.forEach((listener) => listener());
}
