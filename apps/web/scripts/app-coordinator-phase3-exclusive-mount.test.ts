/**
 * Phase 3 — exclusive production mount ownership (Stage 7 Phase 2).
 *
 * Run:
 *   npx tsx --tsconfig apps/web/tsconfig.json apps/web/scripts/app-coordinator-phase3-exclusive-mount.test.ts
 */
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { selectApplicationSurfaceOwner } from '../src/app-coordinator/app-coordinator.selectors';
import {
  createInitialAppCoordinatorState,
  type AppCoordinatorState,
} from '../src/app-coordinator/app-coordinator.types';

const root = process.cwd();
const read = (relativePath: string) =>
  readFileSync(join(root, 'apps/web/src', relativePath), 'utf8');

const layout = read('app/(miniapp)/layout.tsx');
const page = read('app/(miniapp)/page.tsx');
const appServices = read('app-services/AppServicesProvider.tsx');
const applicationSurface = read('app-coordinator/ApplicationSurface.tsx');

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
    assert.match(applicationSurface, /return <BootSurface \/>/);
    pass('2. shared providers, transport, lifecycle, and auth mount once');
  }

  {
    assert.match(applicationSurface, /return \([\s\S]*?<ProductFlowSurface/);
    assert.equal(count(applicationSurface, /<ProductFlowSurface\s/g), 1);
    assert.doesNotMatch(applicationSurface, /DirectNotificationHost/);
    assert.doesNotMatch(applicationSurface, /hidden|aria-hidden|display:\s*none/);
    pass('3. ApplicationSurface mounts Product only (no Notification Host)');
  }

  {
    assert.doesNotMatch(layout + appServices + page, /<ProductFlowSurface/);
    assert.doesNotMatch(layout + appServices + page, /DirectNotificationHost/);
    pass('4. domain effects cannot mount outside ApplicationSurface');
  }

  {
    assert.equal(
      existsSync(
        join(root, 'apps/web/src/notification-host/DirectNotificationHost.tsx'),
      ),
      false,
    );
    pass('5. DirectNotificationHost production file deleted');
  }

  {
    const types = read('app-coordinator/app-coordinator.types.ts');
    assert.doesNotMatch(
      types,
      /RUNTIME_CURRENT_CHANGED|RUNTIME_QUEUE_DRAINED|NOTIFICATION_SURFACE_UNAVAILABLE/,
    );
    pass('6. Coordinator has no Runtime activation / surface-unavailable events');
  }

  {
    let state: AppCoordinatorState = createInitialAppCoordinatorState();
    assert.equal(selectApplicationSurfaceOwner(state), 'BOOT');
    state = {
      mode: { type: 'PRODUCT', route: 'LOBBY' },
      resumeDestination: { type: 'PRODUCT', route: 'LOBBY' },
      lastSettledReply: null,
    };
    assert.equal(selectApplicationSurfaceOwner(state), 'PRODUCT_FLOW');
    pass('7. Boot and Product remain exclusive surface owners');
  }

  {
    assert.match(applicationSurface, /useSyncExternalStore\(/);
    assert.doesNotMatch(
      appServices,
      /ProductFlowSurface|DirectIncomingCard|DirectCheckCard|DirectResultCard/,
    );
    pass('8. domain subscriptions remain below exclusive conditional mounts');
  }

  console.log(`\n${passed} passed\n`);
}

main();
