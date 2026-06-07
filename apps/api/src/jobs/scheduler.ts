import cron from 'node-cron';
import {
  processExpiredBans,
  processRetention,
  processStaleChecks,
} from '../services/ban.service';

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

  cron.schedule('* * * * *', async () => {
    console.log('[check-scheduler-tick]', { now: new Date().toISOString() });
  });

  console.log(
    '[scheduler] check backup every 15s; retention daily 12:00; heartbeat every minute',
  );
}
