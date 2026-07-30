/**
 * Stage 6B Phase 3 — overlay lifecycle + lobby CTA restoration.
 *
 * Run:
 *   npx tsx --tsconfig apps/web/tsconfig.json apps/web/scripts/notification-runtime-stage6b-overlay-lifecycle.test.ts
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { BanInteraction } from '@98plus/shared';
import {
  decideHostOverlayRepairAfterIdleEmpty,
  decideLobbyCtaEligibility,
  decideOverlayProductVisible,
  isIllegalEmptyOverlayShell,
  isRuntimeIdleEmpty,
  shouldRestoreCtaOnReleasedPresentation,
} from '../src/lib/stage6b-overlay-lifecycle';
import {
  buildPostNotificationPresentationSnapshot,
  detectPostNotificationPresentationReleaseEdge,
  isPostNotificationPresentationFullyReleased,
} from '../src/lib/post-notification-presentation-release';
import { evaluateSuccessPresentationHandoffHold } from '../src/lib/success-drain-empty-shell-hold';
import {
  createNotificationRuntimeStore,
  nextRuntimeTransitionId,
  syncRuntimeQueue,
} from '../src/notification-runtime/notification-runtime.store';
import {
  selectIndicatorVisible,
  selectLobbyMayShow,
  selectOverlayVisible,
  selectPendingCount,
} from '../src/notification-runtime/notification-runtime.selectors';
import {
  createInitialNotificationRuntimeState,
  type NotificationItem,
  type NotificationRuntimeState,
} from '../src/notification-runtime/notification-runtime.types';
import {
  executeSubmitIncomingOverboardEffect,
  requestIncomingOverboardAction,
} from '../src/notification-runtime/notification-runtime.overboard-action';
import { EMPTY_RUNTIME_LEGACY_SINKS } from '../src/notification-runtime/notification-runtime.demolition';

let passed = 0;
function pass(name: string): void {
  passed += 1;
  console.log(`PASS — ${name}`);
}

function ban(id: string): BanInteraction {
  return { id } as BanInteraction;
}
function incoming(id: string): NotificationItem {
  return { kind: 'incoming', ban: ban(id) };
}
function check(id: string): NotificationItem {
  return { kind: 'check', ban: ban(id) };
}

function seed(items: NotificationItem[]) {
  const store = createNotificationRuntimeStore();
  syncRuntimeQueue(store, items, 'test', nextRuntimeTransitionId('p3-seed'));
  return store;
}

async function overboardFinal(
  store: ReturnType<typeof createNotificationRuntimeStore>,
  banId: string,
) {
  const requested = requestIncomingOverboardAction(store, {
    banId,
    commandId: `cmd-${banId}`,
  });
  assert.equal(requested.accepted, true);
  const effect = requested.effects.find((e) => e.type === 'SUBMIT_CARD_ACTION');
  assert.ok(effect && effect.type === 'SUBMIT_CARD_ACTION');
  return executeSubmitIncomingOverboardEffect(
    store,
    effect,
    async () => ({ ok: true, result: null, explicitNoResult: true }),
    'tok',
    EMPTY_RUNTIME_LEGACY_SINKS,
  );
}

function hostCleared(
  overrides: Partial<
    Parameters<typeof buildPostNotificationPresentationSnapshot>[1]
  > = {},
) {
  return {
    notificationOverlayMounted: false,
    notificationQueueUiLock: false,
    hostResultActive: false,
    directOverboardActive: false,
    notificationChainTransitioning: false,
    visualQueueDimSession: false,
    orbOverlayDim: false,
    postSuccessHandoffBlocking: false,
    successExitDraining: false,
    ...overrides,
  };
}

const webSrc = join(process.cwd(), 'apps/web/src');
const flowSrc = readFileSync(
  join(webSrc, 'components/instant-ban/InstantBanFlow.tsx'),
  'utf8',
);
const providersSrc = readFileSync(
  join(webSrc, 'components/Providers.tsx'),
  'utf8',
);

async function main() {
// 1. Final card completion clears overlay (runtime)
{
  const store = seed([incoming('A')]);
  await overboardFinal(store, 'A');
  const s = store.getState();
  assert.equal(isRuntimeIdleEmpty(s), true);
  assert.equal(selectOverlayVisible(s), false);
  assert.equal(decideOverlayProductVisible(s), false);
  pass('1. final card completion clears overlay');
}

// 2. Final card completion clears transitioning (repair decision)
{
  const idle = createInitialNotificationRuntimeState();
  const repair = decideHostOverlayRepairAfterIdleEmpty({
    runtime: idle,
    notificationChainTransitioning: true,
    visualQueueDimSession: false,
    notificationOverlayMounted: false,
    hostResultActive: false,
    heldUserCardActive: false,
  });
  assert.equal(repair.shouldRepair, true);
  assert.equal(repair.reason, 'stale-host-shadow');
  assert.match(providersSrc, /stage6b-phase3-idle-empty-repair/);
  pass('2. final card completion clears transitioning');
}

// 3. Final card completion restores lobby CTA
{
  const store = seed([incoming('A')]);
  await overboardFinal(store, 'A');
  const snap = buildPostNotificationPresentationSnapshot(
    store.getState(),
    hostCleared(),
  );
  assert.equal(isPostNotificationPresentationFullyReleased(snap), true);
  const cta = decideLobbyCtaEligibility({
    lobbyBootIntroPrimed: true,
    phaseIdle: true,
    interactiveLobbyChromeMayShow: true,
    presentationFullyReleased: true,
    hostBlocksCta: false,
    ctaState: 'hidden',
  });
  assert.equal(cta.show, true);
  assert.equal(cta.forceCtaVisible, true);
  pass('3. final card completion restores lobby CTA');
}

// 4. Lobby never renders without CTA after idle+empty
{
  const cta = decideLobbyCtaEligibility({
    lobbyBootIntroPrimed: true,
    phaseIdle: true,
    interactiveLobbyChromeMayShow: true,
    presentationFullyReleased: true,
    hostBlocksCta: false,
    ctaState: 'hidden',
  });
  assert.equal(cta.show, true, 'idle+empty eligible ⇒ CTA must show');
  assert.equal(selectLobbyMayShow(createInitialNotificationRuntimeState()), true);
  pass('4. lobby never without CTA after idle+empty');
}

// 5. Two-card queue never shows lobby between cards
{
  const store = seed([incoming('A'), incoming('B')]);
  const lobbyFrames: boolean[] = [];
  store.subscribe(() => {
    lobbyFrames.push(selectLobbyMayShow(store.getState()));
  });
  await overboardFinal(store, 'A');
  assert.equal(store.getState().display.kind, 'incoming');
  assert.equal(selectLobbyMayShow(store.getState()), false);
  assert.equal(
    lobbyFrames.every((v) => v === false),
    true,
    'no lobby between cards',
  );
  const mid = decideLobbyCtaEligibility({
    lobbyBootIntroPrimed: true,
    phaseIdle: true,
    interactiveLobbyChromeMayShow: selectLobbyMayShow(store.getState()),
    presentationFullyReleased: isPostNotificationPresentationFullyReleased(
      buildPostNotificationPresentationSnapshot(store.getState(), hostCleared()),
    ),
    hostBlocksCta: false,
    ctaState: 'hidden',
  });
  assert.equal(mid.show, false);
  pass('5. two-card queue never shows lobby between cards');
}

// 6. Empty shell cannot persist after active display clears
{
  const idle = createInitialNotificationRuntimeState();
  assert.equal(
    isIllegalEmptyOverlayShell({
      runtime: idle,
      notificationOverlayMounted: true,
    }),
    true,
  );
  assert.equal(
    isIllegalEmptyOverlayShell({
      runtime: idle,
      notificationOverlayMounted: false,
    }),
    false,
  );
  const showing = seed([incoming('X')]).getState();
  assert.equal(
    isIllegalEmptyOverlayShell({
      runtime: showing,
      notificationOverlayMounted: true,
    }),
    false,
  );
  pass('6. empty shell cannot persist after active display clears');
}

// 7. Success hold cannot survive card identity change / explicit empty
{
  // Armed + awaiting next card: idle+null still holds (Fix A).
  const stillHolding = evaluateSuccessPresentationHandoffHold({
    lobbyBootIntroPrimed: true,
    handoffArmed: true,
    runtimeLifecycle: 'idle',
    runtimeDisplayKind: null,
    runtimeDisplayPayloadPresent: false,
    runtimeQueueLength: 0,
    notificationPresentationClaimed: false,
    expectedDisplayId: 'A',
    nextDisplayDomMounted: false,
    chainExplicitlyEmpty: false,
    presentationOwnershipReleased: false,
    holdExpired: false,
  });
  assert.equal(stillHolding.hold, true);
  // Owning identity / chain done → explicit empty releases without timer.
  const released = evaluateSuccessPresentationHandoffHold({
    lobbyBootIntroPrimed: true,
    handoffArmed: true,
    runtimeLifecycle: 'idle',
    runtimeDisplayKind: null,
    runtimeDisplayPayloadPresent: false,
    runtimeQueueLength: 0,
    notificationPresentationClaimed: false,
    expectedDisplayId: null,
    nextDisplayDomMounted: false,
    chainExplicitlyEmpty: true,
    presentationOwnershipReleased: false,
    holdExpired: false,
  });
  assert.equal(released.hold, false);
  assert.equal(released.releaseReason, 'chain-explicitly-empty');
  pass('7. success hold cannot survive card identity / explicit empty');
}

// 8. Stale local ctaState cannot hide CTA when runtime allows
{
  const cta = decideLobbyCtaEligibility({
    lobbyBootIntroPrimed: true,
    phaseIdle: true,
    interactiveLobbyChromeMayShow: true,
    presentationFullyReleased: true,
    hostBlocksCta: false,
    ctaState: 'hidden',
  });
  assert.equal(cta.show, true);
  assert.equal(cta.forceCtaVisible, true);
  assert.match(flowSrc, /decideLobbyCtaEligibility/);
  assert.match(flowSrc, /lobbyCtaEligibility\.show/);
  pass('8. stale local ctaState cannot hide CTA when runtime allows');
}

// 9. Indicator clears after final consumed item when no pending remains
{
  const after = createInitialNotificationRuntimeState();
  const withPendingThenClear: NotificationRuntimeState = {
    ...after,
    pending: { itemIds: ['incoming:A'], sourceVersion: 't', generation: 1 },
  };
  assert.equal(selectIndicatorVisible(withPendingThenClear), true);
  const cleared: NotificationRuntimeState = {
    ...after,
    pending: { itemIds: [], sourceVersion: 't', generation: 2 },
    consumed: { itemIds: ['incoming:A'] },
  };
  assert.equal(isRuntimeIdleEmpty(cleared), true);
  assert.equal(selectPendingCount(cleared), 0);
  assert.equal(selectIndicatorVisible(cleared), false);
  pass('9. indicator clears when no pending source remains');
}

// 10. Indicator remains if server pending still exists
{
  const idle = createInitialNotificationRuntimeState();
  const withPending: NotificationRuntimeState = {
    ...idle,
    pending: {
      itemIds: ['incoming:server-pending'],
      sourceVersion: 's',
      generation: 1,
    },
  };
  assert.equal(selectIndicatorVisible(withPending), true);
  assert.equal(isRuntimeIdleEmpty(withPending), true);
  pass('10. indicator remains if server pending still legitimately exists');
}

// 11. Display acknowledgement timeout is not required for teardown
{
  // Terminal empty (caller-derived) releases without holdExpired / DOM ack.
  const d = evaluateSuccessPresentationHandoffHold({
    lobbyBootIntroPrimed: true,
    handoffArmed: true,
    runtimeLifecycle: 'idle',
    runtimeDisplayKind: null,
    runtimeDisplayPayloadPresent: false,
    runtimeQueueLength: 0,
    notificationPresentationClaimed: false,
    expectedDisplayId: 'missing-dom',
    nextDisplayDomMounted: false,
    chainExplicitlyEmpty: true,
    presentationOwnershipReleased: false,
    holdExpired: false,
  });
  assert.equal(d.hold, false);
  assert.equal(d.releaseReason, 'chain-explicitly-empty');
  assert.match(
    flowSrc,
    /isRuntimeIdleEmpty\(notificationRuntimeState\) &&\s*\n\s*!successPresentationHandoffArmed/,
  );
  pass('11. display acknowledgement timeout is not required for teardown');
}

// 12. Remount after idle+empty restores correct lobby + CTA
{
  assert.equal(
    shouldRestoreCtaOnReleasedPresentation({
      presentationFullyReleased: true,
      previousReleased: null,
      ctaState: 'hidden',
      phaseIdle: true,
    }),
    true,
  );
  const cta = decideLobbyCtaEligibility({
    lobbyBootIntroPrimed: true,
    phaseIdle: true,
    interactiveLobbyChromeMayShow: true,
    presentationFullyReleased: true,
    hostBlocksCta: false,
    ctaState: 'hidden',
  });
  assert.equal(cta.show, true);
  pass('12. remount after idle+empty restores lobby + CTA');
}

// 13. Runtime idle+empty + stale overlay shadow repairs
{
  const repair = decideHostOverlayRepairAfterIdleEmpty({
    runtime: createInitialNotificationRuntimeState(),
    notificationChainTransitioning: true,
    visualQueueDimSession: true,
    notificationOverlayMounted: true,
    hostResultActive: true,
    heldUserCardActive: true,
  });
  assert.equal(repair.shouldRepair, true);
  pass('13. idle+empty + stale overlay shadow repairs');
}

// 14. Runtime non-empty + stale lobby-visible → card display
{
  const store = seed([check('C')]);
  const s = store.getState();
  assert.equal(selectOverlayVisible(s), true);
  assert.equal(selectLobbyMayShow(s), false);
  assert.equal(decideOverlayProductVisible(s), true);
  const cta = decideLobbyCtaEligibility({
    lobbyBootIntroPrimed: true,
    phaseIdle: true,
    interactiveLobbyChromeMayShow: false,
    presentationFullyReleased: false,
    hostBlocksCta: false,
    ctaState: 'visible',
  });
  assert.equal(cta.show, false);
  pass('14. non-empty runtime returns to card display (CTA hidden)');
}

// 15. Duplicate completion does not re-hide CTA or remount overlay
{
  let prev: boolean | null = false;
  let edges = 0;
  for (let i = 0; i < 5; i++) {
    const det = detectPostNotificationPresentationReleaseEdge(prev, true);
    prev = det.nextPrevious;
    if (det.edge) edges += 1;
  }
  assert.equal(edges, 1);
  const cta = decideLobbyCtaEligibility({
    lobbyBootIntroPrimed: true,
    phaseIdle: true,
    interactiveLobbyChromeMayShow: true,
    presentationFullyReleased: true,
    hostBlocksCta: false,
    ctaState: 'visible',
  });
  assert.equal(cta.show, true);
  assert.equal(cta.forceCtaVisible, false);
  pass('15. duplicate completion does not re-hide CTA');
}

// Source: Phase 3 sync CTA (no enter timer on restore path)
{
  assert.match(flowSrc, /Deterministic restore — no CTA_ENTER_MS/);
  assert.match(providersSrc, /decideHostOverlayRepairAfterIdleEmpty/);
  pass('source: Phase 3 restore + idle-empty repair wired');
}

console.log(
  `notification-runtime-stage6b-overlay-lifecycle.test.ts: ${passed} passed`,
);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
