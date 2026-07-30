/**
 * App Coordinator foundation — architecture boundaries.
 *
 * Run:
 *   npx tsx --tsconfig apps/web/tsconfig.json apps/web/scripts/app-coordinator-architecture.test.ts
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  selectApplicationSurfaceOwner,
} from '../src/app-coordinator/app-coordinator.selectors';
import { parseResumeToken } from '../src/app-coordinator/resume-token';
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
const reducerSrc = readFileSync(
  join(coordinatorDir, 'app-coordinator.reducer.ts'),
  'utf8',
);
const selectorsSrc = readFileSync(
  join(coordinatorDir, 'app-coordinator.selectors.ts'),
  'utf8',
);
const boundariesSrc = readFileSync(
  join(coordinatorDir, 'app-coordinator.boundaries.ts'),
  'utf8',
);
const matrixSrc = readFileSync(
  join(coordinatorDir, 'app-coordinator.transition-matrix.ts'),
  'utf8',
);
const portsSrc = readFileSync(
  join(coordinatorDir, 'app-coordinator.ports.ts'),
  'utf8',
);
const storeSrc = readFileSync(
  join(coordinatorDir, 'app-coordinator.store.ts'),
  'utf8',
);
const executorSrc = readFileSync(
  join(coordinatorDir, 'app-coordinator.command-executor.ts'),
  'utf8',
);

const productionEntrySources = [
  readFileSync(join(root, 'apps/web/src/app/(miniapp)/layout.tsx'), 'utf8'),
  readFileSync(
    join(root, 'apps/web/src/app-services/AppServicesProvider.tsx'),
    'utf8',
  ),
  readFileSync(
    join(root, 'apps/web/src/app-coordinator/ApplicationSurface.tsx'),
    'utf8',
  ),
];

async function main() {
  // 1. Required explicit modes exist as a closed union.
  {
    assert.match(typesSrc, /type: 'BOOTING'/);
    assert.match(typesSrc, /type: 'PRODUCT'; route: ProductRoute/);
    assert.match(typesSrc, /type: 'NOTIFICATION'; itemId: string/);
    assert.match(typesSrc, /type: 'REPLY_COMPOSE'/);
    assert.match(typesSrc, /sourceItemId: string/);
    assert.match(typesSrc, /targetUserId: string/);
    assert.match(typesSrc, /resumeToken: ResumeToken/);
    assert.match(typesSrc, /route: ReplyComposeRoute/);
    pass('1. AppMode is explicit and includes all required modes');
  }

  // 2. One selector maps each AppMode to exactly one mounted surface owner.
  {
    const states: Array<{
      state: AppCoordinatorState;
      owner: 'BOOT' | 'PRODUCT_FLOW' | 'NOTIFICATION_SYSTEM';
    }> = [
      {
        state: {
          mode: { type: 'BOOTING' },
          resumeDestination: { type: 'PRODUCT', route: 'LOBBY' },
          lastSettledReply: null,
        },
        owner: 'BOOT',
      },
      {
        state: {
          mode: { type: 'PRODUCT', route: 'WHO' },
          resumeDestination: { type: 'PRODUCT', route: 'LOBBY' },
          lastSettledReply: null,
        },
        owner: 'PRODUCT_FLOW',
      },
      {
        state: {
          mode: { type: 'NOTIFICATION', itemId: 'incoming:A' },
          resumeDestination: { type: 'PRODUCT', route: 'LOBBY' },
          lastSettledReply: null,
        },
        owner: 'NOTIFICATION_SYSTEM',
      },
      {
        state: {
          mode: {
            type: 'REPLY_COMPOSE',
            sourceItemId: 'incoming:A',
            targetUserId: 'user:B',
            resumeToken: parseResumeToken('reply:1')!,
            route: 'WHAT',
            completionPending: false,
          },
          resumeDestination: {
            type: 'NOTIFICATION',
            itemId: 'incoming:A',
            afterQueue: { type: 'PRODUCT', route: 'LOBBY' },
          },
          lastSettledReply: null,
        },
        owner: 'PRODUCT_FLOW',
      },
    ];
    for (const { state, owner } of states) {
      assert.equal(selectApplicationSurfaceOwner(state), owner);
    }
    pass('2. every AppMode has exactly one surface owner');
  }

  // 3. Coordinator authority is not inferred from UI flags.
  {
    const forbiddenAuthority = [
      'overlayVisible',
      'lobbyMayShow',
      'selectedUser',
      'activeOverlayKind',
      'overlayQueue',
      'paintSnapshot',
      'ctaVisible',
    ];
    const authoritySrc = `${reducerSrc}\n${selectorsSrc}`;
    for (const symbol of forbiddenAuthority) {
      assert.doesNotMatch(authoritySrc, new RegExp(symbol, 'i'));
    }
    pass('3. mode authority does not use UI flag combinations');
  }

  // 4. Pure coordinator does not import either subsystem implementation.
  {
    const foundation = [
      typesSrc,
      reducerSrc,
      selectorsSrc,
      boundariesSrc,
      matrixSrc,
      portsSrc,
      storeSrc,
      executorSrc,
    ].join('\n');
    assert.doesNotMatch(foundation, /notification-runtime\//);
    assert.doesNotMatch(foundation, /components\/Providers/);
    assert.doesNotMatch(foundation, /DirectNotificationHost/);
    assert.doesNotMatch(foundation, /InstantBanFlow/);
    assert.doesNotMatch(foundation, /NotificationRuntimeStore/);
    assert.doesNotMatch(foundation, /syncRuntimeQueue/);
    assert.doesNotMatch(foundation, /useApp\(/);
    pass('4. coordinator foundation has no subsystem implementation imports');
  }

  // 5. Reducer is deterministic and side-effect free.
  {
    assert.doesNotMatch(reducerSrc, /Date\.now|Math\.random|setTimeout|setInterval/);
    assert.doesNotMatch(reducerSrc, /\bfetch\(|\bapi\(/);
    assert.doesNotMatch(reducerSrc, /window\.|document\./);
    assert.doesNotMatch(reducerSrc, /useEffect|useState|useRef/);
    pass('5. coordinator reducer is pure');
  }

  // 6. Integration is command-based, never cross-state writes.
  {
    assert.match(portsSrc, /interface NotificationRuntimePort/);
    assert.match(portsSrc, /interface ProductFlowPort/);
    assert.match(boundariesSrc, /interface EntryRouter/);
    assert.match(storeSrc, /interface AppCoordinatorStore/);
    assert.doesNotMatch(portsSrc, /setNotification|setProduct|dispatchRuntime/);
    pass('6. subsystem integration uses explicit command ports');
  }

  // 7. Reply contract requires suspend, token validation, complete, resume.
  {
    assert.match(reducerSrc, /type: 'SUSPEND'/);
    assert.match(reducerSrc, /type: 'COMPLETE_SOURCE_ITEM'/);
    assert.match(reducerSrc, /type: 'RESUME'/);
    assert.match(reducerSrc, /state\.mode\.resumeToken !== event\.resumeToken/);
    pass('7. reply handoff is token-owned and explicit');
  }

  // 8. Deeplink path is a Runtime ingestion command, not direct-entry UI.
  {
    assert.match(typesSrc, /type: 'INGEST_ENTRY'/);
    assert.doesNotMatch(reducerSrc, /DIRECT_ITEM|direct-entry|directEntry/);
    assert.doesNotMatch(matrixSrc, /direct-entry host|direct-entry card/i);
    pass('8. notification entries target canonical Runtime ingestion');
  }

  // 9. Production composition mounts exactly one coordinator-owned surface.
  {
    const appServicesSrc = productionEntrySources[1];
    const surfaceSrc = productionEntrySources[2];
    assert.match(appServicesSrc, /createAppCoordinatorLifecycle/);
    assert.match(appServicesSrc, /ApplicationSurface/);
    assert.doesNotMatch(appServicesSrc, /sendFlowRequested|bansSectionRequested/);
    assert.match(surfaceSrc, /coordinatorState\.mode\.type/);
    assert.match(surfaceSrc, /data-surface-owner/);
    assert.doesNotMatch(surfaceSrc, /overlayVisible|pendingCount|selectedUser/);
    // Direct host is mounted only inside the Notification branch.
    assert.match(surfaceSrc, /NOTIFICATION_SYSTEM/);
    assert.match(surfaceSrc, /PRODUCT_FLOW/);
    assert.match(surfaceSrc, /BOOT/);
    pass('9. coordinator is the sole global surface authority');
  }

  console.log(`\n${passed} passed\n`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
