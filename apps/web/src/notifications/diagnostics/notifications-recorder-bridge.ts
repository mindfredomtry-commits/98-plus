/**
 * Phase 9I — thin observational bridge for production recorder.
 * Never mutates domain state. Safe no-op when recorder is stopped.
 */
import {
  recordNotificationsProductionEvent,
  type NotificationsRecorderStage,
  type RecordEventInput,
} from './notifications-production-recorder';

export function rec(
  source: string,
  stage: NotificationsRecorderStage,
  extra?: Omit<RecordEventInput, 'source' | 'stage'>,
): void {
  recordNotificationsProductionEvent({
    source,
    stage,
    ...extra,
  });
}

export function ownerLabel(owner: {
  type: string;
  domain?: string;
}): string {
  return owner.type === 'DOMAIN' ? String(owner.domain) : owner.type;
}
