/**
 * Phase 0 — Direct Notification Host architecture / source-scan tests.
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
const providersSrc = readFileSync(
  join(webSrc, 'components/Providers.tsx'),
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
const lobbySrc = readFileSync(
  join(webSrc, 'components/notification/DirectLobbySurface.tsx'),
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
    pass('1. layout uses AppServicesProvider, not Providers');
  }

  // 2. AppServices mounts DirectNotificationHost + transport
  {
    assert.match(appServicesSrc, /DirectNotificationHost/);
    assert.match(appServicesSrc, /NotificationRuntimeTransport/);
    assert.match(appServicesSrc, /NotificationRuntimeProvider/);
    assert.doesNotMatch(appServicesSrc, /from ['"]@\/components\/Providers['"]/);
    pass('2. AppServices mounts Direct host + runtime transport');
  }

  // 3. Page does not import legacy host / InstantBanFlow notification path
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
    assert.match(pageSrc, /useAppServices/);
    pass('3. page does not import legacy notification host');
  }

  // 4. DirectNotificationHost has no forbidden compatibility symbols
  {
    assertNoForbidden('DirectNotificationHost', directHostSrc);
    assert.doesNotMatch(directHostSrc, /useApp\(/);
    assert.doesNotMatch(directHostSrc, /from ['"]@\/components\/Providers['"]/);
    pass('4. DirectNotificationHost has no legacy compatibility symbols');
  }

  // 5. Direct UI cards do not write queue/display / useApp
  {
    for (const [label, src] of [
      ['DirectIncomingCard', incomingCardSrc],
      ['DirectCheckCard', checkCardSrc],
      ['DirectResultCard', resultCardSrc],
      ['DirectLobbySurface', lobbySrc],
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

  // 7. Legacy Providers throws when invoked
  {
    assert.match(providersSrc, /LEGACY_NOTIFICATION_HOST_IS_DISABLED/);
    assert.match(
      providersSrc,
      /export function Providers[\s\S]*?throw new Error\('LEGACY_NOTIFICATION_HOST_IS_DISABLED'\)/,
    );
    // Dynamic import of the live module would throw on call; source-scan is enough.
    pass('7. Providers entry throws LEGACY_NOTIFICATION_HOST_IS_DISABLED');
  }

  // 8. View-state selector works without legacy paint
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
    const view = selectNotificationViewState(store.getState(), {
      lobbyBootIntroPrimed: true,
      hostBlocksCta: false,
    });
    assert.equal(view.phase, 'INCOMING');
    assert.equal(view.currentCard?.kind, 'incoming');
    assert.equal(view.ctaVisible, false);
    assert.equal(view.queueLength >= 1, true);
    pass('8. selectNotificationViewState maps incoming without legacy paint');
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
