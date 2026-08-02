/**
 * App Coordinator foundation — architecture boundaries (Stage 8 Phase 1).
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
const policySrc = readFileSync(
  join(coordinatorDir, 'application-policy.ts'),
  'utf8',
);

async function main() {
  {
    assert.match(typesSrc, /currentOwner: ApplicationOwner/);
    assert.match(typesSrc, /ApplicationOwner/);
    assert.doesNotMatch(typesSrc, /mode: AppMode|resumeDestination/);
    assert.doesNotMatch(typesSrc, /REPLY_COMPOSE/);
    pass('1. currentOwner is sole ownership authority');
  }

  {
    const states: Array<{
      state: AppCoordinatorState;
      owner: 'BOOT' | 'CREATE_BAN';
    }> = [
      {
        state: { currentOwner: { type: 'BOOT' },
    returnOwner: null },
        owner: 'BOOT',
      },
      {
        state: {
          currentOwner: { type: 'DOMAIN', domain: 'CREATE_BAN' },
    returnOwner: null,
        },
        owner: 'CREATE_BAN',
      },
    ];
    for (const { state, owner } of states) {
      assert.equal(selectApplicationSurfaceOwner(state), owner);
    }
    assert.doesNotMatch(selectorsSrc, /NOTIFICATION_SYSTEM|PRODUCT_FLOW/);
    pass('2. selectors map Boot and CREATE_BAN from currentOwner');
  }

  {
    assert.match(surfaceSrc, /ProductFlowSurface/);
    assert.match(surfaceSrc, /SettingsSurface/);
    assert.match(surfaceSrc, /currentOwner/);
    assert.doesNotMatch(surfaceSrc, /DirectNotificationHost|NOTIFICATION_SYSTEM/);
    pass('3. ApplicationSurface mounts from currentOwner');
  }

  {
    assert.equal(
      existsSync(
        join(root, 'apps/web/src/lib/notification-overlay-owner.ts'),
      ),
      false,
    );
    assert.equal(
      existsSync(join(coordinatorDir, 'application-policy.ts')),
      true,
    );
    assert.doesNotMatch(policySrc, /\bWHO\b|\bLOBBY\b|\bqueue\b/);
    pass('4. policy present; overlay-owner absent');
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
