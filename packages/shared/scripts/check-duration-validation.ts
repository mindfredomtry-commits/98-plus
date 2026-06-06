/**
 * Run: npx tsx packages/shared/scripts/check-duration-validation.ts
 */
import assert from 'node:assert/strict';
import {
  isInstantBanDurationMinutes,
  isOnboardingDurationMinutes,
  isValidDurationMinutes,
} from '../src/types';

const cases: Array<{ m: number; valid: boolean; label: string }> = [
  { m: 3, valid: true, label: 'instant min' },
  { m: 15, valid: true, label: 'instant mid' },
  { m: 60, valid: true, label: 'instant max' },
  { m: 2, valid: false, label: 'below min' },
  { m: 61, valid: false, label: 'above max' },
  { m: 10.5, valid: false, label: 'non-integer' },
  { m: 180, valid: true, label: 'onboarding 3h' },
  { m: 10080, valid: true, label: 'onboarding 7d' },
];

for (const { m, valid, label } of cases) {
  assert.equal(
    isValidDurationMinutes(m),
    valid,
    `isValidDurationMinutes(${m}) [${label}]`,
  );
}

assert.equal(isInstantBanDurationMinutes(15), true);
assert.equal(isInstantBanDurationMinutes(180), false);
assert.equal(isOnboardingDurationMinutes(180), true);
assert.equal(isOnboardingDurationMinutes(15), false);

console.log('[98+] duration validation checks passed');
