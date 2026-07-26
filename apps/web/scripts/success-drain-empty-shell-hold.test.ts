/**
 * FIX A — SUCCESS-drain empty-shell Lobby presentation hold.
 *
 * A1–A5 cover the proven production flash:
 *   successExitDraining + runtime.display=null + prefetch/pending chain active
 *   → InstantBanFlow painted lobby-shell-render with the orb for ~1.1s before
 *     IncomingBanOverlay mounted.
 *
 * Run:
 *   npx tsx --tsconfig apps/web/tsconfig.json apps/web/scripts/success-drain-empty-shell-hold.test.ts
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  evaluateSuccessDrainEmptyShellHold,
  resolveLobbyOrbLayersWithSuccessDrainHold,
  SUCCESS_DRAIN_EMPTY_SHELL_HOLD_MAX_MS,
  type SuccessDrainEmptyShellHoldInput,
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

/** Exact proven production state at the first wrong lobby paint. */
function provenDrainState(
  overrides: Partial<SuccessDrainEmptyShellHoldInput> = {},
): SuccessDrainEmptyShellHoldInput {
  return {
    lobbyBootIntroPrimed: true,
    successHandoffOwnsPresentation: true,
    runtimeLifecycle: 'draining',
    runtimeDisplayKind: null,
    runtimeDisplayPayloadPresent: false,
    runtimeQueueLength: 0,
    runtimePendingCount: 1,
    notificationPresentationClaimed: true,
    drainPrefetchInFlight: true,
    drainCompletedEmpty: false,
    presentationOwnershipReleased: false,
    holdExpired: false,
    ...overrides,
  };
}

/** Mirrors the InstantBanFlow lobby render branch. */
function lobbyRenderBranch(input: SuccessDrainEmptyShellHoldInput): {
  branch: 'lobby' | 'base-null';
  showBootOrb: boolean;
  showLobbyOrb: boolean;
  hold: boolean;
  releaseReason: string;
} {
  const decision = evaluateSuccessDrainEmptyShellHold(input);
  const { showBootOrb, showLobbyOrb } =
    resolveLobbyOrbLayersWithSuccessDrainHold({
      hold: decision.hold,
      lobbyBootIntroPrimed: input.lobbyBootIntroPrimed,
      // Bootstrap hold is false in every SUCCESS-drain scenario (not booting).
      holdLobbyOrbForBootstrap: false,
    });
  return {
    branch: showBootOrb || showLobbyOrb ? 'lobby' : 'base-null',
    showBootOrb,
    showLobbyOrb,
    hold: decision.hold,
    releaseReason: decision.releaseReason,
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

async function main() {
  await spec(
    'A1: SUCCESS draining + display null + prefetch/pending chain active → no Lobby orb paint',
    () => {
      const render = lobbyRenderBranch(provenDrainState());
      assert.equal(render.hold, true, 'hold must be active');
      assert.equal(render.releaseReason, 'holding-awaiting-materialization');
      assert.equal(render.showLobbyOrb, false, 'no lobby orb');
      assert.equal(render.showBootOrb, false, 'no boot orb');
      assert.equal(
        render.branch,
        'base-null',
        'InstantBanFlow must not take the lobby-shell-render branch',
      );
    },
  );

  await spec(
    'A1b: hold also covers the pre-handoff frame (runtime still idle, pending chain exists)',
    () => {
      // Proven trace: two lobby-shell-render frames landed BEFORE
      // SUCCESS_HANDOFF flipped lifecycle to draining.
      const render = lobbyRenderBranch(
        provenDrainState({
          runtimeLifecycle: 'idle',
          notificationPresentationClaimed: false,
          drainPrefetchInFlight: false,
          runtimePendingCount: 1,
        }),
      );
      assert.equal(render.hold, true);
      assert.equal(render.branch, 'base-null');
    },
  );

  await spec(
    'A2: runtime materializes incoming → hold releases, IncomingBanOverlay mounts with no intermediate Lobby frame',
    () => {
      const during = evaluateSuccessDrainEmptyShellHold(provenDrainState());
      assert.equal(during.hold, true);

      // Materialize edge: display becomes incoming while handoff is still active.
      const after = provenDrainState({
        runtimeLifecycle: 'showing',
        runtimeDisplayKind: 'incoming',
        runtimeDisplayPayloadPresent: true,
      });
      const decision = evaluateSuccessDrainEmptyShellHold(after);
      assert.equal(decision.hold, false);
      assert.equal(decision.releaseReason, 'runtime-materialized-head');

      // The frame that releases the hold is the frame that owns the card,
      // so no lobby frame can be interleaved: the runtime claims the screen.
      assert.equal(after.notificationPresentationClaimed, true);

      for (const kind of ['incoming', 'check', 'result'] as const) {
        const d = evaluateSuccessDrainEmptyShellHold(
          provenDrainState({
            runtimeDisplayKind: kind,
            runtimeDisplayPayloadPresent: true,
          }),
        );
        assert.equal(d.hold, false, `must release for materialized ${kind}`);
        assert.equal(d.releaseReason, 'runtime-materialized-head');
      }
    },
  );

  await spec(
    'A3: drain completes explicitly empty → hold releases, Lobby may render',
    () => {
      const decision = evaluateSuccessDrainEmptyShellHold(
        provenDrainState({
          runtimeLifecycle: 'idle',
          notificationPresentationClaimed: false,
          drainPrefetchInFlight: false,
          runtimeQueueLength: 0,
          runtimePendingCount: 0,
          drainCompletedEmpty: true,
        }),
      );
      assert.equal(decision.hold, false);
      assert.equal(decision.releaseReason, 'drain-completed-empty');

      const render = lobbyRenderBranch(
        provenDrainState({
          runtimeLifecycle: 'idle',
          notificationPresentationClaimed: false,
          drainPrefetchInFlight: false,
          runtimeQueueLength: 0,
          runtimePendingCount: 0,
          drainCompletedEmpty: true,
        }),
      );
      assert.equal(render.showLobbyOrb, true, 'Lobby orb may paint again');
      assert.equal(render.branch, 'lobby');
    },
  );

  await spec(
    'A4: drain fails / releases ownership → hold releases, no permanent blank screen',
    () => {
      const failed = evaluateSuccessDrainEmptyShellHold(
        provenDrainState({ presentationOwnershipReleased: true }),
      );
      assert.equal(failed.hold, false);
      assert.equal(failed.releaseReason, 'presentation-ownership-released');

      // Handoff flag cleared by the host finally-block.
      const handoffCleared = evaluateSuccessDrainEmptyShellHold(
        provenDrainState({
          successHandoffOwnsPresentation: false,
          runtimeLifecycle: 'idle',
          notificationPresentationClaimed: false,
          drainPrefetchInFlight: false,
        }),
      );
      assert.equal(handoffCleared.hold, false);
      assert.equal(handoffCleared.releaseReason, 'not-success-handoff');

      // Bounded safety net: a drain that never settles still releases.
      const expired = evaluateSuccessDrainEmptyShellHold(
        provenDrainState({ holdExpired: true }),
      );
      assert.equal(expired.hold, false);
      assert.equal(expired.releaseReason, 'hold-expired');
      assert.equal(
        lobbyRenderBranch(provenDrainState({ holdExpired: true })).branch,
        'lobby',
        'expired hold must fall back to lobby, never a blank screen',
      );
      assert.ok(
        SUCCESS_DRAIN_EMPTY_SHELL_HOLD_MAX_MS > 0 &&
          SUCCESS_DRAIN_EMPTY_SHELL_HOLD_MAX_MS <= 5000,
        'bound must be finite and short',
      );
    },
  );

  await spec('A5: normal Lobby outside SUCCESS drain → unchanged', () => {
    const idleLobby = provenDrainState({
      successHandoffOwnsPresentation: false,
      runtimeLifecycle: 'idle',
      runtimeQueueLength: 0,
      runtimePendingCount: 0,
      notificationPresentationClaimed: false,
      drainPrefetchInFlight: false,
      drainCompletedEmpty: true,
    });
    const render = lobbyRenderBranch(idleLobby);
    assert.equal(render.hold, false);
    assert.equal(render.showLobbyOrb, true);
    assert.equal(render.branch, 'lobby');

    // Lobby with an unread indicator but no SUCCESS handoff stays unchanged.
    const indicatorLobby = provenDrainState({
      successHandoffOwnsPresentation: false,
      runtimeLifecycle: 'idle',
      runtimePendingCount: 3,
      notificationPresentationClaimed: false,
      drainPrefetchInFlight: false,
    });
    const indicatorRender = lobbyRenderBranch(indicatorLobby);
    assert.equal(indicatorRender.hold, false);
    assert.equal(indicatorRender.releaseReason, 'not-success-handoff');
    assert.equal(indicatorRender.showLobbyOrb, true);

    // Cold boot orb is untouched by the hold.
    const coldBoot = resolveLobbyOrbLayersWithSuccessDrainHold({
      hold: false,
      lobbyBootIntroPrimed: false,
      holdLobbyOrbForBootstrap: false,
    });
    assert.equal(coldBoot.showBootOrb, true);
    assert.equal(coldBoot.showLobbyOrb, false);
    assert.equal(
      evaluateSuccessDrainEmptyShellHold(
        provenDrainState({ lobbyBootIntroPrimed: false }),
      ).releaseReason,
      'lobby-boot-not-primed',
      'hold can never be true before boot intro is primed',
    );

    // Bootstrap hold behaviour (boot orb swap) is preserved.
    const bootstrapHold = resolveLobbyOrbLayersWithSuccessDrainHold({
      hold: false,
      lobbyBootIntroPrimed: true,
      holdLobbyOrbForBootstrap: true,
    });
    assert.equal(bootstrapHold.showBootOrb, true);
    assert.equal(bootstrapHold.showLobbyOrb, false);
  });

  await spec(
    'NO STARVATION: every hold state has a release edge; hold is impossible once anything settles',
    () => {
      const releasingOverrides: Array<Partial<SuccessDrainEmptyShellHoldInput>> =
        [
          { runtimeDisplayKind: 'incoming', runtimeDisplayPayloadPresent: true },
          { runtimeDisplayPayloadPresent: true },
          { presentationOwnershipReleased: true },
          { drainCompletedEmpty: true },
          { successHandoffOwnsPresentation: false },
          { holdExpired: true },
          {
            notificationPresentationClaimed: false,
            drainPrefetchInFlight: false,
            runtimeLifecycle: 'idle',
            runtimeQueueLength: 0,
            runtimePendingCount: 0,
          },
        ];
      for (const overrides of releasingOverrides) {
        const decision = evaluateSuccessDrainEmptyShellHold(
          provenDrainState(overrides),
        );
        assert.equal(
          decision.hold,
          false,
          `must release for ${JSON.stringify(overrides)}`,
        );
      }
    },
  );

  await spec(
    'purity: hold module never mutates queue / pending / consumption / CTA',
    () => {
      assert.doesNotMatch(
        holdSrc,
        /dispatch|consumed\.|markShown|removeFromQueue|showLobbyCta|setState/,
        'hold module must be a pure paint gate',
      );
      assert.match(
        holdSrc,
        /suppresses paint only/,
        'module must document that it only suppresses paint',
      );
    },
  );

  await spec('wiring: InstantBanFlow gates the base lobby layers on the hold', () => {
    assert.match(
      flowSrc,
      /evaluateSuccessDrainEmptyShellHold\(/,
      'InstantBanFlow must evaluate the hold',
    );
    assert.match(
      flowSrc,
      /const \{ showBootOrb, showLobbyOrb \} =\s*\n\s*resolveLobbyOrbLayersWithSuccessDrainHold\(\{/,
      'orb layers must be resolved through the hold',
    );
    assert.match(
      flowSrc,
      /!successEmptyShellHold/,
      'persistent lobby logo must also be gated',
    );
    assert.match(
      flowSrc,
      /logSuccessEmptyShellHoldEnter\(fields\)/,
      'enter diagnostic must be edge-only',
    );
    assert.match(
      flowSrc,
      /logSuccessEmptyShellHoldRelease\(\{/,
      'release diagnostic must carry heldMs',
    );
    // Constraints: CTA eligibility and reducer semantics untouched.
    assert.doesNotMatch(
      flowSrc,
      /showLobbyCta =[^\n]*successEmptyShellHold/,
      'must not change Lobby CTA eligibility',
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
