/**
 * Regression: the miniapp route must mount the canonical Coordinator tree and
 * dismiss the pre-hydration shell after the first client commit.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const src = join(process.cwd(), 'apps/web/src');
const read = (path: string) => readFileSync(join(src, path), 'utf8');

const rootLayout = read('app/layout.tsx');
const miniappLayout = read('app/(miniapp)/layout.tsx');
const page = read('app/(miniapp)/page.tsx');
const marker = read('components/AppHydrationMarker.tsx');
const prehydrateStyle = read('components/LobbyOrbPrehydrateStyle.tsx');
const services = read('app-services/AppServicesProvider.tsx');
const surface = read('app-coordinator/ApplicationSurface.tsx');

let passed = 0;
function pass(name: string): void {
  passed += 1;
  console.log(`PASS — ${name}`);
}

{
  assert.match(rootLayout, /\{children\}/);
  assert.match(miniappLayout, /<AppHydrationMarker\s*\/>/);
  assert.match(miniappLayout, /<AppServicesProvider\s*\/>/);
  assert.doesNotMatch(miniappLayout, /\{children\}/);
  assert.match(page, /return null/);
  pass('1. route reaches canonical root through MiniAppLayout independently of page');
}

{
  assert.equal(
    (miniappLayout.match(/<AppServicesProvider\s*\/>/g) ?? []).length,
    1,
  );
  assert.equal(
    (services.match(/<AppCoordinatorComposition/g) ?? []).length,
    1,
  );
  assert.equal(
    (services.match(/<NotificationRuntimeProvider>/g) ?? []).length,
    1,
  );
  assert.equal((services.match(/<ApplicationSurface/g) ?? []).length, 1);
  pass('2. exactly one canonical Coordinator composition is mounted');
}

{
  assert.match(marker, /dataset\.appHydrated = 'true'/);
  assert.match(
    prehydrateStyle,
    /html\[data-app-hydrated\] #lobby-boot-shell-early[\s\S]*?display: none !important/,
  );
  pass('3. hydration dismisses the fixed pre-hydration shell');
}

{
  assert.match(surface, /return <BootSurface \/>/);
  assert.match(surface, /data-surface-owner="BOOT"/);
  assert.doesNotMatch(surface, /return null/);
  pass('4. BOOT renders BootSurface rather than an empty tree');
}

{
  assert.match(surface, /data-surface-owner="PRODUCT_FLOW"/);
  assert.match(surface, /<ProductFlowSurface/);
  pass('5. PRODUCT_FLOW renders ProductFlowSurface');
}

{
  assert.match(surface, /data-surface-owner="NOTIFICATION_SYSTEM"/);
  assert.match(surface, /<DirectNotificationHost/);
  pass('6. NOTIFICATION_SYSTEM renders DirectNotificationHost');
}

{
  const productionEntry = rootLayout + miniappLayout + page + services + surface;
  assert.doesNotMatch(
    productionEntry,
    /HomePage|Providers|InstantBanFlow|DirectLobbySurface|GlobalOverlayHost|NotificationQueueShell/,
  );
  assert.doesNotMatch(productionEntry, /hidden page|app-services-page-slot/);
  pass('7. no legacy or hidden ownership path was restored');
}

console.log(`\n${passed} passed\n`);
