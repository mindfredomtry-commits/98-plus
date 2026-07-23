/**
 * Run: npx tsx apps/web/scripts/analytics-session.test.ts
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  ANALYTICS_SESSION_STORAGE_KEY,
  ANALYTICS_SESSION_TTL_MS,
  __resetAnalyticsSessionCacheForTests,
  __setAnalyticsSessionNowForTests,
  getAnalyticsSessionId,
} from '../src/lib/analytics-session';

const source = readFileSync(
  join(__dirname, '../src/lib/analytics-session.ts'),
  'utf8',
);

assert.doesNotMatch(source, /localStorage\.|getItem\(['"]98plus_token/);
assert.doesNotMatch(source, /initData/);
assert.doesNotMatch(source, /telegramId|userId/);
assert.doesNotMatch(source, /localStorage/);
assert.match(source, /sessionStorage/);
assert.match(source, /98plus_analytics_session_v1/);
assert.match(source, /ANALYTICS_SESSION_TTL_MS/);
assert.match(source, /ses_/);
assert.doesNotMatch(source, /useState|useEffect|createContext/);
assert.ok(!source.includes('jsonwebtoken'));
assert.ok(!/signToken|verifyToken|Bearer/.test(source));

assert.equal(ANALYTICS_SESSION_STORAGE_KEY, '98plus_analytics_session_v1');
assert.equal(ANALYTICS_SESSION_TTL_MS, 24 * 60 * 60 * 1000);

type MemoryStorage = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
  clear(): void;
  key(index: number): string | null;
  readonly length: number;
};

function makeMemoryStorage(
  map: Map<string, string>,
  opts?: { throwOnAccess?: boolean },
): MemoryStorage {
  return {
    getItem(key: string) {
      if (opts?.throwOnAccess) throw new Error('storage blocked');
      return map.has(key) ? map.get(key)! : null;
    },
    setItem(key: string, value: string) {
      if (opts?.throwOnAccess) throw new Error('storage blocked');
      map.set(key, value);
    },
    removeItem(key: string) {
      if (opts?.throwOnAccess) throw new Error('storage blocked');
      map.delete(key);
    },
    clear() {
      if (opts?.throwOnAccess) throw new Error('storage blocked');
      map.clear();
    },
    key() {
      return null;
    },
    get length() {
      return map.size;
    },
  };
}

function installWindow(storage: MemoryStorage): void {
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    writable: true,
    value: { sessionStorage: storage },
  });
}

function uninstallWindow(): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  delete (globalThis as any).window;
}

function resetAll(): void {
  __resetAnalyticsSessionCacheForTests();
  __setAnalyticsSessionNowForTests(null);
}

// —— SSR: no window ——
{
  uninstallWindow();
  resetAll();
  assert.equal(getAnalyticsSessionId(), null);
  assert.equal(getAnalyticsSessionId(), null);
}

// —— Client: create + stable ——
{
  const store = new Map<string, string>();
  installWindow(makeMemoryStorage(store));
  resetAll();

  const first = getAnalyticsSessionId();
  assert.ok(first);
  assert.match(first!, /^ses_.+/);
  assert.ok(first!.length > 'ses_'.length);

  const second = getAnalyticsSessionId();
  assert.equal(second, first);

  const raw = store.get(ANALYTICS_SESSION_STORAGE_KEY);
  assert.ok(raw);
  const parsed = JSON.parse(raw!) as {
    id: string;
    createdAt: string;
    version: number;
  };
  assert.equal(parsed.id, first);
  assert.equal(parsed.version, 1);
  assert.ok(!Number.isNaN(Date.parse(parsed.createdAt)));
}

// —— Restore from storage after cache clear (reload / remount) ——
{
  const store = new Map<string, string>();
  const existingId = 'ses_11111111-2222-4333-8444-555555555555';
  store.set(
    ANALYTICS_SESSION_STORAGE_KEY,
    JSON.stringify({
      id: existingId,
      createdAt: new Date().toISOString(),
      version: 1,
    }),
  );
  installWindow(makeMemoryStorage(store));
  resetAll();

  assert.equal(getAnalyticsSessionId(), existingId);
  __resetAnalyticsSessionCacheForTests();
  assert.equal(getAnalyticsSessionId(), existingId);
}

// —— Expired TTL rotates ——
{
  const store = new Map<string, string>();
  const oldId = 'ses_aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
  store.set(
    ANALYTICS_SESSION_STORAGE_KEY,
    JSON.stringify({
      id: oldId,
      createdAt: new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString(),
      version: 1,
    }),
  );
  installWindow(makeMemoryStorage(store));
  resetAll();

  const next = getAnalyticsSessionId();
  assert.ok(next);
  assert.notEqual(next, oldId);
  assert.match(next!, /^ses_.+/);
  assert.equal(
    JSON.parse(store.get(ANALYTICS_SESSION_STORAGE_KEY)!).id,
    next,
  );
}

// —— Corrupt JSON replaced ——
{
  const store = new Map<string, string>();
  store.set(ANALYTICS_SESSION_STORAGE_KEY, '{not-json');
  installWindow(makeMemoryStorage(store));
  resetAll();

  const id = getAnalyticsSessionId();
  assert.match(id!, /^ses_.+/);
  assert.ok(JSON.parse(store.get(ANALYTICS_SESSION_STORAGE_KEY)!));
}

// —— Bad prefix replaced ——
{
  const store = new Map<string, string>();
  store.set(
    ANALYTICS_SESSION_STORAGE_KEY,
    JSON.stringify({
      id: 'bad_not_ses',
      createdAt: new Date().toISOString(),
      version: 1,
    }),
  );
  installWindow(makeMemoryStorage(store));
  resetAll();

  const id = getAnalyticsSessionId();
  assert.match(id!, /^ses_.+/);
  assert.notEqual(id, 'bad_not_ses');
}

// —— Empty uuid part replaced ——
{
  const store = new Map<string, string>();
  store.set(
    ANALYTICS_SESSION_STORAGE_KEY,
    JSON.stringify({
      id: 'ses_',
      createdAt: new Date().toISOString(),
      version: 1,
    }),
  );
  installWindow(makeMemoryStorage(store));
  resetAll();

  const id = getAnalyticsSessionId();
  assert.notEqual(id, 'ses_');
  assert.match(id!, /^ses_.+/);
}

// —— Future createdAt replaced ——
{
  const store = new Map<string, string>();
  store.set(
    ANALYTICS_SESSION_STORAGE_KEY,
    JSON.stringify({
      id: 'ses_future-id-should-rotate',
      createdAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      version: 1,
    }),
  );
  installWindow(makeMemoryStorage(store));
  resetAll();

  const id = getAnalyticsSessionId();
  assert.notEqual(id, 'ses_future-id-should-rotate');
}

// —— Wrong version replaced ——
{
  const store = new Map<string, string>();
  store.set(
    ANALYTICS_SESSION_STORAGE_KEY,
    JSON.stringify({
      id: 'ses_old-version-record',
      createdAt: new Date().toISOString(),
      version: 99,
    }),
  );
  installWindow(makeMemoryStorage(store));
  resetAll();

  const id = getAnalyticsSessionId();
  assert.notEqual(id, 'ses_old-version-record');
}

// —— sessionStorage throws: module cache still works ——
{
  const store = new Map<string, string>();
  installWindow(makeMemoryStorage(store, { throwOnAccess: true }));
  resetAll();

  const id = getAnalyticsSessionId();
  assert.match(id!, /^ses_.+/);
  assert.equal(getAnalyticsSessionId(), id);
  assert.equal(store.size, 0);
}

// —— TTL helper: forced "now" advances past TTL ——
{
  const store = new Map<string, string>();
  const id = 'ses_ttl-forced-rotate-0001';
  const createdAtMs = Date.parse('2026-01-01T00:00:00.000Z');
  store.set(
    ANALYTICS_SESSION_STORAGE_KEY,
    JSON.stringify({
      id,
      createdAt: new Date(createdAtMs).toISOString(),
      version: 1,
    }),
  );
  installWindow(makeMemoryStorage(store));
  resetAll();

  __setAnalyticsSessionNowForTests(createdAtMs + 1000);
  assert.equal(getAnalyticsSessionId(), id);

  __resetAnalyticsSessionCacheForTests();
  __setAnalyticsSessionNowForTests(createdAtMs + ANALYTICS_SESSION_TTL_MS + 1);
  const rotated = getAnalyticsSessionId();
  assert.notEqual(rotated, id);
}

uninstallWindow();
resetAll();

console.log('analytics-session.test.ts: ok');
