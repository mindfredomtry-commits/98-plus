'use client';

type PostConsumeSession = {
  banId: string;
  answer: string;
  source: string;
  startedAt: number;
};

let postConsumeSession: PostConsumeSession | null = null;

const POST_CONSUME_SESSION_TTL_MS = 30_000;

function captureCallstack(): string {
  try {
    const stack = new Error('[post-consume-trace]').stack ?? '';
    return stack.split('\n').slice(2, 14).join('\n');
  } catch {
    return '';
  }
}

function emit(event: string, data: Record<string, unknown>): void {
  if (typeof window === 'undefined') return;
  const payload = {
    t: performance.now(),
    consumeSession: postConsumeSession,
    ...data,
    callStack: captureCallstack(),
  };
  console.log(event, payload);
  window.__debug98log?.(event, payload);
}

export function beginPostConsumeTraceSession(data: {
  banId: string;
  answer: string;
  source: string;
}): void {
  if (typeof window === 'undefined') return;
  postConsumeSession = {
    banId: data.banId,
    answer: data.answer,
    source: data.source,
    startedAt: performance.now(),
  };
}

export function isPostConsumeTraceActive(): boolean {
  if (typeof window === 'undefined' || !postConsumeSession) return false;
  if (performance.now() - postConsumeSession.startedAt > POST_CONSUME_SESSION_TTL_MS) {
    postConsumeSession = null;
    return false;
  }
  return true;
}

export function emitPostConsumeStart(
  data: Record<string, unknown>,
): void {
  if (typeof window === 'undefined') return;
  emit('[POST CONSUME START]', data);
}

export function emitPostConsumeQueueUpdate(data: {
  source: string;
  oldValue: Record<string, unknown>;
  newValue: Record<string, unknown>;
}): void {
  if (!isPostConsumeTraceActive()) return;
  emit('[POST CONSUME QUEUE UPDATE]', data);
}

export function emitPostConsumePendingUpdate(data: {
  source: string;
  oldValue: Record<string, unknown>;
  newValue: Record<string, unknown>;
}): void {
  if (!isPostConsumeTraceActive()) return;
  emit('[POST CONSUME PENDING UPDATE]', data);
}

export function emitPostConsumeDisplayUpdate(data: {
  source: string;
  oldValue: Record<string, unknown>;
  newValue: Record<string, unknown>;
}): void {
  if (!isPostConsumeTraceActive()) return;
  emit('[POST CONSUME DISPLAY UPDATE]', data);
}

export function emitPostConsumeActiveUpdate(data: {
  source: string;
  oldValue: Record<string, unknown>;
  newValue: Record<string, unknown>;
}): void {
  if (!isPostConsumeTraceActive()) return;
  emit('[POST CONSUME ACTIVE UPDATE]', data);
}

export function emitPostConsumeOverlayUpdate(data: {
  source: string;
  oldValue: Record<string, unknown>;
  newValue: Record<string, unknown>;
}): void {
  if (!isPostConsumeTraceActive()) return;
  emit('[POST CONSUME OVERLAY UPDATE]', data);
}

export function emitPostConsumeNextCard(data: {
  source: string;
  pipeline: string;
  queueHeadKind: string | null;
  queueHeadBanId: string | null;
  selectedKind: string | null;
  selectedBanId: string | null;
  selectedReason: string;
}): void {
  if (!isPostConsumeTraceActive()) return;
  emit('[POST CONSUME NEXT CARD]', data);
}

export function emitPostConsumeNoNextCard(
  reasons: Record<string, unknown>,
): void {
  if (!isPostConsumeTraceActive()) return;
  emit('[POST CONSUME NO NEXT CARD]', reasons);
}

export function emitPostConsumeOpenBlocked(
  reasons: Record<string, unknown>,
): void {
  if (!isPostConsumeTraceActive()) return;
  emit('[POST CONSUME OPEN BLOCKED]', reasons);
}

export function getPostConsumeTraceBanId(): string | null {
  return postConsumeSession?.banId ?? null;
}

export function emitPostConsumeChainEndReason(
  data: Record<string, unknown>,
): void {
  if (!isPostConsumeTraceActive()) return;
  emit('[POST CONSUME CHAIN END REASON]', data);
}

export function emitPostConsumeReturnPath(
  data: Record<string, unknown>,
): void {
  if (!isPostConsumeTraceActive()) return;
  emit('[POST CONSUME RETURN PATH]', data);
}

export function emitPostConsumeShowNextDecision(
  data: Record<string, unknown>,
): void {
  if (!isPostConsumeTraceActive()) return;
  emit('[POST CONSUME SHOW NEXT DECISION]', data);
}
