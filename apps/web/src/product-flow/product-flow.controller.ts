/**
 * Product Flow controller — composes CreateBan domain and host sinks.
 * Does not read Runtime queue or decide global surface ownership.
 * Production UI intents enter only through asDomainPort() via Coordinator.
 */
import type {
  CreateBanDomainPort,
  ProductFlowEventSink,
  ProductFlowPort,
} from '@/app-coordinator/app-coordinator.ports';
import type { FriendCard } from '@98plus/shared';
import {
  createCreateBanController,
  type CreateBanController,
} from './create-ban/create-ban.controller';
import { mapCreateBanCapability } from './create-ban/create-ban.capability';
import type {
  CreateBanRecipientsPort,
  CreateBanSubmissionPort,
} from './create-ban/create-ban.ports';
import {
  selectLastSentBanId,
  selectSubmissionErrorDetail,
} from './create-ban/create-ban.selectors';
import type {
  CreateBanState,
  CreateBanUiIntent,
  CreateBanValidation,
  CreateBanSubmission,
  CreateBanRecipientsStatus,
  ProductRoute,
  ProductRouteContext,
} from './create-ban/create-ban.types';
import type { ResumeToken } from './create-ban/resume-token';

export type ProductReplyContext = {
  sourceItemId: string;
  targetUserId: string;
  resumeToken: ResumeToken;
};

/**
 * CreateBan read model for Product presentation.
 * Flat fields remain for tests; CreateBan fields are authoritative.
 */
export type ProductFlowState = {
  route: ProductRoute;
  reply: ProductReplyContext | null;
  selectedUser: FriendCard | null;
  banText: string;
  durationMinutes: number;
  lastSentBanId: string | null;
  navigationGeneration: number;
  validation: CreateBanValidation;
  submission: CreateBanSubmission;
  recipients: CreateBanRecipientsStatus;
  submissionErrorDetail: string | null;
};

export type ProductFlowListener = (state: ProductFlowState) => void;

export type ProductFlowController = {
  getState(): ProductFlowState;
  subscribe(listener: ProductFlowListener): () => void;
  /** Domain-test / composition open — not Presentation. */
  openRoute(input: {
    route: ProductRoute;
    context?: ProductRouteContext;
  }): void;
  getCreateBanState(): CreateBanState;
  markSendSucceeded(banId: string): void;
  cancelReply(): void;
  completeReply(): void;
  releaseFlow(route?: ProductRoute): void;
  asPort(): ProductFlowPort;
  asDomainPort(): CreateBanDomainPort;
  dispose(): void;
};

function project(createBan: CreateBanState): ProductFlowState {
  return {
    route: createBan.route,
    reply: createBan.replyContext,
    selectedUser: createBan.draft.recipient,
    banText: createBan.draft.text,
    durationMinutes: createBan.draft.durationMinutes,
    lastSentBanId: selectLastSentBanId(createBan),
    navigationGeneration: createBan.navigationGeneration,
    validation: createBan.validation,
    submission: createBan.submission,
    recipients: createBan.recipients,
    submissionErrorDetail: selectSubmissionErrorDetail(createBan),
  };
}

export function createProductFlowController(input: {
  sink: ProductFlowEventSink;
  submissionPort?: CreateBanSubmissionPort | null;
  recipientsPort?: CreateBanRecipientsPort | null;
}): ProductFlowController {
  const createBan: CreateBanController = createCreateBanController({
    sink: input.sink,
    submissionPort: input.submissionPort,
    recipientsPort: input.recipientsPort,
  });

  const listeners = new Set<ProductFlowListener>();
  let disposed = false;
  let cachedProjection: ProductFlowState = project(createBan.getState());

  const unsubscribeCreateBan = createBan.subscribe(() => {
    cachedProjection = project(createBan.getState());
    for (const listener of [...listeners]) {
      listener(cachedProjection);
    }
  });

  const controller: ProductFlowController = {
    getState() {
      return cachedProjection;
    },

    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },

    openRoute(openInput) {
      createBan.openRoute(openInput);
    },

    getCreateBanState() {
      return createBan.getState();
    },

    markSendSucceeded(banId) {
      createBan.markSendSucceeded(banId);
    },

    cancelReply() {
      createBan.dispatch({ type: 'REPLY_CANCEL_REQUESTED' });
    },

    completeReply() {
      createBan.dispatch({ type: 'SUCCESS_DISMISSED' });
    },

    releaseFlow(route = 'LOBBY') {
      if (route !== 'LOBBY') {
        createBan.openRoute({ route });
        return;
      }
      createBan.dispatch({ type: 'RELEASE_TO_LOBBY_REQUESTED' });
    },

    asPort() {
      return {
        openRoute: (openInput) => {
          createBan.openRoute(openInput);
        },
      };
    },

    asDomainPort() {
      return {
        dispatch(intent: CreateBanUiIntent) {
          createBan.dispatch(intent);
        },
        getCapability() {
          return mapCreateBanCapability(createBan.getState());
        },
      };
    },

    dispose() {
      disposed = true;
      void disposed;
      unsubscribeCreateBan();
      listeners.clear();
      createBan.dispose();
    },
  };

  return controller;
}
