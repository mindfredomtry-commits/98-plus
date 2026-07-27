/**
 * Phase 3 — NotificationPresentation pure renderer tests.
 *
 * Run:
 *   npx tsx --tsconfig apps/web/tsconfig.json apps/web/scripts/notification-owner-presentation.test.ts
 *
 * Not wired to Providers / page / InstantBanFlow.
 */
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { createElement, type ReactNode } from 'react';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  countTopLevelSurfaces,
  createInitialNotificationOwnerState,
  emptyComposeDraft,
  NotificationPresentation,
  NotificationPresentationController,
  reduceNotificationOwnerUnchecked,
  resolvePresentationSurface,
  type NotificationOwnerCommand,
  type NotificationOwnerState,
  type NotificationPresentationState,
  type QueueItem,
} from '../src/notification-owner';

type SpecResult = { name: string; ok: boolean; error?: string };
const results: SpecResult[] = [];
const webRoot = join(__dirname, '..');
const presentationDir = join(
  webRoot,
  'src/notification-owner/presentation',
);

async function spec(name: string, fn: () => void | Promise<void>) {
  try {
    await fn();
    results.push({ name, ok: true });
    console.log(`PASS — ${name}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    results.push({ name, ok: false, error: message });
    console.error(`FAIL — ${name}`);
    console.error(message);
  }
}

function read(path: string): string {
  return readFileSync(path, 'utf8').replace(/\r\n/g, '\n');
}

function listFilesRecursive(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...listFilesRecursive(full));
    else if (/\.(tsx?|jsx?)$/.test(name)) out.push(full);
  }
  return out;
}

function render(node: ReactNode): string {
  return renderToStaticMarkup(node);
}

function renderPresentation(state: NotificationPresentationState): string {
  const intents: NotificationOwnerCommand[] = [];
  return render(
    createElement(NotificationPresentation, {
      state,
      onIntent: (c) => intents.push(c),
    }),
  );
}

function assertSurface(
  html: string,
  presentation: NotificationPresentationState,
) {
  const desc = resolvePresentationSurface(presentation);
  assert.ok(
    html.includes(`data-np-surface="${desc.surfaceId}"`),
    `missing root data-np-surface="${desc.surfaceId}" in ${html.slice(0, 200)}`,
  );
  for (const marker of desc.requiredMarkers) {
    if (marker.includes('=')) {
      assert.ok(html.includes(marker), `missing required marker ${marker}`);
      continue;
    }
    // boolean data attrs render as data-foo=""
    assert.ok(
      html.includes(marker),
      `missing required marker ${marker}`,
    );
  }
  for (const forbidden of desc.forbiddenMarkers) {
    if (forbidden.startsWith('data-np-surface=')) {
      const other = forbidden.match(/"([^"]+)"/)?.[1];
      if (other && other !== desc.surfaceId) {
        assert.equal(
          html.includes(`data-np-surface="${other}"`),
          false,
          `forbidden surface ${other} present`,
        );
      }
      continue;
    }
    assert.equal(
      html.includes(forbidden),
      false,
      `forbidden marker ${forbidden}`,
    );
  }
  assert.equal(countTopLevelSurfaces(html), 1, 'exactly one top-level surface');
}

function incoming(banId: string): QueueItem {
  return {
    kind: 'incoming',
    displayId: `incoming:${banId}`,
    banId,
    card: { banId, text: `t-${banId}`, senderLabel: `s-${banId}` },
  };
}

function ownerWith(
  presentation: NotificationPresentationState,
): NotificationOwnerState {
  return {
    ...createInitialNotificationOwnerState(),
    presentation,
  };
}

async function main() {
  console.log('\n=== PHASE 3 — NOTIFICATION PRESENTATION RENDERER ===\n');

  await spec('BOOT: deliberate complete boot; no Lobby/overlay', () => {
    const state: NotificationPresentationState = {
      kind: 'BOOT',
      surface: 'deliberate-boot',
    };
    const html = renderPresentation(state);
    assertSurface(html, state);
    assert.equal(html.includes('data-np-surface="LOBBY"'), false);
    assert.equal(html.includes('data-np-overlay-shell'), false);
  });

  await spec('LOBBY: full chrome; no overlay; no orb-only', () => {
    const state: NotificationPresentationState = {
      kind: 'LOBBY',
      mode: 'full',
    };
    const html = renderPresentation(state);
    assertSurface(html, state);
    assert.ok(html.includes('data-np-lobby-orb'));
    assert.ok(html.includes('data-np-lobby-logo'));
    assert.ok(html.includes('data-np-lobby-cta'));
    assert.ok(html.includes('data-np-lobby-chrome'));
    assert.equal(html.includes('data-np-orb-only'), false);
    assert.equal(html.includes('data-np-overlay-shell'), false);
  });

  await spec('WHAT: complete compose surface', () => {
    const state: NotificationPresentationState = {
      kind: 'WHAT',
      draft: emptyComposeDraft({ selectedUserId: 'u1', banText: 'no phones' }),
    };
    assertSurface(renderPresentation(state), state);
  });

  await spec('CONFIRM: complete confirm surface', () => {
    const state: NotificationPresentationState = {
      kind: 'CONFIRM',
      draft: emptyComposeDraft({ selectedUserId: 'u1', banText: 'no phones' }),
    };
    assertSurface(renderPresentation(state), state);
  });

  await spec('SENDING: complete sending; no CONFIRM/Lobby fallback', () => {
    const state: NotificationPresentationState = {
      kind: 'SENDING',
      snapshot: {
        selectedUserId: 'u1',
        banText: 'x',
        durationMinutes: 30,
        replyToBanId: null,
      },
    };
    const html = renderPresentation(state);
    assertSurface(html, state);
    assert.equal(html.includes('data-np-surface="CONFIRM"'), false);
    assert.equal(html.includes('data-np-surface="LOBBY"'), false);
  });

  await spec('SUCCESS: complete card; no Lobby; no notification shell', () => {
    const state: NotificationPresentationState = {
      kind: 'SUCCESS',
      snapshot: {
        selectedUserId: 'u1',
        banText: 'x',
        durationMinutes: 30,
        replyToBanId: null,
      },
    };
    const html = renderPresentation(state);
    assertSurface(html, state);
    assert.equal(html.includes('data-np-surface="LOBBY"'), false);
    assert.equal(html.includes('data-np-overlay-shell'), false);
  });

  await spec('INCOMING: backdrop + shell + card + controls in one render', () => {
    const state: NotificationPresentationState = {
      kind: 'INCOMING',
      displayId: 'incoming:A',
      banId: 'A',
      card: { banId: 'A', text: 't', senderLabel: 's' },
    };
    const html = renderPresentation(state);
    assertSurface(html, state);
    assert.ok(html.includes('data-np-backdrop'));
    assert.ok(html.includes('data-np-overlay-shell'));
    assert.ok(html.includes('data-np-card'));
    assert.ok(html.includes('data-np-incoming-controls'));
  });

  await spec('INCOMING cannot render with missing card model', () => {
    const bad = {
      kind: 'INCOMING',
      displayId: 'incoming:A',
      banId: 'A',
      card: null,
    } as unknown as NotificationPresentationState;
    assert.throws(() => renderPresentation(bad), /INCOMING requires complete/);
  });

  await spec('CHECK: atomic surface; missing card throws', () => {
    const state: NotificationPresentationState = {
      kind: 'CHECK',
      displayId: 'check:C',
      banId: 'C',
      card: { banId: 'C', text: 't', senderLabel: 's' },
    };
    assertSurface(renderPresentation(state), state);
    const bad = {
      kind: 'CHECK',
      displayId: 'check:C',
      banId: 'C',
      card: null,
    } as unknown as NotificationPresentationState;
    assert.throws(() => renderPresentation(bad), /CHECK requires complete/);
  });

  await spec('ACTION_PENDING keeps matching card visible', () => {
    const state: NotificationPresentationState = {
      kind: 'ACTION_PENDING',
      displayId: 'incoming:A',
      banId: 'A',
      from: 'INCOMING',
      action: 'overboard',
      card: { banId: 'A', text: 't', senderLabel: 's' },
    };
    const html = renderPresentation(state);
    assertSurface(html, state);
    assert.ok(html.includes('data-np-card'));
    assert.ok(html.includes('data-np-action-pending'));
    assert.ok(html.includes('data-np-ban-id="A"'));
  });

  await spec('RESULT: complete card+backdrop; no secondary/direct portal', () => {
    const state: NotificationPresentationState = {
      kind: 'RESULT',
      displayId: 'result:A',
      banId: 'A',
      card: {
        banId: 'A',
        title: 'title',
        body: 'body',
        outcome: 'overboard',
      },
    };
    const html = renderPresentation(state);
    assertSurface(html, state);
    assert.equal(html.includes('data-direct-overboard-result'), false);
    assert.equal(html.includes('data-np-secondary-result-portal'), false);
  });

  await spec('no branch falls through null presentation to Lobby', () => {
    // Renderer requires a discriminated union member; null is unrepresentable.
    // Guard: resolvePresentationSurface throws on garbage.
    assert.throws(() =>
      resolvePresentationSurface({
        kind: 'NOT_A_KIND',
      } as unknown as NotificationPresentationState),
    );
  });

  await spec('exactly one top-level surface per kind', () => {
    const kinds: NotificationPresentationState[] = [
      { kind: 'BOOT', surface: 'deliberate-boot' },
      { kind: 'LOBBY', mode: 'full' },
      {
        kind: 'WHAT',
        draft: emptyComposeDraft({ selectedUserId: 'u', banText: 'x' }),
      },
      {
        kind: 'CONFIRM',
        draft: emptyComposeDraft({ selectedUserId: 'u', banText: 'x' }),
      },
      {
        kind: 'SENDING',
        snapshot: {
          selectedUserId: 'u',
          banText: 'x',
          durationMinutes: 30,
          replyToBanId: null,
        },
      },
      {
        kind: 'SUCCESS',
        snapshot: {
          selectedUserId: 'u',
          banText: 'x',
          durationMinutes: 30,
          replyToBanId: null,
        },
      },
      {
        kind: 'INCOMING',
        displayId: 'incoming:A',
        banId: 'A',
        card: { banId: 'A', text: 't', senderLabel: 's' },
      },
      {
        kind: 'RESULT',
        displayId: 'result:A',
        banId: 'A',
        card: {
          banId: 'A',
          title: 't',
          body: 'b',
          outcome: null,
        },
      },
    ];
    for (const state of kinds) {
      assert.equal(countTopLevelSurfaces(renderPresentation(state)), 1);
    }
  });

  await spec('controller remains mounted across kind switches', () => {
    const mountId = 'stable-controller-mount';
    const intents: NotificationOwnerCommand[] = [];
    let owner = createInitialNotificationOwnerState();
    const htmlBoot = render(
      createElement(NotificationPresentationController, {
        state: owner,
        onIntent: (c) => intents.push(c),
        mountIdForTest: mountId,
      }),
    );
    assert.ok(htmlBoot.includes(`data-np-controller-mount-id="${mountId}"`));
    assert.ok(htmlBoot.includes('data-np-presentation-kind="BOOT"'));

    owner = reduceNotificationOwnerUnchecked(owner, [
      { type: 'BOOT_COMPLETE', next: null },
    ]);
    const htmlLobby = render(
      createElement(NotificationPresentationController, {
        state: owner,
        onIntent: (c) => intents.push(c),
        mountIdForTest: mountId,
      }),
    );
    assert.ok(htmlLobby.includes(`data-np-controller-mount-id="${mountId}"`));
    assert.ok(htmlLobby.includes('data-np-presentation-kind="LOBBY"'));
    assert.ok(htmlLobby.includes('data-np-surface="LOBBY"'));

    owner = reduceNotificationOwnerUnchecked(owner, [
      { type: 'ITEMS_INGESTED', items: [incoming('A')] },
      {
        type: 'OPEN_WHAT',
        draft: emptyComposeDraft({ selectedUserId: 'u1', banText: 'x' }),
      },
      { type: 'OPEN_CONFIRM' },
      { type: 'SUBMIT_SEND' },
      { type: 'SEND_SUCCEEDED' },
    ]);
    const htmlSuccess = render(
      createElement(NotificationPresentationController, {
        state: owner,
        onIntent: (c) => intents.push(c),
        mountIdForTest: mountId,
      }),
    );
    assert.ok(htmlSuccess.includes(`data-np-controller-mount-id="${mountId}"`));
    assert.ok(htmlSuccess.includes('data-np-presentation-kind="SUCCESS"'));

    owner = reduceNotificationOwnerUnchecked(owner, [{ type: 'CLOSE_SUCCESS' }]);
    const htmlIncoming = render(
      createElement(NotificationPresentationController, {
        state: owner,
        onIntent: (c) => intents.push(c),
        mountIdForTest: mountId,
      }),
    );
    assert.ok(
      htmlIncoming.includes(`data-np-controller-mount-id="${mountId}"`),
    );
    assert.ok(htmlIncoming.includes('data-np-presentation-kind="INCOMING"'));
    assert.ok(htmlIncoming.includes('data-np-surface="INCOMING"'));

    // Continuous-mount contract in source: useRef mount id, no remount gate.
    const ctrlSrc = read(
      join(presentationDir, 'NotificationPresentationController.tsx'),
    );
    assert.match(ctrlSrc, /useRef/);
    assert.match(ctrlSrc, /data-np-controller-mount-id/);
    assert.match(ctrlSrc, /NotificationPresentation/);
    assert.doesNotMatch(ctrlSrc, /\buseEffect\s*\(/);
    assert.doesNotMatch(ctrlSrc, /\bsetTimeout\s*\(/);
    assert.doesNotMatch(ctrlSrc, /acknowledgeIncoming/);
  });

  await spec('renderer emits only owner commands/intents', () => {
    const intents: NotificationOwnerCommand[] = [];
    const html = render(
      createElement(NotificationPresentation, {
        state: { kind: 'LOBBY', mode: 'full' },
        onIntent: (c) => intents.push(c),
      }),
    );
    assert.ok(html.includes('data-np-lobby-cta'));
    // Intent path is onClick → onIntent({ type: 'OPEN_WHAT' })
    const lobbySrc = read(join(presentationDir, 'surfaces.tsx'));
    assert.match(lobbySrc, /type: 'OPEN_WHAT'/);
    assert.match(lobbySrc, /type: 'CLOSE_SUCCESS'/);
    assert.match(lobbySrc, /type: 'REQUEST_CARD_ACTION'/);
    assert.match(lobbySrc, /type: 'DISMISS_CARD'/);
    assert.match(lobbySrc, /type: 'CLOSE_RESULT'/);
  });

  await spec('renderer does not read legacy runtime/Providers/ack/mirror', () => {
    const files = listFilesRecursive(presentationDir);
    const joined = files.map((f) => read(f)).join('\n');
    assert.doesNotMatch(joined, /notification-runtime/);
    assert.doesNotMatch(joined, /from ['"]@\/components\/Providers['"]/);
    assert.doesNotMatch(joined, /useApp\s*\(/);
    assert.doesNotMatch(joined, /selectOverlayVisible|selectLobbyMayShow/);
    assert.doesNotMatch(joined, /incoming-dom-mount-ack/);
    assert.doesNotMatch(joined, /observed-presentation/);
    assert.doesNotMatch(joined, /GlobalOverlayHost|NotificationQueueShell/);
    assert.doesNotMatch(joined, /sendSuccessCardActive|notificationOverlayVisible/);
  });

  await spec('no useEffect / DOM ack / timer correctness in presentation layer', () => {
    const files = listFilesRecursive(presentationDir);
    for (const file of files) {
      const src = read(file);
      assert.doesNotMatch(src, /import\s*\{[^}]*\buseEffect\b/);
      assert.doesNotMatch(src, /\buseEffect\s*\(/);
      assert.doesNotMatch(src, /\bsetTimeout\s*\(/);
      assert.doesNotMatch(src, /acknowledgeIncomingDomMounted/);
      assert.doesNotMatch(src, /nextDisplayDomMounted/);
    }
  });

  await spec('SUCCESS→INCOMING painted via owner+renderer has no Lobby frame', () => {
    let owner = createInitialNotificationOwnerState();
    owner = reduceNotificationOwnerUnchecked(owner, [
      { type: 'BOOT_COMPLETE', next: null },
      { type: 'ITEMS_INGESTED', items: [incoming('A')] },
      {
        type: 'OPEN_WHAT',
        draft: emptyComposeDraft({ selectedUserId: 'u1', banText: 'x' }),
      },
      { type: 'OPEN_CONFIRM' },
      { type: 'SUBMIT_SEND' },
      { type: 'SEND_SUCCEEDED' },
    ]);
    const successHtml = render(
      createElement(NotificationPresentationController, {
        state: owner,
        onIntent: () => {},
        mountIdForTest: 'flow-c',
      }),
    );
    assert.ok(successHtml.includes('data-np-surface="SUCCESS"'));
    assert.equal(successHtml.includes('data-np-surface="LOBBY"'), false);

    owner = reduceNotificationOwnerUnchecked(owner, [{ type: 'CLOSE_SUCCESS' }]);
    const incomingHtml = render(
      createElement(NotificationPresentationController, {
        state: owner,
        onIntent: () => {},
        mountIdForTest: 'flow-c',
      }),
    );
    assert.ok(incomingHtml.includes('data-np-surface="INCOMING"'));
    assert.equal(incomingHtml.includes('data-np-surface="SUCCESS"'), false);
    assert.equal(incomingHtml.includes('data-np-surface="LOBBY"'), false);
    assert.ok(incomingHtml.includes('data-np-backdrop'));
    assert.ok(incomingHtml.includes('data-np-card'));
  });

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  if (failed.length) process.exitCode = 1;
}

void main();
