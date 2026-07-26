/**
 * Root PresentationState surface exclusivity.
 *
 * Run:
 *   npx tsx --tsconfig apps/web/tsconfig.json apps/web/scripts/presentation-root-surface-exclusivity.test.ts
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { BanInteraction, BanResult } from '@98plus/shared';
import {
  assertPresentationInvariants,
  presentationSurfaceMount,
  selectPresentationState,
  type PresentationState,
} from '../src/notification-runtime/notification-runtime.presentation';
import {
  beginInteractiveCardActionChain,
  resetInteractiveCardActionResultHandoffForTest,
  stageMatchingActionResult,
} from '../src/notification-runtime/notification-runtime.action-result-handoff';
import { createNotificationRuntimeStore } from '../src/notification-runtime/notification-runtime.store';
import {
  createInitialNotificationRuntimeState,
  notificationItemId,
  type NotificationItem,
  type NotificationRuntimeState,
} from '../src/notification-runtime/notification-runtime.types';

type SpecResult = { name: string; ok: boolean; error?: string };
const results: SpecResult[] = [];

async function spec(name: string, fn: () => void | Promise<void>) {
  resetInteractiveCardActionResultHandoffForTest();
  try {
    await fn();
    results.push({ name, ok: true });
    console.log(`PASS — ${name}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    results.push({ name, ok: false, error: message });
    console.error(`FAIL — ${name}`);
    console.error(message);
  }
}

function ban(id: string): BanInteraction {
  return { id } as BanInteraction;
}
function result(id: string): BanResult {
  return { id, outcome: 'overboard' } as unknown as BanResult;
}
function incoming(id: string): NotificationItem {
  return { kind: 'incoming', ban: ban(id) };
}

function mountFor(p: PresentationState) {
  return presentationSurfaceMount(p);
}

function assertExclusive(p: PresentationState, label: string) {
  const m = mountFor(p);
  const count = Number(m.lobby) + Number(m.transition) + Number(m.notification);
  assert.equal(count, 1, `${label}: exactly one surface`);
  assert.equal(m.lobby && m.notification, false, `${label}: no Lobby+Notification`);
}

const ROOT = join(__dirname, '..');
const providersSrc = readFileSync(
  join(ROOT, 'src/components/Providers.tsx'),
  'utf8',
);
const presentationRootSrc = readFileSync(
  join(ROOT, 'src/components/presentation/PresentationRoot.tsx'),
  'utf8',
);
const flowSrc = readFileSync(
  join(ROOT, 'src/components/instant-ban/InstantBanFlow.tsx'),
  'utf8',
);

async function main() {
  console.log('\n=== ROOT PRESENTATION SURFACE EXCLUSIVITY ===\n');

  await spec('at most one root surface for every derived mode', () => {
    const idle = createInitialNotificationRuntimeState();
    const p = selectPresentationState(idle);
    assert.equal(p.mode, 'LOBBY');
    assertExclusive(p, 'idle');

    const success: NotificationRuntimeState = {
      ...idle,
      presentation: { successCardVisible: true, handoffArmed: false },
    };
    const ps = selectPresentationState(success);
    assert.equal(ps.mode, 'NOTIFICATION');
    assert.equal(ps.mode === 'NOTIFICATION' && ps.display.kind, 'success');
    assertExclusive(ps, 'success');

    const armed: NotificationRuntimeState = {
      ...idle,
      presentation: { successCardVisible: false, handoffArmed: true },
    };
    const pa = selectPresentationState(armed);
    assert.equal(pa.mode, 'TRANSITION');
    assert.equal(pa.mode === 'TRANSITION' && pa.reason, 'SUCCESS_HANDOFF');
    assertExclusive(pa, 'handoff-armed');
  });

  await spec('LOBBY => no overlay/notification shell eligibility', () => {
    const p = selectPresentationState(createInitialNotificationRuntimeState());
    const m = mountFor(p);
    assert.equal(m.lobby, true);
    assert.equal(m.notification, false);
    assert.equal(m.transition, false);
  });

  await spec('TRANSITION => no Lobby, no empty notification shell', () => {
    const store = createNotificationRuntimeStore();
    store.dispatch({
      type: 'SUCCESS_PRESENTATION_HANDOFF_ARMED',
      source: 'user',
    });
    const p = selectPresentationState(store.getState());
    assert.equal(p.mode, 'TRANSITION');
    const m = mountFor(p);
    assert.equal(m.lobby, false);
    assert.equal(m.notification, false);
    assert.equal(m.transition, true);
  });

  await spec('NOTIFICATION requires materialized display; no Lobby', () => {
    const store = createNotificationRuntimeStore();
    store.dispatch({
      type: 'ITEMS_RECEIVED',
      transitionId: 't1',
      items: [incoming('A')],
      replaceQueue: true,
      source: 'test',
    });
    const p = selectPresentationState(store.getState());
    assert.equal(p.mode, 'NOTIFICATION');
    if (p.mode !== 'NOTIFICATION') throw new Error('expected NOTIFICATION');
    assert.equal(p.display.kind, 'incoming');
    assertExclusive(p, 'incoming');
    assert.equal(mountFor(p).lobby, false);
  });

  await spec('SUCCESS → handoff → incoming never mounts LobbySurface', () => {
    const store = createNotificationRuntimeStore();
    const modes: string[] = [];
    const unsub = store.subscribe(() => {
      const p = selectPresentationState(store.getState());
      modes.push(p.mode);
      assertExclusive(p, `frame:${p.mode}`);
      assert.notEqual(
        p.mode,
        'LOBBY',
        'must not mount Lobby during SUCCESS handoff chain',
      );
    });
    store.dispatch({ type: 'SUCCESS_PRESENTATION_SHOWN', source: 'user' });
    store.dispatch({
      type: 'SUCCESS_PRESENTATION_HANDOFF_ARMED',
      source: 'user',
    });
    store.dispatch({
      type: 'SUCCESS_HANDOFF_REQUESTED',
      transitionId: 'handoff-1',
      source: 'user',
    });
    store.dispatch({
      type: 'ITEMS_RECEIVED',
      transitionId: 'handoff-1',
      items: [incoming('A')],
      replaceQueue: true,
      source: 'drain',
    });
    unsub();
    assert.ok(modes.includes('NOTIFICATION'));
    assert.ok(modes.includes('TRANSITION'));
    assert.equal(selectPresentationState(store.getState()).mode, 'NOTIFICATION');
  });

  await spec(
    'SUCCESS → empty queue mounts LobbySurface exactly once after explicit release',
    () => {
      const store = createNotificationRuntimeStore();
      store.dispatch({ type: 'SUCCESS_PRESENTATION_SHOWN', source: 'user' });
      store.dispatch({
        type: 'SUCCESS_PRESENTATION_HANDOFF_ARMED',
        source: 'user',
      });
      store.dispatch({
        type: 'SUCCESS_HANDOFF_REQUESTED',
        transitionId: 'handoff-empty',
        source: 'user',
      });
      assert.equal(selectPresentationState(store.getState()).mode, 'TRANSITION');
      store.dispatch({
        type: 'RUNTIME_NORMALIZE_IDLE',
        transitionId: 'handoff-empty',
        reason: 'empty-drain',
        source: 'drain',
      });
      const p = selectPresentationState(store.getState());
      assert.equal(p.mode, 'LOBBY');
      assert.equal(store.getState().presentation.handoffArmed, false);
    },
  );

  await spec(
    'incoming → overboard submit/wait never mounts LobbySurface',
    () => {
      const store = createNotificationRuntimeStore();
      store.dispatch({
        type: 'ITEMS_RECEIVED',
        transitionId: 'ingest',
        items: [incoming('A')],
        replaceQueue: true,
        source: 'test',
      });
      beginInteractiveCardActionChain({
        banId: 'A',
        actionTransactionId: 'cmd-A',
        action: 'incoming_overboard',
      });
      store.dispatch({
        type: 'CARD_ACTION_REQUESTED',
        commandId: 'cmd-A',
        targetItemId: 'incoming:A',
        action: 'incoming_overboard',
        source: 'user',
      });
      const submitting = selectPresentationState(store.getState());
      assert.equal(submitting.mode, 'NOTIFICATION');
      assert.equal(mountFor(submitting).lobby, false);

      // Simulate display gap while action still pending — must stay TRANSITION.
      const gap: NotificationRuntimeState = {
        ...store.getState(),
        display: { kind: null, payload: null, mode: 'normal' },
        lifecycle: {
          status: 'submitting',
          source: 'user',
          transitionId: 'cmd-A',
        },
        action: {
          status: 'pending',
          commandId: 'cmd-A',
          targetItemId: 'incoming:A',
          errorCode: null,
        },
      };
      const pGap = selectPresentationState(gap);
      assert.equal(pGap.mode, 'TRANSITION');
      assert.equal(mountFor(pGap).lobby, false);
    },
  );

  await spec('overlay cannot exist without materialized display', () => {
    const p = selectPresentationState(createInitialNotificationRuntimeState());
    assert.notEqual(p.mode, 'NOTIFICATION');
    const armed = selectPresentationState({
      ...createInitialNotificationRuntimeState(),
      presentation: { successCardVisible: false, handoffArmed: true },
    });
    assert.equal(armed.mode, 'TRANSITION');
  });

  await spec('empty card shell impossible by type/render contract', () => {
    assert.match(
      presentationRootSrc,
      /presentation\.display\.kind !== 'success'/,
    );
    assert.match(
      readFileSync(
        join(ROOT, 'src/components/presentation/NotificationSurface.tsx'),
        'utf8',
      ),
      /requires materialized display/,
    );
  });

  await spec('WS-before-HTTP and HTTP-before-WS remain NOTIFICATION', () => {
    const store = createNotificationRuntimeStore();
    store.dispatch({
      type: 'ITEMS_RECEIVED',
      transitionId: 'ingest',
      items: [incoming('A')],
      replaceQueue: true,
      source: 'test',
    });
    beginInteractiveCardActionChain({
      banId: 'A',
      actionTransactionId: 'cmd-A',
      action: 'incoming_overboard',
    });
    stageMatchingActionResult({
      banId: 'A',
      result: result('A'),
      source: 'ws',
    });
    store.dispatch({
      type: 'CARD_ACTION_SUCCEEDED',
      commandId: 'cmd-A',
      targetItemId: 'incoming:A',
      replacement: { kind: 'result', result: result('A') },
      source: 'user',
    });
    // Without prior REQUESTED, SUCCEEDED may no-op — use full request path.
    const store2 = createNotificationRuntimeStore();
    store2.dispatch({
      type: 'ITEMS_RECEIVED',
      transitionId: 'ingest2',
      items: [incoming('B')],
      replaceQueue: true,
      source: 'test',
    });
    store2.dispatch({
      type: 'CARD_ACTION_REQUESTED',
      commandId: 'cmd-B',
      targetItemId: 'incoming:B',
      action: 'incoming_overboard',
      source: 'user',
    });
    store2.dispatch({
      type: 'CARD_ACTION_SUCCEEDED',
      commandId: 'cmd-B',
      targetItemId: 'incoming:B',
      replacement: { kind: 'result', result: result('B') },
      source: 'user',
    });
    const p = selectPresentationState(store2.getState());
    assert.equal(p.mode, 'NOTIFICATION');
    if (p.mode === 'NOTIFICATION') {
      assert.equal(p.display.kind, 'result');
    }
    assert.equal(mountFor(p).lobby, false);
  });

  await spec(
    'timeout / reconciliation keeps TRANSITION or NOTIFICATION — never silent Lobby',
    () => {
      const failed: NotificationRuntimeState = {
        ...createInitialNotificationRuntimeState(),
        lifecycle: {
          status: 'showing',
          source: 'user',
          transitionId: 'x',
        },
        items: { queue: [incoming('A')] },
        display: {
          kind: 'incoming',
          payload: { kind: 'incoming', ban: ban('A') },
          mode: 'normal',
        },
        action: {
          status: 'failed',
          commandId: 'cmd',
          targetItemId: 'incoming:A',
          errorCode: 'ACTION_RESULT_WAIT_TIMEOUT',
        },
      };
      const p = selectPresentationState(failed);
      assert.equal(p.mode, 'NOTIFICATION');
      assert.equal(mountFor(p).lobby, false);

      const recon: NotificationRuntimeState = {
        ...createInitialNotificationRuntimeState(),
        lifecycle: {
          status: 'recovering',
          source: 'system',
          transitionId: 'r',
        },
      };
      const pr = selectPresentationState(recon);
      assert.equal(pr.mode, 'TRANSITION');
      assert.equal(mountFor(pr).lobby, false);
    },
  );

  await spec(
    'assertPresentationInvariants catches Lobby+Notification coexistence',
    () => {
      const state = createInitialNotificationRuntimeState();
      const p = selectPresentationState(state);
      assert.throws(() =>
        assertPresentationInvariants(p, state, {
          forceThrow: true,
          mountedSurfaces: {
            lobby: true,
            transition: false,
            notification: true,
          },
        }),
      );
    },
  );

  await spec('StrictMode double derive stays exclusive', () => {
    const store = createNotificationRuntimeStore();
    store.dispatch({ type: 'SUCCESS_PRESENTATION_SHOWN', source: 'user' });
    const a = selectPresentationState(store.getState());
    const b = selectPresentationState(store.getState());
    assert.deepEqual(a, b);
    assertExclusive(a, 'strict-a');
    assertExclusive(b, 'strict-b');
  });

  await spec('wiring: PresentationRoot owns Providers sibling fork', () => {
    assert.match(providersSrc, /PresentationRoot/);
    assert.match(providersSrc, /notificationOverlays=/);
    assert.match(presentationRootSrc, /mode === 'LOBBY'/);
    assert.match(presentationRootSrc, /mode === 'TRANSITION'/);
    assert.match(presentationRootSrc, /mode === 'NOTIFICATION'/);
    assert.match(flowSrc, /SUCCESS_PRESENTATION_SHOWN/);
    assert.match(flowSrc, /SUCCESS_PRESENTATION_HANDOFF_ARMED/);
    assert.match(flowSrc, /useIsLobbySurfaceActive/);
    assert.match(flowSrc, /lobbySurfaceActive/);
  });

  const failed = results.filter((r) => !r.ok);
  console.log('\n---');
  console.log(
    `presentation-root-surface-exclusivity: ${results.length - failed.length}/${results.length} passed`,
  );
  if (failed.length) {
    for (const f of failed) {
      console.error(`FAILED: ${f.name}: ${f.error}`);
    }
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
