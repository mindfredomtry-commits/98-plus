/**
 * Product Flow controller — composes CreateBan domain and Coordinator sinks.
 * Does not read Runtime queue or decide global surface ownership.
 */
import type {
  ProductFlowEventSink,
  ProductFlowPort,
} from '@/app-coordinator/app-coordinator.ports';
import type { ProductRoute } from '@/app-coordinator/app-coordinator.types';
import type { ResumeToken } from '@/app-coordinator/resume-token';
import type { FriendCard } from '@98plus/shared';
import {
  createCreateBanController,
  type CreateBanController,
} from './create-ban/create-ban.controller';
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
  ProductRouteContext,
} from './create-ban/create-ban.types';

export type ProductReplyContext = {
  sourceItemId: string;
  targetUserId: string;
  resumeToken: ResumeToken;
};

/**
 * Compatibility + CreateBan read model for Product presentation.
 * Flat fields remain for Coordinator tests; CreateBan fields are authoritative.
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
  /** Presentation helper: submission failure detail string. */
  submissionErrorDetail: string | null;
};

export type ProductFlowListener = (state: ProductFlowState) => void;

export type ProductFlowController = {
  getState(): ProductFlowState;
  subscribe(listener: ProductFlowListener): () => void;
  openRoute(input: {
    route: ProductRoute;
    context?: ProductRouteContext;
  }): void;
  /** Local Product navigation intents (WHO→WHAT etc.). Prefer dispatch(). */
  navigateLocal(route: ProductRoute): void;
  dispatch(intent: CreateBanUiIntent): void;
  getCreateBanState(): CreateBanState;
  /**
   * Compatibility for Coordinator harness tests.
   * Prefer SUBMIT via ports; this only marks SUCCESS.
   */
  markSendSucceeded(banId: string): void;
  cancelReply(): void;
  completeReply(): void;
  releaseFlow(route?: ProductRoute): void;
  asPort(): ProductFlowPort;
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
  /**
   * Cached projection for useSyncExternalStore.
   * getSnapshot must return a stable reference when CreateBan state is unchanged;
   * allocating a new object per getState() call causes React error #185
   * (Maximum update depth exceeded).
   */
  let cachedProjection: ProductFlowState = project(createBan.getState());

  const unsubscribeCreateBan = createBan.subscribe(() => {
    cachedProjection = project(createBan.getState());
    for (const listener of [...listeners]) {
      listener(cachedProjection);
    }
  });

  function navigateLocal(route: ProductRoute): void {
    if (disposed) return;
    if (route === 'BANS') {
      createBan.dispatch({ type: 'NAVIGATE_BANS_REQUESTED' });
      return;
    }
    if (route === 'LOBBY') {
      createBan.dispatch({ type: 'RELEASE_TO_LOBBY_REQUESTED' });
      return;
    }
    createBan.changeLocalRoute(route);
  }

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

    navigateLocal,

    dispatch(intent) {
      createBan.dispatch(intent);
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

    dispose() {
      disposed = true;
      unsubscribeCreateBan();
      listeners.clear();
      createBan.dispose();
    },
  };

  return controller;
}
