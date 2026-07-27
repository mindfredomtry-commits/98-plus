/**
 * FIX A — SUCCESS presentation handoff hold (base Lobby suppression).
 *
 * Required invariant: once SUCCESS exit arms the latch synchronously, base orb
 * + logo + chrome stay hidden until an explicit terminal runtime outcome —
 * not because display is null, not because successExitDraining cleared.
 *
 * Run:
 *   npx tsx --tsconfig apps/web/tsconfig.json apps/web/scripts/success-drain-empty-shell-hold.test.ts
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  evaluateSuccessPresentationHandoffHold,
  notificationTransitionOwnsPresentation,
  resolveLobbyOrbLayersWithSuccessDrainHold,
  SUCCESS_PRESENTATION_HANDOFF_HOLD_MAX_MS,
  type SuccessPresentationHandoffHoldInput,
} from '../src/lib/success-drain-empty-shell-hold';

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

/** Armed SUCCESS exit with null display — the proven orb-flash frame. */
function armedNullDisplay(
  overrides: Partial<SuccessPresentationHandoffHoldInput> = {},
): SuccessPresentationHandoffHoldInput {
  return {
    lobbyBootIntroPrimed: true,
    handoffArmed: true,
    runtimeLifecycle: 'idle',
    runtimeDisplayKind: null,
    runtimeDisplayPayloadPresent: false,
    runtimeQueueLength: 0,
    notificationPresentationClaimed: false,
    chainExplicitlyEmpty: false,
    presentationOwnershipReleased: false,
    holdExpired: false,
    ...overrides,
  };
}

function lobbyRenderBranch(input: SuccessPresentationHandoffHoldInput): {
  branch: 'lobby' | 'base-null';
  showBootOrb: boolean;
  showLobbyOrb: boolean;
  hold: boolean;
  releaseReason: string;
  logoVisible: boolean;
  chromeVisible: boolean;
} {
  const decision = evaluateSuccessPresentationHandoffHold(input);
  const owns = notificationTransitionOwnsPresentation({
    successPresentationHandoffHold: decision.hold,
    interactiveActionOwnsPresentation: false,
  });
  const { showBootOrb, showLobbyOrb } =
    resolveLobbyOrbLayersWithSuccessDrainHold({
      hold: owns,
      lobbyBootIntroPrimed: input.lobbyBootIntroPrimed,
      holdLobbyOrbForBootstrap: false,
    });
  return {
    branch: showBootOrb || showLobbyOrb ? 'lobby' : 'base-null',
    showBootOrb,
    showLobbyOrb,
    hold: decision.hold,
    releaseReason: decision.releaseReason,
    logoVisible: !owns,
    chromeVisible: !owns,
  };
}

const ROOT = join(__dirname, '..');
const holdSrc = readFileSync(
  join(ROOT, 'src/lib/success-drain-empty-shell-hold.ts'),
  'utf8',
);
const flowSrc = readFileSync(
  join(ROOT, 'src/components/instant-ban/InstantBanFlow.tsx'),
  'utf8',
);
const debugSrc = readFileSync(
  join(ROOT, 'src/lib/success-drain-empty-shell-hold-debug.ts'),
  'utf8',
);

async function main() {
  console.log('\n=== FIX A — SUCCESS PRESENTATION HANDOFF HOLD ===\n');

  await spec(
    'A1: SUCCESS exits and runtime display is null for one or more renders → base orb remains hidden',
    () => {
      for (const lifecycle of ['idle', 'draining', 'booting'] as const) {
        const render = lobbyRenderBranch(
          armedNullDisplay({ runtimeLifecycle: lifecycle }),
        );
        assert.equal(render.hold, true, `hold for lifecycle=${lifecycle}`);
        assert.equal(render.showLobbyOrb, false);
        assert.equal(render.showBootOrb, false);
        assert.equal(render.branch, 'base-null');
        assert.equal(render.logoVisible, false, 'logo must hide with orb');
        assert.equal(render.chromeVisible, false, 'chrome must hide with orb');
      }
    },
  );

  await spec(
    'A2: SUCCESS exits and incoming materializes → no render permits base orb between SUCCESS and incoming',
    () => {
      const frames = [
        armedNullDisplay(),
        armedNullDisplay({ runtimeLifecycle: 'draining' }),
        armedNullDisplay({
          runtimeLifecycle: 'showing',
          runtimeDisplayKind: 'incoming',
          runtimeDisplayPayloadPresent: true,
          expectedDisplayId: 'in-1',
          // Claim / materialize not enough — keep holding until DOM mount.
          notificationPresentationClaimed: true,
          nextDisplayDomMounted: false,
        }),
        armedNullDisplay({
          runtimeLifecycle: 'showing',
          runtimeDisplayKind: 'incoming',
          runtimeDisplayPayloadPresent: true,
          expectedDisplayId: 'in-1',
          notificationPresentationClaimed: true,
          nextDisplayDomMounted: true,
        }),
      ];
      const holds = frames.map((f) => lobbyRenderBranch(f));
      assert.equal(holds[0]!.hold, true);
      assert.equal(holds[1]!.hold, true);
      assert.equal(holds[2]!.hold, true, 'materialized but unmounted still holds');
      assert.equal(holds[2]!.branch, 'base-null');
      assert.equal(holds[3]!.hold, false);
      assert.equal(holds[3]!.releaseReason, 'next-display-dom-mounted');
      // No intermediate lobby paint while hold was active.
      for (const h of holds.slice(0, 3)) {
        assert.equal(h!.branch, 'base-null');
        assert.equal(h!.showLobbyOrb, false);
      }
    },
  );

  await spec(
    'A3: SUCCESS exits and result materializes → no base orb frame',
    () => {
      const during = lobbyRenderBranch(armedNullDisplay());
      assert.equal(during.hold, true);
      assert.equal(during.branch, 'base-null');

      const after = lobbyRenderBranch(
        armedNullDisplay({
          runtimeLifecycle: 'showing',
          runtimeDisplayKind: 'result',
          runtimeDisplayPayloadPresent: true,
          expectedDisplayId: 'res-1',
          notificationPresentationClaimed: true,
          nextDisplayDomMounted: false,
        }),
      );
      assert.equal(after.hold, false);
      assert.equal(after.releaseReason, 'runtime-materialized-and-claimed');
    },
  );

  await spec(
    'A4: SUCCESS exits and runtime explicitly reports empty → hold releases and complete Lobby renders',
    () => {
      const render = lobbyRenderBranch(
        armedNullDisplay({
          chainExplicitlyEmpty: true,
          runtimeLifecycle: 'idle',
          notificationPresentationClaimed: false,
        }),
      );
      assert.equal(render.hold, false);
      assert.equal(render.releaseReason, 'chain-explicitly-empty');
      assert.equal(render.showLobbyOrb, true);
      assert.equal(render.logoVisible, true);
      assert.equal(render.chromeVisible, true);
      assert.equal(render.branch, 'lobby');
    },
  );

  await spec(
    'A5: successExitDraining becomes false before materialization → hold remains active',
    () => {
      // Latch stays armed even though the draining flag was cleared in finally.
      const render = lobbyRenderBranch(
        armedNullDisplay({
          handoffArmed: true,
          runtimeLifecycle: 'idle',
          runtimeDisplayKind: null,
          notificationPresentationClaimed: false,
        }),
      );
      assert.equal(render.hold, true);
      assert.equal(
        render.releaseReason,
        'holding-armed-awaiting-terminal',
      );
      assert.equal(render.branch, 'base-null');
    },
  );

  await spec(
    'A6: no pending/prefetch flag on the first post-SUCCESS render → hold still remains active',
    () => {
      // The old hold required pending/prefetch — that was the defect.
      const render = lobbyRenderBranch(
        armedNullDisplay({
          runtimeLifecycle: 'idle',
          runtimeQueueLength: 0,
          notificationPresentationClaimed: false,
        }),
      );
      assert.equal(render.hold, true);
      assert.equal(render.branch, 'base-null');
      assert.doesNotMatch(
        holdSrc,
        /runtimePendingCount|drainPrefetchInFlight/,
        'latch evaluator must not require pending/prefetch evidence',
      );
    },
  );

  await spec(
    'A7: safety timeout → hold releases without permanent blank screen',
    () => {
      const render = lobbyRenderBranch(
        armedNullDisplay({ holdExpired: true }),
      );
      assert.equal(render.hold, false);
      assert.equal(render.releaseReason, 'hold-expired');
      assert.equal(render.branch, 'lobby');
      assert.ok(
        SUCCESS_PRESENTATION_HANDOFF_HOLD_MAX_MS > 0 &&
          SUCCESS_PRESENTATION_HANDOFF_HOLD_MAX_MS <= 10_000,
      );
    },
  );

  await spec('A8: full Lobby still works normally outside SUCCESS handoff', () => {
    const idle = lobbyRenderBranch(
      armedNullDisplay({ handoffArmed: false }),
    );
    assert.equal(idle.hold, false);
    assert.equal(idle.releaseReason, 'not-armed');
    assert.equal(idle.showLobbyOrb, true);
    assert.equal(idle.branch, 'lobby');

    const coldBoot = resolveLobbyOrbLayersWithSuccessDrainHold({
      hold: false,
      lobbyBootIntroPrimed: false,
      holdLobbyOrbForBootstrap: false,
    });
    assert.equal(coldBoot.showBootOrb, true);
    assert.equal(coldBoot.showLobbyOrb, false);

    assert.equal(
      evaluateSuccessPresentationHandoffHold(
        armedNullDisplay({ lobbyBootIntroPrimed: false }),
      ).releaseReason,
      'lobby-boot-not-primed',
    );
  });

  await spec(
    'orb/logo presentation rule: notificationTransitionOwnsPresentation gates both together',
    () => {
      assert.equal(
        notificationTransitionOwnsPresentation({
          successPresentationHandoffHold: true,
          interactiveActionOwnsPresentation: false,
        }),
        true,
      );
      assert.equal(
        notificationTransitionOwnsPresentation({
          successPresentationHandoffHold: false,
          interactiveActionOwnsPresentation: true,
        }),
        true,
      );
      assert.equal(
        notificationTransitionOwnsPresentation({
          successPresentationHandoffHold: false,
          interactiveActionOwnsPresentation: false,
        }),
        false,
      );
      // Mere display null must not release an armed latch.
      assert.equal(
        evaluateSuccessPresentationHandoffHold(armedNullDisplay()).hold,
        true,
      );
    },
  );

  await spec('diagnostics + InstantBanFlow wiring', () => {
    assert.match(debugSrc, /SUCCESS_PRESENTATION_HANDOFF_ARMED/);
    assert.match(debugSrc, /SUCCESS_PRESENTATION_HANDOFF_RELEASED/);
    assert.match(
      flowSrc,
      /setSuccessPresentationHandoffArmed\(true\)/,
      'must arm latch synchronously',
    );
    // Stage 3A: send-success retains SUCCESS until terminal; reply-parent still
    // clears after arm. Arm must still happen before any SUCCESS clear.
    assert.match(
      flowSrc,
      /setSuccessPresentationHandoffArmed\(true\);[\s\S]*?setBanSentSuccess\(false\)/,
      'arm must precede SUCCESS unmount (reply-parent path)',
    );
    assert.match(flowSrc, /evaluateSuccessToNextHandoff\(/);
    assert.match(flowSrc, /evaluateSuccessPresentationHandoffHold\(/);
    assert.match(flowSrc, /notificationTransitionOwnsPresentation\(/);
    assert.match(flowSrc, /!transitionOwnsPresentation/);
    assert.match(
      flowSrc,
      /setSuccessPresentationChainExplicitlyEmpty\(true\)/,
      'empty chain must be an explicit terminal signal',
    );
    assert.doesNotMatch(
      holdSrc,
      /dispatch|consumed\.|markShown|removeFromQueue|setState/,
      'hold module must remain presentation-only',
    );
  });

  const failed = results.filter((r) => !r.ok);
  console.log('\n---');
  console.log(
    `success-drain-empty-shell-hold: ${results.length - failed.length}/${results.length} passed`,
  );
  if (failed.length) {
    for (const f of failed) {
      console.error(`FAILED: ${f.name}: ${f.error}`);
    }
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
