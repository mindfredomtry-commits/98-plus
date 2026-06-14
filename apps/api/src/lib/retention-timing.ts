/** Production cadence — one retention DM per user at most every 24 hours. */
export const RETENTION_TEST_INTERVAL_MINUTES = 24 * 60;

export function retentionAutomationIntervalMs(): number {
  return RETENTION_TEST_INTERVAL_MINUTES * 60 * 1000;
}
