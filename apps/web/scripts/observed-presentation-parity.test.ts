/**
 * Stage 2 — ObservedPresentationState integration parity validation.
 *
 * Harness: same script-style app-level frame simulation as
 * providers-queue-flow / success-drain suites (no React remount tree).
 * Paint oracle = InstantBanFlow + Providers JSX predicates.
 * Mirror = observePresentationState + publishObservedPresentation.
 *
 * Run:
 *   npx tsx --tsconfig apps/web/tsconfig.json apps/web/scripts/observed-presentation-parity.test.ts
 */
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  assertObservedMatchesPainted,
  baseParityInput,
  derivePaintedDomSurface,
  idleRuntime,
  PresentationParityRecorder,
} from '../src/lib/observed-presentation-parity';
import {
  getObservedPresentationPublishCount,
  getObservedPresentationState,
  publishObservedPresentation,
  resetObservedPresentationMirror,
  subscribeObservedPresentation,
} from '../src/lib/observed-presentation-mirror';
import { observePresentationState } from '../src/lib/observed-presentation-state';

type SpecResult = { name: string; ok: boolean; error?: string };
const results: SpecResult[] = [];
const mismatches: Array<{
  scenario: string;
  detail: string;
  owner: string;
}> = [];

const webRoot = join(__dirname, '..');
const INSTANCE = 'instant-ban-flow-instance-stage2';

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

function printSequence(
  title: string,
  recorder: PresentationParityRecorder,
): void {
  console.log(`\n  sequence: ${title}`);
  for (const s of recorder.samples) {
      const snap =
      s.observed.mode === 'SUCCESS' ||
      s.observed.mode === 'SUCCESS_HANDOFF_WAIT'
        ? ` snapshot=${s.observed.snapshot.banText}`
        : s.observed.mode === 'RESULT' ||
            s.observed.mode === 'INCOMING' ||
            s.observed.mode === 'CHECK'
          ? ` id=${s.observed.display.id} surface=${s.observed.mode === 'RESULT' ? s.observed.display.surface : 'queue'}`
          : '';
    console.log(
      `    t=${s.t}ms [${s.label}] observed=${s.observed.mode} painted=${s.painted.mode}` +
        ` runtime=${s.runtime.lifecycle}/${s.runtime.displayKind ?? 'null'}` +
        ` local.phase=${s.local.phase} banSentSuccess=${s.local.banSentSuccess}` +
        ` dom=${s.painted.domIds.join(',')}${snap}` +
        ` instance=${s.local.instantBanFlowInstanceId} publish#=${s.mirrorPublishCount}`,
    );
  }
}

function successSnapshot() {
  return {
    selectedUserId: 'friend-1',
    banText: 'stage2-ban',
    durationMinutes: 30,
    replyToBanId: null as string | null,
  };
}

async function main() {
  console.log('\n=== STAGE 2 — OBSERVED PRESENTATION PARITY ===\n');
  resetObservedPresentationMirror();

  await spec('1. Startup / bootstrap — boot Lobby + DOM parity, no blank transition', () => {
    const rec = new PresentationParityRecorder(INSTANCE);
    rec.record({
      label: 'boot-unprimed',
      input: baseParityInput({
        lobbyBootIntroPrimed: false,
        holdLobbyOrbForBootstrap: false,
        showBootOrb: true,
        showLobbyOrb: false,
        persistentLogoVisible: false,
        showLobbyChrome: false,
      }),
      runtime: idleRuntime({ lifecycle: 'booting' }),
    });
    rec.record({
      label: 'boot-hold-bootstrap',
      input: baseParityInput({
        lobbyBootIntroPrimed: true,
        holdLobbyOrbForBootstrap: true,
        showBootOrb: true,
        showLobbyOrb: false,
        persistentLogoVisible: false,
        showLobbyChrome: false,
      }),
      runtime: idleRuntime({ lifecycle: 'booting' }),
    });
    printSequence('startup/bootstrap', rec);
    rec.assertParity();
    rec.assertContinuousMount();
    assert.deepEqual(rec.modes(), ['BOOT_LOBBY', 'BOOT_LOBBY']);
    assert.equal(
      rec.samples.every((s) => s.painted.domIds.includes('data-boot-scene') || s.observed.mode === 'BOOT_LOBBY'),
      true,
    );
    // No PresentationRoot / TransitionSurface blank
    assert.equal(
      existsSync(join(webRoot, 'src/components/presentation/PresentationRoot.tsx')),
      false,
    );
    assert.equal(
      existsSync(join(webRoot, 'src/components/presentation/TransitionSurface.tsx')),
      false,
    );
  });

  await spec('2. Lobby idle — orb/logo/CTA/chrome parity', () => {
    const rec = new PresentationParityRecorder(INSTANCE);
    rec.record({
      label: 'lobby-idle',
      input: baseParityInput({
        phase: 'idle',
        showLobbyOrb: true,
        persistentLogoVisible: true,
        showLobbyChrome: true,
      }),
      runtime: idleRuntime(),
    });
    printSequence('lobby idle', rec);
    rec.assertParity();
    const s = rec.samples[0]!;
    assert.equal(s.observed.mode, 'LOBBY');
    assert.equal(s.observed.mode === 'LOBBY' && s.observed.empty, false);
    assert.equal(s.observed.chrome.orbVisible, true);
    assert.equal(s.observed.chrome.logoVisible, true);
    assert.equal(s.observed.chrome.chromeVisible, true);
    assert.ok(s.painted.domIds.includes('data-base-lobby-orb'));
  });

  await spec('3. WHAT — matches screen; no Lobby/notification misclassification', () => {
    const rec = new PresentationParityRecorder(INSTANCE);
    rec.record({
      label: 'what',
      input: baseParityInput({
        phase: 'composingBan',
        showLobbyOrb: true,
        persistentLogoVisible: false,
      }),
      runtime: idleRuntime(),
    });
    printSequence('WHAT', rec);
    rec.assertParity();
    assert.equal(rec.samples[0]!.observed.mode, 'WHAT');
    assert.notEqual(rec.samples[0]!.observed.mode, 'LOBBY');
    assert.notEqual(rec.samples[0]!.observed.mode, 'INCOMING');
  });

  await spec('4. CONFIRM — hold/orb state parity', () => {
    const rec = new PresentationParityRecorder(INSTANCE);
    rec.record({
      label: 'confirm',
      input: baseParityInput({
        phase: 'confirming',
        confirmActive: true,
        showLobbyOrb: true,
        persistentLogoVisible: false,
        showLobbyChrome: false,
      }),
      runtime: idleRuntime(),
    });
    printSequence('CONFIRM', rec);
    rec.assertParity();
    const s = rec.samples[0]!;
    assert.equal(s.observed.mode, 'CONFIRM');
    assert.equal(s.observed.chrome.confirmLayerVisible, true);
    assert.equal(s.observed.chrome.confirmOrbVisible, true);
    assert.equal(s.painted.confirmLayerVisible, true);
    assert.equal(s.painted.confirmOrbVisible, true);
  });

  await spec('5. Send in flight — SENDING; no premature SUCCESS', () => {
    const rec = new PresentationParityRecorder(INSTANCE);
    rec.record({
      label: 'sending',
      input: baseParityInput({
        phase: 'confirming',
        confirmActive: true,
        inFlight: true,
        showLobbyOrb: true,
        banSentSuccess: false,
        successSnapshot: null,
      }),
      runtime: idleRuntime({ lifecycle: 'submitting' }),
    });
    printSequence('SENDING', rec);
    rec.assertParity();
    assert.equal(rec.samples[0]!.observed.mode, 'SENDING');
    assert.notEqual(rec.samples[0]!.observed.mode, 'SUCCESS');
  });

  await spec('6. SUCCESS — complete snapshot + SuccessOverlay; no remount', () => {
    const snap = successSnapshot();
    const rec = new PresentationParityRecorder(INSTANCE);
    const beforePublish = getObservedPresentationPublishCount();
    rec.record({
      label: 'success',
      input: baseParityInput({
        phase: 'confirming',
        banSentSuccess: true,
        successSnapshot: snap,
        confirmActive: false,
        inFlight: false,
        showLobbyOrb: false,
      }),
      runtime: idleRuntime({ lifecycle: 'showing' }),
    });
    printSequence('SUCCESS', rec);
    rec.assertParity();
    rec.assertContinuousMount();
    const s = rec.samples[0]!;
    assert.equal(s.observed.mode, 'SUCCESS');
    assert.ok(s.observed.mode === 'SUCCESS' && s.observed.snapshot.banText === 'stage2-ban');
    assert.ok(s.observed.mode === 'SUCCESS' && s.observed.snapshot.selectedUserId === 'friend-1');
    assert.ok(s.painted.domIds.includes('SuccessOverlay'));
    assert.equal(s.local.instantBanFlowInstanceId, INSTANCE);
    assert.ok(s.mirrorPublishCount > beforePublish);
  });

  await spec('7. SUCCESS → incoming — Stage 3A: no empty LOBBY frame', () => {
    const snap = successSnapshot();
    const rec = new PresentationParityRecorder(INSTANCE);
    rec.record({
      label: 'success-card',
      input: baseParityInput({
        banSentSuccess: true,
        successSnapshot: snap,
        showLobbyOrb: false,
        showLobbyChrome: false,
        successHandoffArmed: false,
      }),
      runtime: idleRuntime({ lifecycle: 'showing' }),
    });
    // Stage 3A handoff wait — SUCCESS retained; Lobby base suppressed.
    rec.record({
      label: 'success-handoff-wait',
      input: baseParityInput({
        banSentSuccess: true,
        successSnapshot: snap,
        phase: 'idle',
        showBootOrb: false,
        showLobbyOrb: false,
        persistentLogoVisible: false,
        showLobbyChrome: false,
        overlayHostActive: false,
        successHandoffArmed: true,
      }),
      runtime: idleRuntime({ lifecycle: 'draining' }),
    });
    rec.record({
      label: 'incoming-mounted',
      input: baseParityInput({
        phase: 'idle',
        banSentSuccess: false,
        successSnapshot: null,
        showLobbyOrb: false,
        showLobbyChrome: false,
        overlayHostActive: true,
        notificationOverlayVisible: true,
        activeOverlayKind: 'incoming',
        overlayDisplayId: 'in-1',
        successHandoffArmed: false,
      }),
      runtime: idleRuntime({
        lifecycle: 'showing',
        displayKind: 'incoming',
        displayId: 'in-1',
        displayPayloadPresent: true,
        queueLength: 1,
      }),
    });
    printSequence('SUCCESS → incoming', rec);
    rec.assertParity();
    rec.assertContinuousMount();
    assert.deepEqual(rec.modes(), [
      'SUCCESS',
      'SUCCESS_HANDOFF_WAIT',
      'INCOMING',
    ]);
    assert.equal(
      rec.samples.some((s) => s.observed.mode === 'LOBBY'),
      false,
      'Stage 3A must not observe empty LOBBY between SUCCESS and INCOMING',
    );
  });

  await spec('8. Incoming — observed display matches runtime/DOM', () => {
    const rec = new PresentationParityRecorder(INSTANCE);
    rec.record({
      label: 'incoming',
      input: baseParityInput({
        overlayHostActive: true,
        activeOverlayKind: 'incoming',
        overlayDisplayId: 'incoming-42',
        showLobbyOrb: false,
      }),
      runtime: idleRuntime({
        lifecycle: 'showing',
        displayKind: 'incoming',
        displayId: 'incoming-42',
        displayPayloadPresent: true,
        queueLength: 1,
      }),
    });
    printSequence('incoming', rec);
    rec.assertParity();
    const s = rec.samples[0]!;
    assert.equal(s.observed.mode, 'INCOMING');
    assert.ok(s.observed.mode === 'INCOMING' && s.observed.display.id === 'incoming-42');
    assert.equal(s.runtime.displayId, 'incoming-42');
  });

  await spec('9. Check — observed check matches DOM', () => {
    const rec = new PresentationParityRecorder(INSTANCE);
    rec.record({
      label: 'check',
      input: baseParityInput({
        overlayHostActive: true,
        activeOverlayKind: 'check',
        overlayDisplayId: 'check-7',
        showLobbyOrb: false,
      }),
      runtime: idleRuntime({
        lifecycle: 'showing',
        displayKind: 'check',
        displayId: 'check-7',
        displayPayloadPresent: true,
        queueLength: 1,
      }),
    });
    printSequence('check', rec);
    rec.assertParity();
    assert.equal(rec.samples[0]!.observed.mode, 'CHECK');
    assert.ok(
      rec.samples[0]!.observed.mode === 'CHECK' &&
        rec.samples[0]!.observed.display.id === 'check-7',
    );
  });

  await spec('10. Result — queue vs direct-overboard distinguished', () => {
    const rec = new PresentationParityRecorder(INSTANCE);
    rec.record({
      label: 'queue-result',
      input: baseParityInput({
        overlayHostActive: true,
        activeOverlayKind: 'result',
        queueResultId: 'res-q',
        overlayDisplayId: 'res-q',
        showLobbyOrb: false,
      }),
      runtime: idleRuntime({
        lifecycle: 'showing',
        displayKind: 'result',
        displayId: 'res-q',
        displayPayloadPresent: true,
      }),
    });
    rec.record({
      label: 'direct-overboard-result',
      input: baseParityInput({
        showDirectOverboardLayer: true,
        directOverboardResultId: 'res-direct',
        overlayHostActive: false,
        activeOverlayKind: null,
        showLobbyOrb: false,
      }),
      runtime: idleRuntime({
        lifecycle: 'showing',
        displayKind: 'result',
        displayId: 'res-direct',
        displayPayloadPresent: true,
      }),
    });
    printSequence('result surfaces', rec);
    rec.assertParity();
    assert.equal(rec.samples[0]!.observed.mode, 'RESULT');
    assert.ok(
      rec.samples[0]!.observed.mode === 'RESULT' &&
        rec.samples[0]!.observed.display.surface === 'queue' &&
        rec.samples[0]!.observed.display.id === 'res-q',
    );
    assert.ok(
      rec.samples[1]!.observed.mode === 'RESULT' &&
        rec.samples[1]!.observed.display.surface === 'direct' &&
        rec.samples[1]!.observed.display.id === 'res-direct',
    );
  });

  await spec('11. Empty Lobby — release matches DOM', () => {
    const rec = new PresentationParityRecorder(INSTANCE);
    rec.record({
      label: 'empty-lobby',
      input: baseParityInput({
        phase: 'idle',
        showBootOrb: false,
        showLobbyOrb: false,
        persistentLogoVisible: false,
        showLobbyChrome: false,
        overlayHostActive: false,
        showDirectOverboardLayer: false,
      }),
      runtime: idleRuntime({ lifecycle: 'idle', queueLength: 0 }),
    });
    printSequence('empty lobby', rec);
    rec.assertParity();
    assert.equal(rec.samples[0]!.observed.mode, 'LOBBY');
    assert.equal(
      rec.samples[0]!.observed.mode === 'LOBBY' &&
        rec.samples[0]!.observed.empty,
      true,
    );
  });

  await spec('12. Startup with stale queued result — record real behavior, no correction', () => {
    const rec = new PresentationParityRecorder(INSTANCE);
    // Frame A: boot orb painting while runtime already holds a stale result payload
    // but host has not mounted yet — real paint is still BOOT_LOBBY.
    rec.record({
      label: 'boot-with-stale-runtime-result-unmounted',
      input: baseParityInput({
        lobbyBootIntroPrimed: false,
        showBootOrb: true,
        showLobbyOrb: false,
        persistentLogoVisible: false,
        showLobbyChrome: false,
        overlayHostActive: false,
        activeOverlayKind: null,
        overlayDisplayId: 'stale-r1',
      }),
      runtime: idleRuntime({
        lifecycle: 'booting',
        displayKind: 'result',
        displayId: 'stale-r1',
        displayPayloadPresent: true,
        queueLength: 1,
      }),
    });
    // Frame B: host mounts stale result over boot — topmost paint is RESULT.
    rec.record({
      label: 'stale-result-host-mounted',
      input: baseParityInput({
        lobbyBootIntroPrimed: false,
        showBootOrb: true,
        showLobbyOrb: false,
        overlayHostActive: true,
        notificationOverlayVisible: true,
        activeOverlayKind: 'result',
        queueResultId: 'stale-r1',
        overlayDisplayId: 'stale-r1',
      }),
      runtime: idleRuntime({
        lifecycle: 'showing',
        displayKind: 'result',
        displayId: 'stale-r1',
        displayPayloadPresent: true,
        queueLength: 1,
      }),
    });
    printSequence('startup + stale result', rec);
    rec.assertParity();
    rec.assertContinuousMount();
    assert.deepEqual(rec.modes(), ['BOOT_LOBBY', 'RESULT']);
    // Documented: Stage 2 does not correct this — it mirrors it.
    assert.equal(rec.samples[0]!.runtime.displayKind, 'result');
    assert.equal(rec.samples[0]!.observed.mode, 'BOOT_LOBBY');
  });

  await spec('mirror publishes do not dispatch runtime events', () => {
    const observeSrc = read(
      join(webRoot, 'src/lib/observed-presentation-state.ts'),
    );
    const mirrorSrc = read(
      join(webRoot, 'src/lib/observed-presentation-mirror.ts'),
    );
    const paritySrc = read(
      join(webRoot, 'src/lib/observed-presentation-parity.ts'),
    );
    for (const src of [observeSrc, mirrorSrc, paritySrc]) {
      assert.doesNotMatch(src, /\.dispatch\(/);
      assert.doesNotMatch(src, /CARD_ACTION_/);
      assert.doesNotMatch(src, /createNotificationRuntimeStore/);
    }
  });

  await spec('mirror subscription cannot influence rendering', () => {
    const flow = read(
      join(webRoot, 'src/components/instant-ban/InstantBanFlow.tsx'),
    );
    assert.equal(flow.includes('getObservedPresentationState'), false);
    assert.equal(flow.includes('subscribeObservedPresentation'), false);
    const returnIdx = flow.lastIndexOf('return (\n    <>');
    assert.ok(returnIdx > 0);
    const jsx = flow.slice(returnIdx);
    assert.equal(jsx.includes('observePresentationState'), false);
    assert.equal(jsx.includes('publishObservedPresentation'), false);

    // Subscriber mutation of a local copy must not feed back into paint owners.
    resetObservedPresentationMirror();
    let subscriberSaw: string | null = null;
    const unsub = subscribeObservedPresentation(() => {
      subscriberSaw = getObservedPresentationState()?.mode ?? null;
      // Attempted "influence" — ignored by production (no get in InstantBanFlow).
    });
    const observed = observePresentationState(
      baseParityInput({ phase: 'composingBan' }),
    );
    publishObservedPresentation(observed);
    assert.equal(subscriberSaw, 'WHAT');
    unsub();
  });

  await spec('zero existing render predicates changed (Stage 2 fingerprint)', () => {
    const flow = read(
      join(webRoot, 'src/components/instant-ban/InstantBanFlow.tsx'),
    );
    const page = read(join(webRoot, 'src/app/(miniapp)/page.tsx'));
    const providers = read(join(webRoot, 'src/components/Providers.tsx'));
    const needles = [
      '{banSentSuccess && successSnapshot ? (',
      '{confirmActive ? (',
      '{showBootOrb ? (',
      '{showLobbyOrb ? (',
      'data-instant-ban-view="SuccessOverlay"',
      'data-base-lobby-orb',
    ];
    for (const n of needles) {
      assert.ok(flow.includes(n), `missing InstantBanFlow predicate: ${n}`);
    }
    assert.ok(page.includes('{arenaVisible ? ('));
    assert.ok(page.includes('<InstantBanFlow'));
    assert.ok(providers.includes('<GlobalOverlayHost'));
    assert.ok(providers.includes('<DirectOverboardResultLayer'));
    assert.equal(page.includes('PresentationRoot'), false);
    assert.equal(providers.includes('PresentationRoot'), false);
  });

  await spec('oracle vs observe agree on mixed chrome edges', () => {
    const cases = [
      baseParityInput({ confirmActive: true, phase: 'confirming', showLobbyOrb: false }),
      baseParityInput({
        banSentSuccess: true,
        successSnapshot: successSnapshot(),
        overlayHostActive: true,
        activeOverlayKind: 'result',
        queueResultId: 'blocked',
      }),
      baseParityInput({
        showDirectOverboardLayer: true,
        directOverboardResultId: 'd1',
        overlayHostActive: true,
        activeOverlayKind: 'incoming',
        overlayDisplayId: 'should-not-win',
      }),
    ];
    for (const input of cases) {
      const observed = observePresentationState(input);
      const painted = derivePaintedDomSurface(input);
      assertObservedMatchesPainted(observed, painted, `edge:${observed.mode}`);
    }
  });

  // Collect observation notes (Stage 3A closed the SUCCESS→empty LOBBY gap).
  mismatches.push({
    scenario: '12. Startup with stale queued result',
    detail:
      'Runtime displayKind=result while host unmounted still paints BOOT_LOBBY; RESULT only after host mount — mirrored, not corrected (Stage 3A out of scope).',
    owner: 'Providers GlobalOverlayHost mount gate vs notification-runtime display',
  });

  console.log('\n--- parity mismatch report (observation only; no Stage 2 fixes) ---');
  for (const m of mismatches) {
    console.log(`  [${m.scenario}]`);
    console.log(`    detail: ${m.detail}`);
    console.log(`    owner:  ${m.owner}`);
  }

  const failed = results.filter((r) => !r.ok);
  console.log('\n---');
  console.log(
    `observed-presentation-parity: ${results.length - failed.length}/${results.length} passed`,
  );
  if (failed.length) {
    for (const f of failed) {
      console.error(`FAILED: ${f.name}: ${f.error}`);
    }
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
