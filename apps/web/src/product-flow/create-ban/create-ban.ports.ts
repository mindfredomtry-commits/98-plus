/**
 * Create Ban ports — domain depends on these, not on concrete HTTP/React/Coordinator.
 */
import type {
  CreateBanCommand,
  CreateBanError,
  CreateBanRecipient,
  CreateBanResult,
  ProductRoute,
} from './create-ban.types';

export interface CreateBanSubmissionPort {
  submit(command: CreateBanCommand): Promise<CreateBanResult>;
}

export interface CreateBanRecipientsPort {
  loadRecipients(): Promise<CreateBanRecipient[]>;
}

/** Host facts emitted by CreateBan — wired by composition, not Coordinator types. */
export interface CreateBanHostSink {
  routeChanged(route: ProductRoute): void;
  replyCancelled(input: {
    resumeToken: string;
    sourceItemId: string;
  }): void;
  replyCompleted(input: {
    resumeToken: string;
    sourceItemId: string;
  }): void;
  flowReleased(route: ProductRoute): void;
}

export function mapUnknownSubmitError(err: unknown): CreateBanError {
  if (err && typeof err === 'object' && 'code' in err) {
    const code = (err as { code?: unknown }).code;
    if (code === 'auth') {
      return {
        code: 'AUTH_REQUIRED',
        detail: err instanceof Error ? err.message : undefined,
      };
    }
  }
  return {
    code: 'SUBMIT_FAILED',
    detail: err instanceof Error ? err.message : undefined,
  };
}
