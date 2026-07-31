/**
 * Create Ban domain types — React-free, serializable Product compose state.
 */
import type {
  ProductRoute,
  ProductRouteContext,
  ResumeToken,
} from '@/app-coordinator/app-coordinator.types';
import type { FriendCard } from '@98plus/shared';

/** Recipient identity for create-ban draft (FriendCard is the live contract). */
export type CreateBanRecipient = FriendCard;

export type CreateBanDraft = {
  recipient: CreateBanRecipient | null;
  text: string;
  durationMinutes: number;
};

export type CreateBanErrorCode =
  | 'RECIPIENT_REQUIRED'
  | 'TEXT_REQUIRED'
  | 'TEXT_TOO_SHORT'
  | 'INVALID_DURATION'
  | 'SUBMISSION_IN_PROGRESS'
  | 'AUTH_REQUIRED'
  | 'SUBMIT_FAILED'
  | 'RECIPIENTS_LOAD_FAILED';

export type CreateBanError = {
  code: CreateBanErrorCode;
  /** Optional infrastructure detail; UI may display, domain identity is `code`. */
  detail?: string;
};

export type CreateBanValidation = {
  canContinueToConfirm: boolean;
  canSubmit: boolean;
  codes: readonly CreateBanErrorCode[];
};

export type CreateBanResult = {
  banId: string;
};

export type CreateBanSubmission =
  | { status: 'IDLE' }
  | { status: 'SUBMITTING' }
  | { status: 'FAILED'; error: CreateBanError }
  | { status: 'SUCCEEDED'; result: CreateBanResult };

export type CreateBanReplyContext = {
  sourceItemId: string;
  targetUserId: string;
  resumeToken: ResumeToken;
};

export type CreateBanRecipientsStatus =
  | { status: 'IDLE' }
  | { status: 'LOADING' }
  | { status: 'READY'; recipients: CreateBanRecipient[] }
  | { status: 'FAILED'; error: CreateBanError };

export type CreateBanState = {
  route: ProductRoute;
  draft: CreateBanDraft;
  validation: CreateBanValidation;
  submission: CreateBanSubmission;
  replyContext: CreateBanReplyContext | null;
  recipients: CreateBanRecipientsStatus;
  /** Prevents duplicate OPEN_ROUTE side effects for the same command. */
  navigationGeneration: number;
};

export type CreateBanCommand =
  | {
      kind: 'DIRECT';
      text: string;
      durationMinutes: number;
      recipient: CreateBanRecipient;
      friends: CreateBanRecipient[];
    }
  | {
      kind: 'REPLY';
      text: string;
      durationMinutes: number;
      sourceItemId: string;
      targetUserId: string;
    };

export type CreateBanUiIntent =
  | { type: 'RECIPIENT_SELECTED'; recipient: CreateBanRecipient }
  | { type: 'TEXT_CHANGED'; text: string }
  | { type: 'DURATION_CHANGED'; durationMinutes: number }
  | { type: 'CONTINUE_REQUESTED' }
  | { type: 'BACK_REQUESTED' }
  | { type: 'SUBMIT_REQUESTED' }
  | { type: 'SUCCESS_DISMISSED' }
  | { type: 'REPLY_CANCEL_REQUESTED' }
  | { type: 'NAVIGATE_BANS_REQUESTED' }
  | { type: 'RELEASE_TO_LOBBY_REQUESTED' }
  | { type: 'RECIPIENTS_LOAD_REQUESTED' }
  | { type: 'RECIPIENTS_RETRY_REQUESTED' };

export type CreateBanInternalEvent =
  | {
      type: 'OPEN_ROUTE';
      route: ProductRoute;
      context?: ProductRouteContext;
    }
  /** Compatibility local route change — preserves reply/draft. */
  | { type: 'LOCAL_ROUTE_CHANGED'; route: ProductRoute }
  | { type: 'SUBMIT_SUCCEEDED'; result: CreateBanResult }
  | { type: 'SUBMIT_FAILED'; error: CreateBanError }
  | { type: 'RECIPIENTS_LOAD_SUCCEEDED'; recipients: CreateBanRecipient[] }
  | { type: 'RECIPIENTS_LOAD_FAILED'; error: CreateBanError };

export type CreateBanEvent = CreateBanUiIntent | CreateBanInternalEvent;

export type CreateBanEffect =
  | { type: 'SUBMIT'; command: CreateBanCommand }
  | { type: 'LOAD_RECIPIENTS' }
  | { type: 'SINK_ROUTE_CHANGED'; route: ProductRoute }
  | {
      type: 'SINK_REPLY_CANCELLED';
      resumeToken: ResumeToken;
      sourceItemId: string;
    }
  | {
      type: 'SINK_REPLY_COMPLETED';
      resumeToken: ResumeToken;
      sourceItemId: string;
    }
  | { type: 'SINK_FLOW_RELEASED'; route: ProductRoute };

export type CreateBanReduceResult = {
  state: CreateBanState;
  effects: CreateBanEffect[];
};

export const CREATE_BAN_MIN_TEXT_LENGTH = 3;
export const CREATE_BAN_MIN_DURATION = 1;
export const CREATE_BAN_MAX_DURATION = 1440;
export const CREATE_BAN_DEFAULT_DURATION = 3;
