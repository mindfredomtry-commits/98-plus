/**
 * Unit tests for Telegram share open fallbacks (WHO invite / viral share).
 *
 * Run:
 *   npx tsx --tsconfig apps/web/tsconfig.json apps/web/scripts/share-open-telegram.test.ts
 */

import assert from 'node:assert/strict';

type OpenFn = (url: string) => void;

function installWindow(opts: {
  openTelegramLink?: OpenFn;
  openLink?: OpenFn;
  windowOpen?: (url: string) => Window | null;
  anchorClick?: () => void;
}) {
  const calls: string[] = [];

  const win = {
    Telegram: {
      WebApp: {
        openTelegramLink: opts.openTelegramLink
          ? (url: string) => {
              calls.push(`openTelegramLink`);
              opts.openTelegramLink!(url);
            }
          : undefined,
        openLink: opts.openLink
          ? (url: string) => {
              calls.push(`openLink`);
              opts.openLink!(url);
            }
          : undefined,
      },
    },
    open: (url: string) => {
      calls.push('windowOpen');
      return opts.windowOpen?.(url) ?? null;
    },
    document: {
      createElement: () => {
        const a = {
          href: '',
          target: '',
          rel: '',
          style: { cssText: '' },
          setAttribute() {},
          click: () => {
            calls.push('anchor');
            opts.anchorClick?.();
          },
        };
        return a;
      },
      body: {
        appendChild() {},
      },
    },
    setTimeout: (fn: () => void) => {
      fn();
      return 0;
    },
  };

  (globalThis as { window: unknown; document?: unknown }).window = win;
  (globalThis as { document?: unknown }).document = win.document;
  return { calls };
}

async function loadShare() {
  const href = new URL('../src/lib/share.ts', import.meta.url).href;
  return import(`${href}?t=${Date.now()}`) as Promise<
    typeof import('../src/lib/share')
  >;
}

async function main() {
  let passed = 0;
  function pass(name: string): void {
    passed += 1;
    console.log(`PASS — ${name}`);
  }

  console.log('\n=== SHARE OPEN TELEGRAM ===\n');

  {
    const { calls } = installWindow({
      openTelegramLink: () => {},
    });
    const { openTelegramShareLink } = await loadShare();
    const result = openTelegramShareLink('https://t.me/share/url?text=hi');
    assert.equal(result, 'openTelegramLink');
    assert.deepEqual(calls, ['openTelegramLink']);
    pass('prefers openTelegramLink');
  }

  {
    const { calls } = installWindow({
      openTelegramLink: () => {
        throw new Error('boom');
      },
      openLink: () => {},
    });
    const { openTelegramShareLink } = await loadShare();
    const result = openTelegramShareLink('https://t.me/share/url?text=hi');
    assert.equal(result, 'openLink');
    assert.ok(calls.includes('openTelegramLink'));
    assert.ok(calls.includes('openLink'));
    pass('falls back to openLink when openTelegramLink throws');
  }

  {
    const { calls } = installWindow({});
    const { openTelegramShareLink } = await loadShare();
    const result = openTelegramShareLink('https://t.me/share/url?text=hi');
    assert.equal(result, 'anchor');
    assert.deepEqual(calls, ['anchor']);
    pass('falls back to hidden anchor (not window.open alone)');
  }

  {
    const { calls } = installWindow({
      openTelegramLink: () => {},
    });
    const { shareInstantBanInviteMore } = await loadShare();
    const diag = shareInstantBanInviteMore('alice');
    assert.equal(diag.shareMethod, 'openTelegramLink');
    assert.equal(diag.username, 'alice');
    assert.match(diag.linkPreview, /t\.me\/share/);
    assert.ok(calls.includes('openTelegramLink'));
    pass('shareInstantBanInviteMore opens invite share for username');
  }

  console.log(`\n=== ${passed} passed ===\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
