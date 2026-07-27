/**
 * Stage 3A — SUCCESS → next handoff (eliminate empty LOBBY gap).
 *
 * Run:
 *   npx tsx --tsconfig apps/web/tsconfig.json apps/web/scripts/success-to-next-handoff.test.ts
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  evaluateSuccessToNextHandoff,
  type SuccessToNextHandoffInput,
} from '../src/lib/success-to-next-handoff';
import {
  baseParityInput,
  derivePaintedDomSurface,
  idleRuntime,
  PresentationParityRecorder,
} from '../src/lib/observed-presentation-parity';
import { observePresentationState } from '../src/lib/observed-presentation-state';
import {
  notificationTransitionOwnsPresentation,
  resolveLobbyOrbLayersWithSuccessDrainHold,
} from '../src/lib/success-drain-empty-shell-hold';
import { resetObservedPresentationMirror } from '../src/lib/observed-presentation-mirror';

type SpecResult = { name: string; ok: boolean; error?: string };
const results: SpecResult[] = [];
const webRoot = join(__dirname, '..');
const INSTANCE = 'instant-ban-flow-stage3a';

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

function handoffInput(
  overrides: Partial<SuccessToNextHandoffInput> = {},
): SuccessToNextHandoffInput {
  return {
    banSentSuccess: true,
    hasSuccessSnapshot: true,
    handoffArmed: true,
    runtimeDisplayKind: null,
    runtimeDisplayPayloadPresent: false,
    notificationPresentationClaimed: false,
    chainExplicitlyEmpty: false,
    presentationOwnershipReleased: false,
    ...overrides,
  };
}

function successSnap() {
  return {
    selectedUserId: 'friend-1',
    banText: 'stage3a',
    durationMinutes: 30,
    replyToBanId: null as string | null,
  };
}

async function main() {
  console.log('\n=== STAGE 3A — SUCCESS → NEXT HANDOFF ===\n');
  resetObservedPresentationMirror();

  await spec('contract: display null while armed → SUCCESS_HANDOFF_WAIT (not Lobby)', () => {
    const d = evaluateSuccessToNextHandoff(handoffInput());
    assert.equal(d.phase, 'SUCCESS_HANDOFF_WAIT');
    assert.equal(d.retainSuccessPresentation, true);
    assert.equal(d.mayClearSuccessLocal, false);
    assert.equal(d.allowLobbyBase, false);
  });

  await spec('contract: materialize+claimed → NEXT_NOTIFICATION_VISIBLE', () => {
    const d = evaluateSuccessToNextHandoff(
      handoffInput({
        runtimeDisplayKind: 'incoming',
        runtimeDisplayPayloadPresent: true,
        notificationPresentationClaimed: true,
      }),
    );
    assert.equal(d.phase, 'NEXT_NOTIFICATION_VISIBLE');
    assert.equal(d.mayClearSuccessLocal, true);
    assert.equal(d.retainSuccessPresentation, false);
    assert.equal(d.allowLobbyBase, false);
  });

  await spec('contract: explicit empty → EMPTY_LOBBY_RELEASED once', () => {
    const d = evaluateSuccessToNextHandoff(
      handoffInput({ chainExplicitlyEmpty: true }),
    );
    assert.equal(d.phase, 'EMPTY_LOBBY_RELEASED');
    assert.equal(d.mayClearSuccessLocal, true);
    assert.equal(d.allowLobbyBase, true);
  });

  await spec('contract: failure retains SUCCESS — never Lobby from null display', () => {
    const d = evaluateSuccessToNextHandoff(
      handoffInput({ presentationOwnershipReleased: true }),
    );
    assert.equal(d.phase, 'SUCCESS_HANDOFF_WAIT');
    assert.equal(d.releaseReason, 'retain-on-failure');
    assert.equal(d.retainSuccessPresentation, true);
    assert.equal(d.mayClearSuccessLocal, false);
    assert.equal(d.allowLobbyBase, false);
  });

  await spec('SUCCESS → incoming has no observed LOBBY frame', () => {
    const snap = successSnap();
    const rec = new PresentationParityRecorder(INSTANCE);
    rec.record({
      label: 'SUCCESS_VISIBLE',
      input: baseParityInput({
        banSentSuccess: true,
        successSnapshot: snap,
        showLobbyOrb: false,
        successHandoffArmed: false,
      }),
      runtime: idleRuntime(),
    });
    rec.record({
      label: 'SUCCESS_HANDOFF_WAIT',
      input: baseParityInput({
        banSentSuccess: true,
        successSnapshot: snap,
        showBootOrb: false,
        showLobbyOrb: false,
        persistentLogoVisible: false,
        showLobbyChrome: false,
        successHandoffArmed: true,
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
    assert.deepEqual(rec.modes(), [
      'SUCCESS',
      'SUCCESS_HANDOFF_WAIT',
      'INCOMING',
    ]);
    assert.equal(rec.modes().includes('LOBBY'), false);
  });

  await spec('SUCCESS → incoming has no painted Lobby orb/logo/chrome frame', () => {
    const snap = successSnap();
    const waitInput = baseParityInput({
      banSentSuccess: true,
      successSnapshot: snap,
      showBootOrb: false,
      showLobbyOrb: false,
      persistentLogoVisible: false,
      showLobbyChrome: false,
      successHandoffArmed: true,
    });
    const painted = derivePaintedDomSurface(waitInput);
    assert.equal(painted.mode, 'SUCCESS_HANDOFF_WAIT');
    assert.equal(painted.domIds.includes('data-base-lobby-orb'), false);
    // InstantBanFlow wiring: armed + !allowLobbyBase suppresses lobby layers.
    const decision = evaluateSuccessToNextHandoff(handoffInput());
    const owns = notificationTransitionOwnsPresentation({
      successPresentationHandoffHold: !decision.allowLobbyBase,
      interactiveActionOwnsPresentation: false,
    });
    const layers = resolveLobbyOrbLayersWithSuccessDrainHold({
      hold: owns,
      lobbyBootIntroPrimed: true,
      holdLobbyOrbForBootstrap: false,
    });
    assert.equal(layers.showBootOrb, false);
    assert.equal(layers.showLobbyOrb, false);
  });

  await spec('SUCCESS → empty queue releases to Lobby exactly once', () => {
    const snap = successSnap();
    const rec = new PresentationParityRecorder(INSTANCE);
    rec.record({
      label: 'handoff-wait',
      input: baseParityInput({
        banSentSuccess: true,
        successSnapshot: snap,
        showLobbyOrb: false,
        showLobbyChrome: false,
        successHandoffArmed: true,
      }),
      runtime: idleRuntime({ lifecycle: 'draining' }),
    });
    // Terminal empty — SUCCESS cleared, Lobby allowed once.
    rec.record({
      label: 'empty-lobby-released',
      input: baseParityInput({
        banSentSuccess: false,
        successSnapshot: null,
        phase: 'idle',
        showLobbyOrb: true,
        persistentLogoVisible: true,
        showLobbyChrome: true,
        successHandoffArmed: false,
      }),
      runtime: idleRuntime({ lifecycle: 'idle', queueLength: 0 }),
    });
    rec.assertParity();
    assert.deepEqual(rec.modes(), ['SUCCESS_HANDOFF_WAIT', 'LOBBY']);
    const lobbyFrames = rec.samples.filter((s) => s.observed.mode === 'LOBBY');
    assert.equal(lobbyFrames.length, 1);
  });

  await spec('SUCCESS snapshot remains available until handoff terminal', () => {
    const snap = successSnap();
    const wait = observePresentationState(
      baseParityInput({
        banSentSuccess: true,
        successSnapshot: snap,
        successHandoffArmed: true,
        showLobbyOrb: false,
      }),
    );
    assert.equal(wait.mode, 'SUCCESS_HANDOFF_WAIT');
    assert.ok(
      wait.mode === 'SUCCESS_HANDOFF_WAIT' &&
        wait.snapshot.banText === 'stage3a',
    );
    const d = evaluateSuccessToNextHandoff(handoffInput());
    assert.equal(d.mayClearSuccessLocal, false);
    assert.equal(d.retainSuccessPresentation, true);
  });

  await spec('InstantBanFlow instance remains stable', () => {
    const snap = successSnap();
    const rec = new PresentationParityRecorder(INSTANCE);
    for (const label of ['a', 'b', 'c'] as const) {
      rec.record({
        label,
        input: baseParityInput({
          banSentSuccess: true,
          successSnapshot: snap,
          successHandoffArmed: true,
          showLobbyOrb: false,
        }),
        runtime: idleRuntime({ lifecycle: 'draining' }),
      });
    }
    rec.assertContinuousMount();
  });

  await spec('no startup behavior changes / stale startup result unchanged', () => {
    const boot = observePresentationState(
      baseParityInput({
        lobbyBootIntroPrimed: false,
        showBootOrb: true,
        showLobbyOrb: false,
        successHandoffArmed: false,
      }),
    );
    assert.equal(boot.mode, 'BOOT_LOBBY');
    const staleUnmounted = observePresentationState(
      baseParityInput({
        lobbyBootIntroPrimed: false,
        showBootOrb: true,
        showLobbyOrb: false,
        overlayHostActive: false,
        activeOverlayKind: null,
        overlayDisplayId: 'stale-r1',
        successHandoffArmed: false,
      }),
    );
    assert.equal(staleUnmounted.mode, 'BOOT_LOBBY');
    const staleMounted = observePresentationState(
      baseParityInput({
        lobbyBootIntroPrimed: false,
        showBootOrb: true,
        overlayHostActive: true,
        activeOverlayKind: 'result',
        queueResultId: 'stale-r1',
        overlayDisplayId: 'stale-r1',
        successHandoffArmed: false,
      }),
    );
    assert.equal(staleMounted.mode, 'RESULT');
  });

  await spec('WHAT / CONFIRM / SENDING unchanged', () => {
    assert.equal(
      observePresentationState(
        baseParityInput({ phase: 'composingBan', successHandoffArmed: false }),
      ).mode,
      'WHAT',
    );
    assert.equal(
      observePresentationState(
        baseParityInput({
          phase: 'confirming',
          confirmActive: true,
          successHandoffArmed: false,
        }),
      ).mode,
      'CONFIRM',
    );
    assert.equal(
      observePresentationState(
        baseParityInput({
          phase: 'confirming',
          confirmActive: true,
          inFlight: true,
          successHandoffArmed: false,
        }),
      ).mode,
      'SENDING',
    );
  });

  await spec('incoming / check / result behavior unchanged', () => {
    assert.equal(
      observePresentationState(
        baseParityInput({
          overlayHostActive: true,
          activeOverlayKind: 'incoming',
          overlayDisplayId: 'i1',
        }),
      ).mode,
      'INCOMING',
    );
    assert.equal(
      observePresentationState(
        baseParityInput({
          overlayHostActive: true,
          activeOverlayKind: 'check',
          overlayDisplayId: 'c1',
        }),
      ).mode,
      'CHECK',
    );
    assert.equal(
      observePresentationState(
        baseParityInput({
          showDirectOverboardLayer: true,
          directOverboardResultId: 'd1',
        }),
      ).mode,
      'RESULT',
    );
  });

  await spec('observer still matches DOM (oracle parity)', () => {
    const snap = successSnap();
    for (const input of [
      baseParityInput({
        banSentSuccess: true,
        successSnapshot: snap,
        successHandoffArmed: false,
      }),
      baseParityInput({
        banSentSuccess: true,
        successSnapshot: snap,
        successHandoffArmed: true,
        showLobbyOrb: false,
      }),
      baseParityInput({
        overlayHostActive: true,
        activeOverlayKind: 'incoming',
        overlayDisplayId: 'x',
      }),
    ]) {
      const observed = observePresentationState(input);
      const painted = derivePaintedDomSurface(input);
      assert.equal(observed.mode, painted.mode);
    }
  });

  await spec('no new timeout/delay-based fix in Stage 3A contract', () => {
    const src = read(join(webRoot, 'src/lib/success-to-next-handoff.ts'));
    assert.doesNotMatch(src, /setTimeout|setInterval|HOLD_MAX_MS|holdExpired/);
    assert.doesNotMatch(src, /PresentationRoot/);
    const flow = read(
      join(webRoot, 'src/components/instant-ban/InstantBanFlow.tsx'),
    );
    assert.match(flow, /evaluateSuccessToNextHandoff/);
    assert.match(flow, /Stage 3A send-success: keep banSentSuccess/);
    assert.match(
      flow,
      /lobbySource === 'reply-parent-active'[\s\S]{0,180}setBanSentSuccess\(false\)/,
    );
  });

  await spec('wiring: InstantBanFlow retains SUCCESS until mayClear', () => {
    const flow = read(
      join(webRoot, 'src/components/instant-ban/InstantBanFlow.tsx'),
    );
    assert.match(flow, /successToNextHandoff\.mayClearSuccessLocal/);
    assert.match(flow, /retainSuccessPresentation/);
    assert.match(
      flow,
      /setSuccessPresentationHandoffArmed\(true\);\s*\n\s*if \(opts\.lobbySource === 'reply-parent-active'\)/,
    );
  });

  const failed = results.filter((r) => !r.ok);
  console.log('\n---');
  console.log(
    `success-to-next-handoff: ${results.length - failed.length}/${results.length} passed`,
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
