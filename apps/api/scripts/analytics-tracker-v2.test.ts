/**
 * Run: npx tsx apps/api/scripts/analytics-tracker-v2.test.ts
 *
 * Static + pure-helper checks — no database.
 */
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import {
  ANALYTICS_TRACKER_V2_SCHEMA_VERSION,
  ANALYTICS_TRACKER_V2_SOURCE_TYPE,
  TRACK_ANALYTICS_EVENT_V1_FN,
  buildTrackAnalyticsEventV2Call,
  type AnalyticsTrackerV2Meta,
} from '../src/services/analytics-tracker-v2';

const srcRoot = join(__dirname, '../src');
const legacyService = readFileSync(
  join(srcRoot, 'services/analytics.service.ts'),
  'utf8',
);
const v2Service = readFileSync(
  join(srcRoot, 'services/analytics-tracker-v2.ts'),
  'utf8',
);
const routeSource = readFileSync(
  join(srcRoot, 'routes/analytics.ts'),
  'utf8',
);

// —— Legacy trackEvent still uses Prisma, not Studio ————————————————
assert.match(legacyService, /analyticsEvent\.create/);
assert.doesNotMatch(legacyService, /studio\.track_analytics_event_v1/);
assert.doesNotMatch(legacyService, /trackAnalyticsEventV2/);
assert.doesNotMatch(legacyService, /\$queryRaw/);

// Route still uses Legacy trackEvent only
assert.match(routeSource, /from ['"]\.\.\/services\/analytics\.service['"]/);
assert.match(routeSource, /await trackEvent\(name, req\.userId!, meta\)/);
assert.doesNotMatch(routeSource, /trackAnalyticsEventV2/);
assert.doesNotMatch(routeSource, /analytics-tracker-v2/);

// —— V2 adapter: Studio function with five arguments ————————————————
assert.equal(TRACK_ANALYTICS_EVENT_V1_FN, 'studio.track_analytics_event_v1');
assert.equal(ANALYTICS_TRACKER_V2_SOURCE_TYPE, 'analytics_event');
assert.equal(ANALYTICS_TRACKER_V2_SCHEMA_VERSION, '98plus.analytics.v1');

assert.match(v2Service, /studio\.track_analytics_event_v1/);
assert.match(v2Service, /CAST\(\$\{call\.metaJson\} AS jsonb\)/);
assert.match(
  v2Service,
  /SELECT studio\.track_analytics_event_v1\(\s*\$\{call\.eventCode\},[\s\S]*\$\{call\.userId\},[\s\S]*CAST\(\$\{call\.metaJson\} AS jsonb\),[\s\S]*\$\{call\.sourceType\},[\s\S]*\$\{call\.enforcePriority\}\s*\)/m,
);

const sampleMeta: AnalyticsTrackerV2Meta = {
  schemaVersion: '98plus.analytics.v1',
  eventId: 'evt_test_1',
  sourceType: 'analytics_event',
  sessionId: 'sess_test_1',
};

const defaults = buildTrackAnalyticsEventV2Call(
  'open_premium',
  'user_1',
  sampleMeta,
);
assert.equal(defaults.eventCode, 'open_premium');
assert.equal(defaults.userId, 'user_1');
assert.equal(defaults.sourceType, 'analytics_event');
assert.equal(defaults.enforcePriority, true);
assert.equal(defaults.metaJson, JSON.stringify(sampleMeta));
assert.equal(JSON.parse(defaults.metaJson).schemaVersion, '98plus.analytics.v1');

const withNullUser = buildTrackAnalyticsEventV2Call(
  'open_premium',
  undefined,
  sampleMeta,
);
assert.equal(withNullUser.userId, null);

const overridden = buildTrackAnalyticsEventV2Call(
  'open_premium',
  'user_1',
  sampleMeta,
  { sourceType: 'analytics_event', enforcePriority: true },
);
assert.equal(overridden.enforcePriority, true);
assert.equal(overridden.sourceType, 'analytics_event');

// Explicit false is possible in the helper (for tests) but must not be default
const explicitFalse = buildTrackAnalyticsEventV2Call(
  'open_premium',
  'user_1',
  sampleMeta,
  { enforcePriority: false },
);
assert.equal(explicitFalse.enforcePriority, false);
assert.notEqual(
  buildTrackAnalyticsEventV2Call('open_premium', 'user_1', sampleMeta)
    .enforcePriority,
  false,
);

// —— Studio adapter production wiring: open_premium track-v2 only ————
function listTsFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) out.push(...listTsFiles(full));
    else if (name.endsWith('.ts')) out.push(full);
  }
  return out;
}

const allowedImporters = new Set([
  'services/analytics-tracker-v2.ts',
  'services/analytics-track-v2.ts',
  'routes/analytics.ts',
]);

const unexpectedImporters: string[] = [];
for (const file of listTsFiles(srcRoot)) {
  const rel = file
    .replace(/\\/g, '/')
    .replace(/^.*\/src\//, '');
  if (allowedImporters.has(rel)) continue;
  const text = readFileSync(file, 'utf8');
  if (
    text.includes('analytics-tracker-v2') ||
    text.includes('trackAnalyticsEventV2')
  ) {
    unexpectedImporters.push(rel);
  }
}

assert.deepEqual(
  unexpectedImporters,
  [],
  `Unexpected V2 adapter imports: ${unexpectedImporters.join(', ')}`,
);

console.log('analytics-tracker-v2.test.ts: ok');
