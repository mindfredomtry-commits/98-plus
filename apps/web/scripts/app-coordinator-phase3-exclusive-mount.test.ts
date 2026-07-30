/**
 * Phase 3 — exclusive production mount ownership.
 *
 * Run:
 *   npx tsx --tsconfig apps/web/tsconfig.json apps/web/scripts/app-coordinator-phase3-exclusive-mount.test.ts
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { appCoordinatorReducer } from '../src/app-coordinator/app-coordinator.reducer';
import { selectApplicationSurfaceOwner } from '../src/app-coordinator/app-coordinator.selectors';
import {
  createInitialAppCoordinatorState,
  type AppCoordinatorState,
  type ResumeToken,
} from '../src/app-coordinator/app-coordinator.types';

const root = process.cwd();
const read = (relativePath: string) =>
  readFileSync(join(root, 'apps/web/src', relativePath), 'utf8');

const layout = read('app/(miniapp)/layout.tsx');
const page = read('app/(miniapp)/page.tsx');
const appServices = read('app-services/AppServicesProvider.tsx');
const applicationSurface = read('app-coordinator/ApplicationSurface.tsx');
const directHost = read('notification-host/DirectNotificationHost.tsx');

let passed = 0;
function pass(name: string): void {
  passed += 1;
  console.log(`PASS — ${name}`);
}

function count(source: string, pattern: RegExp): number {
  return source.match(pattern)?.length ?? 0;
}

function main(): void {
  {
    assert.match(layout, /<AppHydrationMarker\s*\/>/);
    assert.match(layout, /<AppServicesProvider\s*\/>/);
    assert.doesNotMatch(layout, /\{children\}/);
    assert.doesNotMatch(appServices, /\{children\}|hidden|aria-hidden/);
    assert.doesNotMatch(appServices, /app-services-page-slot/);
    assert.doesNotMatch(page, /HomePage|useAppServices|InstantBanFlow/);
    assert.match(page, /return null/);
    pass('1. route page subtree is not mounted under a hidden compatibility slot');
  }

  {
    assert.equal(count(appServices, /<NotificationRuntimeProvider>/g), 1);
    assert.equal(count(appServices, /<NotificationRuntimeTransport/g), 1);
    assert.equal(count(appServices, /<ApplicationSurface/g), 1);
    assert.equal(count(appServices, /createAppCoordinatorLifecycle\(/g), 1);
    assert.equal(count(appServices, /useAuth\(\)/g), 1);
    assert.equal(count(appServices, /useTelegram\(\)/g), 1);
    assert.doesNotMatch(appServices, /data-surface-owner="BOOT"/);
    assert.match(applicationSurface, /return <BootSurface \/>/);
    pass('2. shared providers, transport, lifecycle, and auth mount once');
  }

  {
    assert.match(
      applicationSurface,
      /if \(coordinatorState\.mode\.type === 'NOTIFICATION'\) \{[\s\S]*?return \([\s\S]*?<DirectNotificationHost/,
    );
    assert.match(applicationSurface, /return \([\s\S]*?<ProductFlowSurface/);
    assert.equal(count(applicationSurface, /<DirectNotificationHost\s/g), 1);
    assert.equal(count(applicationSurface, /<ProductFlowSurface\s/g), 1);
    assert.doesNotMatch(applicationSurface, /hidden|aria-hidden|display:\s*none/);
    pass('3. ApplicationSurface conditionally mounts one domain subtree');
  }

  {
    assert.doesNotMatch(layout + appServices + page, /<ProductFlowSurface/);
    assert.doesNotMatch(layout + appServices + page, /<DirectNotificationHost/);
    pass('4. domain effects cannot mount outside ApplicationSurface');
  }

  {
    assert.doesNotMatch(directHost, /DirectLobbySurface|openBansCta|onStartBan/);
    assert.doesNotMatch(directHost, /ctaVisible|influencePercent/);
    assert.match(directHost, /data-phase="NEUTRAL"/);
    assert.match(directHost, /expectedItemIsDisplayable/);
    pass('5. notification host has no Product Lobby or Product CTA path');
  }

  {
    const notification: AppCoordinatorState = {
      mode: { type: 'NOTIFICATION', itemId: 'ban:expected' },
      resumeDestination: { type: 'PRODUCT', route: 'LOBBY' },
      lastSettledReply: null,
    };
    const result = appCoordinatorReducer(notification, {
      type: 'NOTIFICATION_SURFACE_UNAVAILABLE',
      expectedItemId: 'ban:expected',
      runtimeItemId: null,
      runtimePhase: 'LOBBY',
    });
    assert.equal(result.state, notification);
    assert.equal(
      result.violation?.code,
      'NOTIFICATION_SURFACE_ITEM_UNAVAILABLE',
    );
    assert.deepEqual(result.effects, []);
    pass('6. Runtime/Coordinator skew produces a typed invariant');
  }

  {
    let state = appCoordinatorReducer(createInitialAppCoordinatorState(), {
      type: 'BOOT_COMPLETED',
      currentNotificationItemId: null,
    }).state;
    assert.equal(selectApplicationSurfaceOwner(state), 'PRODUCT_FLOW');
    state = appCoordinatorReducer(state, {
      type: 'RUNTIME_CURRENT_CHANGED',
      itemId: 'ban:1',
    }).state;
    assert.equal(selectApplicationSurfaceOwner(state), 'NOTIFICATION_SYSTEM');
    pass('7. Product to Notification changes the sole mounted owner');
  }

  {
    const notification: AppCoordinatorState = {
      mode: { type: 'NOTIFICATION', itemId: 'ban:1' },
      resumeDestination: { type: 'PRODUCT', route: 'BANS' },
      lastSettledReply: null,
    };
    const state = appCoordinatorReducer(notification, {
      type: 'RUNTIME_QUEUE_DRAINED',
    }).state;
    assert.equal(selectApplicationSurfaceOwner(state), 'PRODUCT_FLOW');
    pass('8. Notification to Product changes the sole mounted owner');
  }

  {
    const token = 'phase3-reply' as ResumeToken;
    const notification: AppCoordinatorState = {
      mode: { type: 'NOTIFICATION', itemId: 'ban:1' },
      resumeDestination: { type: 'PRODUCT', route: 'LOBBY' },
      lastSettledReply: null,
    };
    const result = appCoordinatorReducer(notification, {
      type: 'REPLY_REQUESTED',
      sourceItemId: 'ban:1',
      targetUserId: 'user:2',
      resumeToken: token,
    });
    assert.equal(result.state.mode.type, 'REPLY_COMPOSE');
    assert.equal(selectApplicationSurfaceOwner(result.state), 'PRODUCT_FLOW');
    assert.ok(
      result.effects.some(
        (effect) =>
          effect.target === 'NOTIFICATION_RUNTIME' &&
          effect.command.type === 'SUSPEND',
      ),
    );
    pass('9. reply compose is Product-owned while Runtime is suspended');
  }

  {
    assert.match(directHost, /useEffect\(/);
    assert.match(applicationSurface, /useSyncExternalStore\(/);
    assert.doesNotMatch(appServices, /ProductFlowSurface|DirectIncomingCard|DirectCheckCard|DirectResultCard/);
    pass('10. domain subscriptions remain below exclusive conditional mounts');
  }

  console.log(`\n${passed} passed\n`);
}

main();
