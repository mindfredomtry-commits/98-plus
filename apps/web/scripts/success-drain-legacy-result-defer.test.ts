/**
 * SUCCESS-drain legacy ResultOverlay single-owner paint gate.
 *
 * A–E cover the proven production flash:
 *   LATE_RESULT owner result + SUCCESS draining + runtime display null
 *   → must not claim/paint ResultOverlay; must not consume the owner result;
 *   then runtime incoming must be able to take the shell.
 *
 * Run:
 *   npx tsx --tsconfig apps/web/tsconfig.json apps/web/scripts/success-drain-legacy-result-defer.test.ts
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  explainSuccessDrainLegacyResultDeferRelease,
  resolveShellKindWithLegacyResultDeferred,
  runtimeOwnsMatchingResultDisplay,
  shouldDeferLegacyResultOverlayPaint,
  type SuccessDrainLegacyResultDeferInput,
} from '../src/lib/success-drain-legacy-result-defer';
import { resolveQueueResultOverlayClaimed } from '../src/lib/queue-result-overlay-claim-trace-debug';

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

function base(
  overrides: Partial<SuccessDrainLegacyResultDeferInput> = {},
): SuccessDrainLegacyResultDeferInput {
  return {
    successExitDraining: true,
    runtimeLifecycle: 'draining',
    runtimeDisplayKind: null,
    runtimeDisplayResultId: null,
    legacyResultPaintCandidate: true,
    legacyResultId: 'cms0t5gx00dflry0px1wfpyha',
    ...overrides,
  };
}

/** Mirrors Providers paint decision after the gate. */
function wouldMountResultOverlay(input: {
  defer: boolean;
  queueHeadKind: string | null;
  activeKind: string | null;
  effectiveShellKind: string | null;
  hasPayload: boolean;
}): boolean {
  if (input.defer) return false;
  const claimed = resolveQueueResultOverlayClaimed({
    queueHeadKind: input.queueHeadKind,
    activeKind: input.activeKind,
    effectiveShellKind: input.effectiveShellKind,
  }).claimed;
  const shellShowsResult =
    input.effectiveShellKind === 'result' && input.hasPayload;
  return input.hasPayload && (shellShowsResult || claimed);
}

const ROOT = join(__dirname, '..');
const providersSrc = readFileSync(
  join(ROOT, 'src/components/Providers.tsx'),
  'utf8',
);
const gateSrc = readFileSync(
  join(ROOT, 'src/lib/success-drain-legacy-result-defer.ts'),
  'utf8',
);

async function main() {
  await spec(
    'A: pre-SUCCESS LATE_RESULT owner result + SUCCESS draining + runtime display null → no ResultOverlay / no flash',
    () => {
      const input = base();
      const defer = shouldDeferLegacyResultOverlayPaint(input);
      assert.equal(defer, true, 'must defer legacy result during SUCCESS drain');

      const shell = resolveShellKindWithLegacyResultDeferred(
        defer,
        'result',
        null,
      );
      assert.equal(shell, null, 'must not keep shellKind=result while awaiting');

      const mounts = wouldMountResultOverlay({
        defer,
        queueHeadKind: 'result',
        activeKind: 'result',
        effectiveShellKind: shell,
        hasPayload: true,
      });
      assert.equal(mounts, false, 'ResultOverlay must not mount');
    },
  );

  await spec(
    'B: after suppress, runtime materializes incoming → incoming shell, no blank claim',
    () => {
      const defer = shouldDeferLegacyResultOverlayPaint(
        base({
          successExitDraining: false,
          runtimeLifecycle: 'showing',
          runtimeDisplayKind: 'incoming',
          runtimeDisplayResultId: null,
          legacyResultPaintCandidate: true,
          legacyResultId: 'cms0t5gx00dflry0px1wfpyha',
        }),
      );
      assert.equal(
        defer,
        true,
        'stale owner result must stay deferred under runtime incoming',
      );

      const shell = resolveShellKindWithLegacyResultDeferred(
        defer,
        'result',
        'incoming',
      );
      assert.equal(shell, 'incoming', 'shell must follow runtime incoming head');

      const mountsResult = wouldMountResultOverlay({
        defer,
        queueHeadKind: 'incoming',
        activeKind: 'result', // stale owner active
        effectiveShellKind: shell,
        hasPayload: true,
      });
      assert.equal(
        mountsResult,
        false,
        'must not claim ResultOverlay over incoming',
      );

      assert.equal(
        defer
          ? false
          : resolveQueueResultOverlayClaimed({
              queueHeadKind: 'incoming',
              activeKind: 'result',
              effectiveShellKind: 'incoming',
            }).claimed,
        false,
      );
    },
  );

  await spec(
    'C: runtime display legitimately becomes result during SUCCESS drain → matching result may render',
    () => {
      const input = base({
        runtimeDisplayKind: 'result',
        runtimeDisplayResultId: 'cms0t5gx00dflry0px1wfpyha',
        legacyResultId: 'cms0t5gx00dflry0px1wfpyha',
      });
      assert.equal(runtimeOwnsMatchingResultDisplay(input), true);
      const defer = shouldDeferLegacyResultOverlayPaint(input);
      assert.equal(defer, false, 'matching runtime result must not be deferred');

      const shell = resolveShellKindWithLegacyResultDeferred(
        defer,
        'result',
        'result',
      );
      assert.equal(shell, 'result');

      const mounts = wouldMountResultOverlay({
        defer,
        queueHeadKind: 'result',
        activeKind: 'result',
        effectiveShellKind: 'result',
        hasPayload: true,
      });
      assert.equal(mounts, true, 'matching runtime-owned result may paint');
    },
  );

  await spec(
    'D: normal non-SUCCESS owner result flow → ResultOverlay still renders',
    () => {
      const defer = shouldDeferLegacyResultOverlayPaint(
        base({
          successExitDraining: false,
          runtimeLifecycle: 'idle',
          runtimeDisplayKind: null,
          runtimeDisplayResultId: null,
          legacyResultPaintCandidate: true,
          legacyResultId: 'result-normal-1',
        }),
      );
      assert.equal(
        defer,
        false,
        'must not change normal non-SUCCESS result paint',
      );

      const mounts = wouldMountResultOverlay({
        defer,
        queueHeadKind: 'result',
        activeKind: 'result',
        effectiveShellKind: 'result',
        hasPayload: true,
      });
      assert.equal(mounts, true);
    },
  );

  await spec(
    'E: deferred owner result remains available — gate does not consume/delete/mark shown',
    () => {
      assert.match(
        gateSrc,
        /not consumed, deleted, or marked/,
        'module must document non-destructive deferral',
      );
      assert.doesNotMatch(
        gateSrc,
        /consumed\.|markShown|deleteResult|removeFromQueue/,
        'gate module must not mutate ownership/consumption',
      );

      assert.match(
        providersSrc,
        /deferLegacyResultOverlayPaint/,
        'Providers must wire the SUCCESS-drain defer gate',
      );
      assert.match(
        providersSrc,
        /shouldDeferLegacyResultOverlayPaint/,
        'Providers must call shouldDeferLegacyResultOverlayPaint',
      );
      assert.match(
        providersSrc,
        /queueResultOverlayClaimed = deferLegacyResultOverlayPaint\s*\?\s*false/,
        'deferred path must force claim false without consuming',
      );
    },
  );

  await spec(
    'NO STARVATION F1: SUCCESS drain finished + runtime materializes matching result → release via runtime (path 1)',
    () => {
      // Was deferred during SUCCESS drain (runtime display null).
      const during = base();
      assert.equal(shouldDeferLegacyResultOverlayPaint(during), true);

      // SUCCESS finished; runtime intentionally materializes the SAME result id.
      const after = base({
        successExitDraining: false,
        runtimeLifecycle: 'showing',
        runtimeDisplayKind: 'result',
        runtimeDisplayResultId: 'cms0t5gx00dflry0px1wfpyha',
        legacyResultId: 'cms0t5gx00dflry0px1wfpyha',
      });
      const rel = explainSuccessDrainLegacyResultDeferRelease(after);
      assert.equal(rel.deferred, false);
      assert.equal(rel.released, true);
      assert.equal(rel.reason, 'runtime-materialized-matching-result');

      const mounts = wouldMountResultOverlay({
        defer: rel.deferred,
        queueHeadKind: 'result',
        activeKind: 'result',
        effectiveShellKind: 'result',
        hasPayload: true,
      });
      assert.equal(mounts, true, 'matching runtime result paints — not starved');
    },
  );

  await spec(
    'NO STARVATION F2: SUCCESS drain finished + runtime releases ownership (idle, no head) → legacy eligible again (path 2)',
    () => {
      const during = base();
      assert.equal(shouldDeferLegacyResultOverlayPaint(during), true);

      // SUCCESS finished; runtime idle with no competing head.
      const after = base({
        successExitDraining: false,
        runtimeLifecycle: 'idle',
        runtimeDisplayKind: null,
        runtimeDisplayResultId: null,
        legacyResultId: 'cms0t5gx00dflry0px1wfpyha',
      });
      const rel = explainSuccessDrainLegacyResultDeferRelease(after);
      assert.equal(rel.deferred, false);
      assert.equal(rel.released, true);
      assert.equal(rel.reason, 'runtime-released-ownership');

      // Legacy ResultOverlay becomes eligible again (shell not forced away).
      const shell = resolveShellKindWithLegacyResultDeferred(
        rel.deferred,
        'result',
        null,
      );
      assert.equal(shell, 'result', 'shell no longer suppressed after release');
      const mounts = wouldMountResultOverlay({
        defer: rel.deferred,
        queueHeadKind: 'result',
        activeKind: 'result',
        effectiveShellKind: 'result',
        hasPayload: true,
      });
      assert.equal(mounts, true, 'legacy ResultOverlay eligible again — not starved');
    },
  );

  await spec(
    'NO STARVATION F3: invariant — for a legacy candidate, defer is impossible once runtime is not actively owning the screen',
    () => {
      // Enumerate every terminal / non-owning runtime state after SUCCESS.
      const releasedLifecycles = [
        'idle',
        'showing', // showing but NOT incoming/check (see displayKind below)
        'failed',
        'booting',
        'recovering',
        null,
      ] as const;
      const nonCompetingDisplays = [null, 'result'] as const;

      for (const lifecycle of releasedLifecycles) {
        for (const displayKind of nonCompetingDisplays) {
          const input = base({
            successExitDraining: false,
            runtimeLifecycle: lifecycle as string | null,
            runtimeDisplayKind: displayKind,
            runtimeDisplayResultId:
              displayKind === 'result' ? 'cms0t5gx00dflry0px1wfpyha' : null,
            legacyResultId: 'cms0t5gx00dflry0px1wfpyha',
          });
          const rel = explainSuccessDrainLegacyResultDeferRelease(input);
          assert.equal(
            rel.deferred,
            false,
            `must release for lifecycle=${lifecycle} display=${displayKind}`,
          );
          assert.equal(rel.released, true);
        }
      }

      // Defer is ONLY ever true while runtime is actively owning the screen:
      // (a) SUCCESS draining with null runtime result, or
      // (b) draining/showing an incoming/check head.
      const activeOwning: SuccessDrainLegacyResultDeferInput[] = [
        base({ successExitDraining: true, runtimeLifecycle: 'draining', runtimeDisplayKind: null }),
        base({ successExitDraining: false, runtimeLifecycle: 'draining', runtimeDisplayKind: 'incoming' }),
        base({ successExitDraining: false, runtimeLifecycle: 'showing', runtimeDisplayKind: 'incoming' }),
        base({ successExitDraining: false, runtimeLifecycle: 'showing', runtimeDisplayKind: 'check' }),
      ];
      for (const input of activeOwning) {
        assert.equal(
          shouldDeferLegacyResultOverlayPaint(input),
          true,
          'defer only while runtime actively owns the screen',
        );
      }

      // And every "active owning" state has a defined exit: flipping runtime to
      // idle releases it (proves the deferral is bounded, never permanent).
      for (const input of activeOwning) {
        const releasedNext = explainSuccessDrainLegacyResultDeferRelease({
          ...input,
          successExitDraining: false,
          runtimeLifecycle: 'idle',
          runtimeDisplayKind: null,
          runtimeDisplayResultId: null,
        });
        assert.equal(releasedNext.released, true, 'bounded: idle transition releases');
      }
    },
  );

  await spec(
    'wiring: Providers applies shell override + blocks queueShellRendersResultOverlay when deferred',
    () => {
      assert.match(providersSrc, /resolveShellKindWithLegacyResultDeferred/);
      assert.match(
        providersSrc,
        /!deferLegacyResultOverlayPaint &&\s*\n\s*ownerRenderResultPayload != null/,
      );
      assert.match(
        providersSrc,
        /!deferLegacyResultOverlayPaint &&\s*\n\s*effectiveNotificationQueueShellKind === 'result'/,
      );
    },
  );

  const failed = results.filter((r) => !r.ok);
  console.log('\n---');
  console.log(
    `success-drain-legacy-result-defer: ${results.length - failed.length}/${results.length} passed`,
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
