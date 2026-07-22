/**
 * Run: npx tsx apps/web/scripts/analytics-track-v2-open-premium.test.ts
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  OPEN_PREMIUM_ENTRY_POINT,
  OPEN_PREMIUM_EVENT_CODE,
  OPEN_PREMIUM_EVENT_ID_PREFIX,
  TRACKER_V2_SCHEMA_VERSION,
  TRACKER_V2_SOURCE_TYPE,
  buildOpenPremiumV2Request,
  newOpenPremiumEventId,
} from '../src/lib/analytics-track-v2-client';

const clientSource = readFileSync(
  join(__dirname, '../src/lib/analytics-track-v2-client.ts'),
  'utf8',
);
const sectionSource = readFileSync(
  join(__dirname, '../src/components/monetization/MonetizationSection.tsx'),
  'utf8',
);

assert.equal(OPEN_PREMIUM_EVENT_CODE, 'open_premium');
assert.equal(OPEN_PREMIUM_ENTRY_POINT, 'relationship_analytics');
assert.equal(TRACKER_V2_SCHEMA_VERSION, '98plus.analytics.v1');
assert.equal(TRACKER_V2_SOURCE_TYPE, 'analytics_event');

const eventId = newOpenPremiumEventId();
assert.match(eventId, /^evt_open_premium_.+/);
assert.ok(eventId.startsWith(OPEN_PREMIUM_EVENT_ID_PREFIX));
assert.notEqual(newOpenPremiumEventId(), eventId);

const body = buildOpenPremiumV2Request(
  'ses_11111111-2222-4333-8444-555555555555',
  'evt_open_premium_aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
);
assert.deepEqual(body, {
  eventCode: 'open_premium',
  meta: {
    schemaVersion: '98plus.analytics.v1',
    eventId: 'evt_open_premium_aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
    sourceType: 'analytics_event',
    sessionId: 'ses_11111111-2222-4333-8444-555555555555',
    entryPoint: 'relationship_analytics',
  },
});

// Dual-write wiring in click handler only
assert.match(sectionSource, /trackOpenPremiumV2\(token\)/);
assert.match(
  sectionSource,
  /trackProductEvent\(ANALYTICS_EVENTS\.OPEN_PREMIUM, token\)/,
);
assert.match(sectionSource, /const handleOpenPremium = useCallback\(\(\) => \{/);
assert.doesNotMatch(sectionSource, /trackOpenPremiumV2\(token\).*useEffect/s);

// V2 client is fire-and-forget and skips null session
assert.match(clientSource, /getAnalyticsSessionId\(\)/);
assert.match(clientSource, /if \(sessionId == null\) return;/);
assert.match(clientSource, /\/analytics\/track-v2/);
assert.match(clientSource, /retries:\s*0/);
assert.match(clientSource, /\.catch\(\(\) =>/);
assert.doesNotMatch(clientSource, /await api\(/);
assert.doesNotMatch(clientSource, /useState|useEffect|useMemo/);

// Only open_premium in this client helper
assert.doesNotMatch(clientSource, /ban_sent|session_recovered|create_payment/);

console.log('analytics-track-v2-open-premium.test.ts: ok');
