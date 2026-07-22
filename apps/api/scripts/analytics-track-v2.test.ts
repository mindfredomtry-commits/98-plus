/**
 * Run: npx tsx apps/api/scripts/analytics-track-v2.test.ts
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  mapTrackV2StudioError,
  validateTrackV2Request,
} from '../src/services/analytics-track-v2';
import { buildTrackAnalyticsEventV2Call } from '../src/services/analytics-tracker-v2';

const routeSource = readFileSync(
  join(__dirname, '../src/routes/analytics.ts'),
  'utf8',
);
const serviceSource = readFileSync(
  join(__dirname, '../src/services/analytics-track-v2.ts'),
  'utf8',
);
const legacySource = readFileSync(
  join(__dirname, '../src/services/analytics.service.ts'),
  'utf8',
);

const validMeta = {
  schemaVersion: '98plus.analytics.v1' as const,
  eventId: 'evt_open_premium_11111111-2222-4333-8444-555555555555',
  sourceType: 'analytics_event' as const,
  sessionId: 'ses_aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
  entryPoint: 'relationship_analytics' as const,
};

// —— valid payload ——
{
  const result = validateTrackV2Request({
    eventCode: 'open_premium',
    meta: validMeta,
  });
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.eventCode, 'open_premium');
    assert.equal(result.meta.sessionId, validMeta.sessionId);
    assert.equal(result.meta.eventId, validMeta.eventId);
    assert.equal(result.meta.entryPoint, 'relationship_analytics');
  }
}

// —— unsupported event ——
{
  const result = validateTrackV2Request({
    eventCode: 'ban_sent',
    meta: validMeta,
  });
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.code, 'UNSUPPORTED_EVENT_CODE');
    assert.equal(result.status, 400);
  }
}

// —— invalid session ——
{
  const result = validateTrackV2Request({
    eventCode: 'open_premium',
    meta: { ...validMeta, sessionId: 'bad_session' },
  });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.code, 'INVALID_SESSION_ID');
}

// —— invalid eventId ——
{
  const result = validateTrackV2Request({
    eventCode: 'open_premium',
    meta: { ...validMeta, eventId: 'evt_other_1' },
  });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.code, 'INVALID_EVENT_ID');
}

// —— invalid entryPoint ——
{
  const result = validateTrackV2Request({
    eventCode: 'open_premium',
    meta: { ...validMeta, entryPoint: 'lobby' },
  });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.code, 'INVALID_ENTRY_POINT');
}

// —— invalid schema / source ——
{
  const badSchema = validateTrackV2Request({
    eventCode: 'open_premium',
    meta: { ...validMeta, schemaVersion: 'v0' },
  });
  assert.equal(badSchema.ok, false);
  if (!badSchema.ok) assert.equal(badSchema.code, 'INVALID_SCHEMA_VERSION');

  const badSource = validateTrackV2Request({
    eventCode: 'open_premium',
    meta: { ...validMeta, sourceType: 'other' },
  });
  assert.equal(badSource.ok, false);
  if (!badSource.ok) assert.equal(badSource.code, 'INVALID_SOURCE_TYPE');
}

// —— Studio validation mapping (no SQL stack leakage) ——
{
  const mapped = mapTrackV2StudioError(
    new Error('priority validation failed: missing sessionId\nSELECT ...'),
  );
  assert.equal(mapped.status, 400);
  assert.equal(mapped.code, 'STUDIO_VALIDATION_FAILED');
  assert.equal(mapped.error, 'Event failed Studio validation');
  assert.doesNotMatch(mapped.error, /SELECT|stack|priority validation failed/i);

  const generic = mapTrackV2StudioError(new Error('connection refused'));
  assert.equal(generic.status, 500);
  assert.equal(generic.code, 'TRACK_V2_FAILED');
  assert.doesNotMatch(generic.error, /connection refused/);
}

// —— enforcePriority=true for open_premium ——
{
  const call = buildTrackAnalyticsEventV2Call(
    'open_premium',
    'user_from_jwt',
    validMeta,
  );
  assert.equal(call.enforcePriority, true);
  assert.equal(call.userId, 'user_from_jwt');
  assert.equal(call.sourceType, 'analytics_event');
}

// —— route wiring ——
assert.match(routeSource, /analyticsRouter\.post\(\s*'\/track-v2'/);
assert.match(routeSource, /validateTrackV2Request/);
assert.match(routeSource, /executeTrackV2OpenPremium\(req\.userId!/);
assert.match(routeSource, /mapTrackV2StudioError/);
assert.match(serviceSource, /enforcePriority:\s*true/);

// Legacy path untouched
assert.match(legacySource, /analyticsEvent\.create/);
assert.doesNotMatch(legacySource, /trackAnalyticsEventV2/);
assert.match(routeSource, /analyticsRouter\.post\(\s*'\/track'/);
assert.match(routeSource, /await trackEvent\(name, req\.userId!, meta\)/);

console.log('analytics-track-v2.test.ts: ok');
