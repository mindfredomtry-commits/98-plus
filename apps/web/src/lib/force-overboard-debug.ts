import { traceOverboardFlow } from '@/lib/overboard-flow-debug';
import { logResultPath } from '@/lib/result-open-trace';

export const FORCE_OPEN_OVERBOARD_IMPL_ID = 'force-open-overboard-v4';

export function probeForceOpenRef(
  refFn: unknown,
  implFn?: unknown,
): Record<string, unknown> {
  const callable = typeof refFn === 'function';
  let refStringPrefix = '';
  if (callable) {
    try {
      refStringPrefix = String(refFn).slice(0, 80);
    } catch {
      refStringPrefix = '(unstringifiable)';
    }
  }
  return {
    typeofRef: typeof refFn,
    fnName: callable ? (refFn as { name?: string }).name || '(anonymous)' : null,
    hasCurrent: callable,
    sameAsImpl: refFn === implFn,
    implId: callable
      ? (refFn as { __forceOpenImplId?: string }).__forceOpenImplId ?? null
      : null,
    refStringPrefix,
  };
}

export type DirectForceCallPhase =
  | 'probe'
  | 'before invoke'
  | 'after invoke'
  | 'exception';

export function logDirectForceCall(
  phase: DirectForceCallPhase,
  data?: Record<string, unknown>,
): void {
  console.log(`[DIRECT CALL] ${phase}`, data ?? '');
  traceOverboardFlow(`direct-call:${phase}`, data);
  const pathPhase =
    phase === 'before invoke'
      ? 'attempt'
      : phase === 'after invoke'
        ? 'state-written'
        : 'path-skip';
  logResultPath('direct-force-call', pathPhase, {
    banId: typeof data?.banId === 'string' ? data.banId : null,
    allowed: phase === 'after invoke' && data?.returned === true,
    reason: phase === 'exception' ? String(data?.error ?? 'exception') : null,
    extra: { phase, ...data },
  });
}

export function probeForceOpenFn(
  fn: unknown,
  closureFn?: unknown,
): Record<string, unknown> {
  const callable = typeof fn === 'function';
  const probe: Record<string, unknown> = {
    typeofFn: typeof fn,
    callable,
    fnName: callable ? (fn as { name?: string }).name || '(anonymous)' : null,
    sameAsClosure: fn === closureFn,
    implId: callable
      ? (fn as { __forceOpenImplId?: string }).__forceOpenImplId ?? null
      : null,
  };
  if (callable && process.env.NODE_ENV !== 'production') {
    try {
      probe.fnSnippet = String(fn).slice(0, 120);
    } catch {
      probe.fnSnippet = '(unstringifiable)';
    }
  }
  return probe;
}

export type ForceOverboardLogStep =
  | 'enter'
  | 'input'
  | 'guard'
  | 'early-return'
  | 'before-flushSync'
  | 'inside-flushSync'
  | 'setResult-done'
  | 'setDirectResultOverlayActive-done'
  | 'state-written'
  | 'flushSync-error'
  | 'exit';

export function logForceOverboard(
  step: ForceOverboardLogStep | string,
  data?: Record<string, unknown>,
): void {
  const line = `[FORCE OVERBOARD] ${step}`;
  // Always mirror to console — visible even if traceOverboardFlow is filtered.
  console.log(line, { implId: FORCE_OPEN_OVERBOARD_IMPL_ID, ...(data ?? {}) });
  traceOverboardFlow(`force:${step}`, data);
  if (step === 'state-written' || step === 'early-return' || step === 'flushSync-error') {
    logResultPath('forceOpenOverboardResult', step === 'state-written' ? 'state-written' : 'path-skip', {
      banId: typeof data?.banId === 'string' ? data.banId : null,
      resultId: typeof data?.banId === 'string' ? data.banId : null,
      allowed: step === 'state-written',
      reason: typeof data?.reason === 'string' ? data.reason : null,
      extra: data,
    });
  }
}

export function logResultStateCleared(
  source: string,
  data: Record<string, unknown>,
): void {
  const row = { source, ...data };
  console.log('[RESULT STATE CLEARED]', row);
  traceOverboardFlow('result-state-cleared', row);
  logResultPath(source, 'state-cleared', {
    banId: typeof data.banId === 'string' ? data.banId : null,
    resultId: typeof data.resultId === 'string' ? data.resultId : data.banId ?? null,
    allowed: false,
    reason: typeof data.reason === 'string' ? data.reason : null,
    extra: row,
  });
}
