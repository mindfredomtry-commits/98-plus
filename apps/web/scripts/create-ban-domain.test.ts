/**
 * Create Ban domain behavior + architecture gates.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createSequentialResumeTokenFactory } from '../src/app-coordinator/resume-token';
import {
  createBanReducer,
  createInitialCreateBanState,
} from '../src/product-flow/create-ban/create-ban.reducer';
import { createCreateBanController } from '../src/product-flow/create-ban/create-ban.controller';
import type {
  CreateBanCommand,
  CreateBanRecipient,
  CreateBanResult,
} from '../src/product-flow/create-ban/create-ban.types';
import { createProductFlowController } from '../src/product-flow/product-flow.controller';

const __dirname = dirname(fileURLToPath(import.meta.url));
const webSrc = join(__dirname, '../src');

function pass(label: string): void {
  console.log(`ok - ${label}`);
}

function friend(id: string, name = 'Alex'): CreateBanRecipient {
  return {
    id,
    userId: id,
    username: name.toLowerCase(),
    firstName: name,
    photoUrl: null,
    avatarUrl: null,
    auraLabel: '',
    streak: 0,
    energyPercent: 50,
    presence: 'online',
    lastSeenAt: null,
    interactionCount: 1,
    isRegistered: true,
  };
}

function sinkRecorder() {
  const events: string[] = [];
  return {
    events,
    sink: {
      routeChanged(route: string) {
        events.push(`route:${route}`);
      },
      replyCancelled() {
        events.push('replyCancelled');
      },
      replyCompleted() {
        events.push('replyCompleted');
      },
      flowReleased(route: string) {
        events.push(`released:${route}`);
      },
    },
  };
}

async function main(): Promise<void> {
  {
    const state = createInitialCreateBanState();
    assert.equal(state.route, 'LOBBY');
    assert.equal(state.draft.text, '');
    assert.equal(state.draft.durationMinutes, 3);
    assert.equal(state.draft.recipient, null);
    assert.equal(state.submission.status, 'IDLE');
    assert.equal(state.replyContext, null);
    assert.equal(state.validation.canContinueToConfirm, false);
    assert.equal(state.validation.canSubmit, false);
    pass('1. Initial state');
  }

  {
    let state = createInitialCreateBanState();
    state = createBanReducer(state, {
      type: 'OPEN_ROUTE',
      route: 'WHO',
    }).state;
    const selected = friend('u1');
    state = createBanReducer(state, {
      type: 'RECIPIENT_SELECTED',
      recipient: selected,
    }).state;
    assert.equal(state.route, 'WHAT');
    assert.equal(state.draft.recipient?.id, 'u1');
    pass('2. Recipient selection');
  }

  {
    let state = createInitialCreateBanState();
    state = createBanReducer(state, {
      type: 'TEXT_CHANGED',
      text: 'abc',
    }).state;
    assert.equal(state.draft.text, 'abc');
    assert.equal(state.validation.canContinueToConfirm, true);
    pass('3. Text change');
  }

  {
    let state = createInitialCreateBanState();
    state = createBanReducer(state, {
      type: 'DURATION_CHANGED',
      durationMinutes: 15,
    }).state;
    assert.equal(state.draft.durationMinutes, 15);
    state = createBanReducer(state, {
      type: 'DURATION_CHANGED',
      durationMinutes: Number.NaN,
    }).state;
    assert.equal(state.draft.durationMinutes, 3);
    pass('4. Duration change');
  }

  {
    let state = createInitialCreateBanState();
    state = createBanReducer(state, { type: 'OPEN_ROUTE', route: 'WHO' }).state;
    state = createBanReducer(state, {
      type: 'RECIPIENT_SELECTED',
      recipient: friend('u1'),
    }).state;
    state = createBanReducer(state, {
      type: 'TEXT_CHANGED',
      text: 'ab',
    }).state;
    const result = createBanReducer(state, { type: 'CONTINUE_REQUESTED' });
    assert.equal(result.state.route, 'WHAT');
    assert.equal(result.effects.length, 0);
    pass('5. Invalid CONTINUE_REQUESTED does not move to CONFIRM');
  }

  {
    let state = createInitialCreateBanState();
    state = createBanReducer(state, { type: 'OPEN_ROUTE', route: 'WHO' }).state;
    state = createBanReducer(state, {
      type: 'RECIPIENT_SELECTED',
      recipient: friend('u1'),
    }).state;
    state = createBanReducer(state, {
      type: 'TEXT_CHANGED',
      text: 'ban coffee',
    }).state;
    const result = createBanReducer(state, { type: 'CONTINUE_REQUESTED' });
    assert.equal(result.state.route, 'CONFIRM');
    assert.equal(result.state.draft.text, 'ban coffee');
    pass('6. Valid CONTINUE_REQUESTED moves to CONFIRM');
  }

  {
    let state = createInitialCreateBanState();
    state = createBanReducer(state, { type: 'OPEN_ROUTE', route: 'WHO' }).state;
    state = createBanReducer(state, {
      type: 'RECIPIENT_SELECTED',
      recipient: friend('u1'),
    }).state;
    state = createBanReducer(state, {
      type: 'TEXT_CHANGED',
      text: 'ab',
    }).state;
    state = createBanReducer(state, { type: 'CONTINUE_REQUESTED' }).state;
    // Force confirm with invalid text via local route (presentation bypass not used).
    state = createBanReducer(state, {
      type: 'LOCAL_ROUTE_CHANGED',
      route: 'CONFIRM',
    }).state;
    const result = createBanReducer(state, { type: 'SUBMIT_REQUESTED' });
    assert.equal(result.state.submission.status, 'IDLE');
    assert.ok(!result.effects.some((e) => e.type === 'SUBMIT'));
    pass('7. Invalid SUBMIT_REQUESTED does not call submission port');
  }

  {
    const submits: CreateBanCommand[] = [];
    const { sink } = sinkRecorder();
    const controller = createCreateBanController({
      sink,
      submissionPort: {
        async submit(command) {
          submits.push(command);
          await new Promise((r) => setTimeout(r, 20));
          return { banId: 'ban:ok' };
        },
      },
      recipientsPort: {
        async loadRecipients() {
          return [friend('u1')];
        },
      },
    });
    controller.openRoute({ route: 'WHO' });
    controller.dispatch({
      type: 'RECIPIENT_SELECTED',
      recipient: friend('u1'),
    });
    controller.dispatch({ type: 'TEXT_CHANGED', text: 'no sweets' });
    controller.dispatch({ type: 'CONTINUE_REQUESTED' });
    controller.dispatch({ type: 'SUBMIT_REQUESTED' });
    assert.equal(controller.getState().submission.status, 'SUBMITTING');
    assert.equal(submits.length, 1);
    pass('8. Valid SUBMIT_REQUESTED enters SUBMITTING');

    controller.dispatch({ type: 'SUBMIT_REQUESTED' });
    assert.equal(submits.length, 1);
    pass('9. Duplicate submit while SUBMITTING is ignored');

    await new Promise((r) => setTimeout(r, 40));
    const successState = controller.getState();
    assert.equal(successState.submission.status, 'SUCCEEDED');
    assert.equal(successState.route, 'SUCCESS');
    assert.equal(
      successState.submission.status === 'SUCCEEDED'
        ? successState.submission.result.banId
        : null,
      'ban:ok',
    );
    pass('10. Successful direct submission stores result and reaches SUCCESS');
    controller.dispose();
  }

  {
    const { sink } = sinkRecorder();
    const controller = createCreateBanController({
      sink,
      submissionPort: {
        async submit() {
          throw new Error('boom');
        },
      },
    });
    controller.openRoute({ route: 'WHO' });
    controller.dispatch({
      type: 'RECIPIENT_SELECTED',
      recipient: friend('u1'),
    });
    controller.dispatch({ type: 'TEXT_CHANGED', text: 'no sweets' });
    controller.dispatch({ type: 'CONTINUE_REQUESTED' });
    controller.dispatch({ type: 'SUBMIT_REQUESTED' });
    await new Promise((r) => setTimeout(r, 20));
    const state = controller.getState();
    assert.equal(state.submission.status, 'FAILED');
    assert.equal(state.route, 'CONFIRM');
    assert.equal(state.draft.text, 'no sweets');
    assert.equal(state.draft.recipient?.id, 'u1');
    pass('11. Failed direct submission reaches FAILED and preserves draft');
    controller.dispose();
  }

  {
    const tokens = createSequentialResumeTokenFactory('t');
    const resumeToken = tokens.create();
    const { sink, events } = sinkRecorder();
    const replyCmds: CreateBanCommand[] = [];
    const controller = createCreateBanController({
      sink,
      submissionPort: {
        async submit(command) {
          replyCmds.push(command);
          return { banId: 'ban:reply' } satisfies CreateBanResult;
        },
      },
    });
    controller.openRoute({
      route: 'WHAT',
      context: {
        type: 'REPLY',
        sourceItemId: 'incoming:src1',
        targetUserId: 'opp1',
        resumeToken,
      },
    });
    assert.equal(controller.getState().replyContext?.sourceItemId, 'incoming:src1');
    controller.dispatch({ type: 'TEXT_CHANGED', text: 'reply text' });
    controller.dispatch({ type: 'CONTINUE_REQUESTED' });
    controller.dispatch({ type: 'SUBMIT_REQUESTED' });
    await new Promise((r) => setTimeout(r, 20));
    assert.equal(replyCmds.length, 1);
    assert.equal(replyCmds[0]?.kind, 'REPLY');
    assert.equal(controller.getState().route, 'SUCCESS');
    controller.dispatch({ type: 'SUCCESS_DISMISSED' });
    assert.ok(events.includes('replyCompleted'));
    assert.equal(controller.getState().replyContext, null);
    pass('12. Successful reply submission preserves reply handoff semantics');
    controller.dispose();
  }

  {
    const tokens = createSequentialResumeTokenFactory('t');
    const resumeToken = tokens.create();
    const { sink, events } = sinkRecorder();
    const controller = createCreateBanController({
      sink,
      submissionPort: {
        async submit() {
          throw new Error('reply fail');
        },
      },
    });
    controller.openRoute({
      route: 'WHAT',
      context: {
        type: 'REPLY',
        sourceItemId: 'incoming:src1',
        targetUserId: 'opp1',
        resumeToken,
      },
    });
    controller.dispatch({ type: 'TEXT_CHANGED', text: 'reply text' });
    controller.dispatch({ type: 'CONTINUE_REQUESTED' });
    controller.dispatch({ type: 'SUBMIT_REQUESTED' });
    await new Promise((r) => setTimeout(r, 20));
    assert.equal(controller.getState().submission.status, 'FAILED');
    assert.equal(controller.getState().route, 'CONFIRM');
    assert.ok(!events.includes('replyCompleted'));
    assert.ok(!events.includes('replyCancelled'));
    assert.ok(controller.getState().replyContext);
    pass('13. Failed reply submission does not complete/release reply');
    controller.dispose();
  }

  {
    let state = createInitialCreateBanState();
    state = createBanReducer(state, { type: 'OPEN_ROUTE', route: 'WHO' }).state;
    state = createBanReducer(state, {
      type: 'RECIPIENT_SELECTED',
      recipient: friend('u1'),
    }).state;
    state = createBanReducer(state, {
      type: 'TEXT_CHANGED',
      text: 'keep me',
    }).state;
    state = createBanReducer(state, { type: 'CONTINUE_REQUESTED' }).state;
    state = createBanReducer(state, { type: 'BACK_REQUESTED' }).state;
    assert.equal(state.route, 'WHAT');
    assert.equal(state.draft.text, 'keep me');
    assert.equal(state.draft.recipient?.id, 'u1');
    pass('14. Back from CONFIRM returns to WHAT without losing draft');
  }

  {
    const tokens = createSequentialResumeTokenFactory('t');
    let state = createInitialCreateBanState();
    state = createBanReducer(state, {
      type: 'OPEN_ROUTE',
      route: 'WHAT',
      context: {
        type: 'REPLY',
        sourceItemId: 'incoming:x',
        targetUserId: 'u2',
        resumeToken: tokens.create(),
      },
    }).state;
    assert.ok(state.replyContext);
    state = createBanReducer(state, { type: 'OPEN_ROUTE', route: 'WHO' }).state;
    assert.equal(state.replyContext, null);
    assert.equal(state.draft.text, '');
    assert.equal(state.submission.status, 'IDLE');
    assert.equal(state.route, 'WHO');
    pass('15. Starting a new ordinary compose resets stale reply/success state');
  }

  {
    const { sink } = sinkRecorder();
    const controller = createCreateBanController({
      sink,
      recipientsPort: {
        async loadRecipients() {
          return [friend('u9', 'Nine')];
        },
      },
    });
    controller.dispatch({ type: 'RECIPIENTS_LOAD_REQUESTED' });
    assert.equal(controller.getState().recipients.status, 'LOADING');
    await new Promise((r) => setTimeout(r, 20));
    const ready = controller.getState().recipients;
    assert.equal(ready.status, 'READY');
    assert.equal(ready.status === 'READY' ? ready.recipients[0]?.id : null, 'u9');

    const failing = createCreateBanController({
      sink,
      recipientsPort: {
        async loadRecipients() {
          throw new Error('friends down');
        },
      },
    });
    failing.dispatch({ type: 'RECIPIENTS_LOAD_REQUESTED' });
    await new Promise((r) => setTimeout(r, 20));
    assert.equal(failing.getState().recipients.status, 'FAILED');
    pass('16. Recipient loading success/failure behavior');
    controller.dispose();
    failing.dispose();
  }

  {
    const domainFiles = [
      'create-ban.types.ts',
      'create-ban.validation.ts',
      'create-ban.reducer.ts',
      'create-ban.ports.ts',
      'create-ban.selectors.ts',
      'create-ban.controller.ts',
    ];
    for (const file of domainFiles) {
      const src = readFileSync(
        join(webSrc, 'product-flow/create-ban', file),
        'utf8',
      );
      assert.doesNotMatch(src, /from ['"]react['"]/);
      assert.doesNotMatch(src, /from ['"]react\//);
    }
    pass('17. No CreateBan domain file imports React');
  }

  {
    const surface = readFileSync(
      join(webSrc, 'product-flow/product-flow.surface.tsx'),
      'utf8',
    );
    assert.doesNotMatch(surface, /from ['"]@\/lib\/api['"]/);
    assert.doesNotMatch(surface, /deliverDirectChallenge/);
    assert.doesNotMatch(surface, /\/friends/);
    assert.doesNotMatch(surface, /method:\s*['"]POST['"]/);
    assert.doesNotMatch(surface, /fetch\(/);
    assert.doesNotMatch(surface, /useState\(/);
    assert.match(surface, /TEXT_CHANGED|CONTINUE_REQUESTED|SUBMIT_REQUESTED/);

    const adapters = readFileSync(
      join(webSrc, 'product-flow/create-ban/create-ban.adapters.ts'),
      'utf8',
    );
    assert.match(adapters, /from ['"]@\/lib\/api['"]/);
    assert.match(adapters, /deliverDirectChallenge/);
    assert.match(adapters, /\/friends/);

    const ports = readFileSync(
      join(webSrc, 'product-flow/create-ban/create-ban.ports.ts'),
      'utf8',
    );
    assert.doesNotMatch(ports, /from ['"]@\/lib\/api['"]/);
    assert.doesNotMatch(ports, /deliverDirectChallenge/);

    const product = createProductFlowController({
      sink: sinkRecorder().sink,
    });
    product.openRoute({ route: 'WHO' });
    assert.equal(product.getState().route, 'WHO');
    pass('18. ProductFlowSurface has no direct API/friends imports; domain uses ports');
    product.dispose();
  }

  console.log('\nAll CreateBan tests passed.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
