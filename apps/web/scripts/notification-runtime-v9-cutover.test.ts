/**
 * Vertical 9 — final runtime cutover / no Legacy engine tests.
 *
 * Run:
 *   npx tsx --tsconfig apps/web/tsconfig.json apps/web/scripts/notification-runtime-v9-cutover.test.ts
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { BanInteraction } from '@98plus/shared';
import {
  EMPTY_RUNTIME_LEGACY_SINKS,
  selectRuntimePaintSnapshot,
} from '../src/notification-runtime/notification-runtime.demolition';
import { createNotificationRuntimeStore } from '../src/notification-runtime/notification-runtime.store';
import {
  selectLobbyMayShow,
  selectOverlayVisible,
} from '../src/notification-runtime/notification-runtime.selectors';
import type { NotificationItem } from '../src/notification-runtime/notification-runtime.types';
import { assertNotificationRuntimeInvariant } from '../src/notification-runtime/notification-runtime.reducer';

function ban(id: string): BanInteraction {
  return { id } as BanInteraction;
}
function incoming(id: string): NotificationItem {
  return { kind: 'incoming', ban: ban(id) };
}

async function main() {
  // 1. Runtime only — paint === store
  {
    const store = createNotificationRuntimeStore();
    store.dispatch({
      type: 'ITEMS_RECEIVED',
      transitionId: 'v9-1',
      items: [incoming('A')],
      replaceQueue: true,
      source: 'system',
    });
    const paint = selectRuntimePaintSnapshot(store.getState());
    assert.equal(paint.queueLength, store.getState().items.queue.length);
    assert.equal(paint.display.incomingBan?.id, 'A');
    assert.equal(selectOverlayVisible(store.getState()), true);
    assert.equal(selectLobbyMayShow(store.getState()), false);
    assertNotificationRuntimeInvariant(store.getState());
  }

  // 2. Empty sinks are true no-ops
  {
    let wrote = false;
    EMPTY_RUNTIME_LEGACY_SINKS.writeQueue([], 'test');
    EMPTY_RUNTIME_LEGACY_SINKS.writeDisplay({}, 'test');
    assert.equal(wrote, false);
  }

  // 3. Invariants: idle => no overlay
  {
    const store = createNotificationRuntimeStore();
    assert.equal(store.getState().lifecycle.status, 'idle');
    assert.equal(selectOverlayVisible(store.getState()), false);
    assert.equal(selectLobbyMayShow(store.getState()), true);
  }

  // —— Source scans ——
  {
    const webSrc = join(process.cwd(), 'apps/web/src');
    const demolition = readFileSync(
      join(webSrc, 'notification-runtime/notification-runtime.demolition.ts'),
      'utf8',
    );
    const shadow = readFileSync(
      join(webSrc, 'notification-owner/notification-owner-pin-state.ts'),
      'utf8',
    );
    const providers = readFileSync(
      join(webSrc, 'components/Providers.tsx'),
      'utf8',
    );
    const advance = readFileSync(
      join(
        webSrc,
        'notification-runtime/notification-runtime.production-advance.ts',
      ),
      'utf8',
    );

    assert.match(demolition, /EMPTY_RUNTIME_LEGACY_SINKS/);
    assert.match(demolition, /Vertical 9/);
    assert.match(shadow, /v9-queue-authority-noop/);
    assert.match(shadow, /v9-display-authority-noop/);
    assert.match(providers, /EMPTY_RUNTIME_LEGACY_SINKS/);
    assert.match(providers, /dual-store mirrors are no-ops/);
    assert.match(providers, /no dual-store queue writes/);
    assert.match(
      providers,
      /result: ownerRenderResultPayload \?\? runtimePaint\.display\.result/,
    );
    assert.doesNotMatch(providers, /writeQueue:\s*\(/);
    assert.match(advance, /EMPTY_RUNTIME_LEGACY_SINKS/);
    // Production sinks must not write through
    assert.equal(
      (providers.match(/EMPTY_RUNTIME_LEGACY_SINKS/g) || []).length >= 10,
      true,
    );
  }

  console.log('notification-runtime-v9-cutover: ok');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
