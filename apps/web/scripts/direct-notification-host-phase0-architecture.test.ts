/**
 * Phase 0 — Direct Notification Host architecture / source-scan tests.
 * Updated for Phase 4: legacy Providers / DirectLobbySurface deleted.
 *
 * Run:
 *   npx tsx --tsconfig apps/web/tsconfig.json apps/web/scripts/direct-notification-host-phase0-architecture.test.ts
 */
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  selectNotificationViewState,
} from '../src/notification-runtime/notification-runtime.host-api';
import { createNotificationRuntimeStore } from '../src/notification-runtime/notification-runtime.store';
import { receiveNotificationItem } from '../src/notification-runtime/notification-runtime.ingest';
import type { BanInteraction } from '@98plus/shared';

let passed = 0;
function pass(name: string): void {
  passed += 1;
  console.log(`PASS — ${name}`);
}

const webSrc = join(process.cwd(), 'apps/web/src');
const layoutSrc = readFileSync(
  join(webSrc, 'app/(miniapp)/layout.tsx'),
  'utf8',
);
const pageSrc = readFileSync(join(webSrc, 'app/(miniapp)/page.tsx'), 'utf8');
const directHostSrc = readFileSync(
  join(webSrc, 'notification-host/DirectNotificationHost.tsx'),
  'utf8',
);
const appServicesSrc = readFileSync(
  join(webSrc, 'app-services/AppServicesProvider.tsx'),
  'utf8',
);
const incomingCardSrc = readFileSync(
  join(webSrc, 'components/notification/DirectIncomingCard.tsx'),
  'utf8',
);
const checkCardSrc = readFileSync(
  join(webSrc, 'components/notification/DirectCheckCard.tsx'),
  'utf8',
);
const resultCardSrc = readFileSync(
  join(webSrc, 'components/notification/DirectResultCard.tsx'),
  'utf8',
);
const transportSrc = readFileSync(
  join(webSrc, 'notification-host/NotificationRuntimeTransport.tsx'),
  'utf8',
);

const FORBIDDEN = [
  'overlayQueueRef',
  'pendingStartupInteractionsRef',
  'applyOverlayQueue',
  'commitOverlayQueueViaApply',
  'ownerShadow',
  'selectRuntimePaintSnapshot',
  'projectRuntimeQueueToLegacy',
  'QUEUE_APPLIED',
  'PENDING_QUEUE_APPLIED',
  'writeOwnerDisplay',
];

function assertNoForbidden(label: string, src: string): void {
  for (const sym of FORBIDDEN) {
    assert.doesNotMatch(
      src,
      new RegExp(sym),
      `${label} must not reference ${sym}`,
    );
  }
}

async function main() {
  // 1. Active layout imports Direct path, not Providers
  {
    assert.match(layoutSrc, /AppServicesProvider/);
    assert.doesNotMatch(layoutSrc, /from ['"]@\/components\/Providers['"]/);
    assert.doesNotMatch(layoutSrc, /<Providers[\s>]/);
    assert.equal(existsSync(join(webSrc, 'components/Providers.tsx')), false);
    pass('1. layout uses AppServicesProvider; Providers file deleted');
  }

  // 2. AppServices owns Runtime provider/transport; ApplicationSurface mounts Direct host under Coordinator
  {
    assert.match(appServicesSrc, /NotificationRuntimeTransport/);
    assert.match(appServicesSrc, /NotificationRuntimeProvider/);
    assert.match(appServicesSrc, /createAppCoordinatorLifecycle|ApplicationSurface/);
    assert.doesNotMatch(appServicesSrc, /from ['"]@\/components\/Providers['"]/);
    assert.doesNotMatch(appServicesSrc, /sendFlowRequested/);
    assert.doesNotMatch(appServicesSrc, /bansSectionRequested/);
    pass('2. AppServices mounts coordinator lifecycle + runtime transport');
  }

  // 3. Page is a non-mounted route stub without legacy host imports
  {
    assert.doesNotMatch(pageSrc, /from ['"]@\/components\/Providers['"]/);
    assert.doesNotMatch(
      pageSrc,
      /from ['"]@\/components\/instant-ban\/InstantBanFlow['"]/,
    );
    assert.doesNotMatch(pageSrc, /from ['"]@\/components\/GlobalOverlayHost['"]/);
    assert.doesNotMatch(
      pageSrc,
      /from ['"]@\/components\/NotificationQueueShell['"]/,
    );
    assert.doesNotMatch(pageSrc, /HomePage|useAppServices|InstantBanFlow/);
    assert.match(pageSrc, /return null/);
    pass('3. page is a non-mounted route stub without legacy hosts');
  }

  // 4. DirectNotificationHost has no forbidden compatibility symbols
  {
    assertNoForbidden('DirectNotificationHost', directHostSrc);
    assert.doesNotMatch(directHostSrc, /useApp\(/);
    assert.doesNotMatch(directHostSrc, /from ['"]@\/components\/Providers['"]/);
    assert.doesNotMatch(directHostSrc, /DirectLobbySurface/);
    assert.equal(
      existsSync(join(webSrc, 'components/notification/DirectLobbySurface.tsx')),
      false,
    );
    pass('4. DirectNotificationHost has no legacy compatibility symbols');
  }

  // 5. Direct UI cards do not write queue/display / useApp
  {
    for (const [label, src] of [
      ['DirectIncomingCard', incomingCardSrc],
      ['DirectCheckCard', checkCardSrc],
      ['DirectResultCard', resultCardSrc],
    ] as const) {
      assert.doesNotMatch(src, /useApp\(/);
      assert.doesNotMatch(src, /from ['"]@\/components\/Providers['"]/);
      assert.doesNotMatch(src, /syncRuntimeQueue/);
      assert.doesNotMatch(src, /dispatch\(/);
      assertNoForbidden(label, src);
    }
    pass('5. Direct UI cards are prop-driven (no queue/display writes)');
  }

  // 6. Transport writes only via runtime modules
  {
    assert.match(transportSrc, /requestBootstrap|completeBootstrap/);
    assert.match(transportSrc, /receiveNotificationItem|ingestPendingSnapshot/);
    assert.doesNotMatch(transportSrc, /overlayQueueRef/);
    assert.doesNotMatch(transportSrc, /applyOverlayQueue/);
    assert.doesNotMatch(transportSrc, /from ['"]@\/components\/Providers['"]/);
    pass('6. transport does not use legacy queue bridges');
  }

  // 7. Legacy ownership graph files are gone
  {
    assert.equal(existsSync(join(webSrc, 'components/Providers.tsx')), false);
    assert.equal(
      existsSync(join(webSrc, 'components/instant-ban/InstantBanFlow.tsx')),
      false,
    );
    assert.equal(
      existsSync(join(webSrc, 'components/GlobalOverlayHost.tsx')),
      false,
    );
    assert.equal(
      existsSync(join(webSrc, 'components/NotificationQueueShell.tsx')),
      false,
    );
    pass('7. legacy ownership graph files are deleted');
  }

  // 8. View-state selector exposes ready head without activation / Lobby fields
  {
    const store = createNotificationRuntimeStore();
    const ban = {
      id: 'A',
      sender: { id: 's1', firstName: 'S', username: 's' },
      receiver: { id: 'r1', firstName: 'R', username: 'r' },
    } as BanInteraction;
    receiveNotificationItem(store, {
      item: { kind: 'incoming', ban },
      source: 'test',
    });
    const view = selectNotificationViewState(store.getState());
    assert.equal(view.phase, 'READY');
    assert.equal(view.readyHead?.kind, 'incoming');
    assert.equal(view.readyHeadId, 'incoming:A');
    assert.equal(view.queueLength >= 1, true);
    assert.equal('ctaVisible' in view, false);
    assert.equal('currentCard' in view, false);
    pass('8. selectNotificationViewState maps ready head without Lobby/CTA');
  }

  // 8b. Host has no expectedItem veto
  {
    assert.doesNotMatch(directHostSrc, /expectedItemIsDisplayable/);
    assert.doesNotMatch(directHostSrc, /onSurfaceUnavailable/);
    assert.doesNotMatch(directHostSrc, /onReply/);
    assert.doesNotMatch(directHostSrc, /onOpenBans/);
    assert.match(directHostSrc, /activation unavailable/i);
    pass('8b. DirectNotificationHost has no identity veto or Product handoffs');
  }

  // 9. Host API / ingest / intents modules exist
  {
    assert.equal(
      existsSync(join(webSrc, 'notification-runtime/notification-runtime.host-api.ts')),
      true,
    );
    assert.equal(
      existsSync(join(webSrc, 'notification-runtime/notification-runtime.intents.ts')),
      true,
    );
    assert.equal(
      existsSync(join(webSrc, 'notification-runtime/notification-runtime.effects.ts')),
      true,
    );
    assert.equal(
      existsSync(join(webSrc, 'notification-runtime/notification-runtime.ingest.ts')),
      true,
    );
    pass('9. Phase 0 public runtime API modules exist');
  }

  console.log(`\n${passed} passed\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
