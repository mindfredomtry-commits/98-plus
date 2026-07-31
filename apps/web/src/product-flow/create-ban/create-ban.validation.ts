/**
 * Create Ban validation — sole owner of draft legality checks.
 */
import {
  CREATE_BAN_DEFAULT_DURATION,
  CREATE_BAN_MAX_DURATION,
  CREATE_BAN_MIN_DURATION,
  CREATE_BAN_MIN_TEXT_LENGTH,
  type CreateBanDraft,
  type CreateBanErrorCode,
  type CreateBanState,
  type CreateBanValidation,
} from './create-ban.types';

export function normalizeDurationMinutes(value: number): number {
  if (!Number.isFinite(value)) return CREATE_BAN_DEFAULT_DURATION;
  const rounded = Math.round(value);
  if (rounded < CREATE_BAN_MIN_DURATION || rounded > CREATE_BAN_MAX_DURATION) {
    return CREATE_BAN_DEFAULT_DURATION;
  }
  return rounded;
}

export function isDurationValid(value: number): boolean {
  return (
    Number.isFinite(value) &&
    Number.isInteger(value) &&
    value >= CREATE_BAN_MIN_DURATION &&
    value <= CREATE_BAN_MAX_DURATION
  );
}

export function textErrorCode(text: string): CreateBanErrorCode | null {
  const trimmed = text.trim();
  if (trimmed.length === 0) return 'TEXT_REQUIRED';
  if (trimmed.length < CREATE_BAN_MIN_TEXT_LENGTH) return 'TEXT_TOO_SHORT';
  return null;
}

export function computeCreateBanValidation(
  draft: CreateBanDraft,
  input: {
    replyActive: boolean;
    submissionInProgress: boolean;
  },
): CreateBanValidation {
  const codes: CreateBanErrorCode[] = [];
  const textCode = textErrorCode(draft.text);
  if (textCode) codes.push(textCode);
  if (!isDurationValid(draft.durationMinutes)) {
    codes.push('INVALID_DURATION');
  }
  if (!input.replyActive && !draft.recipient?.id) {
    codes.push('RECIPIENT_REQUIRED');
  }
  if (input.submissionInProgress) {
    codes.push('SUBMISSION_IN_PROGRESS');
  }

  const textOk = textCode === null;
  const durationOk = isDurationValid(draft.durationMinutes);
  const recipientOk = input.replyActive || Boolean(draft.recipient?.id);

  return {
    canContinueToConfirm:
      textOk && durationOk && !input.submissionInProgress,
    canSubmit:
      textOk && durationOk && recipientOk && !input.submissionInProgress,
    codes,
  };
}

export function withValidation(state: CreateBanState): CreateBanState {
  return {
    ...state,
    validation: computeCreateBanValidation(state.draft, {
      replyActive: state.replyContext != null,
      submissionInProgress: state.submission.status === 'SUBMITTING',
    }),
  };
}
