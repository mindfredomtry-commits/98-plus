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

export type CreateBanWhoPresentation = {
  recipientsStatus: 'idle' | 'loading' | 'ready' | 'failed' | 'empty';
  recipients: CreateBanRecipient[];
  selectedRecipientId: string | null;
  isReply: boolean;
  replyRecipientLabel: string | null;
  errorDetail: string | null;
};

export function selectCreateBanWhoPresentation(
  state: CreateBanState,
): CreateBanWhoPresentation {
  const isReply = state.replyContext != null;
  if (state.recipients.status === 'IDLE') {
    return {
      recipientsStatus: 'idle',
      recipients: [],
      selectedRecipientId: state.draft.recipient?.id ?? null,
      isReply,
      replyRecipientLabel: isReply ? selectCreateBanRecipientLabel(state) : null,
      errorDetail: null,
    };
  }
  if (state.recipients.status === 'LOADING') {
    return {
      recipientsStatus: 'loading',
      recipients: [],
      selectedRecipientId: state.draft.recipient?.id ?? null,
      isReply,
      replyRecipientLabel: isReply ? selectCreateBanRecipientLabel(state) : null,
      errorDetail: null,
    };
  }
  if (state.recipients.status === 'FAILED') {
    return {
      recipientsStatus: 'failed',
      recipients: [],
      selectedRecipientId: state.draft.recipient?.id ?? null,
      isReply,
      replyRecipientLabel: isReply ? selectCreateBanRecipientLabel(state) : null,
      errorDetail:
        state.recipients.error.detail ?? state.recipients.error.code,
    };
  }
  const recipients = state.recipients.recipients;
  return {
    recipientsStatus: recipients.length === 0 ? 'empty' : 'ready',
    recipients,
    selectedRecipientId: state.draft.recipient?.id ?? null,
    isReply,
    replyRecipientLabel: isReply ? selectCreateBanRecipientLabel(state) : null,
    errorDetail: null,
  };
}

export type CreateBanSuccessPresentation = {
  recipientLabel: string;
  banText: string;
  durationMinutes: number;
  isReply: boolean;
};

export function selectCreateBanSuccessPresentation(
  state: CreateBanState,
): CreateBanSuccessPresentation {
  return {
    recipientLabel: selectCreateBanRecipientLabel(state),
    banText: state.draft.text,
    durationMinutes: state.draft.durationMinutes,
    isReply: state.replyContext != null,
  };
}
