import cron from 'node-cron';
import {
  processExpiredBans,
  processReminders,
  processStaleChecks,
} from '../services/ban.service';

export function startScheduler() {
  cron.schedule('* * * * *', async () => {
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
