/**
 * Regression: ProductFlowController getSnapshot stability for useSyncExternalStore.
 *
 * Unstable getState() (new object every call) causes React production error #185
 * — Maximum update depth exceeded — when ProductFlowSurface mounts.
 *
 * Run:
 *   npx tsx --tsconfig apps/web/tsconfig.json apps/web/scripts/product-flow-snapshot-stability.test.ts
 */
import assert from 'node:assert/strict';
import { createElement, useSyncExternalStore } from 'react';
import { renderToString } from 'react-dom/server';
import { createProductFlowController } from '../src/product-flow/product-flow.controller';

function pass(label: string): void {
  console.log(`ok - ${label}`);
}

function sinkStub() {
  return {
    routeChanged() {},
    replyCancelled() {},
    replyCompleted() {},
    flowReleased() {},
  };
}

function useProductFlowStateForTest(
  controller: ReturnType<typeof createProductFlowController>,
) {
  return useSyncExternalStore(
    controller.subscribe,
    controller.getState,
    controller.getState,
  );
}

function Probe({
  controller,
}: {
  controller: ReturnType<typeof createProductFlowController>;
}) {
  const state = useProductFlowStateForTest(controller);
  return createElement('div', {
    'data-route': state.route,
    'data-testid': 'product-flow-probe',
  });
}

function main(): void {
  {
    const controller = createProductFlowController({ sink: sinkStub() });
    const a = controller.getState();
    const b = controller.getState();
    assert.equal(a, b);
    pass('1. getState returns a stable reference when unchanged');
    controller.dispose();
  }

  {
    const controller = createProductFlowController({ sink: sinkStub() });
    const before = controller.getState();
    controller.openRoute({ route: 'WHO' });
    const after = controller.getState();
    assert.notEqual(before, after);
    assert.equal(after.route, 'WHO');
    assert.equal(controller.getState(), after);
    pass('2. getState returns a new reference only after a real update');
    controller.dispose();
  }

  {
    const controller = createProductFlowController({ sink: sinkStub() });
    // SSR mount path mirrors useSyncExternalStore getServerSnapshot usage.
    // Unstable snapshots throw Maximum update depth exceeded (#185) in client;
    // stable snapshots render without looping.
    const html = renderToString(
      createElement(Probe, { controller }),
    );
    assert.match(html, /data-route="LOBBY"/);
    assert.match(html, /data-testid="product-flow-probe"/);
    pass('3. ProductFlowSurface-style useSyncExternalStore mounts without looping');
    controller.dispose();
  }

  {
    const controller = createProductFlowController({ sink: sinkStub() });
    // Simulate useSyncExternalStore client bailout: if getSnapshot is unstable,
    // React treats every read as a store change and re-renders until #185.
    let nestedUpdates = 0;
    let snapshot = controller.getState();
    for (let i = 0; i < 50; i += 1) {
      const next = controller.getState();
      if (!Object.is(snapshot, next)) {
        nestedUpdates += 1;
        snapshot = next;
      }
    }
    assert.equal(nestedUpdates, 0);
    pass('4. 50 consecutive getSnapshot reads do not schedule nested updates');
    controller.dispose();
  }

  console.log('\nAll ProductFlow snapshot stability tests passed.');
}

main();
