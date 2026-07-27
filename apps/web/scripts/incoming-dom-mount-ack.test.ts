/**
 * Atomic SUCCESS → incoming materialization (DOM mount ack).
 *
 * Run:
 *   npx tsx --tsconfig apps/web/tsconfig.json apps/web/scripts/incoming-dom-mount-ack.test.ts
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  acknowledgeIncomingDomMounted,
  clearIncomingDomMountAck,
  expectNextDisplayDomMount,
  getIncomingDomMountAckSnapshot,
  getIncomingDomMountAckWriteCounts,
  nextDisplayDomMounted,
  resetIncomingDomMountAck,
  resetIncomingDomMountAckForTest,
  subscribeIncomingDomMountAck,
} from '../src/lib/incoming-dom-mount-ack';
import { evaluateSuccessToNextHandoff } from '../src/lib/success-to-next-handoff';
import {
  assertNoVisibleShellWithoutCard,
  baseParityInput,
  deriveOverlayMaterializationParity,
  derivePaintedDomSurface,
  idleRuntime,
  PresentationParityRecorder,
} from '../src/lib/observed-presentation-parity';
import { resetObservedPresentationMirror } from '../src/lib/observed-presentation-mirror';

type SpecResult = { name: string; ok: boolean; error?: string };
const results: SpecResult[] = [];
const webRoot = join(__dirname, '..');
const INSTANCE = 'instant-ban-flow-atomic-incoming';

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

function read(path: string): string {
  return readFileSync(path, 'utf8').replace(/\r\n/g, '\n');
}

function successSnap() {
  return {
    selectedUserId: 'friend-1',
    banText: 'atomic',
    durationMinutes: 30,
    replyToBanId: null as string | null,
  };
}

async function main() {
  console.log('\n=== ATOMIC INCOMING MATERIALIZATION ===\n');
  resetObservedPresentationMirror();
  resetIncomingDomMountAckForTest();

  await spec('1: SUCCESS_FROZEN → INCOMING painted sequence only', () => {
    const snap = successSnap();
    const rec = new PresentationParityRecorder(INSTANCE);
    rec.record({
      label: 'SUCCESS_FROZEN',
      input: baseParityInput({
        banSentSuccess: true,
        successSnapshot: snap,
        showBootOrb: false,
        showLobbyOrb: false,
        persistentLogoVisible: false,
        showLobbyChrome: false,
        successHandoffArmed: true,
        // Host may exist internally with empty children — SUCCESS still paints.
        overlayHostActive: true,
        notificationOverlayVisible: true,
        activeOverlayKind: null,
      }),
      runtime: idleRuntime({ lifecycle: 'draining' }),
    });
    rec.record({
      label: 'INCOMING',
      input: baseParityInput({
        banSentSuccess: false,
        successSnapshot: null,
        showLobbyOrb: false,
        overlayHostActive: true,
        notificationOverlayVisible: true,
        activeOverlayKind: 'incoming',
        overlayDisplayId: 'in-9',
        successHandoffArmed: false,
      }),
      runtime: idleRuntime({
        lifecycle: 'showing',
        displayKind: 'incoming',
        displayId: 'in-9',
        displayPayloadPresent: true,
      }),
    });
    rec.assertParity();
    assert.deepEqual(rec.modes(), ['SUCCESS_HANDOFF_WAIT', 'INCOMING']);
    assert.equal(rec.modes().includes('LOBBY'), false);
  });

  await spec('2: no visible overlay shell without a card', () => {
    const emptyShell = deriveOverlayMaterializationParity({
      overlayHostMountedInternally: true,
      visibleOverlayShell: true,
      incomingCardDomMounted: false,
    });
    assert.equal(emptyShell.overlayHostMountedInternally, true);
    assert.equal(emptyShell.visibleOverlayShell, false);
    assert.equal(emptyShell.incomingCardDomMounted, false);
    assertNoVisibleShellWithoutCard(emptyShell, 'empty-shell');

    const withCard = deriveOverlayMaterializationParity({
      overlayHostMountedInternally: true,
      visibleOverlayShell: true,
      incomingCardDomMounted: true,
    });
    assert.equal(withCard.visibleOverlayShell, true);
    assertNoVisibleShellWithoutCard(withCard, 'with-card');
  });

  await spec('3: underlying SUCCESS not replaced by empty overlay in paint oracle', () => {
    const snap = successSnap();
    const painted = derivePaintedDomSurface(
      baseParityInput({
        banSentSuccess: true,
        successSnapshot: snap,
        successHandoffArmed: true,
        overlayHostActive: true,
        notificationOverlayVisible: true,
        showLobbyOrb: false,
      }),
    );
    assert.equal(painted.mode, 'SUCCESS_HANDOFF_WAIT');
  });

  await spec('4: handoff does not release on display != null alone', () => {
    const d = evaluateSuccessToNextHandoff({
      banSentSuccess: true,
      hasSuccessSnapshot: true,
      handoffArmed: true,
      runtimeDisplayKind: 'incoming',
      runtimeDisplayPayloadPresent: true,
      expectedDisplayId: 'in-1',
      nextDisplayDomMounted: false,
      notificationPresentationClaimed: true,
      chainExplicitlyEmpty: false,
      presentationOwnershipReleased: false,
    });
    assert.equal(d.mayClearSuccessLocal, false);
    assert.equal(d.phase, 'SUCCESS_HANDOFF_WAIT');
  });

  await spec('5: handoff releases only on matching DOM-mounted ack', () => {
    resetIncomingDomMountAckForTest();
    expectNextDisplayDomMount('in-1');
    assert.equal(nextDisplayDomMounted('in-1'), false);
    acknowledgeIncomingDomMounted('in-1');
    assert.equal(nextDisplayDomMounted('in-1'), true);
    const snap = getIncomingDomMountAckSnapshot();
    assert.equal(snap.matchingDomMounted, true);
    assert.equal(snap.visibilityLifetimeStartedForId, 'in-1');
    const d = evaluateSuccessToNextHandoff({
      banSentSuccess: true,
      hasSuccessSnapshot: true,
      handoffArmed: true,
      runtimeDisplayKind: 'incoming',
      runtimeDisplayPayloadPresent: true,
      expectedDisplayId: 'in-1',
      nextDisplayDomMounted: nextDisplayDomMounted('in-1'),
      notificationPresentationClaimed: false,
      chainExplicitlyEmpty: false,
      presentationOwnershipReleased: false,
    });
    assert.equal(d.phase, 'NEXT_NOTIFICATION_VISIBLE');
    assert.equal(d.releaseReason, 'next-display-dom-mounted');
  });

  await spec('6: stale/mismatched display id cannot release SUCCESS', () => {
    resetIncomingDomMountAckForTest();
    expectNextDisplayDomMount('in-expected');
    acknowledgeIncomingDomMounted('in-stale');
    assert.equal(nextDisplayDomMounted('in-expected'), false);
    assert.equal(getIncomingDomMountAckSnapshot().matchingDomMounted, false);
    const d = evaluateSuccessToNextHandoff({
      banSentSuccess: true,
      hasSuccessSnapshot: true,
      handoffArmed: true,
      runtimeDisplayKind: 'incoming',
      runtimeDisplayPayloadPresent: true,
      expectedDisplayId: 'in-expected',
      nextDisplayDomMounted: nextDisplayDomMounted('in-expected'),
      notificationPresentationClaimed: true,
      chainExplicitlyEmpty: false,
      presentationOwnershipReleased: false,
    });
    assert.equal(d.mayClearSuccessLocal, false);
  });

  await spec('7: incoming lifecycle timer starts only after DOM mount', () => {
    resetIncomingDomMountAckForTest();
    expectNextDisplayDomMount('in-1');
    assert.equal(
      getIncomingDomMountAckSnapshot().visibilityLifetimeStartedForId,
      null,
    );
    acknowledgeIncomingDomMounted('in-1');
    assert.equal(
      getIncomingDomMountAckSnapshot().visibilityLifetimeStartedForId,
      'in-1',
    );
    clearIncomingDomMountAck('in-1');
    assert.equal(
      getIncomingDomMountAckSnapshot().visibilityLifetimeStartedForId,
      null,
    );
  });

  await spec(
    'boot: getSnapshot is referentially stable (no useSyncExternalStore #185 loop)',
    () => {
      resetIncomingDomMountAckForTest();
      const a = getIncomingDomMountAckSnapshot();
      const b = getIncomingDomMountAckSnapshot();
      const c = getIncomingDomMountAckSnapshot();
      assert.equal(a, b);
      assert.equal(b, c);
      // Simulate InstantBanFlow boot subscribe: many getSnapshot calls, zero writes.
      let notifies = 0;
      const unsub = subscribeIncomingDomMountAck(() => {
        notifies += 1;
      });
      for (let i = 0; i < 50; i += 1) {
        const snap = getIncomingDomMountAckSnapshot();
        assert.equal(snap, a);
      }
      assert.equal(notifies, 0);
      assert.equal(getIncomingDomMountAckWriteCounts().acknowledge, 0);
      assert.equal(getIncomingDomMountAckWriteCounts().expect, 0);
      unsub();
    },
  );

  await spec('ack: incoming mount writes exactly once per displayId', () => {
    resetIncomingDomMountAckForTest();
    expectNextDisplayDomMount('in-1');
    acknowledgeIncomingDomMounted('in-1');
    assert.equal(getIncomingDomMountAckWriteCounts().acknowledge, 1);
    acknowledgeIncomingDomMounted('in-1');
    acknowledgeIncomingDomMounted('in-1');
    assert.equal(getIncomingDomMountAckWriteCounts().acknowledge, 1);
  });

  await spec('ack: rerender same displayId performs zero additional writes', () => {
    resetIncomingDomMountAckForTest();
    expectNextDisplayDomMount('in-9');
    acknowledgeIncomingDomMounted('in-9');
    const before = getIncomingDomMountAckWriteCounts();
    const snapBefore = getIncomingDomMountAckSnapshot();
    for (let i = 0; i < 20; i += 1) {
      acknowledgeIncomingDomMounted('in-9');
      assert.equal(getIncomingDomMountAckSnapshot(), snapBefore);
    }
    const after = getIncomingDomMountAckWriteCounts();
    assert.equal(after.acknowledge, before.acknowledge);
    assert.equal(after.expect, before.expect);
  });

  await spec('ack: new displayId acknowledges exactly once', () => {
    resetIncomingDomMountAckForTest();
    expectNextDisplayDomMount('in-a');
    acknowledgeIncomingDomMounted('in-a');
    assert.equal(getIncomingDomMountAckWriteCounts().acknowledge, 1);
    expectNextDisplayDomMount('in-b');
    // Expected change clears stale mount → matching false until new ack.
    assert.equal(nextDisplayDomMounted('in-b'), false);
    acknowledgeIncomingDomMounted('in-b');
    assert.equal(getIncomingDomMountAckWriteCounts().acknowledge, 2);
    acknowledgeIncomingDomMounted('in-b');
    assert.equal(getIncomingDomMountAckWriteCounts().acknowledge, 2);
    assert.equal(nextDisplayDomMounted('in-b'), true);
  });

  await spec('ack: unmount clear then remount acknowledges once again', () => {
    resetIncomingDomMountAckForTest();
    expectNextDisplayDomMount('in-1');
    acknowledgeIncomingDomMounted('in-1');
    assert.equal(getIncomingDomMountAckWriteCounts().acknowledge, 1);
    clearIncomingDomMountAck('in-1');
    assert.equal(getIncomingDomMountAckWriteCounts().clear, 1);
    assert.equal(getIncomingDomMountAckSnapshot().mountedDisplayId, null);
    // Remount same id — one new write.
    acknowledgeIncomingDomMounted('in-1');
    assert.equal(getIncomingDomMountAckWriteCounts().acknowledge, 2);
    acknowledgeIncomingDomMounted('in-1');
    assert.equal(getIncomingDomMountAckWriteCounts().acknowledge, 2);
    // reset after handoff complete is also idempotent when repeated.
    resetIncomingDomMountAck();
    assert.equal(getIncomingDomMountAckWriteCounts().reset, 1);
    resetIncomingDomMountAck();
    assert.equal(getIncomingDomMountAckWriteCounts().reset, 1);
  });

  await spec('wiring: ack effect deps are stable (no reportOverlayRendered)', () => {
    const incoming = read(
      join(webRoot, 'src/components/IncomingBanOverlay.tsx'),
    );
    assert.match(
      incoming,
      /acknowledgeIncomingDomMounted\(activeIncomingBan\.id\);\s*\n\s*\}, \[activeIncomingBan\?\.id, visible, verifyPhase\]\)/,
    );
    assert.match(
      incoming,
      /getIncomingDomMountAckSnapshot[\s\S]*useSyncExternalStore|acknowledgeIncomingDomMounted/,
    );
    const ackSrc = read(join(webRoot, 'src/lib/incoming-dom-mount-ack.ts'));
    assert.match(ackSrc, /cachedSnapshot/);
    assert.match(ackSrc, /Referentially stable/);
  });

  await spec(
    '8: no product auto-dismiss TTL for untouched incoming (~10s)',
    () => {
      const incoming = read(
        join(webRoot, 'src/components/IncomingBanOverlay.tsx'),
      );
      assert.doesNotMatch(
        incoming,
        /AUTO_DISMISS|autoDismiss|VISIBLE_TTL|PRESENTATION_TTL|10_000|10000/,
      );
      const ack = read(join(webRoot, 'src/lib/incoming-dom-mount-ack.ts'));
      assert.doesNotMatch(ack, /setTimeout|setInterval/);
      // ACTION_RESULT_WAIT_TIMEOUT_MS is overboard-result wait, not incoming view TTL.
      const actionHandoff = read(
        join(
          webRoot,
          'src/notification-runtime/notification-runtime.action-result-handoff.ts',
        ),
      );
      assert.match(actionHandoff, /ACTION_RESULT_WAIT_TIMEOUT_MS = 10_000/);
    },
  );

  await spec('9: empty-queue SUCCESS → Lobby contract unchanged', () => {
    const d = evaluateSuccessToNextHandoff({
      banSentSuccess: true,
      hasSuccessSnapshot: true,
      handoffArmed: true,
      runtimeDisplayKind: null,
      runtimeDisplayPayloadPresent: false,
      expectedDisplayId: null,
      nextDisplayDomMounted: false,
      notificationPresentationClaimed: false,
      chainExplicitlyEmpty: true,
      presentationOwnershipReleased: false,
    });
    assert.equal(d.phase, 'EMPTY_LOBBY_RELEASED');
    assert.equal(d.mayClearSuccessLocal, true);
    assert.equal(d.allowLobbyBase, true);
  });

  await spec('wiring: GlobalOverlayHost gates visible shell on card children', () => {
    const host = read(join(webRoot, 'src/components/GlobalOverlayHost.tsx'));
    assert.match(host, /hasOverlayChildren/);
    assert.match(host, /pointerActive = active && hasOverlayChildren/);
    assert.match(host, /data-visible-overlay-shell/);
  });

  await spec('wiring: IncomingBanOverlay acknowledges DOM mount', () => {
    const incoming = read(
      join(webRoot, 'src/components/IncomingBanOverlay.tsx'),
    );
    assert.match(incoming, /acknowledgeIncomingDomMounted/);
    const flow = read(
      join(webRoot, 'src/components/instant-ban/InstantBanFlow.tsx'),
    );
    assert.match(flow, /nextDisplayDomMounted/);
    assert.match(flow, /expectNextDisplayDomMount/);
  });

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  if (failed.length) {
    process.exitCode = 1;
  }
}

void main();
