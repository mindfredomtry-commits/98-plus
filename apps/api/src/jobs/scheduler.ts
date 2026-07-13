import cron from 'node-cron';
import {
  processExpiredBans,
  processRetention,
  processStaleChecks,
} from '../services/ban.service';
import { processAutomaticRetention } from '../services/retention-automation.service';
import { processPendingMonetizationEvents } from '../services/monetization-event-processor';
import { expireStalePayments } from '../services/payment-status.service';
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

  // Monetization outbox — retry pending entitlement provisioning.
  cron.schedule('*/30 * * * * *', async () => {
    try {
      await processPendingMonetizationEvents();
    } catch (e) {
      console.error('[scheduler] monetization-events', e);
    }
  });

  // Payment cleanup — expire stale CREATED/PENDING intents past their TTL.
  cron.schedule('*/10 * * * *', async () => {
    try {
      const expired = await expireStalePayments();
      if (expired > 0) {
        console.log('[scheduler] payment-cleanup expired', { count: expired });
      }
    } catch (e) {
      console.error('[scheduler] payment-cleanup', e);
    }
  });

  console.log(
    `[scheduler] check backup every 15s; retention daily 12:00; auto-retention every ${RETENTION_TEST_INTERVAL_MINUTES}m; monetization outbox every 30s; payment cleanup every 10m; heartbeat every minute`,
  );
}
