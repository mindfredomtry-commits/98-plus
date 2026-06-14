/** Test cadence — change to `24 * 60` for once-per-day production retention. */
export const RETENTION_TEST_INTERVAL_MINUTES = 5;

export function retentionAutomationIntervalMs(): number {
  return RETENTION_TEST_INTERVAL_MINUTES * 60 * 1000;
}
