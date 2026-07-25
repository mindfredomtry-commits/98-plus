/**
 * Vertical V1 — Lobby claim single-owner regressions.
 *
 * Production: ownerQueueLen=5, runtimeQueueLen=0, legacyQueueLen=0,
 * queueLobbyGuardActive=true → InstantBanFlow orb-only shell.
 *
 * Fix: product chrome / screen claim from runtime selectors only.
 *
 * Run:
 *   npx tsx --tsconfig apps/web/tsconfig.json apps/web/scripts/notification-runtime-lobby-claim-single-owner.test.ts
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { decideLobbyClaimFromRuntime } from '../src/lib/lobby-claim-from-runtime';
import {
  selectInteractiveLobbyChromeMayShow,
  selectLobbyMayShow,
  selectOverlayVisible,
} from '../src/notification-runtime/notification-runtime.selectors';
import {
  createInitialNotificationRuntimeState,
  type NotificationRuntimeState,
} from '../src/notification-runtime/notification-runtime.types';

type SpecResult = { name: string; ok: boolean; error?: string };
const results: SpecResult[] = [];

async function spec(name: string, fn: () => void | Promise<void>) {
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

function withLifecycle(
  status: NotificationRuntimeState['lifecycle']['status'],
): NotificationRuntimeState {
  const base = createInitialNotificationRuntimeState();
  return {
    ...base,
    lifecycle: { ...base.lifecycle, status, transitionId: `t:${status}` },
  };
}

function assertFullLobbyChrome(state: NotificationRuntimeState) {
  const claim = decideLobbyClaimFromRuntime(state);
  assert.equal(claim.lobbyMayShow, true, 'lobbyMayShow');
  assert.equal(claim.chromeMayShow, true, 'chromeMayShow');
  assert.equal(claim.claimsNotificationScreen, false, 'claimsNotificationScreen');
  assert.equal(selectLobbyMayShow(state), true);
  assert.equal(selectInteractiveLobbyChromeMayShow(state), true);
  assert.equal(selectOverlayVisible(state), false);
  // Product chrome expression: !claims && chromeMayShow → full chrome, not orb-only.
  const lobbyChromeHiddenByRuntime = !claim.chromeMayShow;
  assert.equal(lobbyChromeHiddenByRuntime, false, 'chrome must not be hidden');
  assert.equal(
    claim.claimsNotificationScreen && !claim.chromeMayShow,
    false,
    'orb-only shell must not occur when idle+empty',
  );
}

function assertChromeHidden(state: NotificationRuntimeState) {
  const claim = decideLobbyClaimFromRuntime(state);
  assert.equal(claim.claimsNotificationScreen, true);
  assert.equal(claim.chromeMayShow, false);
  assert.equal(claim.lobbyMayShow, false);
  assert.equal(selectOverlayVisible(state), true);
  assert.equal(!claim.chromeMayShow, true, 'chrome hidden');
}

async function main() {
  console.log('\n=== V1 LOBBY CLAIM SINGLE-OWNER ===\n');

  await spec(
    'A: runtime idle + empty queue + stale owner irrelevant → full Lobby chrome',
    () => {
      const state = withLifecycle('idle');
      // Stale owner queue/result cannot be passed into decideLobbyClaimFromRuntime —
      // that is the single-owner guarantee under test.
      assertFullLobbyChrome(state);
      const claim = decideLobbyClaimFromRuntime(state);
      assert.equal(
        claim.chromeMayShow && !claim.claimsNotificationScreen,
        true,
        'full chrome visible (not orb-only)',
      );
    },
  );

  await spec('B: runtime showing → Lobby chrome hidden', () => {
    assertChromeHidden(withLifecycle('showing'));
  });

  await spec('C: runtime draining → Lobby chrome hidden', () => {
    assertChromeHidden(withLifecycle('draining'));
  });

  await spec('C: runtime submitting → Lobby chrome hidden', () => {
    assertChromeHidden(withLifecycle('submitting'));
  });

  await spec('C: runtime completing → Lobby chrome hidden', () => {
    assertChromeHidden(withLifecycle('completing'));
  });

  await spec(
    'D: stale owner state cannot claim the notification screen',
    () => {
      // Even if a hypothetical owner had queueLen=5 + active=result,
      // product claim is only selectOverlayVisible(runtime).
      const idleEmpty = withLifecycle('idle');
      const claim = decideLobbyClaimFromRuntime(idleEmpty);
      assert.equal(claim.claimsNotificationScreen, false);
      assert.equal(claim.chromeMayShow, true);
      // Source contract: InstantBanFlow product chrome must not OR legacy guard.
      const flowPath = join(
        process.cwd(),
        'apps/web/src/components/instant-ban/InstantBanFlow.tsx',
      );
      const src = readFileSync(flowPath, 'utf8');
      assert.match(
        src,
        /const queueClaimsNotificationScreen = runtimeClaimsNotificationScreen/,
      );
      assert.match(src, /!interactiveLobbyChromeMayShow/);
      assert.doesNotMatch(
        src,
        /queueClaimsNotificationScreen =\s*\r?\n?\s*effectiveOverlayQueueLengthForLobbyCta > 0 \|\|/,
      );
      const chromeBlockMatch = src.match(
        /const lobbyChromeHidden =\r?\n([\s\S]*?);/,
      );
      assert.ok(chromeBlockMatch, 'lobbyChromeHidden block present');
      const chromeBlock = chromeBlockMatch![1];
      assert.match(chromeBlock, /!interactiveLobbyChromeMayShow/);
      assert.doesNotMatch(chromeBlock, /queueClaimsNotificationScreen/);
      assert.doesNotMatch(chromeBlock, /shouldBlockLobbyForActiveQueue/);
      assert.doesNotMatch(chromeBlock, /queueLobbyGuardActive/);
      assert.doesNotMatch(chromeBlock, /queueShellShowsResult/);
      // Product open reject must use runtime, not shouldBlockLobbyForActiveQueue.
      assert.match(src, /if \(!runtimeLobbyMayShowStrict\)/);
      const decidePath = join(
        process.cwd(),
        'apps/web/src/lib/lobby-claim-from-runtime.ts',
      );
      const decideSrc = readFileSync(decidePath, 'utf8');
      assert.match(decideSrc, /selectOverlayVisible/);
      assert.match(decideSrc, /selectInteractiveLobbyChromeMayShow/);
      assert.match(decideSrc, /selectLobbyMayShow/);
      assert.doesNotMatch(decideSrc, /shouldBlockLobbyForActiveQueue/);
      assert.doesNotMatch(decideSrc, /ownerQueue/);
      assert.doesNotMatch(decideSrc, /queueShellShowsResult/);
    },
  );

  await spec(
    'Providers auto-lobby product block uses selectLobbyMayShow not legacy guard',
    () => {
      const providersPath = join(
        process.cwd(),
        'apps/web/src/components/Providers.tsx',
      );
      const src = readFileSync(providersPath, 'utf8');
      const marker =
        'V1: runtime selectLobbyMayShow replaces legacy queue-lobby-guard product block';
      const markerIdx = src.indexOf(marker);
      assert.ok(markerIdx >= 0, 'V1 auto-lobby marker present');
      const windowStart = Math.max(0, markerIdx - 1200);
      const windowEnd = Math.min(src.length, markerIdx + 800);
      const autoLobbySlice = src.slice(windowStart, windowEnd);
      assert.doesNotMatch(
        autoLobbySlice,
        /shouldBlockLobbyForActiveQueue\(\)/,
      );
      assert.match(
        autoLobbySlice,
        /!selectLobbyMayShow\(notificationRuntimeStoreRef\.current\.getState\(\)\)/,
      );
    },
  );

  const failed = results.filter((r) => !r.ok);
  console.log(
    `\n${results.length - failed.length}/${results.length} passed` +
      (failed.length ? ` — ${failed.length} failed` : ''),
  );
  if (failed.length) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
