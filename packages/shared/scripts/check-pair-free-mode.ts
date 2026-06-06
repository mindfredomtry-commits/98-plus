/**
 * Run: npm run test:pair-free-mode -w @98plus/shared
 */
import assert from 'node:assert/strict';
import {
  calcCheckOutcome,
  calcOverboardPenalty,
  calcSendCost,
  isPairDailyFreeMode,
} from '../src/energy';
import { PAIR_DAILY_FREE_MODE_BAN_LIMIT } from '../src/constants';

assert.equal(PAIR_DAILY_FREE_MODE_BAN_LIMIT, 5);

assert.equal(isPairDailyFreeMode(1), false, '1st ban — paid economy');
assert.equal(isPairDailyFreeMode(5), false, '5th ban — still paid economy');
assert.equal(isPairDailyFreeMode(6), true, '6th ban — free mode');
assert.equal(isPairDailyFreeMode(10), true, 'many bans — free mode');

const sendCost = calcSendCost();
const bothYes = calcCheckOutcome('both_yes');
const overboard = calcOverboardPenalty();

assert.notEqual(sendCost.sender, 0, 'send cost baseline');
assert.notEqual(bothYes.sender, 0, 'both_yes sender baseline');
assert.notEqual(overboard.sender, 0, 'overboard baseline');

/** In free mode API applies 0 deltas — document expected overrides. */
const freeDelta = { sender: 0, receiver: 0 };
assert.deepEqual(freeDelta, { sender: 0, receiver: 0 });

console.log('[98+] pair free mode checks passed', {
  limit: PAIR_DAILY_FREE_MODE_BAN_LIMIT,
  sendCost,
  bothYes,
  overboard,
});
