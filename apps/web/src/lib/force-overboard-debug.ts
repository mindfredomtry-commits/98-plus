import { traceOverboardFlow } from '@/lib/overboard-flow-debug';
import { logResultPath } from '@/lib/result-open-trace';

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
  console.log(line, data ?? '');
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
