/**
 * Create Ban selectors / read helpers.
 */
import type { CreateBanRecipient, CreateBanState } from './create-ban.types';

export function selectCreateBanRecipientLabel(state: CreateBanState): string {
  const selected = state.draft.recipient;
  if (!selected) return '—';
  return selected.firstName || selected.username || '—';
}

export function selectReadyRecipients(
  state: CreateBanState,
): CreateBanRecipient[] {
  return state.recipients.status === 'READY' ? state.recipients.recipients : [];
}

export function selectSubmissionErrorDetail(
  state: CreateBanState,
): string | null {
  if (state.submission.status !== 'FAILED') return null;
  return state.submission.error.detail ?? state.submission.error.code;
}

export function selectLastSentBanId(state: CreateBanState): string | null {
  return state.submission.status === 'SUCCEEDED'
    ? state.submission.result.banId
    : null;
}
