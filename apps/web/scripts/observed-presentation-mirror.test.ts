/**
 * Stage 1 — observed presentation mirror invariance + parity tests.
 *
 * Proves:
 * - startup / WHAT / CONFIRM / SUCCESS / incoming-result paint predicates unchanged
 * - InstantBanFlow is not remounted or gated by the mirror
 * - observed modes match existing DOM attributes
 * - zero production render predicates were changed by Stage 1 wiring
 * - PresentationRoot is not reintroduced
 *
 * Run:
 *   npx tsx --tsconfig apps/web/tsconfig.json apps/web/scripts/observed-presentation-mirror.test.ts
 */
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  OBSERVED_PRESENTATION_DOM_HINTS,
  observePresentationState,
  type ObservedPresentationInput,
} from '../src/lib/observed-presentation-state';
import {
  getObservedPresentationState,
  publishObservedPresentation,
  resetObservedPresentationMirror,
  subscribeObservedPresentation,
} from '../src/lib/observed-presentation-mirror';

type SpecResult = { name: string; ok: boolean; error?: string };
const results: SpecResult[] = [];

const webRoot = join(__dirname, '..');
const instantBanPath = join(
  webRoot,
  'src/components/instant-ban/InstantBanFlow.tsx',
);
const pagePath = join(webRoot, 'src/app/(miniapp)/page.tsx');
const providersPath = join(webRoot, 'src/components/Providers.tsx');
const observePath = join(webRoot, 'src/lib/observed-presentation-state.ts');
const mirrorPath = join(webRoot, 'src/lib/observed-presentation-mirror.ts');

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

function baseInput(
  overrides: Partial<ObservedPresentationInput> = {},
): ObservedPresentationInput {
  return {
    phase: 'idle',
    banSentSuccess: false,
    successSnapshot: null,
    inFlight: false,
    sharing: false,
    replySending: false,
    confirmActive: false,
    lobbyBootIntroPrimed: true,
    holdLobbyOrbForBootstrap: false,
    showBootOrb: false,
    showLobbyOrb: true,
    persistentLogoVisible: true,
    showLobbyChrome: true,
    activeOverlayKind: null,
    overlayHostActive: false,
    notificationOverlayVisible: false,
    showDirectOverboardLayer: false,
    directOverboardResultId: null,
    queueResultId: null,
    overlayDisplayId: null,
    ...overrides,
  };
}

/** Production paint predicates that Stage 1 must not alter. */
const UNCHANGED_RENDER_PREDICATES = {
  instantBan: [
    'data-instant-ban-view="InstantBanFlow"',
    'data-instant-ban-view="SuccessOverlay"',
    '{banSentSuccess && successSnapshot ? (',
    '{confirmActive ? (',
    '{showBootOrb ? (',
    '{showLobbyOrb ? (',
    'data-base-lobby-orb',
    'data-boot-scene={showBootOrb ? \'\' : undefined}',
  ],
  page: ['{arenaVisible ? (', '<InstantBanFlow'],
  providers: ['<GlobalOverlayHost', '<DirectOverboardResultLayer'],
} as const;

async function main() {
  console.log('\n=== STAGE 1 — OBSERVED PRESENTATION MIRROR ===\n');

  await spec(
    'startup does not change — InstantBanFlow still mounts on arenaVisible',
    () => {
      const page = read(pagePath);
      for (const needle of UNCHANGED_RENDER_PREDICATES.page) {
        assert.ok(page.includes(needle), `missing page predicate: ${needle}`);
      }
      assert.equal(page.includes('PresentationRoot'), false);
      assert.equal(page.includes('observePresentationState'), false);
    },
  );

  await spec(
    'WHAT does not change — WhatScreen still owned by InstantBanFlow phase',
    () => {
      const src = read(instantBanPath);
      assert.ok(
        src.includes("phase === 'composingBan'") || src.includes('composingBan'),
      );
      assert.ok(src.includes('WhatScreen'));
      const returnIdx = src.lastIndexOf('return (\n    <>');
      assert.ok(returnIdx > 0);
      assert.equal(
        /observedPresentation|ObservedPresentationState/.test(
          src.slice(returnIdx),
        ),
        false,
      );
    },
  );

  await spec(
    'CONFIRM does not change — confirmActive still gates confirm layer',
    () => {
      const src = read(instantBanPath);
      assert.ok(src.includes('{confirmActive ? ('));
      assert.ok(
        src.includes(
          "phase === 'confirming' && selectedUser != null && !banSentSuccess",
        ),
      );
    },
  );

  await spec(
    'SUCCESS does not change — local banSentSuccess + snapshot still paint SuccessOverlay',
    () => {
      const src = read(instantBanPath);
      assert.ok(src.includes('{banSentSuccess && successSnapshot ? ('));
      assert.ok(src.includes('data-instant-ban-view="SuccessOverlay"'));
      assert.ok(src.includes('<SuccessScreen'));
      assert.ok(src.includes('sendSnapshotRef'));
    },
  );

  await spec(
    'incoming/result behavior does not change — Providers host predicates intact',
    () => {
      const providers = read(providersPath);
      for (const needle of UNCHANGED_RENDER_PREDICATES.providers) {
        assert.ok(
          providers.includes(needle),
          `missing Providers predicate: ${needle}`,
        );
      }
      assert.equal(providers.includes('PresentationRoot'), false);
      assert.equal(providers.includes('observePresentationState'), false);
      assert.equal(providers.includes('publishObservedPresentation'), false);
    },
  );

  await spec(
    'no existing component is unmounted because of the mirror',
    () => {
      const src = read(instantBanPath);
      const page = read(pagePath);
      assert.ok(page.includes('{arenaVisible ? ('));
      assert.ok(page.includes('<InstantBanFlow'));
      const returnIdx = src.lastIndexOf('return (\n    <>');
      assert.ok(returnIdx > 0, 'expected InstantBanFlow JSX return');
      const jsx = src.slice(returnIdx);
      assert.equal(jsx.includes('observePresentationState'), false);
      assert.equal(jsx.includes('publishObservedPresentation'), false);
      assert.equal(jsx.includes('getObservedPresentationState'), false);
      assert.equal(jsx.includes('ObservedPresentation'), false);
    },
  );

  await spec(
    'zero production render predicates were changed (fingerprint)',
    () => {
      const src = read(instantBanPath);
      for (const needle of UNCHANGED_RENDER_PREDICATES.instantBan) {
        assert.ok(src.includes(needle), `render predicate missing: ${needle}`);
      }
      assert.equal(
        existsSync(
          join(webRoot, 'src/components/presentation/PresentationRoot.tsx'),
        ),
        false,
      );
      assert.equal(src.includes('PresentationRoot'), false);
    },
  );

  await spec('mirror is effect-only telemetry (publish + observe imports)', () => {
    const src = read(instantBanPath);
    assert.ok(src.includes("from '@/lib/observed-presentation-state'"));
    assert.ok(src.includes("from '@/lib/observed-presentation-mirror'"));
    assert.ok(src.includes('publishObservedPresentation('));
    assert.ok(src.includes('observePresentationState('));
    assert.ok(src.includes('// Stage 1 — read-only presentation mirror'));
    assert.ok(
      src.includes('useEffect(() => {\n    const observedOverlayKind'),
    );
  });

  await spec('observePresentationState — BOOT_LOBBY', () => {
    const state = observePresentationState(
      baseInput({
        lobbyBootIntroPrimed: false,
        showBootOrb: true,
        showLobbyOrb: false,
        persistentLogoVisible: false,
        showLobbyChrome: false,
      }),
    );
    assert.equal(state.mode, 'BOOT_LOBBY');
    assert.deepEqual(
      [...state.domHints],
      [...OBSERVED_PRESENTATION_DOM_HINTS.BOOT_LOBBY],
    );
  });

  await spec('observePresentationState — empty LOBBY', () => {
    const state = observePresentationState(
      baseInput({
        phase: 'idle',
        showBootOrb: false,
        showLobbyOrb: false,
        persistentLogoVisible: false,
        showLobbyChrome: false,
      }),
    );
    assert.equal(state.mode, 'LOBBY');
    assert.equal(state.mode === 'LOBBY' && state.empty, true);
  });

  await spec('observePresentationState — WHAT', () => {
    const state = observePresentationState(
      baseInput({ phase: 'composingBan' }),
    );
    assert.equal(state.mode, 'WHAT');
    assert.ok(state.domHints.includes('[data-instant-ban-view="WhatScreen"]'));
  });

  await spec('observePresentationState — CONFIRM', () => {
    const state = observePresentationState(
      baseInput({ phase: 'confirming', confirmActive: true }),
    );
    assert.equal(state.mode, 'CONFIRM');
    assert.ok(
      state.domHints.includes('[data-instant-ban-view="ConfirmScreen"]'),
    );
  });

  await spec('observePresentationState — SENDING', () => {
    const state = observePresentationState(
      baseInput({
        phase: 'confirming',
        confirmActive: true,
        inFlight: true,
      }),
    );
    assert.equal(state.mode, 'SENDING');
  });

  await spec('observePresentationState — SUCCESS with complete snapshot', () => {
    const snapshot = {
      selectedUserId: 'u1',
      banText: 'hello',
      durationMinutes: 60,
      replyToBanId: null,
    };
    const state = observePresentationState(
      baseInput({
        banSentSuccess: true,
        successSnapshot: snapshot,
        phase: 'confirming',
        overlayHostActive: true,
        activeOverlayKind: 'result',
        queueResultId: 'stale',
      }),
    );
    assert.equal(state.mode, 'SUCCESS');
    assert.ok(state.mode === 'SUCCESS' && state.snapshot.banText === 'hello');
    assert.ok(
      state.mode === 'SUCCESS' && state.snapshot.selectedUserId === 'u1',
    );
    assert.deepEqual(
      [...state.domHints],
      [...OBSERVED_PRESENTATION_DOM_HINTS.SUCCESS],
    );
  });

  await spec('observePresentationState — INCOMING / CHECK / RESULT queue', () => {
    assert.equal(
      observePresentationState(
        baseInput({
          overlayHostActive: true,
          activeOverlayKind: 'incoming',
        }),
      ).mode,
      'INCOMING',
    );
    assert.equal(
      observePresentationState(
        baseInput({
          overlayHostActive: true,
          activeOverlayKind: 'check',
        }),
      ).mode,
      'CHECK',
    );
    const result = observePresentationState(
      baseInput({
        overlayHostActive: true,
        activeOverlayKind: 'result',
        queueResultId: 'r1',
      }),
    );
    assert.equal(result.mode, 'RESULT');
    assert.ok(
      result.mode === 'RESULT' &&
        result.display.surface === 'queue' &&
        result.display.id === 'r1',
    );
  });

  await spec('observePresentationState — direct overboard RESULT', () => {
    const state = observePresentationState(
      baseInput({
        showDirectOverboardLayer: true,
        directOverboardResultId: 'ob-1',
      }),
    );
    assert.equal(state.mode, 'RESULT');
    assert.ok(
      state.mode === 'RESULT' &&
        state.display.surface === 'direct' &&
        state.display.id === 'ob-1',
    );
    assert.deepEqual(
      [...state.domHints],
      [...OBSERVED_PRESENTATION_DOM_HINTS.RESULT_DIRECT],
    );
  });

  await spec(
    'observePresentationState — orb / logo / chrome visibility mirrored',
    () => {
      const state = observePresentationState(
        baseInput({
          showBootOrb: false,
          showLobbyOrb: true,
          persistentLogoVisible: true,
          showLobbyChrome: true,
          overlayHostActive: false,
        }),
      );
      assert.equal(state.chrome.orbVisible, true);
      assert.equal(state.chrome.lobbyOrbVisible, true);
      assert.equal(state.chrome.logoVisible, true);
      assert.equal(state.chrome.chromeVisible, true);
      assert.equal(state.chrome.overlayHostActive, false);
    },
  );

  await spec(
    'observed presentation state matches the DOM hints used in production',
    () => {
      const instantBan = read(instantBanPath);
      const what = read(
        join(webRoot, 'src/components/instant-ban/WhatScreen.tsx'),
      );
      const confirm = read(
        join(webRoot, 'src/components/instant-ban/ConfirmScreen.tsx'),
      );
      const direct = read(
        join(webRoot, 'src/components/DirectOverboardResultLayer.tsx'),
      );
      const check = read(join(webRoot, 'src/components/CheckOverlay.tsx'));
      const resultOverlay = read(
        join(webRoot, 'src/components/ResultOverlay.tsx'),
      );

      assert.ok(instantBan.includes('data-instant-ban-view="SuccessOverlay"'));
      assert.ok(instantBan.includes('data-base-lobby-orb'));
      assert.ok(instantBan.includes('data-boot-scene'));
      assert.ok(what.includes('data-instant-ban-view="WhatScreen"'));
      assert.ok(confirm.includes('data-instant-ban-view="ConfirmScreen"'));
      assert.ok(direct.includes('data-direct-overboard-result'));
      assert.ok(check.includes('data-notification-layer'));
      assert.ok(resultOverlay.includes('data-result-branch'));

      const haystack = [
        instantBan,
        what,
        confirm,
        direct,
        check,
        resultOverlay,
      ].join('\n');
      for (const hint of Object.values(OBSERVED_PRESENTATION_DOM_HINTS).flat()) {
        const attr = hint.replace(/^\[/, '').replace(/\]$/, '');
        const attrName = attr.split('=')[0]!;
        assert.ok(
          haystack.includes(attr) || haystack.includes(attrName),
          `DOM hint not found in production paint: ${hint}`,
        );
      }
    },
  );

  await spec(
    'mirror store is read-only (no runtime writes in mirror modules)',
    () => {
      const observeSrc = read(observePath);
      const mirrorSrc = read(mirrorPath);
      assert.doesNotMatch(observeSrc, /\.dispatch\(|createPortal\(|CARD_ACTION/);
      assert.doesNotMatch(mirrorSrc, /\.dispatch\(|createPortal\(|CARD_ACTION/);
      assert.doesNotMatch(
        observeSrc,
        /import\s+.*PresentationRoot|from\s+['"].*PresentationRoot/,
      );
      assert.doesNotMatch(
        mirrorSrc,
        /import\s+.*PresentationRoot|from\s+['"].*PresentationRoot/,
      );

      resetObservedPresentationMirror();
      assert.equal(getObservedPresentationState(), null);
      let notified = 0;
      const unsub = subscribeObservedPresentation(() => {
        notified += 1;
      });
      const observed = observePresentationState(
        baseInput({ phase: 'composingBan' }),
      );
      publishObservedPresentation(observed);
      assert.equal(getObservedPresentationState()?.mode, 'WHAT');
      assert.ok(notified >= 1);
      unsub();
      resetObservedPresentationMirror();
    },
  );

  const failed = results.filter((r) => !r.ok);
  console.log('\n---');
  console.log(
    `observed-presentation-mirror: ${results.length - failed.length}/${results.length} passed`,
  );
  if (failed.length) {
    for (const f of failed) {
      console.error(`FAILED: ${f.name}: ${f.error}`);
    }
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
