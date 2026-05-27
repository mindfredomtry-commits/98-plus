import cron from 'node-cron';
import {
  processExpiredBans,
  processReminders,
  processStaleChecks,
} from '../services/ban.service';

export function startScheduler() {
  // Precise timers handle check due; this cron is backup (≤15s skew).
  cron.schedule('*/15 * * * * *', async () => {
    try {
      await processReminders();
      await processExpiredBans();
      await processStaleChecks();
    } catch (e) {
      console.error('[scheduler]', e);
    }
  });

  cron.schedule('* * * * *', async () => {
    console.log('[check-scheduler-tick]', { now: new Date().toISOString() });
  });

  console.log(
    '[scheduler] check backup every 15s; heartbeat every minute',
  );
}
