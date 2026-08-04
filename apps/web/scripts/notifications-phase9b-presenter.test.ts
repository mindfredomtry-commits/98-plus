/**
 * Stage 8 Phase 9B — Presenter + Mapper completeness for Contract V1 enrichment.
 *
 * Run:
 *   npx tsx --tsconfig apps/web/tsconfig.json apps/web/scripts/notifications-phase9b-presenter.test.ts
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  fixtureContractCheck,
  fixtureContractIncoming,
  fixtureContractResult,
  fixtureSnapshot,
} from './fixtures/notifications-contract-v1-fixture';
import {
  presentationFromContractItemV1,
  presentationMapFromItems,
} from '../src/notification-runtime/notifications-mapper';
import { selectNotificationsDomainState } from '../src/notifications/notifications.selectors';
import { presentNotificationsState } from '../src/notifications/presentation/notifications.presenter';
import { createNotificationRuntimeStore } from '../src/notification-runtime/notification-runtime.store';
import {
  executeSubmitResultAckEffect,
  requestResultAckAction,
} from '../src/notification-runtime/notification-runtime.result-ack-action';
import type { RuntimeEffect } from '../src/notification-runtime/notification-runtime.types';

let passed = 0;
function pass(name: string) {
  console.log(`PASS — ${name}`);
  passed += 1;
}

const userId = 'user-a';

async function main() {
  {
    const incoming = fixtureContractIncoming({
      banId: 'b1',
      userId,
      sequence: '1',
      text: 'run 5k',
    });
    const check = fixtureContractCheck({
      banId: 'b2',
      userId,
      sequence: '2',
    });
    const result = fixtureContractResult({
      banId: 'b3',
      userId,
      sequence: '3',
    });

    const snap = fixtureSnapshot({
      revision: '3',
      items: [incoming, check, result],
    });
    assert.equal(snap.items.length, 3);
    assert.deepEqual(
      snap.items.map((i) => i.kind),
      ['INCOMING_BAN', 'CHECK_REQUEST', 'BAN_RESULT'],
    );

    const store = createNotificationRuntimeStore();
    store.dispatch({
      type: 'SYNC_STARTED',
      transitionId: 'boot',
      source: 'bootstrap',
    });
    store.dispatch({
      type: 'APPLY_NOTIFICATIONS_SNAPSHOT_V1',
      transitionId: 'boot',
      snapshot: snap,
      presentationByItemId: presentationMapFromItems(snap.items),
      source: 'bootstrap',
    });

    store.dispatch({
      type: 'ACTIVATE_READY_ITEM_REQUESTED',
      source: 'user',
    });
    {
      const domain = selectNotificationsDomainState(store.getState());
      const view = presentNotificationsState(domain);
      assert.equal(view.phase, 'ITEM');
      if (view.phase === 'ITEM') {
        assert.equal(view.senderLabel, '@sender');
        assert.match(view.text, /run 5k/);
        assert.ok(view.actions.some((a) => a.id === 'ACCEPT'));
      }
      pass('8a. Presenter incoming: sender + text + ACCEPT');
    }

    store.dispatch({ type: 'CLEAR_ACTIVATION_REQUESTED', source: 'user' });
    store.dispatch({
      type: 'SYNC_STARTED',
      transitionId: 'c1',
      source: 'poll',
    });
    store.dispatch({
      type: 'APPLY_NOTIFICATIONS_SNAPSHOT_V1',
      transitionId: 'c1',
      snapshot: fixtureSnapshot({ revision: '4', items: [check] }),
      presentationByItemId: presentationMapFromItems([check]),
      source: 'poll',
    });
    store.dispatch({
      type: 'ACTIVATE_READY_ITEM_REQUESTED',
      source: 'user',
    });
    {
      const domain = selectNotificationsDomainState(store.getState());
      const view = presentNotificationsState(domain);
      assert.equal(view.phase, 'ITEM');
      if (view.phase === 'ITEM') {
        assert.equal(view.senderLabel, '@sender');
        assert.ok(view.actions.some((a) => a.id === 'CONFIRM_YES'));
        assert.ok(view.actions.some((a) => a.id === 'CONFIRM_NO'));
      }
      const mapped = presentationFromContractItemV1(check);
      assert.equal(mapped.kind, 'check');
      if (mapped.kind === 'check') {
        assert.equal(mapped.ban.durationMinutes, 30);
        assert.equal(mapped.ban.sender.username, 'sender');
        assert.equal(mapped.ban.sender.photoUrl, 'https://cdn.example/s.jpg');
      }
      pass('8b. Presenter check: actions + duration/avatar from Contract');
    }

    store.dispatch({ type: 'CLEAR_ACTIVATION_REQUESTED', source: 'user' });
    store.dispatch({
      type: 'SYNC_STARTED',
      transitionId: 'r1',
      source: 'poll',
    });
    store.dispatch({
      type: 'APPLY_NOTIFICATIONS_SNAPSHOT_V1',
      transitionId: 'r1',
      snapshot: fixtureSnapshot({ revision: '5', items: [result] }),
      presentationByItemId: presentationMapFromItems([result]),
      source: 'poll',
    });
    store.dispatch({
      type: 'ACTIVATE_READY_ITEM_REQUESTED',
      source: 'user',
    });
    {
      const domain = selectNotificationsDomainState(store.getState());
      assert.equal(domain.activeItem?.kind, 'result');
      if (domain.activeItem?.kind === 'result') {
        assert.equal(domain.activeItem.headline, 'ПЕРЕБОР');
        assert.equal(domain.activeItem.subline, '−8 ⚡ обоим.');
      }
      const view = presentNotificationsState(domain);
      assert.equal(view.phase, 'ITEM');
      if (view.phase === 'ITEM') {
        assert.match(view.text, /ПЕРЕБОР/);
        assert.match(view.text, /−8/);
        assert.ok(view.actions.some((a) => a.id === 'DISMISS_RESULT'));
      }
      pass('8c. Presenter result: headline/subline from Contract (no invention)');
    }
  }

  {
    const result = fixtureContractResult({
      banId: 'ack1',
      userId,
      sequence: '10',
    });
    const store = createNotificationRuntimeStore();
    store.dispatch({
      type: 'SYNC_STARTED',
      transitionId: 'a0',
      source: 'bootstrap',
    });
    store.dispatch({
      type: 'APPLY_NOTIFICATIONS_SNAPSHOT_V1',
      transitionId: 'a0',
      snapshot: fixtureSnapshot({ revision: '10', items: [result] }),
      presentationByItemId: presentationMapFromItems([result]),
      source: 'bootstrap',
    });
    store.dispatch({
      type: 'ACTIVATE_READY_ITEM_REQUESTED',
      source: 'user',
    });

    const requested = requestResultAckAction(store, { banId: 'ack1' });
    assert.equal(requested.accepted, true);
    assert.equal(store.getState().action.status, 'SUBMITTING');

    const submit = requested.effects.find(
      (e): e is Extract<RuntimeEffect, { type: 'SUBMIT_CARD_ACTION' }> =>
        e.type === 'SUBMIT_CARD_ACTION',
    );
    assert.ok(submit);

    await executeSubmitResultAckEffect(
      store,
      submit,
      async () => ({
        ok: true,
        notifications: {
          type: 'DELTA',
          fromRevision: '10',
          revision: '11',
          operations: [
            {
              type: 'REMOVE_ITEM',
              revision: '11',
              itemId: 'result:ack1',
            },
          ],
        },
      }),
      'token',
      userId,
    );

    assert.equal(store.getState().itemsById['result:ack1'], undefined);
    assert.equal(store.getState().activeItemId, null);
    assert.equal(store.getState().action.status, 'IDLE');
    pass('result_ack applies truthful REMOVE delta (no local invent)');
  }

  {
    const intents = readFileSync(
      join(
        __dirname,
        '../src/notification-runtime/notification-runtime.intents.ts',
      ),
      'utf8',
    );
    assert.match(intents, /requestResultAckAction/);
    const dismissStart = intents.indexOf('async dismissResult');
    const dismissEnd = intents.indexOf('async dismissCurrent');
    assert.ok(dismissStart >= 0 && dismissEnd > dismissStart);
    const dismissBody = intents.slice(dismissStart, dismissEnd);
    assert.match(dismissBody, /requestResultAckAction/);
    assert.doesNotMatch(dismissBody, /ACTIVE_ITEM_CLOSE_REQUESTED/);
    const effects = readFileSync(
      join(
        __dirname,
        '../src/notification-runtime/notification-runtime.effects.ts',
      ),
      'utf8',
    );
    assert.match(effects, /result_ack/);
    assert.match(effects, /\/result\/ack/);
    pass('dismissResult wires result_ack HTTP path');
  }

  {
    const mapper = readFileSync(
      join(__dirname, '../src/notification-runtime/notifications-mapper.ts'),
      'utf8',
    );
    assert.doesNotMatch(mapper, /firstName:\s*'User'|username:\s*'unknown'/i);
    assert.match(mapper, /payload\.sender/);
    assert.match(mapper, /payload\.headline/);
    pass('Mapper uses Contract parties/headline (no stub identity)');
  }

  console.log(`\n${passed} passed\n`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
