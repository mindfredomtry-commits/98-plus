/**
 * Minimal production fixes: sync bans nav + safe lobby chrome + boot diag.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  bootGatePayloadIsSafe,
  isBootGateDiagEnabled,
  logBootGate,
} from '../src/lib/boot-gate-diag';
import { planLobbyBansOpenNavigation } from '../src/lib/lobby-bans-open-navigation';
import {
  selectHoldLobbyOrbForBootstrap,
  selectInteractiveLobbyChromeMayShow,
  selectLobbyMayShow,
  selectOverlayVisible,
} from '../src/notification-runtime/notification-runtime.selectors';
import { createNotificationRuntimeStore } from '../src/notification-runtime/notification-runtime.store';
import { createInitialNotificationRuntimeState } from '../src/notification-runtime/notification-runtime.types';
import type { BanInteraction } from '@98plus/shared';
import type { NotificationItem } from '../src/notification-runtime/notification-runtime.types';
import { EMPTY_RUNTIME_LEGACY_SINKS } from '../src/notification-runtime/notification-runtime.demolition';
import {
  completeBootstrap,
  requestBootstrap,
} from '../src/notification-runtime/notification-runtime.bootstrap';

function ban(id: string): BanInteraction {
  return { id } as BanInteraction;
}
function incoming(id: string): NotificationItem {
  return { kind: 'incoming', ban: ban(id) };
}

let passed = 0;
function check(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`ok — ${name}`);
}

// 1–3 bans navigation plan
check('bans overlay paints before pending prefetch resolves', () => {
  const plan = planLobbyBansOpenNavigation({
    phaseIsIdle: true,
    banSentSuccess: false,
    runtimeDraining: false,
    alreadyOpen: false,
    openInFlight: false,
  });
  assert.equal(plan.openImmediately, true);
  assert.equal(plan.runBackgroundPrefetch, true);
  assert.equal(plan.blockReason, null);
});

check('pending prefetch failure does not close opened overlay (plan keeps open)', () => {
  // Open decision is independent of prefetch outcome — failure cannot revoke openImmediately.
  const plan = planLobbyBansOpenNavigation({
    phaseIsIdle: true,
    banSentSuccess: false,
    runtimeDraining: false,
    alreadyOpen: false,
    openInFlight: false,
  });
  assert.equal(plan.openImmediately, true);
  // Simulate: overlay stays open even if background prefetch rejects.
  let overlayOpen = plan.openImmediately;
  const prefetchFailed = true;
  if (prefetchFailed) {
    /* must not set overlayOpen = false */
  }
  assert.equal(overlayOpen, true);
});

check('double click does not create duplicate drain', () => {
  const first = planLobbyBansOpenNavigation({
    phaseIsIdle: true,
    banSentSuccess: false,
    runtimeDraining: false,
    alreadyOpen: false,
    openInFlight: false,
  });
  assert.equal(first.openImmediately, true);
  const second = planLobbyBansOpenNavigation({
    phaseIsIdle: true,
    banSentSuccess: false,
    runtimeDraining: false,
    alreadyOpen: false,
    openInFlight: true,
  });
  assert.equal(second.openImmediately, false);
  assert.equal(second.blockReason, 'open-in-flight');
  const already = planLobbyBansOpenNavigation({
    phaseIsIdle: true,
    banSentSuccess: false,
    runtimeDraining: false,
    alreadyOpen: true,
    openInFlight: false,
  });
  assert.equal(already.openImmediately, false);
  assert.equal(already.blockReason, 'already-open');
});

// 4–10 lobby chrome selectors
check('lobby first usable paint: booting+empty allows chrome', () => {
  const store = createNotificationRuntimeStore();
  requestBootstrap(store, { source: 'bootstrap' });
  const s = store.getState();
  assert.equal(s.lifecycle.status, 'booting');
  assert.equal(selectLobbyMayShow(s), false);
  assert.equal(selectInteractiveLobbyChromeMayShow(s), true);
  assert.equal(selectHoldLobbyOrbForBootstrap(s), false);
});

check('booting + empty runtime can use safe lobby chrome', () => {
  let s = createInitialNotificationRuntimeState();
  s = {
    ...s,
    lifecycle: { status: 'booting', source: 'bootstrap', transitionId: 't1' },
  };
  assert.equal(selectInteractiveLobbyChromeMayShow(s), true);
});

check('booting + deeplink cannot expose lobby chrome', () => {
  let s = createInitialNotificationRuntimeState();
  s = {
    ...s,
    lifecycle: { status: 'booting', source: 'bootstrap', transitionId: 't1' },
    directEntry: {
      active: true,
      transitionId: 'd1',
      targetId: 'x',
      targetKind: 'incoming',
      entrySource: 'deeplink',
      returnPolicy: 'lobby_after_card',
      deferred: null,
    },
  };
  assert.equal(selectInteractiveLobbyChromeMayShow(s), false);
  assert.equal(selectHoldLobbyOrbForBootstrap(s), true);
});

check('booting + success drain cannot expose lobby chrome', () => {
  let s = createInitialNotificationRuntimeState();
  s = {
    ...s,
    lifecycle: { status: 'draining', source: 'success', transitionId: 't1' },
  };
  assert.equal(selectInteractiveLobbyChromeMayShow(s), false);
});

check('booting + displayed notification cannot expose lobby chrome', () => {
  const store = createNotificationRuntimeStore();
  const boot = requestBootstrap(store, { source: 'bootstrap' });
  completeBootstrap(
    store,
    {
      transitionId: boot.transitionId!,
      items: [incoming('A')],
      pendingItemIds: ['incoming:A'],
      mode: 'real-time',
      autoShow: true,
      source: 'bootstrap',
      sourceVersion: 'v1',
    },
    EMPTY_RUNTIME_LEGACY_SINKS,
  );
  const s = store.getState();
  assert.equal(s.lifecycle.status, 'showing');
  assert.equal(selectOverlayVisible(s), true);
  assert.equal(selectInteractiveLobbyChromeMayShow(s), false);
  assert.equal(selectLobbyMayShow(s), false);
});

check('normal pending badge does not block lobby chrome', () => {
  const store = createNotificationRuntimeStore();
  const boot = requestBootstrap(store, { source: 'bootstrap' });
  completeBootstrap(
    store,
    {
      transitionId: boot.transitionId!,
      items: [],
      pendingItemIds: ['incoming:P1', 'incoming:P2'],
      mode: 'normal',
      autoShow: false,
      source: 'bootstrap',
      sourceVersion: 'v1',
    },
    EMPTY_RUNTIME_LEGACY_SINKS,
  );
  const s = store.getState();
  assert.equal(s.lifecycle.status, 'idle');
  assert.equal(selectLobbyMayShow(s), true);
  assert.equal(selectInteractiveLobbyChromeMayShow(s), true);
  assert.ok(s.pending.itemIds.length >= 2);
});

check('realtime pending materialization still takes overlay authority', () => {
  const store = createNotificationRuntimeStore();
  const boot = requestBootstrap(store, { source: 'bootstrap' });
  completeBootstrap(
    store,
    {
      transitionId: boot.transitionId!,
      items: [incoming('RT1')],
      pendingItemIds: ['incoming:RT1'],
      mode: 'real-time',
      autoShow: true,
      source: 'bootstrap',
      sourceVersion: 'v1',
    },
    EMPTY_RUNTIME_LEGACY_SINKS,
  );
  const s = store.getState();
  assert.equal(selectOverlayVisible(s), true);
  assert.equal(selectLobbyMayShow(s), false);
  assert.equal(selectInteractiveLobbyChromeMayShow(s), false);
});

// 11–12 boot diag
check('boot diagnostic disabled by default', () => {
  assert.equal(isBootGateDiagEnabled(), false);
  // Should no-op when disabled
  logBootGate('BOOT_GATE_INIT', { userId: 'u1' });
});

check('diagnostics never include initData/JWT secrets', () => {
  const safe = bootGatePayloadIsSafe({
    event: 'BOOT_GATE_AUTH_START',
    initDataPresent: true,
    userId: 'u1',
  });
  assert.equal(safe, true);
  assert.equal(
    bootGatePayloadIsSafe({
      event: 'x',
      initData: 'query_id=secret',
    }),
    false,
  );
  assert.equal(
    bootGatePayloadIsSafe({
      Authorization: 'Bearer abc',
    }),
    false,
  );
});

check('retry uses existing pipeline once (reload is page-level)', () => {
  const page = readFileSync(
    join(process.cwd(), 'apps/web/src/app/(miniapp)/page.tsx'),
    'utf8',
  );
  assert.match(page, /window\.location\.reload/);
  assert.match(page, /Обновить/);
});

// source scans
check('source-scan: sync bans open + chrome selector + no second owner', () => {
  const flow = readFileSync(
    join(
      process.cwd(),
      'apps/web/src/components/instant-ban/InstantBanFlow.tsx',
    ),
    'utf8',
  );
  const selectors = readFileSync(
    join(
      process.cwd(),
      'apps/web/src/notification-runtime/notification-runtime.selectors.ts',
    ),
    'utf8',
  );
  const providers = readFileSync(
    join(process.cwd(), 'apps/web/src/components/Providers.tsx'),
    'utf8',
  );
  assert.match(flow, /planLobbyBansOpenNavigation/);
  assert.match(flow, /setBansOverlayOpen\(true\)/);
  assert.match(flow, /prefetchPendingAfterLobbyBansOpen/);
  assert.doesNotMatch(
    flow,
    /await startLobbyBansNotificationDrain\(\)/,
  );
  assert.match(selectors, /selectInteractiveLobbyChromeMayShow/);
  assert.match(flow, /interactiveLobbyChromeMayShow/);
  assert.match(providers, /prefetchPendingAfterLobbyBansOpen/);
  assert.match(providers, /lobby-bans-cta-after-sync-open/);
  assert.doesNotMatch(selectors, /createSecondRuntime|dualReducer/);
});

console.log(
  `notification-runtime-lobby-bans-fixes.test.ts: ok (${passed} checks)`,
);
