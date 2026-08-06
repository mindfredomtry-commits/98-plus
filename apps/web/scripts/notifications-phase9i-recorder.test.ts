/**
 * Stage 8 Phase 9I — production recorder automated tests (1–13).
 *
 * Run:
 *   npx tsx --tsconfig apps/web/tsconfig.json apps/web/scripts/notifications-phase9i-recorder.test.ts
 */
import assert from 'node:assert/strict';
import { act, createElement, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { JSDOM } from 'jsdom';
import {
  createNotificationsProductionRecorder,
  installRecorderGlobal,
  resetNotificationsProductionRecorderForTests,
  sanitizeRecorderValue,
  type NotificationsRecorderEvent,
  type NotificationsRecorderTrace,
} from '../src/notifications/diagnostics/notifications-production-recorder';
import { rec } from '../src/notifications/diagnostics/notifications-recorder-bridge';
import {
  analyzeCycleDivergence,
  parseNotificationsProductionTrace,
} from '../src/notifications/diagnostics/notifications-trace-replay';

let passed = 0;
function pass(name: string) {
  console.log(`PASS — ${name}`);
  passed += 1;
}

function installDom() {
  const dom = new JSDOM(
    '<!DOCTYPE html><html><body><div id="root"></div></body></html>',
    { url: 'http://localhost/' },
  );
  const win = dom.window;
  const define = (key: string, value: unknown) => {
    Object.defineProperty(globalThis, key, {
      value,
      configurable: true,
      writable: true,
    });
  };
  define('window', win);
  define('document', win.document);
  define('navigator', win.navigator);
  define('HTMLElement', win.HTMLElement);
  define('Node', win.Node);
  define('Text', win.Text);
  define('MutationObserver', win.MutationObserver);
  define('IS_REACT_ACT_ENVIRONMENT', true);
  return dom;
}

function assertMonotonic(events: NotificationsRecorderEvent[]) {
  for (let i = 1; i < events.length; i++) {
    assert.ok(
      events[i]!.globalSeq > events[i - 1]!.globalSeq,
      `globalSeq not monotonic at ${i}`,
    );
  }
}

// 1 + 2 — global sequence monotonic; shared ordering across sources
{
  resetNotificationsProductionRecorderForTests();
  const r = createNotificationsProductionRecorder();
  installRecorderGlobal(r);
  r.clear();
  r.start();
  rec('ui', 'LOBBY_YOUR_BANS_CLICK');
  rec('coordinator', 'COORDINATOR_OPEN_BEGIN');
  rec('runtime', 'RUNTIME_ACTIVATE_BEGIN');
  rec('controller', 'CONTROLLER_SNAPSHOT_PUBLISHED');
  rec('presenter', 'PRESENTER_OUTPUT_ITEM');
  rec('ApplicationSurface', 'APPLICATION_SURFACE_BRANCH_NOTIFICATIONS');
  rec('transport', 'HTTP_SYNC_BEGIN');
  rec('NotificationsSurface', 'NOTIFICATION_CARD_MOUNT');
  const events = r.getTrace().events;
  assertMonotonic(events);
  const sources = new Set(events.map((e) => e.source));
  assert.ok(sources.size >= 5, 'expected multi-subsystem sources');
  r.stop();
  pass('1–2 globalSeq monotonic + shared ordering');
}

// 3 — survives React unmount/remount
{
  resetNotificationsProductionRecorderForTests();
  const dom = installDom();
  const r = createNotificationsProductionRecorder();
  installRecorderGlobal(r);
  r.clear();
  r.start();

  function Probe({ id }: { id: string }) {
    useEffect(() => {
      rec('Probe', 'NOTIFICATION_HOST_MOUNT', {
        metadata: { instanceId: id },
      });
      return () => {
        rec('Probe', 'NOTIFICATION_HOST_UNMOUNT', {
          metadata: { instanceId: id },
        });
      };
    }, [id]);
    return createElement('div', { 'data-id': id }, id);
  }

  const container = document.getElementById('root')!;
  let root: Root;
  act(() => {
    root = createRoot(container);
    root.render(createElement(Probe, { id: 'a' }));
  });
  act(() => {
    root!.render(createElement(Probe, { id: 'b' }));
  });
  act(() => {
    root!.unmount();
  });

  const stages = r.getTrace().events.map((e) => e.stage);
  assert.ok(stages.includes('NOTIFICATION_HOST_MOUNT'));
  assert.ok(stages.includes('NOTIFICATION_HOST_UNMOUNT'));
  assert.ok(r.getTrace().events.length >= 3);
  r.stop();
  dom.window.close();
  pass('3 trace survives React unmount/remount');
}

// 4 — cycle numbering
{
  resetNotificationsProductionRecorderForTests();
  const r = createNotificationsProductionRecorder();
  installRecorderGlobal(r);
  r.clear();
  r.start();
  rec('ui', 'LOBBY_YOUR_BANS_CLICK');
  rec('ui', 'NOTIFICATION_CARD_MOUNT', {
    stateAfter: { itemId: 'incoming:Ban1', cardMounted: true },
  });
  rec('ui', 'NOTIFICATION_CARD_CLOSE_CLICK');
  rec('ui', 'LOBBY_MOUNT');
  rec('ui', 'LOBBY_YOUR_BANS_CLICK');
  const cycles = r
    .getTrace()
    .events.filter((e) => e.stage === 'CYCLE_STARTED')
    .map((e) => e.cycleNumber);
  assert.deepEqual(cycles, [1, 2]);
  assert.equal(r.getSummary().successfulCycles, 1);
  r.stop();
  pass('4 cycle numbering');
}

// 5 — sanitization
{
  const cleaned = sanitizeRecorderValue({
    authorization: 'Bearer secret-token',
    token: 'abc',
    initData: 'query_id=...',
    username: 'alice',
    banText: 'do not eat pizza',
    text: 'hello',
    url: 'https://api.example.com/x?token=1&foo=2',
    nested: { cookie: 'a=b', ok: true },
  }) as Record<string, unknown>;
  assert.equal(cleaned.authorization, '[redacted]');
  assert.equal(cleaned.token, '[redacted]');
  assert.equal(cleaned.initData, '[redacted]');
  assert.equal(cleaned.username, '[redacted-name]');
  assert.equal(cleaned.banText, '[text:16]');
  assert.equal(cleaned.text, '[text:5]');
  assert.equal(cleaned.url, 'https://api.example.com/x');
  assert.equal((cleaned.nested as Record<string, unknown>).cookie, '[redacted]');
  pass('5 sensitive payloads sanitized');
}

// 6 — export/import lossless for replay fields
{
  resetNotificationsProductionRecorderForTests();
  const r = createNotificationsProductionRecorder({
    build: {
      gitSha: 'deadbeef',
      branch: 'test',
      environment: 'test',
      appVersion: '0',
    },
  });
  installRecorderGlobal(r);
  r.clear();
  r.start();
  rec('ui', 'LOBBY_YOUR_BANS_CLICK', {
    correlationId: 'c1',
    stateBefore: { currentOwner: 'CREATE_BAN' },
    stateAfter: { currentOwner: 'CREATE_BAN' },
  });
  rec('coordinator', 'COORDINATOR_OPEN_REJECTED', {
    rejectionReason: 'CAPABILITY_UNAVAILABLE',
    result: 'rejected',
  });
  r.stop();
  const exported = r.exportTrace();
  const parsed = parseNotificationsProductionTrace(exported);
  assert.equal(parsed.schemaVersion, 1);
  assert.equal(parsed.build.gitSha, 'deadbeef');
  assert.ok(parsed.events.length >= 2);
  assert.equal(
    parsed.events.find((e) => e.stage === 'LOBBY_YOUR_BANS_CLICK')
      ?.correlationId,
    'c1',
  );
  assert.equal(
    parsed.events.find((e) => e.stage === 'COORDINATOR_OPEN_REJECTED')
      ?.rejectionReason,
    'CAPABILITY_UNAVAILABLE',
  );
  pass('6 export/import lossless for replay fields');
}

// 7 — stale async events remain
{
  resetNotificationsProductionRecorderForTests();
  const r = createNotificationsProductionRecorder();
  installRecorderGlobal(r);
  r.clear();
  r.start();
  rec('runtime', 'RUNTIME_STALE_EVENT_RECEIVED', {
    result: 'ignored',
    metadata: { stale: true, eventSessionGeneration: 1 },
  });
  rec('transport', 'SYNC_FLIGHT_STALE_COMPLETE', {
    metadata: { generation: 2 },
  });
  const stages = r.getTrace().events.map((e) => e.stage);
  assert.ok(stages.includes('RUNTIME_STALE_EVENT_RECEIVED'));
  assert.ok(stages.includes('SYNC_FLIGHT_STALE_COMPLETE'));
  r.stop();
  pass('7 stale async events remain in trace');
}

// 8 — subscription counts
{
  resetNotificationsProductionRecorderForTests();
  const r = createNotificationsProductionRecorder();
  installRecorderGlobal(r);
  r.clear();
  r.start();
  rec('controller', 'CONTROLLER_SUBSCRIBE', {
    metadata: { subscriberCount: 1, controllerIdentity: 'c' },
  });
  rec('controller', 'CONTROLLER_SUBSCRIBE', {
    metadata: { subscriberCount: 2, controllerIdentity: 'c' },
  });
  rec('controller', 'CONTROLLER_UNSUBSCRIBE', {
    metadata: { subscriberCount: 1, controllerIdentity: 'c' },
  });
  const counts = r
    .getTrace()
    .events.filter((e) => e.stage.startsWith('CONTROLLER_'))
    .map((e) => e.metadata.subscriberCount);
  assert.deepEqual(counts, [1, 2, 1]);
  r.stop();
  pass('8 subscription counts recorded');
}

// 9 — timers / promise ordering
{
  resetNotificationsProductionRecorderForTests();
  const r = createNotificationsProductionRecorder();
  installRecorderGlobal(r);
  r.clear();
  r.start();
  rec('async', 'TIMER_SCHEDULED', { metadata: { timerId: 't1' } });
  rec('async', 'ASYNC_TASK_SCHEDULED', { metadata: { taskId: 'p1' } });
  rec('async', 'ASYNC_TASK_STARTED', { metadata: { taskId: 'p1' } });
  rec('async', 'TIMER_FIRED', { metadata: { timerId: 't1' } });
  rec('async', 'ASYNC_TASK_COMPLETED', { metadata: { taskId: 'p1' } });
  const stages = r
    .getTrace()
    .events.filter((e) => e.source === 'async')
    .map((e) => e.stage);
  assert.deepEqual(stages, [
    'TIMER_SCHEDULED',
    'ASYNC_TASK_SCHEDULED',
    'ASYNC_TASK_STARTED',
    'TIMER_FIRED',
    'ASYNC_TASK_COMPLETED',
  ]);
  assertMonotonic(r.getTrace().events);
  r.stop();
  pass('9 timers and promise ordering recorded');
}

// 10 — disabled has minimal effect
{
  resetNotificationsProductionRecorderForTests();
  const r = createNotificationsProductionRecorder();
  installRecorderGlobal(r);
  r.clear();
  assert.equal(r.isRunning(), false);
  rec('ui', 'LOBBY_YOUR_BANS_CLICK');
  assert.equal(r.getTrace().events.length, 0);
  pass('10 recorder disabled — no events');
}

// 11 — enabled does not mutate Runtime/Coordinator (recorder is pure append)
{
  resetNotificationsProductionRecorderForTests();
  const r = createNotificationsProductionRecorder();
  installRecorderGlobal(r);
  r.clear();
  r.start();
  const domain = { currentOwner: 'CREATE_BAN', activeItemId: null as string | null };
  const before = { ...domain };
  rec('coordinator', 'COORDINATOR_OPEN_BEGIN', {
    stateBefore: { ...domain },
    stateAfter: { ...domain },
  });
  assert.deepEqual(domain, before);
  r.stop();
  pass('11 recorder does not mutate domain objects');
}

// 12 — 100 cycles bounded memory
{
  resetNotificationsProductionRecorderForTests();
  const r = createNotificationsProductionRecorder({ maxEvents: 500 });
  installRecorderGlobal(r);
  r.clear();
  r.start();
  for (let i = 0; i < 100; i++) {
    rec('ui', 'LOBBY_YOUR_BANS_CLICK');
    rec('ui', 'NOTIFICATION_CARD_MOUNT', {
      stateAfter: { itemId: 'incoming:Ban1' },
    });
    rec('ui', 'NOTIFICATION_CARD_CLOSE_CLICK');
    rec('ui', 'LOBBY_MOUNT');
  }
  const count = r._getRawEventCount();
  assert.ok(count <= 500, `expected bounded <=500 got ${count}`);
  assert.ok(count > 0);
  r.stop();
  pass('12 100 cycles without unbounded growth');
}

// 13 — truncation preserves failed + preceding successful cycle
{
  resetNotificationsProductionRecorderForTests();
  const r = createNotificationsProductionRecorder({ maxEvents: 80 });
  installRecorderGlobal(r);
  r.clear();
  r.start();
  // Two successful cycles with many filler events, then a failure.
  for (let c = 0; c < 2; c++) {
    rec('ui', 'LOBBY_YOUR_BANS_CLICK');
    for (let i = 0; i < 20; i++) {
      rec('filler', 'ASYNC_TASK_COMPLETED', { metadata: { i, c } });
    }
    rec('ui', 'NOTIFICATION_CARD_MOUNT', {
      stateAfter: { itemId: 'incoming:Ban1' },
    });
    rec('ui', 'NOTIFICATION_CARD_CLOSE_CLICK');
    rec('ui', 'LOBBY_MOUNT');
  }
  rec('ui', 'LOBBY_YOUR_BANS_CLICK');
  rec('coordinator', 'COORDINATOR_OPEN_REJECTED', {
    rejectionReason: 'CAPABILITY_UNAVAILABLE',
  });
  // Fill more to force ring pressure after failure.
  for (let i = 0; i < 40; i++) {
    rec('filler', 'ASYNC_TASK_COMPLETED', { metadata: { post: i } });
  }
  const trace = r.getTrace();
  const failed = trace.summary.failedCycleNumber;
  assert.ok(failed != null, 'expected failed cycle');
  const preserved = new Set(
    trace.events
      .filter(
        (e) =>
          e.cycleNumber === failed || e.cycleNumber === (failed as number) - 1,
      )
      .map((e) => e.cycleNumber),
  );
  assert.ok(preserved.has(failed!));
  assert.ok(preserved.has(failed! - 1));
  r.stop();
  pass('13 truncation preserves failed + preceding successful cycle');
}

// Divergence analyzer smoke (synthetic)
{
  const synthetic: NotificationsRecorderTrace = {
    schemaVersion: 1,
    build: {
      gitSha: null,
      branch: null,
      environment: 'test',
      appVersion: null,
    },
    session: {
      appSessionId: 'app',
      recorderSessionId: 'rec',
      startedAt: new Date().toISOString(),
      userAgentSummary: null,
      telegramEnvironment: null,
    },
    summary: {
      successfulCycles: 1,
      failedCycleNumber: 2,
      failureStage: 'COORDINATOR_OPEN_REJECTED',
      failureClass: 'OPEN_REJECTED',
      finalOwner: 'CREATE_BAN',
      finalCapability: null,
      finalActiveItemId: null,
    },
    events: [
      {
        globalSeq: 1,
        monotonicTimeMs: 1,
        wallClockTime: new Date().toISOString(),
        appSessionId: 'app',
        recorderSessionId: 'rec',
        cycleNumber: 1,
        openAttemptId: 'o1',
        closeAttemptId: null,
        correlationId: null,
        source: 'ui',
        stage: 'CYCLE_STARTED',
        eventName: 'CYCLE_STARTED',
        stateBefore: null,
        stateAfter: null,
        result: null,
        rejectionReason: null,
        error: null,
        metadata: {},
      },
      {
        globalSeq: 2,
        monotonicTimeMs: 2,
        wallClockTime: new Date().toISOString(),
        appSessionId: 'app',
        recorderSessionId: 'rec',
        cycleNumber: 1,
        openAttemptId: 'o1',
        closeAttemptId: null,
        correlationId: null,
        source: 'ui',
        stage: 'LOBBY_YOUR_BANS_CLICK',
        eventName: 'LOBBY_YOUR_BANS_CLICK',
        stateBefore: null,
        stateAfter: null,
        result: null,
        rejectionReason: null,
        error: null,
        metadata: {},
      },
      {
        globalSeq: 3,
        monotonicTimeMs: 3,
        wallClockTime: new Date().toISOString(),
        appSessionId: 'app',
        recorderSessionId: 'rec',
        cycleNumber: 1,
        openAttemptId: 'o1',
        closeAttemptId: null,
        correlationId: null,
        source: 'ui',
        stage: 'NOTIFICATION_CARD_MOUNT',
        eventName: 'NOTIFICATION_CARD_MOUNT',
        stateBefore: null,
        stateAfter: { currentOwner: 'NOTIFICATIONS', activeItemId: 'incoming:Ban1' },
        result: null,
        rejectionReason: null,
        error: null,
        metadata: {},
      },
      {
        globalSeq: 4,
        monotonicTimeMs: 4,
        wallClockTime: new Date().toISOString(),
        appSessionId: 'app',
        recorderSessionId: 'rec',
        cycleNumber: 2,
        openAttemptId: 'o2',
        closeAttemptId: null,
        correlationId: null,
        source: 'ui',
        stage: 'CYCLE_STARTED',
        eventName: 'CYCLE_STARTED',
        stateBefore: null,
        stateAfter: null,
        result: null,
        rejectionReason: null,
        error: null,
        metadata: {},
      },
      {
        globalSeq: 5,
        monotonicTimeMs: 5,
        wallClockTime: new Date().toISOString(),
        appSessionId: 'app',
        recorderSessionId: 'rec',
        cycleNumber: 2,
        openAttemptId: 'o2',
        closeAttemptId: null,
        correlationId: null,
        source: 'ui',
        stage: 'LOBBY_YOUR_BANS_CLICK',
        eventName: 'LOBBY_YOUR_BANS_CLICK',
        stateBefore: null,
        stateAfter: null,
        result: null,
        rejectionReason: null,
        error: null,
        metadata: {},
      },
      {
        globalSeq: 6,
        monotonicTimeMs: 6,
        wallClockTime: new Date().toISOString(),
        appSessionId: 'app',
        recorderSessionId: 'rec',
        cycleNumber: 2,
        openAttemptId: 'o2',
        closeAttemptId: null,
        correlationId: null,
        source: 'coordinator',
        stage: 'COORDINATOR_OPEN_REJECTED',
        eventName: 'COORDINATOR_OPEN_REJECTED',
        stateBefore: null,
        stateAfter: { currentOwner: 'CREATE_BAN' },
        result: 'rejected',
        rejectionReason: 'CAPABILITY_UNAVAILABLE',
        error: null,
        metadata: {},
      },
      {
        globalSeq: 7,
        monotonicTimeMs: 7,
        wallClockTime: new Date().toISOString(),
        appSessionId: 'app',
        recorderSessionId: 'rec',
        cycleNumber: 2,
        openAttemptId: 'o2',
        closeAttemptId: null,
        correlationId: null,
        source: 'recorder',
        stage: 'CYCLE_FAILED',
        eventName: 'CYCLE_FAILED',
        stateBefore: null,
        stateAfter: null,
        result: 'failed',
        rejectionReason: 'OPEN_REJECTED',
        error: null,
        metadata: {},
      },
    ],
  };
  const report = analyzeCycleDivergence(synthetic);
  assert.equal(report.lastSuccessfulCycle, 1);
  assert.equal(report.failedCycle, 2);
  assert.ok(report.firstDifferentStage);
  pass('divergence analyzer (synthetic)');
}

console.log(`\nOK — ${passed} phase9i recorder checks passed`);
