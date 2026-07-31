/**
 * Phase 4 — dormant legacy ownership graph deletion guards.
 *
 * Run:
 *   npx tsx --tsconfig apps/web/tsconfig.json apps/web/scripts/app-coordinator-phase4-legacy-deletion.test.ts
 */
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const webSrc = join(root, 'apps/web/src');

let passed = 0;
function pass(name: string): void {
  passed += 1;
  console.log(`PASS — ${name}`);
}

function read(rel: string): string {
  return readFileSync(join(webSrc, rel), 'utf8');
}

function collectSources(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '.next') continue;
      collectSources(full, out);
      continue;
    }
    if (/\.(ts|tsx|js|jsx)$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

const DELETED_FILES = [
  'components/Providers.tsx',
  'components/instant-ban/InstantBanFlow.tsx',
  'components/GlobalOverlayHost.tsx',
  'components/NotificationQueueShell.tsx',
  'components/notification/DirectLobbySurface.tsx',
  'components/IncomingBanOverlay.tsx',
  'components/CheckOverlay.tsx',
  'components/ResultOverlay.tsx',
  'components/DirectOverboardResultLayer.tsx',
  'components/HomeArena.tsx',
  'components/BootScene.tsx',
  'components/EnergyPopupStack.tsx',
  'components/RouteOverlayBootPriorityMarker.tsx',
  'components/LobbyScreen.tsx',
  'components/monetization/MonetizationSection.tsx',
] as const;

const FORBIDDEN_IMPORTS = [
  /from ['"]@\/components\/Providers['"]/,
  /from ['"]@\/components\/instant-ban\/InstantBanFlow['"]/,
  /from ['"]@\/components\/GlobalOverlayHost['"]/,
  /from ['"]@\/components\/NotificationQueueShell['"]/,
  /from ['"]@\/components\/notification\/DirectLobbySurface['"]/,
  /from ['"]@\/components\/IncomingBanOverlay['"]/,
  /from ['"]@\/components\/CheckOverlay['"]/,
  /from ['"]@\/components\/ResultOverlay['"]/,
  /from ['"]@\/components\/DirectOverboardResultLayer['"]/,
  /from ['"]@\/components\/HomeArena['"]/,
  /from ['"]@\/components\/BootScene['"]/,
  /<Providers[\s/>]/,
  /<InstantBanFlow[\s/>]/,
  /<GlobalOverlayHost[\s/>]/,
  /<NotificationQueueShell[\s/>]/,
  /<DirectLobbySurface[\s/>]/,
  /app-services-page-slot/,
];

function main(): void {
  {
    for (const rel of DELETED_FILES) {
      assert.equal(existsSync(join(webSrc, rel)), false, rel);
    }
    pass('1. deleted legacy ownership files are absent');
  }

  {
    const layout = read('app/(miniapp)/layout.tsx');
    const page = read('app/(miniapp)/page.tsx');
    const appServices = read('app-services/AppServicesProvider.tsx');
    assert.match(layout, /<AppHydrationMarker\s*\/>/);
    assert.match(layout, /<AppServicesProvider\s*\/>/);
    assert.doesNotMatch(layout, /\{children\}/);
    assert.doesNotMatch(page, /HomePage|useAppServices/);
    assert.match(page, /return null/);
    assert.doesNotMatch(appServices, /hidden|aria-hidden|app-services-page-slot|\{children\}/);
    pass('2. no HomePage mount or hidden route/page slot');
  }

  {
    const host = read('notification-host/DirectNotificationHost.tsx');
    const surface = read('app-coordinator/ApplicationSurface.tsx');
    assert.doesNotMatch(host, /DirectLobbySurface|onStartBan|openBansCta|ctaVisible/);
    assert.match(host, /activation unavailable/i);
    assert.match(host, /data-phase=\{view\.phase\}/);
    assert.doesNotMatch(surface, /NOTIFICATION_SURFACE_UNAVAILABLE/);
    assert.doesNotMatch(host + surface, /product-lobby-cta|Запретить/);
    pass('3. Host is diagnostic-only; no Lobby CTA / identity veto');
  }

  {
    const appServices = read('app-services/AppServicesProvider.tsx');
    assert.equal((appServices.match(/<NotificationRuntimeProvider>/g) ?? []).length, 1);
    assert.equal((appServices.match(/createAppCoordinatorLifecycle\(/g) ?? []).length, 1);
    assert.equal((appServices.match(/<NotificationRuntimeTransport/g) ?? []).length, 1);
    assert.equal((appServices.match(/<ApplicationSurface/g) ?? []).length, 1);
    assert.equal(
      (read('app/(miniapp)/layout.tsx').match(/<AppHydrationMarker\s*\/>/g) ?? [])
        .length,
      1,
    );
    pass('4. shared providers and lifecycles mount exactly once');
  }

  {
    const sources = collectSources(webSrc);
    for (const file of sources) {
      const src = readFileSync(file, 'utf8');
      for (const pattern of FORBIDDEN_IMPORTS) {
        assert.doesNotMatch(
          src,
          pattern,
          `${file} must not reintroduce ${pattern}`,
        );
      }
      assert.doesNotMatch(src, /import\(['"]@\/components\/Providers['"]\)/);
      assert.doesNotMatch(
        src,
        /import\(['"]@\/components\/instant-ban\/InstantBanFlow['"]\)/,
      );
      assert.doesNotMatch(src, /lazy\(\s*\(\)\s*=>\s*import\(['"][^'"]*Providers/);
      assert.doesNotMatch(
        src,
        /lazy\(\s*\(\)\s*=>\s*import\(['"][^'"]*InstantBanFlow/,
      );
    }
    pass('5. no production import, JSX mount, dynamic import, or lazy of deleted graph');
  }

  {
    assert.equal(
      existsSync(join(webSrc, 'components/instant-ban/WhoScreen.tsx')),
      true,
    );
    assert.equal(
      existsSync(join(webSrc, 'components/instant-ban/SuccessScreen.tsx')),
      true,
    );
    assert.equal(
      existsSync(join(webSrc, 'components/instant-ban/SuccessBanCardBody.tsx')),
      true,
    );
    assert.equal(
      existsSync(join(webSrc, 'components/instant-ban/instant-ban.css')),
      true,
    );
    const surface = read('product-flow/product-flow.surface.tsx');
    assert.doesNotMatch(surface, /instant-ban\.css/);
    assert.doesNotMatch(surface, /WhoOverlay|from ['"]@\/components\/instant-ban\//);
    assert.match(surface, /ProductWhoScreen|presentation\/WhoScreen/);
    assert.match(surface, /ProductSuccessScreen|presentation\/SuccessScreen/);
    pass('6. legacy Who/Success files retained on disk; Product uses new presentation');
  }

  console.log(`\n${passed} passed\n`);
}

main();
