/**
 * OVERBOARD_FLASH_ORIGIN_V1 — emit-once + SUCCESS drain ledger (diagnostics only).
 *
 * Run:
 *   npx tsx --tsconfig apps/web/tsconfig.json apps/web/scripts/overboard-flash-origin-v1.test.ts
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { BanResult } from '@98plus/shared';
import {
  clearOverboardFlashOriginEmitForBan,
  emitOverboardFlashOriginV1,
  noteOverboardFlashWriter,
  noteSuccessDrainBatchForFlashOrigin,
  OVERBOARD_FLASH_ORIGIN_EXPECTED_COMMIT,
  OVERBOARD_FLASH_ORIGIN_V1,
  registerOverboardFlashOriginSnapshotReader,
  resetOverboardFlashOriginForTest,
} from '../src/lib/overboard-flash-origin-v1';

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

function overboard(id: string): BanResult {
  return { id, outcome: 'overboard' } as BanResult;
}

async function main() {
  await spec('emits once per mount surface with writer attribution', () => {
    resetOverboardFlashOriginForTest();
    const logs: unknown[] = [];
    const orig = console.info;
    console.info = ((...args: unknown[]) => {
      logs.push(args);
    }) as typeof console.info;

    registerOverboardFlashOriginSnapshotReader(() => ({
      successCardMounted: false,
      successExitDraining: true,
      runtimeLifecycle: 'idle',
      runtimeAction: 'idle',
      runtimeQueue: [],
      runtimeDisplayKind: null,
      runtimeDisplayId: null,
      runtimeDisplayOutcome: null,
      ownerQueue: [],
      effectiveNotificationQueueShellKind: 'result',
      queueResultOverlayClaimed: true,
      directOverboardRenderForcedByQueueResult: true,
      directOverboardVisible: true,
      resultOverlayVisible: true,
      openBanResultActiveId: null,
      receiveResultActiveId: 'R',
      lateResultActiveId: 'R',
    }));

    noteSuccessDrainBatchForFlashOrigin({
      stage: 'transport',
      withheld: [{ kind: 'result', result: overboard('R') }],
      materialize: [],
    });
    noteOverboardFlashWriter('RECEIVE_RESULT', 'R');
    noteOverboardFlashWriter('LATE_RESULT_ARRIVED', 'R');

    emitOverboardFlashOriginV1({
      result: overboard('R'),
      mountSurface: 'ResultOverlay',
      resultOverlayVisible: true,
      directOverboardVisible: false,
      directOverboardRenderForcedByQueueResult: true,
    });
    emitOverboardFlashOriginV1({
      result: overboard('R'),
      mountSurface: 'ResultOverlay',
      resultOverlayVisible: true,
    });

    console.info = orig;
    assert.equal(logs.length, 1);
    const [marker, payload] = logs[0] as [string, Record<string, unknown>];
    assert.equal(marker, OVERBOARD_FLASH_ORIGIN_V1);
    assert.equal(payload.source, 'LATE_RESULT_ARRIVED');
    assert.equal(payload.resolveSuccessDrainBatchRan, true);
    assert.equal(payload.resolveSuccessDrainBatchStage, 'transport');
    assert.deepEqual(payload.withheldIds, ['R']);
    assert.deepEqual(payload.materializedIds, []);
    assert.equal(payload.flashedIdWasWithheld, true);
    assert.equal(payload.expectedCommit, OVERBOARD_FLASH_ORIGIN_EXPECTED_COMMIT);
    assert.equal(payload.successExitDraining, true);
  });

  await spec('non-overboard outcome does not emit', () => {
    resetOverboardFlashOriginForTest();
    const logs: unknown[] = [];
    const orig = console.info;
    console.info = ((...args: unknown[]) => {
      logs.push(args);
    }) as typeof console.info;
    emitOverboardFlashOriginV1({
      result: { id: 'X', outcome: 'both_no' } as BanResult,
      mountSurface: 'ResultOverlay',
      resultOverlayVisible: true,
    });
    console.info = orig;
    assert.equal(logs.length, 0);
  });

  await spec('clear allows re-emit after unmount', () => {
    resetOverboardFlashOriginForTest();
    const logs: unknown[] = [];
    const orig = console.info;
    console.info = ((...args: unknown[]) => {
      logs.push(args);
    }) as typeof console.info;
    emitOverboardFlashOriginV1({
      result: overboard('R2'),
      mountSurface: 'DirectOverboardResultLayer',
      resultOverlayVisible: true,
      directOverboardVisible: true,
    });
    clearOverboardFlashOriginEmitForBan('R2');
    emitOverboardFlashOriginV1({
      result: overboard('R2'),
      mountSurface: 'DirectOverboardResultLayer',
      resultOverlayVisible: true,
      directOverboardVisible: true,
    });
    console.info = orig;
    assert.equal(logs.length, 2);
  });

  await spec('SOURCE: diagnostic wires at visual + SUCCESS batch + writers', () => {
    const root = join(process.cwd(), 'apps/web/src');
    const flash = readFileSync(
      join(root, 'lib/overboard-flash-origin-v1.ts'),
      'utf8',
    );
    const handoff = readFileSync(
      join(root, 'notification-runtime/notification-runtime.success-handoff.ts'),
      'utf8',
    );
    const providers = readFileSync(join(root, 'components/Providers.tsx'), 'utf8');
    const resultOverlay = readFileSync(
      join(root, 'components/ResultOverlay.tsx'),
      'utf8',
    );
    const direct = readFileSync(
      join(root, 'components/DirectOverboardResultLayer.tsx'),
      'utf8',
    );
    assert.match(flash, /OVERBOARD_FLASH_ORIGIN_V1/);
    assert.match(flash, /a102396/);
    assert.match(handoff, /noteSuccessDrainBatchForFlashOrigin/);
    assert.match(providers, /noteOverboardFlashWriter\('OPEN_BAN_RESULT'/);
    assert.match(providers, /noteOverboardFlashWriter\('RECEIVE_RESULT'/);
    assert.match(providers, /noteOverboardFlashWriter\('LATE_RESULT_ARRIVED'/);
    assert.match(providers, /noteOverboardFlashWriter\('SYNC_DISPLAY_FROM_QUEUE'/);
    assert.match(
      providers,
      /noteOverboardFlashWriter\(\s*'DIRECT_OVERBOARD_FORCED_BY_QUEUE'/,
    );
    assert.match(resultOverlay, /emitOverboardFlashOriginV1/);
    assert.match(direct, /emitOverboardFlashOriginV1/);
    // No behavioral SUCCESS filter changes in this commit path beyond existing withhold.
    assert.match(handoff, /partitionSuccessHandoffMaterializeItems/);
  });

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
