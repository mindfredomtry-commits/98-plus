/**
 * Stage 7 Phase 2 — Direct Host deleted; Runtime host-api is readiness-only.
 *
 * Run:
 *   npx tsx --tsconfig apps/web/tsconfig.json apps/web/scripts/direct-notification-host-phase0-architecture.test.ts
 */
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  selectNotificationQueueReadModel,
  selectNotificationViewState,
} from '../src/notification-runtime/notification-runtime.host-api';
import { itemFromIncoming } from '../src/notification-runtime/notification-runtime.ingest';
import { receiveNotificationItem } from '../src/notification-runtime/notification-runtime.ingest';
import { createNotificationRuntimeStore } from '../src/notification-runtime/notification-runtime.store';
import type { BanInteraction } from '@98plus/shared';

let passed = 0;
function pass(name: string) {
  passed += 1;
  console.log(`PASS — ${name}`);
}

const webSrc = join(process.cwd(), 'apps/web/src');

function ban(id: string): BanInteraction {
  return {
    id,
    sender: { id: 's1', firstName: 'S', username: 's' },
    receiver: { id: 'r1', firstName: 'R', username: 'r' },
  } as BanInteraction;
}

{
  const layout = readFileSync(join(webSrc, 'app/(miniapp)/layout.tsx'), 'utf8');
  assert.match(layout, /AppServicesProvider/);
  assert.equal(existsSync(join(webSrc, 'components/Providers.tsx')), false);
  pass('1. layout uses AppServicesProvider; Providers file deleted');
}

{
  const appServices = readFileSync(
    join(webSrc, 'app-services/AppServicesProvider.tsx'),
    'utf8',
  );
  assert.match(appServices, /NotificationRuntimeTransport/);
  assert.match(appServices, /createAppCoordinatorLifecycle/);
  pass('2. AppServices mounts coordinator lifecycle + runtime transport');
}

{
  const page = readFileSync(join(webSrc, 'app/(miniapp)/page.tsx'), 'utf8');
  assert.match(page, /return null/);
  assert.doesNotMatch(page, /DirectNotificationHost|InstantBanFlow/);
  pass('3. page is a non-mounted route stub without legacy hosts');
}

{
  assert.equal(
    existsSync(join(webSrc, 'notification-host/DirectNotificationHost.tsx')),
    false,
  );
  pass('4. DirectNotificationHost deleted');
}

{
  const transport = readFileSync(
    join(webSrc, 'notification-host/NotificationRuntimeTransport.tsx'),
    'utf8',
  );
  assert.doesNotMatch(
    transport,
    /projectRuntime|EMPTY_RUNTIME_LEGACY|legacySink|writeDisplay/,
  );
  pass('5. transport does not use legacy queue bridges');
}

{
  const surface = readFileSync(
    join(webSrc, 'app-coordinator/ApplicationSurface.tsx'),
    'utf8',
  );
  assert.doesNotMatch(surface, /DirectNotificationHost/);
  pass('6. ApplicationSurface does not mount Host');
}

{
  const store = createNotificationRuntimeStore();
  receiveNotificationItem(store, {
    item: itemFromIncoming(ban('A')),
    source: 'websocket',
  });
  const read = selectNotificationQueueReadModel(store.getState());
  assert.equal(read.readyItemId, 'incoming:A');
  const view = selectNotificationViewState(store.getState());
  assert.equal(view.readyHead, null);
  assert.equal(view.readyHeadId, 'incoming:A');
  pass('7. host-api exposes ready id without active card model');
}

{
  const hostApi = readFileSync(
    join(webSrc, 'notification-runtime/notification-runtime.host-api.ts'),
    'utf8',
  );
  assert.doesNotMatch(hostApi, /ctaVisible|overlayVisible|LOBBY|openBans/);
  pass('8. host-api has no Lobby/CTA/overlay policy');
}

{
  assert.equal(
    existsSync(
      join(webSrc, 'notification-runtime/notification-runtime.types.ts'),
    ),
    true,
  );
  assert.equal(
    existsSync(
      join(webSrc, 'notification-runtime/notification-runtime.store.ts'),
    ),
    true,
  );
  pass('9. Phase 0 public runtime API modules exist');
}

console.log(`\n${passed} passed\n`);
