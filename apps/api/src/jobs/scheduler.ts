import cron from 'node-cron';
import {
  processExpiredBans,
  processReminders,
  processStaleChecks,
} from '../services/ban.service';

export function startScheduler() {
  cron.schedule('* * * * *', async () => {
    console.log('[check-scheduler-tick]', { now: new Date().toISOString() });
    try {
      await processReminders();
      await processExpiredBans();
      await processStaleChecks();
    } catch (e) {
      console.error('[scheduler]', e);
    }
  });
  console.log('[scheduler] alpha cron: reminders + checks + stale (every minute)');
}
