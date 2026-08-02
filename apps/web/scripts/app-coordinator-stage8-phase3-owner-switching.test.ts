/**
 * Stage 8 Phase 3 — Owner Switching Engine pure policy tests.
 *
 * Run:
 *   npx tsx --tsconfig apps/web/tsconfig.json apps/web/scripts/app-coordinator-stage8-phase3-owner-switching.test.ts
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { decideOwnerSwitch } from '../src/app-coordinator/application-policy';
import {
  DEFAULT_DOMAIN_ID,
  domainOwner,
  type ApplicationOwner,
} from '../src/app-coordinator/application-owner';
import { OWNER_SWITCH_DECISION_TABLE } from '../src/app-coordinator/app-coordinator.transition-matrix';
import { appCoordinatorReducer } from '../src/app-coordinator/app-coordinator.reducer';
import { createInitialAppCoordinatorState } from '../src/app-coordinator/app-coordinator.types';
import { selectCurrentOwner } from '../src/app-coordinator/app-coordinator.selectors';

let passed = 0;
function pass(name: string): void {
  passed += 1;
  console.log(`PASS — ${name}`);
}

const root = process.cwd();
const policyPath = join(
  root,
  'apps/web/src/app-coordinator/application-policy.ts',
);

async function main() {
  {
    const state = createInitialAppCoordinatorState();
    assert.deepEqual(state.currentOwner, { type: 'BOOT' });
    assert.deepEqual(Object.keys(state).sort(), ['currentOwner', 'returnOwner']);
    assert.equal(state.returnOwner, null);
    pass('1. currentOwner is the only ownership authority');
  }

  {
    const result = decideOwnerSwitch({
      currentOwner: domainOwner('CREATE_BAN'),
      currentCapability: { transition: 'ALLOWED' },
      request: { target: 'CREATE_BAN', reason: 'USER_INTENT' },
    });
    assert.equal(result.decision.type, 'KEEP_CURRENT');
    assert.equal(result.decisionClass, 'KEEP_CURRENT');
    assert.equal(result.violation, null);
    pass('2. same owner → KEEP_CURRENT');
  }

  {
    const none = decideOwnerSwitch({
      currentOwner: domainOwner('CREATE_BAN'),
      currentCapability: { transition: 'ALLOWED' },
      request: null,
    });
    assert.equal(none.decision.type, 'KEEP_CURRENT');
    assert.equal(none.decisionClass, 'KEEP_CURRENT');
    pass('3. no request → KEEP_CURRENT');
  }

  {
    // With sole DomainId, a true cross-domain BLOCKED switch is unreachable.
    // Prove the BLOCKED branch exists and is ordered after same-owner.
    const src = readFileSync(policyPath, 'utf8');
    assert.match(src, /keep\('BLOCKED'\)/);
    const sameIdx = src.indexOf('ownersEqual(currentOwner, nextOwner)');
    const blockedIdx = src.indexOf("transition === 'BLOCKED'");
    const switchIdx = src.lastIndexOf('return switchTo');
    assert.ok(sameIdx > 0 && blockedIdx > sameIdx && switchIdx > blockedIdx);

    // Capability BLOCKED + same target still KEEP (same-owner wins).
    const blockedSame = decideOwnerSwitch({
      currentOwner: domainOwner('CREATE_BAN'),
      currentCapability: {
        transition: 'BLOCKED',
        reason: 'SUBMISSION_IN_PROGRESS',
      },
      request: { target: DEFAULT_DOMAIN_ID, reason: 'USER_INTENT' },
    });
    assert.equal(blockedSame.decision.type, 'KEEP_CURRENT');
    pass('4. blocked capability cannot switch; BLOCKED branch ordered correctly');
  }

  {
    const boot = decideOwnerSwitch({
      currentOwner: { type: 'BOOT' },
      currentCapability: null,
      request: { target: 'CREATE_BAN', reason: 'SYSTEM_READY' },
    });
    assert.equal(boot.decision.type, 'SWITCH_OWNER');
    assert.equal(boot.decisionClass, 'SWITCH_OWNER');
    if (boot.decision.type === 'SWITCH_OWNER') {
      assert.deepEqual(boot.decision.owner, domainOwner('CREATE_BAN'));
    }

    const entry = decideOwnerSwitch({
      currentOwner: { type: 'BOOT' },
      currentCapability: null,
      request: { target: 'CREATE_BAN', reason: 'ENTRY' },
    });
    assert.equal(entry.decisionClass, 'SWITCH_OWNER');
    pass('5. boot SYSTEM_READY|ENTRY → SWITCH_OWNER');
  }

  {
    const result = appCoordinatorReducer(createInitialAppCoordinatorState(), {
      type: 'BOOT_COMPLETED',
    });
    assert.deepEqual(selectCurrentOwner(result.state), {
      type: 'DOMAIN',
      domain: 'CREATE_BAN',
    });
    assert.equal(result.effects.length, 0);
    pass('6. BOOT_COMPLETED applies engine SWITCH; no Runtime logic');
  }

  {
    const invalid = decideOwnerSwitch({
      currentOwner: { type: 'BOOT' },
      currentCapability: null,
      request: { target: 'PROFILE_ANALYTICS' as never, reason: 'SYSTEM_READY' },
    });
    assert.equal(invalid.decision.type, 'KEEP_CURRENT');
    assert.equal(invalid.decisionClass, 'INVALID_REQUEST');
    assert.equal(invalid.violation?.code, 'UNREGISTERED_DOMAIN');

    const bootBad = decideOwnerSwitch({
      currentOwner: { type: 'BOOT' },
      currentCapability: null,
      request: { target: 'CREATE_BAN', reason: 'USER_INTENT' },
    });
    assert.equal(bootBad.decisionClass, 'INVALID_REQUEST');
    assert.equal(bootBad.violation?.code, 'BOOT_OWNER_FORBIDDEN');
    pass('7. invalid owner / boot-forbidden → INVALID_REQUEST');
  }

  {
    const input = {
      currentOwner: { type: 'BOOT' } as ApplicationOwner,
      currentCapability: null,
      request: {
        target: DEFAULT_DOMAIN_ID,
        reason: 'SYSTEM_READY' as const,
      },
    };
    assert.deepEqual(decideOwnerSwitch(input), decideOwnerSwitch(input));
    const once = decideOwnerSwitch(input);
    assert.ok(
      once.decision.type === 'KEEP_CURRENT' ||
        once.decision.type === 'SWITCH_OWNER',
    );
    pass('8. deterministic repeated evaluation; single binary decision');
  }

  {
    const result = decideOwnerSwitch({
      currentOwner: { type: 'BOOT' },
      currentCapability: null,
      request: { target: 'CREATE_BAN', reason: 'ENTRY' },
    });
    assert.equal(result.decision.type, 'SWITCH_OWNER');
    if (result.decision.type === 'SWITCH_OWNER') {
      assert.equal(result.decision.owner.type, 'DOMAIN');
      assert.deepEqual(Object.keys(result.decision.owner).sort(), [
        'domain',
        'type',
      ]);
    }
    pass('9. SWITCH contains exactly one owner');
  }

  {
    assert.ok(OWNER_SWITCH_DECISION_TABLE.length >= 6);
    const classes = new Set(
      OWNER_SWITCH_DECISION_TABLE.map((r) => r.decisionClass),
    );
    for (const required of [
      'KEEP_CURRENT',
      'SWITCH_OWNER',
      'INVALID_REQUEST',
      'BLOCKED',
    ] as const) {
      assert.ok(classes.has(required), required);
    }
    pass('10. decision table covers KEEP / SWITCH / INVALID / BLOCKED');
  }

  {
    const forbidden =
      /\bWHO\b|\bWHAT\b|\bCONFIRM\b|\bSUCCESS\b|\bLOBBY\b|\bqueue\b|\bpending\b|\boverlay\b|\bdisplay\b|\bnotificationMode\b|\breal-time\b|\bnormal\b|from ['"]react['"]|\bcss\b|\bhttp\b|fetch\(|notification-runtime|product-flow|create-ban\.reducer|create-ban\.controller/;
    assert.doesNotMatch(readFileSync(policyPath, 'utf8'), forbidden);
    assert.doesNotMatch(
      readFileSync(
        join(root, 'apps/web/src/app-coordinator/owner-request.ts'),
        'utf8',
      ),
      /\bWHO\b|\bWHAT\b|\bCONFIRM\b|\bSUCCESS\b|\bLOBBY\b|\bReply\b|\bSettings\b|\bAnalytics\b|\bNotification\b/,
    );
    pass('11. policy/OwnerRequest free of routes, screens, React, runtimes');
  }

  {
    const reducer = readFileSync(
      join(root, 'apps/web/src/app-coordinator/app-coordinator.reducer.ts'),
      'utf8',
    );
    assert.match(reducer, /decideOwnerSwitch/);
    assert.match(reducer, /getCurrentCapability/);
    assert.doesNotMatch(
      reducer,
      /readyHead|items\.queue|submission\.status|getCreateBanState/,
    );
    pass('12. Coordinator evaluates via capability only; no Runtime inspection');
  }

  {
    // ALLOWED after BOOT leaves CREATE_BAN; further OWNER_REQUESTED same target keeps.
    const afterBoot = appCoordinatorReducer(createInitialAppCoordinatorState(), {
      type: 'BOOT_COMPLETED',
    });
    const again = appCoordinatorReducer(afterBoot.state, {
      type: 'OWNER_REQUESTED',
      request: { target: 'CREATE_BAN', reason: 'USER_INTENT' },
    });
    assert.deepEqual(again.state.currentOwner, afterBoot.state.currentOwner);
    pass('13. allowed same-owner request keeps single Current Owner');
  }

  console.log(`\n${passed} passed\n`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
