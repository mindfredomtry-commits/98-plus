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
  nextDisplayDomMounted,
  resetIncomingDomMountAckForTest,
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
