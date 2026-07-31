/**
 * Pure Create Ban reducer — route, draft, validation, submission, recipients.
 * Emits effects for async ports and Coordinator sinks; never calls them.
 */
import type { ProductRoute } from '@/app-coordinator/app-coordinator.types';
import {
  CREATE_BAN_DEFAULT_DURATION,
  type CreateBanDraft,
  type CreateBanEffect,
  type CreateBanEvent,
  type CreateBanRecipient,
  type CreateBanReduceResult,
  type CreateBanReplyContext,
  type CreateBanState,
} from './create-ban.types';
import {
  normalizeDurationMinutes,
  withValidation,
} from './create-ban.validation';

function emptyDraft(): CreateBanDraft {
  return {
    recipient: null,
    text: '',
    durationMinutes: CREATE_BAN_DEFAULT_DURATION,
  };
}

export function createInitialCreateBanState(): CreateBanState {
  return withValidation({
    route: 'LOBBY',
    draft: emptyDraft(),
    validation: {
      canContinueToConfirm: false,
      canSubmit: false,
      codes: ['TEXT_REQUIRED', 'RECIPIENT_REQUIRED'],
    },
    submission: { status: 'IDLE' },
    replyContext: null,
    recipients: { status: 'IDLE' },
    navigationGeneration: 0,
  });
}

function bump(
  state: CreateBanState,
  patch: Partial<CreateBanState>,
): CreateBanState {
  return withValidation({
    ...state,
    ...patch,
    navigationGeneration: state.navigationGeneration + 1,
  });
}

function setRoute(
  state: CreateBanState,
  route: ProductRoute,
  effects: CreateBanEffect[],
  emitSink: boolean,
): CreateBanReduceResult {
  const next = bump(state, { route });
  if (emitSink) {
    effects.push({ type: 'SINK_ROUTE_CHANGED', route });
  }
  return { state: next, effects };
}

function resolveReplyRecipient(
  reply: CreateBanReplyContext,
  recipients: CreateBanRecipient[],
  current: CreateBanRecipient | null,
): CreateBanRecipient {
  if (current?.id === reply.targetUserId) return current;
  const found = recipients.find((r) => r.id === reply.targetUserId);
  if (found) return found;
  return {
    id: reply.targetUserId,
    userId: reply.targetUserId,
    username: '',
    firstName: 'Opponent',
    photoUrl: null,
    avatarUrl: null,
    auraLabel: '',
    streak: 0,
    energyPercent: 0,
    presence: 'offline',
    lastSeenAt: null,
    interactionCount: 0,
    isRegistered: true,
  };
}

function friendsFromState(state: CreateBanState): CreateBanRecipient[] {
  return state.recipients.status === 'READY' ? state.recipients.recipients : [];
}

export function createBanReducer(
  state: CreateBanState,
  event: CreateBanEvent,
): CreateBanReduceResult {
  const effects: CreateBanEffect[] = [];

  switch (event.type) {
    case 'OPEN_ROUTE': {
      const { route, context } = event;

      if (context?.type === 'REPLY') {
        const replyContext: CreateBanReplyContext = {
          sourceItemId: context.sourceItemId,
          targetUserId: context.targetUserId,
          resumeToken: context.resumeToken,
        };
        const next = bump(state, {
          route,
          replyContext,
          draft: {
            recipient: resolveReplyRecipient(
              replyContext,
              friendsFromState(state),
              state.draft.recipient,
            ),
            text: '',
            durationMinutes: CREATE_BAN_DEFAULT_DURATION,
          },
          submission: { status: 'IDLE' },
        });
        effects.push({ type: 'SINK_ROUTE_CHANGED', route });
        if (
          route === 'WHAT' &&
          next.recipients.status !== 'READY' &&
          next.recipients.status !== 'LOADING'
        ) {
          effects.push({ type: 'LOAD_RECIPIENTS' });
        }
        return { state: withValidation(next), effects };
      }

      if (route === 'LOBBY') {
        const wasReply = state.replyContext;
        const reset = withValidation({
          ...createInitialCreateBanState(),
          navigationGeneration: state.navigationGeneration + 1,
        });
        if (!wasReply) {
          effects.push({ type: 'SINK_ROUTE_CHANGED', route: 'LOBBY' });
        }
        return { state: reset, effects };
      }

      if (route === state.route && !context) {
        return { state, effects: [] };
      }

      const clearingCompose = route === 'WHO';
      const next = bump(state, {
        route,
        replyContext: null,
        ...(clearingCompose
          ? {
              draft: emptyDraft(),
              submission: { status: 'IDLE' as const },
            }
          : {}),
      });
      effects.push({ type: 'SINK_ROUTE_CHANGED', route });
      if (route === 'WHO') {
        effects.push({ type: 'LOAD_RECIPIENTS' });
      }
      return { state: next, effects };
    }

    case 'LOCAL_ROUTE_CHANGED': {
      if (state.route === event.route) {
        return { state, effects: [] };
      }
      if (
        state.replyContext &&
        (event.route === 'LOBBY' ||
          event.route === 'WHO' ||
          event.route === 'BANS')
      ) {
        return { state, effects: [] };
      }
      const result = setRoute(state, event.route, effects, true);
      if (event.route === 'WHO') {
        result.effects.push({ type: 'LOAD_RECIPIENTS' });
      }
      return result;
    }

    case 'RECIPIENT_SELECTED': {
      if (state.replyContext) {
        return { state, effects: [] };
      }
      const next = bump(state, {
        draft: { ...state.draft, recipient: event.recipient },
        route: 'WHAT',
        submission:
          state.submission.status === 'FAILED'
            ? { status: 'IDLE' }
            : state.submission,
      });
      effects.push({ type: 'SINK_ROUTE_CHANGED', route: 'WHAT' });
      return { state: next, effects };
    }

    case 'TEXT_CHANGED': {
      return {
        state: withValidation({
          ...state,
          draft: { ...state.draft, text: event.text },
          submission:
            state.submission.status === 'FAILED'
              ? { status: 'IDLE' }
              : state.submission,
        }),
        effects: [],
      };
    }

    case 'DURATION_CHANGED': {
      return {
        state: withValidation({
          ...state,
          draft: {
            ...state.draft,
            durationMinutes: normalizeDurationMinutes(event.durationMinutes),
          },
          submission:
            state.submission.status === 'FAILED'
              ? { status: 'IDLE' }
              : state.submission,
        }),
        effects: [],
      };
    }

    case 'CONTINUE_REQUESTED': {
      if (state.route !== 'WHAT') return { state, effects: [] };
      const validated = withValidation(state);
      if (!validated.validation.canContinueToConfirm) {
        return { state: validated, effects: [] };
      }
      const trimmed = validated.draft.text.trim();
      const next = bump(validated, {
        draft: { ...validated.draft, text: trimmed },
        route: 'CONFIRM',
      });
      effects.push({ type: 'SINK_ROUTE_CHANGED', route: 'CONFIRM' });
      return { state: next, effects };
    }

    case 'BACK_REQUESTED': {
      if (state.route === 'CONFIRM') {
        return setRoute(state, 'WHAT', effects, true);
      }
      if (state.route === 'WHAT') {
        if (state.replyContext) {
          const { resumeToken, sourceItemId } = state.replyContext;
          const reset = withValidation({
            ...createInitialCreateBanState(),
            navigationGeneration: state.navigationGeneration + 1,
          });
          effects.push({
            type: 'SINK_REPLY_CANCELLED',
            resumeToken,
            sourceItemId,
          });
          return { state: reset, effects };
        }
        return setRoute(state, 'WHO', effects, true);
      }
      return { state, effects: [] };
    }

    case 'SUBMIT_REQUESTED': {
      if (state.route !== 'CONFIRM') return { state, effects: [] };
      if (state.submission.status === 'SUBMITTING') {
        return {
          state: withValidation(state),
          effects: [],
        };
      }
      const validated = withValidation(state);
      if (!validated.validation.canSubmit) {
        return { state: validated, effects: [] };
      }
      const text = validated.draft.text.trim();
      const durationMinutes = validated.draft.durationMinutes;
      const reply = validated.replyContext;
      if (reply) {
        const next = bump(validated, {
          draft: { ...validated.draft, text },
          submission: { status: 'SUBMITTING' },
        });
        effects.push({
          type: 'SUBMIT',
          command: {
            kind: 'REPLY',
            text,
            durationMinutes,
            sourceItemId: reply.sourceItemId,
            targetUserId: reply.targetUserId,
          },
        });
        return { state: next, effects };
      }
      const recipient = validated.draft.recipient;
      if (!recipient?.id) {
        return {
          state: withValidation({
            ...validated,
            submission: {
              status: 'FAILED',
              error: { code: 'RECIPIENT_REQUIRED' },
            },
          }),
          effects: [],
        };
      }
      const next = bump(validated, {
        draft: { ...validated.draft, text },
        submission: { status: 'SUBMITTING' },
      });
      effects.push({
        type: 'SUBMIT',
        command: {
          kind: 'DIRECT',
          text,
          durationMinutes,
          recipient,
          friends: friendsFromState(validated),
        },
      });
      return { state: next, effects };
    }

    case 'SUBMIT_SUCCEEDED': {
      const next = bump(state, {
        submission: { status: 'SUCCEEDED', result: event.result },
        route: 'SUCCESS',
      });
      effects.push({ type: 'SINK_ROUTE_CHANGED', route: 'SUCCESS' });
      return { state: next, effects };
    }

    case 'SUBMIT_FAILED': {
      return {
        state: withValidation({
          ...state,
          submission: { status: 'FAILED', error: event.error },
        }),
        effects: [],
      };
    }

    case 'SUCCESS_DISMISSED': {
      if (state.route !== 'SUCCESS') return { state, effects: [] };
      if (state.replyContext) {
        const { resumeToken, sourceItemId } = state.replyContext;
        const reset = withValidation({
          ...createInitialCreateBanState(),
          navigationGeneration: state.navigationGeneration + 1,
        });
        effects.push({
          type: 'SINK_REPLY_COMPLETED',
          resumeToken,
          sourceItemId,
        });
        return { state: reset, effects };
      }
      const reset = withValidation({
        ...createInitialCreateBanState(),
        route: 'LOBBY',
        navigationGeneration: state.navigationGeneration + 1,
      });
      effects.push({ type: 'SINK_FLOW_RELEASED', route: 'LOBBY' });
      return { state: reset, effects };
    }

    case 'REPLY_CANCEL_REQUESTED': {
      if (!state.replyContext) return { state, effects: [] };
      const { resumeToken, sourceItemId } = state.replyContext;
      const reset = withValidation({
        ...createInitialCreateBanState(),
        navigationGeneration: state.navigationGeneration + 1,
      });
      effects.push({
        type: 'SINK_REPLY_CANCELLED',
        resumeToken,
        sourceItemId,
      });
      return { state: reset, effects };
    }

    case 'NAVIGATE_BANS_REQUESTED': {
      if (state.replyContext) return { state, effects: [] };
      return setRoute(state, 'BANS', effects, true);
    }

    case 'RELEASE_TO_LOBBY_REQUESTED': {
      if (state.replyContext) return { state, effects: [] };
      const reset = withValidation({
        ...createInitialCreateBanState(),
        route: 'LOBBY',
        navigationGeneration: state.navigationGeneration + 1,
      });
      effects.push({ type: 'SINK_FLOW_RELEASED', route: 'LOBBY' });
      return { state: reset, effects };
    }

    case 'RECIPIENTS_LOAD_REQUESTED':
    case 'RECIPIENTS_RETRY_REQUESTED': {
      if (state.recipients.status === 'LOADING') {
        return { state, effects: [] };
      }
      effects.push({ type: 'LOAD_RECIPIENTS' });
      return {
        state: withValidation({
          ...state,
          recipients: { status: 'LOADING' },
        }),
        effects,
      };
    }

    case 'RECIPIENTS_LOAD_SUCCEEDED': {
      let draft = state.draft;
      if (state.replyContext && !draft.recipient?.id) {
        draft = {
          ...draft,
          recipient: resolveReplyRecipient(
            state.replyContext,
            event.recipients,
            null,
          ),
        };
      } else if (state.replyContext) {
        draft = {
          ...draft,
          recipient: resolveReplyRecipient(
            state.replyContext,
            event.recipients,
            draft.recipient,
          ),
        };
      }
      return {
        state: withValidation({
          ...state,
          draft,
          recipients: { status: 'READY', recipients: event.recipients },
        }),
        effects: [],
      };
    }

    case 'RECIPIENTS_LOAD_FAILED': {
      let draft = state.draft;
      if (state.replyContext && !draft.recipient?.id) {
        draft = {
          ...draft,
          recipient: resolveReplyRecipient(state.replyContext, [], null),
        };
      }
      return {
        state: withValidation({
          ...state,
          draft,
          recipients: { status: 'FAILED', error: event.error },
        }),
        effects: [],
      };
    }

    default:
      return { state, effects: [] };
  }
}
