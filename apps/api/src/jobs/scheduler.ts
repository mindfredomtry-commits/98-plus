import cron from 'node-cron';
import {
  processExpiredBans,
  processRetention,
  processStaleChecks,
} from '../services/ban.service';
import { processAutomaticRetention } from '../services/retention-automation.service';
import {
  RETENTION_TEST_INTERVAL_MINUTES,
  retentionAutomationIntervalMs,
} from '../lib/retention-timing';

export function startScheduler() {
  // Precise timers handle check due; this cron is backup (≤15s skew).
  cron.schedule('*/15 * * * * *', async () => {
    try {
      await processExpiredBans();
      await processStaleChecks();
    } catch (e) {
      console.error('[scheduler]', e);
    }
  });

  cron.schedule('0 12 * * *', async () => {
    try {
      await processRetention();
    } catch (e) {
      console.error('[scheduler] retention', e);
    }
  });

  const retentionMs = retentionAutomationIntervalMs();
  setInterval(async () => {
    try {
      await processAutomaticRetention();
    } catch (e) {
      console.error('[scheduler] retention-automation', e);
    }
  }, retentionMs);

  void processAutomaticRetention().catch((e) => {
    console.error('[scheduler] retention-automation-initial', e);
  });

  cron.schedule('* * * * *', async () => {
    console.log('[check-scheduler-tick]', { now: new Date().toISOString() });
  });

  console.log(
    `[scheduler] check backup every 15s; retention daily 12:00; auto-retention every ${RETENTION_TEST_INTERVAL_MINUTES}m; heartbeat every minute`,
  );
}
