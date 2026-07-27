/**
 * Stage 4A Single Owner Finalization —
 * runtime transition flags (chain transitioning, startupHold, drain)
 * are owner-backed; InstantBanFlow / adapters are thin intents.
 *
 * Run: npx tsx --tsconfig apps/web/tsconfig.json apps/web/scripts/owner-transition-authority.test.ts
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  createInitialNotificationOverlayOwnerState,
  notificationOverlayOwnerReducer,
  reportReverseTransitionBlocked,
} from '../src/lib/notification-overlay-owner';
import { createNotificationOverlayOwnerShadow } from '../src/lib/notification-overlay-owner-shadow';

if (typeof (globalThis as { window?: unknown }).window === 'undefined') {
  (globalThis as { window: Record<string, unknown> }).window = {};
}

const webRoot = join(__dirname, '..');
const providersSrc = readFileSync(
  join(webRoot, 'src/components/Providers.tsx'),
  'utf8',
);
const instantBanSrc = readFileSync(
  join(webRoot, 'src/components/instant-ban/InstantBanFlow.tsx'),
  'utf8',
);
const ownerSrc = readFileSync(
  join(webRoot, 'src/lib/notification-overlay-owner.ts'),
  'utf8',
);
const providersLines = providersSrc.split(/\r?\n/);

function findMirrorLegacySessionRange(lines: string[]): {
  start: number;
  end: number;
} {
  let start = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i]!.includes('mirrorLegacySession: (session, source) => {')) {
      // Prefer the real body (contains sessionProjectionDepthRef), not the thin forwarder.
      if (
        i + 5 < lines.length &&
        lines
          .slice(i, i + 8)
          .some((l) => l.includes('sessionProjectionDepthRef'))
      ) {
        start = i;
        break;
      }
    }
  }
  assert.ok(start >= 0, 'mirrorLegacySession projection body not found');
  let end = -1;
  for (let i = start + 1; i < lines.length; i++) {
    if (lines[i]!.includes('compareActiveDisplayIntegrity:')) {
      end = i;
      break;
    }
  }
  assert.ok(end > start, 'compareActiveDisplayIntegrity after mirrorLegacySession not found');
  return { start, end };
}

const mirrorSessionRange = findMirrorLegacySessionRange(providersLines);

// —— 1–3. InstantBanFlow is intent-only; adapters dispatch owner events ——
assert.match(instantBanSrc, /startLobbyBansNotificationDrain\s*\(/);
assert.match(instantBanSrc, /releaseStartupInteractions\s*\(/);
assert.match(instantBanSrc, /unlockNotificationQueueAndFlush\s*\(/);
assert.match(instantBanSrc, /setNotificationChainTransitioning\s*\(/);
assert.doesNotMatch(
  instantBanSrc,
  /notificationChainTransitioningRef\.current\s*=/,
);
assert.doesNotMatch(instantBanSrc, /startupInteractionsHoldRef\.current\s*=/);
assert.doesNotMatch(instantBanSrc, /overlayQueueDrainActiveRef\.current\s*=/);
assert.doesNotMatch(
  instantBanSrc,
  /type:\s*['\"]CHAIN_TRANSITIONING_SET['\"]/,
);
assert.doesNotMatch(instantBanSrc, /type:\s*['\"]DRAIN_REQUESTED['\"]/);
assert.doesNotMatch(
  instantBanSrc,
  /type:\s*['\"]STARTUP_INTERACTIONS_RELEASED['\"]/,
);

assert.match(
  providersSrc,
  /type:\s*'STARTUP_INTERACTIONS_RELEASED'/,
  'releaseStartupInteractions must dispatch STARTUP_INTERACTIONS_RELEASED',
);
assert.match(
  providersSrc,
  /type:\s*'QUEUE_UNLOCK_REQUESTED'/,
  'unlockNotificationQueueAndFlush must dispatch QUEUE_UNLOCK_REQUESTED',
);
assert.match(
  providersSrc,
  /type:\s*'DRAIN_REQUESTED'/,
  'startLobbyBansNotificationDrain must dispatch DRAIN_REQUESTED',
);
assert.match(
  providersSrc,
  /type:\s*'CHAIN_TRANSITIONING_SET'/,
  'setNotificationChainTransitioning must dispatch CHAIN_TRANSITIONING_SET',
);

// Thin adapter: setNotificationChainTransitioning must not write React state directly.
{
  const setterStart = providersLines.findIndex((l) =>
    l.includes('const setNotificationChainTransitioning = useCallback'),
  );
  assert.ok(setterStart >= 0);
  let setterEnd = setterStart + 1;
  for (let i = setterStart + 1; i < providersLines.length; i++) {
    if (providersLines[i]!.includes('}, []);') && i > setterStart + 3) {
      setterEnd = i;
      break;
    }
  }
  const setterBody = providersLines.slice(setterStart, setterEnd + 1).join('\n');
  assert.match(setterBody, /CHAIN_TRANSITIONING_SET/);
  assert.doesNotMatch(setterBody, /setNotificationChainTransitioningState\(/);
  assert.doesNotMatch(
    setterBody,
    /notificationChainTransitioningRef\.current\s*=(?!=)/,
  );
}

// —— 4–5. chain transitioning start/end via owner event ——
{
  let state = createInitialNotificationOverlayOwnerState();
  const start = notificationOverlayOwnerReducer(state, {
    type: 'CHAIN_TRANSITIONING_SET',
    active: true,
    source: 'test-start',
  });
  state = start.state;
  assert.equal(state.session.notificationChainTransitioning, true);
  assert.equal(state.session.lobbyOpen, false);
  assert.ok(
    start.effects.some(
      (e) =>
        e.type === 'MIRROR_LEGACY_SESSION' &&
        e.session.notificationChainTransitioning === true,
    ),
  );

  const end = notificationOverlayOwnerReducer(state, {
    type: 'CHAIN_TRANSITIONING_SET',
    active: false,
    source: 'test-end',
  });
  state = end.state;
  assert.equal(state.session.notificationChainTransitioning, false);
  assert.ok(
    end.effects.some(
      (e) =>
        e.type === 'MIRROR_LEGACY_SESSION' &&
        e.session.notificationChainTransitioning === false,
    ),
  );
}

// —— 6. React projection mirrors owner session transition fields ——
{
  let projected: {
    notificationChainTransitioning: boolean;
    startupHold: boolean;
    drainActive: boolean;
    lobbyOpen: boolean;
  } | null = null;
  const shadow = createNotificationOverlayOwnerShadow({
    mirrorLegacySession: (session) => {
      projected = {
        notificationChainTransitioning: session.notificationChainTransitioning,
        startupHold: session.startupHold,
        drainActive: session.drainActive,
        lobbyOpen: session.lobbyOpen,
      };
    },
  });
  shadow.dispatch(
    {
      type: 'CHAIN_TRANSITIONING_SET',
      active: true,
      source: 'projection-test',
    },
    'projection-test',
  );
  assert.ok(projected);
  assert.equal(projected!.notificationChainTransitioning, true);
  assert.equal(projected!.lobbyOpen, false);
  assert.equal(
    projected!.notificationChainTransitioning,
    shadow.getState().session.notificationChainTransitioning,
  );
}

// —— 7–8. lobby/resume cannot mutate transition authority via reverse mirror alone ——
{
  const shadow = createNotificationOverlayOwnerShadow();
  shadow.dispatch(
    {
      type: 'CHAIN_TRANSITIONING_SET',
      active: true,
      source: 'seed',
    },
    'seed',
  );
  assert.equal(shadow.getState().session.notificationChainTransitioning, true);

  shadow.dispatch(
    {
      type: 'SHADOW_MIRROR_SESSION',
      patch: {
        notificationChainTransitioning: false,
        startupHold: true,
        lobbyOpen: true,
      },
      source: 'legacy-only-attempt',
    },
    'legacy-only-attempt',
  );
  // Stage 4A strips transitioning + startupHold from reverse mirror.
  assert.equal(shadow.getState().session.notificationChainTransitioning, true);
  assert.equal(shadow.getState().session.startupHold, false);
  // lobbyOpen remains reverse-compat (not Stage 4A owner-only yet).
  assert.equal(shadow.getState().session.lobbyOpen, true);
}

// —— release / unlock / drain owner commands ——
{
  const shadow = createNotificationOverlayOwnerShadow();
  // Initial startupHold is false in createInitial; seed true via direct state setup.
  let state = createInitialNotificationOverlayOwnerState();
  state = {
    ...state,
    session: { ...state.session, startupHold: true, drainActive: false },
  };
  const released = notificationOverlayOwnerReducer(state, {
    type: 'STARTUP_INTERACTIONS_RELEASED',
    pendingCount: 0,
    source: 'test-release',
  });
  assert.equal(released.state.session.startupHold, false);
  assert.ok(released.effects.some((e) => e.type === 'MIRROR_LEGACY_SESSION'));

  const unlocked = notificationOverlayOwnerReducer(released.state, {
    type: 'QUEUE_UNLOCK_REQUESTED',
    reason: 'test-unlock',
  });
  assert.equal(unlocked.state.session.startupHold, false);

  const drained = notificationOverlayOwnerReducer(unlocked.state, {
    type: 'DRAIN_REQUESTED',
    source: 'test-drain',
  });
  assert.equal(drained.state.session.drainActive, true);
  assert.equal(drained.state.session.notificationChainTransitioning, true);
  assert.equal(drained.state.session.startupHold, false);
  assert.equal(drained.state.session.lobbyOpen, false);
}

// —— 9–10. source scan: no direct transitioning state/ref writes outside projection ——
{
  const STATE_SETTER_RE = /setNotificationChainTransitioningState\s*\(/;
  const REF_ASSIGN_RE =
    /notificationChainTransitioningRef\.current\s*=(?!=)/;
  const illegalState: Array<{ line: number; text: string }> = [];
  const illegalRef: Array<{ line: number; text: string }> = [];
  for (let i = 0; i < providersLines.length; i++) {
    const line = providersLines[i]!;
    const inProjection =
      i >= mirrorSessionRange.start && i < mirrorSessionRange.end;
    if (STATE_SETTER_RE.test(line)) {
      // declaration useState line is fine
      if (/useState/.test(line)) continue;
      if (inProjection) continue;
      illegalState.push({ line: i + 1, text: line.trim() });
    }
    if (REF_ASSIGN_RE.test(line)) {
      if (inProjection) continue;
      // useRef(false) init is not an assignment to .current
      illegalRef.push({ line: i + 1, text: line.trim() });
    }
  }
  assert.equal(
    illegalState.length,
    0,
    `Illegal setNotificationChainTransitioningState outside projection:\n${illegalState
      .map((x) => `  L${x.line}: ${x.text}`)
      .join('\n')}`,
  );
  assert.equal(
    illegalRef.length,
    0,
    `Illegal notificationChainTransitioningRef writes outside projection:\n${illegalRef
      .map((x) => `  L${x.line}: ${x.text}`)
      .join('\n')}`,
  );
}

assert.match(ownerSrc, /reportReverseTransitionBlocked/);
assert.match(ownerSrc, /CHAIN_TRANSITIONING_SET/);
assert.match(ownerSrc, /QUEUE_UNLOCK_REQUESTED/);
assert.match(ownerSrc, /DRAIN_REQUESTED/);
assert.match(providersSrc, /sessionProjectionDepthRef/);

// invariant helper exists
{
  const prev = process.env.NODE_ENV;
  process.env.NODE_ENV = 'development';
  try {
    assert.throws(
      () => reportReverseTransitionBlocked('test'),
      /STAGE4A/,
    );
  } finally {
    process.env.NODE_ENV = prev;
  }
}

console.log('owner-transition-authority.test.ts: ok');
console.log(
  `  mirrorLegacySession projection L${mirrorSessionRange.start + 1}-L${mirrorSessionRange.end}`,
);
console.log('  CHAIN_TRANSITIONING_SET / STARTUP_INTERACTIONS_RELEASED / QUEUE_UNLOCK_REQUESTED / DRAIN_REQUESTED');
console.log('  InstantBanFlow intent-only (no direct transition ref writes)');
