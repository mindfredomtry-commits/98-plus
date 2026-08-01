/**
 * App Coordinator foundation — architecture boundaries (Stage 7 Phase 3).
 */
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { selectApplicationSurfaceOwner } from '../src/app-coordinator/app-coordinator.selectors';
import type { AppCoordinatorState } from '../src/app-coordinator/app-coordinator.types';

let passed = 0;
function pass(name: string): void {
  passed += 1;
  console.log(`PASS — ${name}`);
}

const root = process.cwd();
const coordinatorDir = join(root, 'apps/web/src/app-coordinator');
const typesSrc = readFileSync(
  join(coordinatorDir, 'app-coordinator.types.ts'),
  'utf8',
);
const selectorsSrc = readFileSync(
  join(coordinatorDir, 'app-coordinator.selectors.ts'),
  'utf8',
);
const surfaceSrc = readFileSync(
  join(coordinatorDir, 'ApplicationSurface.tsx'),
  'utf8',
);

async function main() {
  {
    assert.match(typesSrc, /type: 'BOOTING'/);
    assert.match(typesSrc, /type: 'PRODUCT'; route: ProductRoute/);
    assert.doesNotMatch(
      typesSrc,
      /\| \{ type: 'NOTIFICATION'; itemId: string \}/,
    );
    assert.doesNotMatch(typesSrc, /REPLY_COMPOSE/);
    pass('1. AppMode is BOOTING | PRODUCT only');
  }

  {
    const states: Array<{
      state: AppCoordinatorState;
      owner: 'BOOT' | 'PRODUCT_FLOW';
    }> = [
      {
        state: {
          mode: { type: 'BOOTING' },
          resumeDestination: { type: 'PRODUCT', route: 'LOBBY' },
        },
        owner: 'BOOT',
      },
      {
        state: {
          mode: { type: 'PRODUCT', route: 'WHO' },
          resumeDestination: { type: 'PRODUCT', route: 'LOBBY' },
        },
        owner: 'PRODUCT_FLOW',
      },
    ];
    for (const { state, owner } of states) {
      assert.equal(selectApplicationSurfaceOwner(state), owner);
    }
    assert.doesNotMatch(selectorsSrc, /NOTIFICATION_SYSTEM/);
    pass('2. selectors map only Boot and Product surfaces');
  }

  {
    assert.match(surfaceSrc, /ProductFlowSurface/);
    assert.doesNotMatch(surfaceSrc, /DirectNotificationHost|NOTIFICATION_SYSTEM/);
    pass('3. ApplicationSurface mounts Boot or Product only');
  }

  {
    assert.equal(
      existsSync(
        join(root, 'apps/web/src/lib/notification-overlay-owner.ts'),
      ),
      false,
    );
    assert.equal(
      existsSync(
        join(root, 'apps/web/src/notification-runtime/notification-runtime.coordinator-port.ts'),
      ),
      false,
    );
    assert.equal(
      existsSync(join(coordinatorDir, 'notification-runtime-port.ts')),
      true,
    );
    pass('4. overlay-owner deleted; Runtime port adapter is Coordinator-owned');
  }

  {
    const runtimeDir = join(root, 'apps/web/src/notification-runtime');
    const files = require('fs')
      .readdirSync(runtimeDir)
      .filter((f: string) => f.endsWith('.ts'));
    for (const f of files) {
      const src = readFileSync(join(runtimeDir, f), 'utf8');
      assert.doesNotMatch(src, /from '@\/app-coordinator/);
      assert.doesNotMatch(src, /from '@\/product-flow/);
    }
    pass('5. Notification Runtime does not import Coordinator or Product');
  }

  console.log(`\n${passed} passed\n`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
