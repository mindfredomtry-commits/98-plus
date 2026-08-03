/**
 * Stage 8 Phase 9 — frontend Mapper / Transport / revision gap proofs.
 *
 * Run:
 *   npx tsx --tsconfig apps/web/tsconfig.json apps/web/scripts/notifications-phase9-mapper.test.ts
 */
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  reconcileNotificationsDeltaV1,
} from '../src/notification-runtime/notification-runtime.reconcile';
import { createInitialNotificationsReconcileStateV1 } from '../src/notification-runtime/notification-runtime.sync-types';
import {
  presentationFromContractItemV1,
  presentationMapFromItems,
} from '../src/notification-runtime/notifications-mapper';
import { fixtureContractIncoming } from './fixtures/notifications-contract-v1-fixture';
import type { NotificationsDeltaV1 } from '@98plus/shared';
import { createNotificationRuntimeStore } from '../src/notification-runtime/notification-runtime.store';

const webSrc = join(__dirname, '../src');
let passed = 0;
function pass(name: string) {
  console.log(`PASS — ${name}`);
  passed += 1;
}

{
  let state = createInitialNotificationsReconcileStateV1();
  state = { ...state, revision: '100', syncStatus: 'READY' };
  const delta: NotificationsDeltaV1 = {
    type: 'DELTA',
    fromRevision: '100',
    revision: '102',
    operations: [
      {
        type: 'UPSERT_ITEM',
        revision: '102',
        item: fixtureContractIncoming({
          banId: 'a',
          userId: 'A',
          sequence: '102',
        }),
      },
    ],
  };
  const result = reconcileNotificationsDeltaV1(state, delta);
  assert.equal(result.type, 'APPLIED');
  assert.equal(result.state.revision, '102');
  pass('G. cross-user gap 100→102 accepted (no false REVISION_GAP)');
}

{
  const item = fixtureContractIncoming({
    banId: '1',
    userId: 'u',
    sequence: '1',
  });
  const pres = presentationFromContractItemV1(item);
  assert.equal(pres.kind, 'incoming');
  if (pres.kind === 'incoming') {
    assert.equal(pres.ban.id, '1');
    assert.equal(pres.ban.text.length > 0, true);
  }
  const map = presentationMapFromItems([item]);
  assert.ok(map['incoming:1']);
  pass('mapper presentation from Contract V1 payload');
}

{
  const store = createNotificationRuntimeStore();
  store.dispatch({
    type: 'SYNC_STARTED',
    transitionId: 't1',
    source: 'bootstrap',
  });
  store.dispatch({
    type: 'APPLY_NOTIFICATIONS_SNAPSHOT_V1',
    transitionId: 't1',
    snapshot: {
      type: 'SNAPSHOT',
      revision: '0',
      items: [],
    },
    presentationByItemId: {},
    source: 'bootstrap',
  });
  assert.equal(store.getState().syncStatus, 'READY');
  assert.equal(store.getState().revision, '0');
  assert.deepEqual(Object.keys(store.getState().itemsById), []);
  pass('A. empty snapshot → READY; Notifications empty');
}

{
  const transport = readFileSync(
    join(webSrc, 'notification-host/NotificationRuntimeTransport.tsx'),
    'utf8',
  );
  assert.match(transport, /runNotificationsSyncViaMapper/);
  assert.match(transport, /isNotificationsDeltaV1Event/);
  assert.doesNotMatch(transport, /pending-all|\/bans\/session/);
  assert.doesNotMatch(transport, /receiveNotificationItem/);
  pass('transport cutover source guards');
}

{
  const files = readdirSync(join(webSrc, 'notification-runtime'));
  assert.ok(files.includes('notifications-mapper.ts'));
  assert.ok(!files.includes('notification-runtime.temporary-adapter.ts'));
  const ingest = readFileSync(
    join(webSrc, 'notification-runtime/notification-runtime.ingest.ts'),
    'utf8',
  );
  assert.doesNotMatch(ingest, /APPLY_NOTIFICATIONS_/);
  pass('one mapper; no temporary adapter; ingest blocked');
}

{
  const effects = readFileSync(
    join(webSrc, 'notification-runtime/notification-runtime.effects.ts'),
    'utf8',
  );
  assert.match(effects, /notifications/);
  const check = readFileSync(
    join(webSrc, 'notification-runtime/notification-runtime.check-action.ts'),
    'utf8',
  );
  assert.match(check, /applyNotificationsDeltaToStore/);
  const overboard = readFileSync(
    join(webSrc, 'notification-runtime/notification-runtime.overboard-action.ts'),
    'utf8',
  );
  assert.match(overboard, /applyNotificationsDeltaToStore/);
  pass('action paths apply Contract V1 notifications delta');
}

console.log(`\n${passed} passed\n`);
