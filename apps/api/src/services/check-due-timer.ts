/** Node setTimeout max (~24.8 days). */
const MAX_TIMER_MS = 2_147_483_647;

const checkDueTimers = new Map<string, NodeJS.Timeout>();

export function cancelCheckDueTimer(banId: string): void {
  const existing = checkDueTimers.get(banId);
  if (existing) {
    clearTimeout(existing);
    checkDueTimers.delete(banId);
  }
}

/** In-memory precise check due — cron remains backup after restarts. */
export function scheduleCheckDueTimer(banId: string, checkDueAt: Date): void {
  cancelCheckDueTimer(banId);

  const delayMs = Math.max(0, checkDueAt.getTime() - Date.now());

  console.log('[check-timer-scheduled]', {
    banId,
    delayMs,
    checkDueAt: checkDueAt.toISOString(),
  });

  if (delayMs > MAX_TIMER_MS) {
    return;
  }

  const timer = setTimeout(() => {
    checkDueTimers.delete(banId);
    console.log('[check-timer-fired]', {
      banId,
      now: new Date().toISOString(),
    });
    void import('./ban.service')
      .then(({ processSingleDueCheck }) => processSingleDueCheck(banId))
      .catch((e) => {
        console.error('[check-timer-fired] process failed', banId, e);
      });
  }, delayMs);

  if (typeof timer.unref === 'function') {
    timer.unref();
  }

  checkDueTimers.set(banId, timer);
}
