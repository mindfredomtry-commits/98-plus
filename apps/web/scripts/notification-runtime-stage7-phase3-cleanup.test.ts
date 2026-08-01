/**
 * Stage 7 Phase 3 — final pre-Coordinator cleanup guards.
 *
 * Run: npx tsx apps/web/scripts/notification-runtime-stage7-phase3-cleanup.test.ts
 */
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

let passed = 0;
function pass(name: string) {
  passed += 1;
  console.log(`PASS — ${name}`);
}

const webSrc = join(process.cwd(), 'apps/web/src');
const runtimeDir = join(webSrc, 'notification-runtime');
const coordinatorDir = join(webSrc, 'app-coordinator');

{
  const types = readFileSync(
    join(coordinatorDir, 'app-coordinator.types.ts'),
    'utf8',
  );
  assert.match(types, /currentOwner: ApplicationOwner/);
  assert.doesNotMatch(types, /REPLY_COMPOSE|NotificationResumeDestination/);
  assert.doesNotMatch(types, /mode: AppMode/);
  pass('currentOwner is sole ownership authority');
}

{
  assert.equal(existsSync(join(webSrc, 'lib/notification-overlay-owner.ts')), false);
  assert.equal(
    existsSync(join(webSrc, 'lib/notification-overlay-owner-shadow.ts')),
    false,
  );
  assert.equal(existsSync(join(webSrc, 'notification-owner')), false);
  assert.equal(existsSync(join(webSrc, 'lib/phase12-smoke-env.ts')), true);
  const mw = readFileSync(join(webSrc, 'middleware.ts'), 'utf8');
  assert.match(mw, /phase12-smoke-env/);
  assert.doesNotMatch(mw, /notification-overlay-owner/);
  pass('overlay-owner cluster deleted; middleware uses phase12-smoke-env');
}

{
  assert.equal(
    existsSync(join(runtimeDir, 'notification-runtime.coordinator-port.ts')),
    false,
  );
  assert.equal(
    existsSync(join(coordinatorDir, 'notification-runtime-port.ts')),
    true,
  );
  for (const f of readdirSync(runtimeDir).filter((x) => x.endsWith('.ts'))) {
    const src = readFileSync(join(runtimeDir, f), 'utf8');
    assert.doesNotMatch(src, /from '@\/app-coordinator/);
    assert.doesNotMatch(src, /from '@\/product-flow/);
    assert.doesNotMatch(src, /\bAppMode\b|\bLOBBY\b|\bREPLY_COMPOSE\b/);
  }
  pass('Runtime has no Coordinator/Product/AppMode/Lobby/Reply imports');
}

{
  const surface = readFileSync(
    join(coordinatorDir, 'ApplicationSurface.tsx'),
    'utf8',
  );
  assert.doesNotMatch(surface, /DirectNotificationHost/);
  assert.match(surface, /ProductFlowSurface/);
  assert.match(surface, /currentOwner/);
  pass('ApplicationSurface selects presentation from currentOwner');
}

{
  const forbidden = [
    'notification owner',
    'overlay owner',
    'notification surface',
    'notification capability',
    'notification presentation',
  ];
  const port = readFileSync(
    join(coordinatorDir, 'notification-runtime-port.ts'),
    'utf8',
  ).toLowerCase();
  for (const phrase of forbidden) {
    assert.equal(port.includes(phrase), false, phrase);
  }
  pass('Coordinator Runtime adapter has no ownership/presentation phrases');
}

console.log(`\n${passed} assertions passed`);
