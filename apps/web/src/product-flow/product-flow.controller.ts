/**
 * Product Flow controller — sole owner of product route and compose context.
 * Does not read Runtime queue or decide global surface ownership.
 */
import type {
  ProductFlowEventSink,
  ProductFlowPort,
} from '@/app-coordinator/app-coordinator.ports';
import type {
  ProductRoute,
  ProductRouteContext,
  ResumeToken,
} from '@/app-coordinator/app-coordinator.types';
import type { FriendCard } from '@98plus/shared';

export type ProductReplyContext = {
  sourceItemId: string;
  targetUserId: string;
  resumeToken: ResumeToken;
};

export type ProductFlowState = {
  route: ProductRoute;
  reply: ProductReplyContext | null;
  selectedUser: FriendCard | null;
  banText: string;
  durationMinutes: number;
  lastSentBanId: string | null;
  /** Prevents duplicate OPEN_ROUTE side effects for the same command. */
  navigationGeneration: number;
};

export type ProductFlowListener = (state: ProductFlowState) => void;

export type ProductFlowController = {
  getState(): ProductFlowState;
  subscribe(listener: ProductFlowListener): () => void;
  openRoute(input: {
    route: ProductRoute;
    context?: ProductRouteContext;
  }): void;
  /** Local Product navigation (WHO→WHAT etc.). Emits routeChanged once. */
  navigateLocal(route: ProductRoute): void;
  setSelectedUser(user: FriendCard | null): void;
  setBanText(text: string): void;
  setDurationMinutes(minutes: number): void;
  markSendSucceeded(banId: string): void;
  cancelReply(): void;
  completeReply(): void;
  releaseFlow(route?: ProductRoute): void;
  asPort(): ProductFlowPort;
  dispose(): void;
};

function createInitialState(): ProductFlowState {
  return {
    route: 'LOBBY',
    reply: null,
    selectedUser: null,
    banText: '',
    durationMinutes: 3,
    lastSentBanId: null,
    navigationGeneration: 0,
  };
}

export function createProductFlowController(input: {
  sink: ProductFlowEventSink;
}): ProductFlowController {
  let state = createInitialState();
  let disposed = false;
  const listeners = new Set<ProductFlowListener>();

  function commit(next: ProductFlowState): void {
    state = next;
    for (const listener of [...listeners]) {
      listener(state);
    }
  }

  function openRoute(openInput: {
    route: ProductRoute;
    context?: ProductRouteContext;
  }): void {
    if (disposed) return;
    const { route, context } = openInput;

    if (context?.type === 'REPLY') {
      commit({
        ...state,
        route,
        reply: {
          sourceItemId: context.sourceItemId,
          targetUserId: context.targetUserId,
          resumeToken: context.resumeToken,
        },
        selectedUser: state.selectedUser,
        banText: '',
        durationMinutes: 3,
        lastSentBanId: null,
        navigationGeneration: state.navigationGeneration + 1,
      });
      input.sink.routeChanged(route);
      return;
    }

    if (route === 'LOBBY') {
      const wasReply = state.reply;
      commit({
        ...createInitialState(),
        navigationGeneration: state.navigationGeneration + 1,
      });
      if (!wasReply) {
        input.sink.routeChanged('LOBBY');
      }
      return;
    }

    if (route === state.route && !context) {
      return;
    }

    commit({
      ...state,
      route,
      reply: null,
      navigationGeneration: state.navigationGeneration + 1,
      ...(route === 'WHO'
        ? {
            selectedUser: null,
            banText: '',
            durationMinutes: 3,
            lastSentBanId: null,
          }
        : {}),
    });
    input.sink.routeChanged(route);
  }

  const controller: ProductFlowController = {
    getState() {
      return state;
    },

    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },

    openRoute,

    navigateLocal(route) {
      if (disposed) return;
      if (state.route === route) return;
      if (state.reply && (route === 'LOBBY' || route === 'WHO' || route === 'BANS')) {
        return;
      }
      commit({
        ...state,
        route,
        navigationGeneration: state.navigationGeneration + 1,
      });
      input.sink.routeChanged(route);
    },

    setSelectedUser(user) {
      if (disposed) return;
      commit({ ...state, selectedUser: user });
    },

    setBanText(text) {
      if (disposed) return;
      commit({ ...state, banText: text });
    },

    setDurationMinutes(minutes) {
      if (disposed) return;
      commit({ ...state, durationMinutes: minutes });
    },

    markSendSucceeded(banId) {
      if (disposed) return;
      commit({
        ...state,
        lastSentBanId: banId,
        route: 'SUCCESS',
        navigationGeneration: state.navigationGeneration + 1,
      });
      input.sink.routeChanged('SUCCESS');
    },

    cancelReply() {
      if (disposed || !state.reply) return;
      const { resumeToken, sourceItemId } = state.reply;
      commit({
        ...createInitialState(),
        navigationGeneration: state.navigationGeneration + 1,
      });
      input.sink.replyCancelled({ resumeToken, sourceItemId });
    },

    completeReply() {
      if (disposed || !state.reply) return;
      const { resumeToken, sourceItemId } = state.reply;
      commit({
        ...createInitialState(),
        navigationGeneration: state.navigationGeneration + 1,
      });
      input.sink.replyCompleted({ resumeToken, sourceItemId });
    },

    releaseFlow(route = 'LOBBY') {
      if (disposed) return;
      if (state.reply) return;
      commit({
        ...createInitialState(),
        route,
        navigationGeneration: state.navigationGeneration + 1,
      });
      input.sink.flowReleased(route);
    },

    asPort() {
      return {
        openRoute,
      };
    },

    dispose() {
      disposed = true;
      listeners.clear();
    },
  };

  return controller;
}
