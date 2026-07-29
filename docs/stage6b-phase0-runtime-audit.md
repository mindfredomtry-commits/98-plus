# Stage 6B Phase 0 — Notification Runtime Stabilization Audit

**Branch:** `stage6b-phase0-runtime-audit`  
**Base:** `origin/main` / tag `stage6a-complete`  
**Commit audited:** `f3efbf61c633d4d615f5684888fff89e7c54e1e0`  
**Mode:** read-only (no product behavior changes)

---

## 1. Executive verdict

Stage 6A correctly removed dead compose-exit and diagnostic claim-fork paths. **Notification runtime is not yet a single controllable owner in practice.**

There are **two live architectural domains**:

| Domain | Module | Owns |
|---|---|---|
| Compose macro | `apps/web/src/notification-owner/` (boot-lobby) | BOOT / LOBBY / WHO / WHAT / CONFIRM / SUCCESS presentation kinds |
| Queue / card / pending | `apps/web/src/notification-runtime/` | queue, display, lifecycle, action, pending, consumed, recovery, directEntry |

Between them sits a large **host projection layer** in `Providers.tsx` + `InstantBanFlow.tsx` that can still:

- delay or suppress overlays (`composeBlocksNotificationHost`, reply/deeplink gates, SUCCESS holds)
- hide Lobby CTA via local `ctaState` even when runtime chrome may show
- gate taps via a global 350ms overlay input lock independent of runtime action state
- keep reading never-written `overlayQueueRef` and NotificationOverlayOwner shadow for paint/diagnostics

**Confirmed:** product lobby/screen *claim* uses `decideLobbyClaimFromRuntime` → runtime selectors.  
**Confirmed:** indicator badge uses `selectIndicatorVisible` (pending − consumed).  
**Confirmed:** Stage 6A enqueue/dismiss prev comes from `readRuntimePrevQueue` / `projectRuntimeQueueToLegacy`.  
**Confirmed:** many user-visible symptoms still have **plausible host/projection causes** that are not reducer defects.

Phase 1 must stabilize **runtime↔host projection contracts** and **action/CTA/overlay release invariants**, not reopen deleted Stage 6A paths.

---

## 2. Runtime ownership map

Legend: **Override?** = can a non-owner path change visible behavior for this concept.

| Concept | Canonical owner | State / selectors | Writers | Readers / projections | Override? |
|---|---|---|---|---|---|
| Pending server items | NotificationRuntime `pending.itemIds` + `generation` | `selectPendingItemIds`, `selectIndicatorVisible` | `PENDING_*` / bootstrap / ITEMS_RECEIVED paths in reducer + Providers fetch | InstantBanFlow badge; Providers | **Yes** — host can delay paint; stale fetch guarded by `generation` in reducer |
| Queue | NotificationRuntime `items.queue` | `selectCurrentItem`, `selectHasNext` | reducer `ITEMS_RECEIVED`, dismiss/advance, bootstrap | Providers via `projectRuntimeQueueToLegacy`; shell | **Partial** — host gates visibility |
| Active card / display | NotificationRuntime `display` + `lifecycle` | `selectOverlayVisible`, `selectCurrentItemId` | reducer show/advance/action | Providers shell; InstantBanFlow claim | **Yes** — compose/SUCCESS/reply local gates |
| Overlay visibility | Runtime lifecycle ∩ host gates | `selectOverlayVisible` + Providers `incomingGateActive` / `checkGateActive` / shell | runtime + Providers memos | GlobalOverlayHost, NotificationQueueShell | **Yes** — `composeBlocksNotificationHost` |
| Notification screen claim | Runtime | `decideLobbyClaimFromRuntime` | runtime only (product) | InstantBanFlow | **No** for claim aliases (Stage 6A Phase 2) |
| Queue transitioning | Dual | runtime `completing` + Providers `notificationChainTransitioning` React state/ref | host setState + runtime lifecycle | InstantBanFlow CTA/orb | **Yes** — host latch |
| Startup hold | Runtime + InstantBanFlow | `selectHoldLobbyOrbForBootstrap` + SUCCESS/drain holds | runtime booting; local handoff armed | orb layers | **Yes** — local SUCCESS holds |
| Card action pending | Runtime `action` for check; **local** for incoming | `selectIsActionBlocked` (check); IncomingBanOverlay `actionLoading` / locks | Check: runtime CARD_ACTION; Incoming: local | buttons disabled | **Yes** — incoming path not fully runtime-gated |
| Consumed | Runtime `consumed.itemIds` | used by pending selector | reducer on dismiss/action success | indicator | Low override if host paints ghost overlay |
| Lobby visibility | Runtime `selectLobbyMayShow` ∩ InstantBanFlow lobbies | + many host suppressors | runtime idle; InstantBanFlow/Providers | CTA/orb | **Yes** — multiple local suppressors |
| Lobby CTA | InstantBanFlow `ctaState` ∩ runtime chrome | `showLobbyCta` AND of ~12 predicates | `setCtaState` timers/effects | ArenaLobbyIdle | **Yes** — `ctaState` independent of runtime |
| Indicator | Runtime pending−consumed | `selectIndicatorVisible` | pending/consumed writers | InstantBanFlow | **Medium** — pending fetch races |
| Interruption eligibility | Host `composeBlocksNotificationHost` + deeplink/SUCCESS | `sendComposePhase`, reply compose, SUCCESS card | InstantBanFlow compose + Providers | gate memos | **Yes** — local compose phase |
| Reconnect / recovery | Runtime `recovery` + Providers bootstrap/WS | `RECOVERY_REQUESTED`, bootstrap | Providers network | runtime | **Yes** — host fetch ordering |

### Clarification on “NotificationOwner”

User brief states NotificationOwner is the single architectural owner. In code at `stage6a-complete`:

- **NotificationOwner** = compose macro only (`boot-lobby.*`).
- **NotificationRuntime** = notification queue/display/action authority.

Stage 6B must treat **NotificationRuntime as the queue single owner** and **NotificationOwner as compose single owner**, then collapse host overrides into projections of those two reducers. Do not invent a third owner.

---

## 3. End-to-end state-transition map

```text
A. BOOT
  auth ready → Providers bootstrap → runtime BOOTSTRAP/ITEMS_RECEIVED
  → lifecycle booting|draining|showing|idle
  → InstantBanFlow boot intro primed → ctaState enter
  → NotificationOwner BOOT→LOBBY via BOOT_COMPLETE

B. INCOMING
  WS/poll event → Providers parse/dedupe → runtime ITEMS_RECEIVED / pending snapshot
  → if composeBlocksNotificationHost: gate false (wait)
  → else shell/incomingGate paints card from runtime paint snapshot / owner-primary reads

C. CARD ACTION
  Check: allowOverlayUserTap? → selectIsActionBlocked? → CARD_ACTION_REQUESTED → HTTP
       → action pending|succeeded|failed → result handoff / advance
  Incoming overboard: allowOverlayUserTap? → submitIncomingOverboard (local lock incomplete)
  Incoming reply: local actionLoading flash → acknowledgeIncomingAndStartReply → compose OPEN_WHAT

D. QUEUE COMPLETION
  runtime advance to idle + empty queue + clear display
  → host must clear chain transitioning / overlay shell / SUCCESS holds
  → InstantBanFlow must restore ctaState visible
  → indicator clears when pending−consumed empty

E. RECOVERY
  refresh/reopen → bootstrap with consumed ids
  WS reconnect → ITEMS_RECEIVED merge/dedupe + pending generation guard
  failed action → action.failed, card retained (reducer paths covered by tests)
```

---

## 4. Exact active runtime path (confirmed)

1. **Queue authority:** `notificationRuntimeStore` in Providers (`createNotificationRuntimeStore`).
2. **Prev queue for Stage 6A mutations:** `readRuntimePrevQueue()` → `projectRuntimeQueueToLegacy(runtimeState)`.
3. **Lobby/screen claim:** InstantBanFlow `decideLobbyClaimFromRuntime(notificationRuntimeState)`.
4. **Indicator:** InstantBanFlow `selectIndicatorVisible(notificationRuntimeState)`.
5. **Compose macro:** `dispatchNotificationOwnerBootLobby` + `useNotificationOwnerWhoProjection`.
6. **Paint host:** Providers still computes shell kinds using runtime paint + residual owner-shadow/primary selectors; InstantBanFlow projects compose via local `phase` + `banSentSuccess`.

`overlayQueueRef` comment: never written under V9; still read in many Providers paths. **Confirmed residual:** WS `check:completed` removes from `overlayQueueRef.current` then `applyOverlayQueue` → can overwrite canonical runtime with an empty queue.

---

## 5. Remaining legacy inventory

| Symbol / module | Reachable? | Changes behavior? | Classification | Removable later? |
|---|---|---|---|---|
| `SendFlowOwnerKind` `'LEGACY_FLOW'` in `send-flow-exclusivity.ts` | type-only | No | **Intentionally frozen** | Yes, with type cleanup |
| Owner presentation `LEGACY_FLOW` / `LEAVE_*` / `leaveWhoForLegacyRef` | No (Stage 6A removed) | No | Deleted | n/a |
| `legacyQueueClaims*` / `queueLobbyGuardActiveDiag` | No (Stage 6A Phase 2) | No | Deleted | n/a |
| `shouldBlockLobbyForActiveQueue` / `queue-lobby-guard.ts` | Yes (sync + diag) | **Not product claim** (claim uses runtime) | Scaffolding / stale-guard maintenance | Conditional after proving no decision consumers |
| `overlayQueueRef` | Reads yes; writes no under V9 | **Yes — confirmed** WS `check:completed` derives next queue from `overlayQueueRef.current` then `applyOverlayQueue` → `syncRuntimeQueue` | Frozen empty ref with residual behavior-changing write-back | Replace with `readRuntimePrevQueue()` first |
| `projectRuntimeQueueToLegacy` | Yes | Bridge only | Production adapter | Keep until native consumers |
| `EMPTY_RUNTIME_LEGACY_SINKS` / demolition | Yes | Intentional empty sinks | Completed Stage 6A substrate | Keep |
| `ownerShadowRef` / `notification-overlay-owner*` / phase12 | Yes (dispatch + reads) | **Mixed** — some decision helpers still called; many diag-only | Entangled residual | Highest risk; staged |
| `shouldDeferLegacyResultOverlayPaint` | Yes | Safety interlock during SUCCESS drain | Live safety | After shadow/result candidates gone |
| InstantBanFlow `phase` / `banSentSuccess` | Yes | Paint/projection required today | Dual compose projection | After paint gates migrate |
| InstantBanFlow `ctaState` timers | Yes | CTA visibility | Local UX state machine | Must be folded into deterministic release contract |

---

## 6. Race-condition and stale-state inventory

| Issue | Evidence | Severity |
|---|---|---|
| Host gates vs runtime display desync | `composeBlocksNotificationHost = sendComposePhase !== 'idle' \|\| replyComposeActive` while runtime may already `showing` | HIGH |
| Lobby CTA local machine | `showLobbyCta` requires `ctaState ∈ {visible,entering,exiting}` independent of `interactiveLobbyChromeMayShow` | HIGH |
| Global 350ms overlay tap lock | `overlay-input-guard.ts` `OVERLAY_INPUT_LOCK_MS = 350`; IncomingBanOverlay uses `allowOverlayUserTap` before actions | HIGH for “second tap” |
| Incoming overboard lock incomplete | `overboardClickLockRef` checked and cleared in `finally`, **never set true** before submit; `actionLoading` not used on overboard path | HIGH |
| Counter sets loading true then immediately false | `setActionLoading(true); acknowledge...; setActionLoading(false)` in same sync turn | MEDIUM |
| SUCCESS presentation holds | `successPresentationHandoffArmed`, drain/empty-shell holds, `transitionOwnsPresentation` hide CTA/orb | HIGH for inter-card lobby flash |
| `notificationChainTransitioning` host state | Separate React state/ref from runtime `completing` | HIGH for delays / empty overlay |
| Pending generation OOO guard | Reducer stamps `pending.generation`; late empty fetch cannot clear newer snapshot | CONFIRMED protection exists |
| Queue dedupe on ITEMS_RECEIVED | `dedupeAppend` in reducer | CONFIRMED for id-level dedupe |
| Canonical queue overwritten from frozen empty `overlayQueueRef` | Providers WS `check:completed` → `applyOverlayQueue(removeOverlaysForBan(overlayQueueRef.current, …))` while ref is never written under V9 | **CONFIRMED** |
| `overlayQueueRef` other stale reads | Lengths/heads in Providers helpers / diags | MEDIUM |
| Reconnect double refresh / uncleared backoff | `useWebSocket` `onReconnect` from close path and `onopen`; timeout cleanup gaps | HIGH |
| Projection delay | Owner boot-lobby → InstantBanFlow phase via effects; SUCCESS has no phase projection (by design) | MEDIUM |
| Timers | CTA enter/exit, who dismiss, SUCCESS hold max ms, rAF in ResultOverlay | MEDIUM–HIGH for 0.5–2s pauses |

---

## 7. Screen interruption matrix

| Screen | Policy (code) | Owner-governed? | Local guards | Bypass risk |
|---|---|---|---|---|
| Lobby idle | May show notifications when runtime overlay lifecycle claims screen | Runtime claim yes | CTA/orb local | Low for claim; CTA separate |
| WHO / WHAT / CONFIRM | `composeBlocksNotificationHost` true while `sendComposePhase !== 'idle'` | Compose phase local + NotificationOwner kind | Providers gates | **HIGH** if phase lags owner |
| Hold-to-confirm | Same as CONFIRM + confirm orb blockers | Dual | confirm-hold debug blockers | MEDIUM |
| SUCCESS | `sendSuccessCardActive` / handoff holds block check/incoming | Local SUCCESS materialization | success drain holds | **HIGH** |
| Timer / result card | Result overlay + `allowOverlayUserTap` | Runtime display + local input lock | Result timer debug | MEDIUM |
| твои запреты (bans) | Section open suppresses shell in places | Host | `notificationShellSuppressedForBansLobby` | MEDIUM |
| History / archive / Premium / Analytics / relationship | Generally outside notification host; compose idle | Mostly n/a | Section mounts | LOW for queue; verify no accidental shell mount |
| Deeplink reply/check | Dedicated pending refs + gates | Host + runtime directEntry | Multiple | HIGH complexity |

---

## 8–9. Known failures → candidate causes (with confidence)

| # | Symptom | Top candidate cause(s) | Confidence |
|---|---|---|---|
| 1 | Lobby flicker between cards | SUCCESS/empty-shell hold release + host transitioning latch + CTA/orb predicates briefly true while next display not mounted | HIGH |
| 2 | Queue interrupted by full lobby | Same as #1; plus **CONFIRMED** path that can clear runtime queue from empty `overlayQueueRef` on WS `check:completed` | HIGH / CONFIRMED path |
| 3 | Second tap required | `allowOverlayUserTap` 350ms carryover lock; IncomingBanOverlay incomplete action lock; disabled until verifyPhase/buttonsEnabled | HIGH |
| 4 | Result buttons unresponsive | Overlay input lock carryover; result timer hit-test / pointer layers; action blocked while `action.succeeded` wait | HIGH |
| 5 | Overlay remains after queue ends | Host shell kind / chain transitioning not cleared when runtime idle+empty | HIGH |
| 6 | Indicator remains after clear | Pending snapshot not updated / consumed not recorded / indicator from pending while UI queue empty | MEDIUM–HIGH |
| 7 | 0.5–5s pauses | Timers (CTA, SUCCESS hold max), action result wait, prefetch, DOM mount ack waits | HIGH |
| 8 | Lobby without CTA | `ctaState` still `hidden` while chromeMayShow true; boot intro / latch predicates | **CONFIRMED path exists** |
| 9 | ~15s incoming delay | Historical; candidates: bootstrap settle, deferred drain, compose block, WS backlog — needs Phase 1 tracing | MEDIUM |
| 10 | Cards on forbidden screens | Gate miss if `sendComposePhase` wrong; reply compose paused flags | MEDIUM |
| 11 | Refresh restores stale display | Bootstrap restore + consumed set incomplete; direct entry preserve | MEDIUM |
| 12 | WS reconnect miss/dup/reorder | Double `reloadPending` per reconnect + uncleared backoff; merge/dedupe / pending generation help but do not cancel duplicate transport | HIGH |
| 13 | Duplicate WS display | Reducer dedupe by item id; host could still remount same head | MEDIUM |
| 14 | Duplicate action submit | Incoming overboard lock never armed; check uses `selectIsActionBlocked` better | HIGH (incoming) |
| 15 | Empty queue but UI active card | Host shell/held card vs runtime empty | HIGH |
| 16 | Owner advances, React stale | Projection/effects; SUCCESS local retain; shell fallback reads | HIGH |
| 17 | CTA restore separate path | InstantBanFlow `ctaState` machine + timers | **CONFIRMED** |
| 18 | Pending count vs queue diverge | **By design** — pending is badge authority, queue is display FIFO; divergence valid until consumed/pending sync | CONFIRMED (design) — bug only if pending not updated after consume |

---

## 10. Exact files and symbols (primary)

**Owners**

- `apps/web/src/notification-owner/boot-lobby.{types,reducer,store,adapter}.ts`
- `apps/web/src/notification-owner/send-flow-exclusivity.ts` (`LEGACY_FLOW` type freeze)
- `apps/web/src/notification-runtime/notification-runtime.{types,reducer,selectors,adapters,store,bootstrap,*.ts}`
- `apps/web/src/lib/lobby-claim-from-runtime.ts` — `decideLobbyClaimFromRuntime`

**Host / projection**

- `apps/web/src/components/Providers.tsx` — `overlayQueueRef`, `readRuntimePrevQueue`, `composeBlocksNotificationHost`, `notificationChainTransitioning`, owner shadow, gates
- `apps/web/src/components/instant-ban/InstantBanFlow.tsx` — `ctaState`, `phase`, `banSentSuccess`, SUCCESS holds, claim aliases
- `apps/web/src/components/IncomingBanOverlay.tsx` — `actionLoading`, `overboardClickLockRef`, `allowOverlayUserTap`
- `apps/web/src/components/CheckOverlay.tsx` — `selectIsActionBlocked`, `submitCheckAnswer`
- `apps/web/src/lib/overlay-input-guard.ts` — `OVERLAY_INPUT_LOCK_MS`
- `apps/web/src/lib/queue-lobby-guard.ts`
- `apps/web/src/lib/success-drain-empty-shell-hold.ts`
- `apps/web/src/lib/notification-overlay-owner*.ts` / phase12

---

## 11. Existing test coverage

### Ran in Phase 0 (product code unchanged)

| Suite | Result |
|---|---|
| notification-owner-boot-lobby | 17 passed |
| notification-owner-who | 18 passed |
| notification-owner-what | 14 passed |
| notification-owner-confirm | 13 passed |
| notification-owner-success | 16 passed |
| notification-owner-overlay-gating | OK |
| notification-owner-what-who-handoff | 10 passed |
| who-invite-more | 11 passed |
| notification-runtime-lobby-claim-single-owner | 7/7 |
| notification-runtime-stage6a-runtime-prev | 8 passed |
| notification-runtime-v4-pending-indicator | ok |
| notification-runtime-v1-advance | ok |
| notification-runtime-v2-lifecycle | **FAILED** |
| notification-runtime-overboard-card-action | 8/8 |
| notification-runtime-action-matching-result-handoff | 12/12 |
| notification-runtime-protect-visible-head | ALL PASSED |
| notification-runtime-queue-lifecycle-authority | 13 checks passed |
| `npm run build -w @98plus/web` | **passed** |
| `tsc -p apps/web/tsconfig.json --noEmit` | **289 pre-existing error lines** (baseline; not fixed) |

### Failed suite detail (do not “fix” in Phase 0)

`notification-runtime-v2-lifecycle.test.ts` source-scans InstantBanFlow for import `selectInteractiveLobbyChromeMayShow`. Production now imports `decideLobbyClaimFromRuntime` instead (which calls that selector). **Implementation-detail test drift**, not a proven product regression.

### Coverage character

- Strong: compose exclusivity, Stage 6A prev queue, lobby claim single-owner, check action, overboard handoff, pending indicator pure selectors, head protection.
- Weak / missing: first-tap incoming, CTA restore after queue empty, no-lobby-between-cards integration, WS reconnect integration, forbidden-screen interruption, refresh-during-action.

Many suites are pure reducer or source-scan tests (implementation detail), not user-visible timing/integration tests.

---

## 12. Missing deterministic tests (matrix)

| # | Missing test | Status |
|---|---|---|
| 1 | Two queued cards advance with zero Lobby frames between | Missing |
| 2 | First tap accepted on check/incoming | Partial (check paths); incoming missing |
| 3 | Rapid double tap → one submission | Missing (incoming especially) |
| 4 | Overlay gone when runtime idle+empty | Missing integration |
| 5 | Indicator clears after final consume | Partial pure selector; missing host integration |
| 6 | Lobby CTA returns after queue completion | Missing (`ctaState` contract) |
| 7 | WS duplicate does not duplicate card | Partial reducer dedupe; missing transport integration |
| 8 | Stale pending fetch cannot resurrect consumed | Partial (`generation` unit); expand |
| 9 | Reconnect does not lose card | Missing |
| 10 | Reconnect does not duplicate | Missing |
| 11–13 | Incoming waits during WHAT / CONFIRM / TIMER | Missing explicit |
| 14 | Queued displays when interruption allowed | Missing |
| 15 | Failed action retryable | Partial reducer tests exist |
| 16 | Recovery clears impossible queue/display/overlay | Missing host invariant |
| 17 | Queue empty + active display repaired | Missing |
| 18 | Queue non-empty + lobby-active advances | Missing |
| 19 | Result controls remain active across transitions | Missing |
| 20 | Refresh during action no duplicate submit | Missing |

---

## 13. Missing diagnostics / Phase 1 minimum trace

**Today:** many `*-trace-debug.ts` modules; fields scattered; hard to follow one ban across owner + runtime + host.

**Often present:** banId, kind, queueLen, pendingLen, activeOverlayKind, some transition flags.  
**Often missing as one correlated record:** owner command/event, runtime commandId, WS delivery id, fetch generation, action attempt id, consumed timestamp, recovery reason, before/after reducer snapshot, current compose kind, `ctaState`, `composeBlocksNotificationHost`.

### Minimum temporary Phase 1 diagnostic (do not implement in Phase 0)

Single structured event `STAGE6B_RUNTIME_TRACE` emitted at:

1. runtime dispatch (command/event + transitionId/commandId)
2. runtime reduce result (lifecycle, queueLen, displayId, action.status, pendingCount, generation)
3. host gate decision (`composeBlocks`, incoming/check gate booleans)
4. user tap allow/deny (`allowOverlayUserTap`, actionBlocked, attemptId)
5. CTA decision (`ctaState`, `showLobbyCta`, chromeMayShow)
6. recovery/bootstrap apply

Correlate by `banId` + `transitionId`/`commandId` + monotonic `seq`. Gate behind existing diag flags. No production default noise.

---

## 14. Proposed Stage 6B repair phases (dependency order)

1. **Phase 1 — Observability + invariant harness + stop frozen-ref write-back**  
   Temporary correlated trace; replace behavior-changing `overlayQueueRef.current` queue derivations with `readRuntimePrevQueue()` (start: WS `check:completed`); deterministic tests for #1/#2/#3/#6/#8/#17.

2. **Phase 2 — Action single-flight**  
   Route IncomingBanOverlay through runtime action blocking; fix overboard lock; scope/clear 350ms carryover lock; align with CheckOverlay.

3. **Phase 3 — Inter-card presentation contract**  
   Eliminate Lobby flash between cards: one release predicate from runtime + explicit next-display ack; shrink SUCCESS hold surface.

4. **Phase 4 — CTA restore contract**  
   Derive CTA eligibility from runtime chrome release + NotificationOwner LOBBY; remove orphan `ctaState` paths that can stick hidden.

5. **Phase 5 — Overlay/shell release on idle+empty**  
   Clear host transitioning/shell when runtime proves idle+empty+no action.

6. **Phase 6 — Pending/indicator sync audits**  
   Prove consume updates pending; reconnect merge rules; no resurrect.

7. **Phase 7 — Interruption policy table enforcement**  
   Single host function from NotificationOwner kind + runtime directEntry; remove ad-hoc compose phase drift.

8. **Phase 8 — Residual legacy read retirement**  
   Stop `overlayQueueRef` reads; thin shadow/phase12; only after 2–7 green.

Never restore Stage 6A deleted reverse-sync / LEAVE_* / claim forks.

---

## 15. Phase 1 acceptance criteria (exact)

**In scope**

- Add Stage 6B correlated diag (flag-gated).
- Add deterministic tests for at least: no-lobby-between-cards; first-tap/double-tap incoming; CTA restore after idle+empty; overlay cleared on idle+empty.
- Document failing baselines (red tests OK if they encode required invariants).

**Out of scope**

- Product UX redesign; WHO picker; Premium; Analytics; payments; referral.
- Deleting large legacy modules.
- Changing NotificationRuntime public event semantics except as required for tests’ seams.
- Merging / repair PR beyond Phase 1 branch when authorized.

**Accept when**

- Trace can follow one banId across dispatch→reduce→gate→tap→CTA.
- New tests either pass or fail for documented invariant gaps (no flaky timing).
- Stage 6A tag still green on owner regressions + build.
- Zero new TypeScript errors vs main baseline.

---

## 16. Exact files changed during Phase 0

- `docs/stage6b-phase0-runtime-audit.md` (this document only)

---

## 17. Exact commands and validation results

```powershell
git fetch origin --prune
git switch -c stage6b-phase0-runtime-audit origin/main

npx tsx --tsconfig apps/web/tsconfig.json apps/web/scripts/notification-owner-boot-lobby.test.ts
npx tsx --tsconfig apps/web/tsconfig.json apps/web/scripts/notification-owner-who.test.ts
npx tsx --tsconfig apps/web/tsconfig.json apps/web/scripts/notification-owner-what.test.ts
npx tsx --tsconfig apps/web/tsconfig.json apps/web/scripts/notification-owner-confirm.test.ts
npx tsx --tsconfig apps/web/tsconfig.json apps/web/scripts/notification-owner-success.test.ts
npx tsx --tsconfig apps/web/tsconfig.json apps/web/scripts/notification-owner-overlay-gating.test.ts
npx tsx --tsconfig apps/web/tsconfig.json apps/web/scripts/notification-owner-what-who-handoff.test.ts
npx tsx --tsconfig apps/web/tsconfig.json apps/web/scripts/who-invite-more.test.ts
npx tsx --tsconfig apps/web/tsconfig.json apps/web/scripts/notification-runtime-lobby-claim-single-owner.test.ts
npx tsx --tsconfig apps/web/tsconfig.json apps/web/scripts/notification-runtime-stage6a-runtime-prev.test.ts
# → NotificationOwner family: 106 assertions + overlay OK; lobby-claim 7/7; stage6a 8/8

npx tsx --tsconfig apps/web/tsconfig.json apps/web/scripts/notification-runtime-v4-pending-indicator.test.ts  # ok
npx tsx --tsconfig apps/web/tsconfig.json apps/web/scripts/notification-runtime-v1-advance.test.ts          # ok
npx tsx --tsconfig apps/web/tsconfig.json apps/web/scripts/notification-runtime-v2-lifecycle.test.ts        # FAIL (source-scan drift)
npx tsx --tsconfig apps/web/tsconfig.json apps/web/scripts/notification-runtime-overboard-card-action.test.ts
npx tsx --tsconfig apps/web/tsconfig.json apps/web/scripts/notification-runtime-action-matching-result-handoff.test.ts
npx tsx --tsconfig apps/web/tsconfig.json apps/web/scripts/notification-runtime-protect-visible-head.test.ts
npx tsx --tsconfig apps/web/tsconfig.json apps/web/scripts/notification-runtime-queue-lifecycle-authority.test.ts

npm run build -w @98plus/web   # passed
node node_modules/typescript/bin/tsc -p apps/web/tsconfig.json --noEmit --pretty false
# tsc_error_lines=289 (pre-existing baseline; not addressed)
```

---

## Facts vs hypotheses

**Facts:** dual compose/runtime owners; CTA local machine; composeBlocks gate; overlay input lock 350ms; incoming overboard lock never armed; Stage 6A claim/indicator/prev-queue paths; deleted Stage 6A symbols absent; **WS `check:completed` can syncRuntimeQueue from empty `overlayQueueRef`**; reconnect double-refresh pattern; v2-lifecycle source-scan fail; build pass; 289 tsc errors baseline.

**Hypotheses:** exact production timing of historical ~15s delay; which single latch dominates lobby flicker in field when queue is intact.

Cross-agent consensus (ownership / races / tests+obs): runtime reducer invariants are strong; host frozen-ref write-back, tap lock, CTA timing, and paint≠lifecycle gaps are the Stage 6B priority surface.
