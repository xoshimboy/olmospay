import test from 'node:test';
import assert from 'node:assert/strict';
import { publicSupportSummary, validateSupportRequest } from './support.js';

test('accepts one or more whole Stars and trims optional messages', () => {
  assert.deepEqual(validateSupportRequest('1', '  Rahmat!  '), { ok: true, stars: 1, message: 'Rahmat!' });
  assert.equal(validateSupportRequest(10_000).ok, true);
});

test('rejects invalid Stars quantities and oversized messages', () => {
  for (const amount of [0, -1, 1.5, 10_001, 'abc']) {
    assert.equal(validateSupportRequest(amount).ok, false);
  }
  assert.equal(validateSupportRequest(1, 'x'.repeat(251)).ok, false);
});

test('builds a ranked public summary without exposing Telegram IDs', () => {
  const summary = publicSupportSummary([
    { donorId: 'secret-1', name: '@first', stars: 2, message: 'Hello', createdAt: 2 },
    { donorId: 'secret-2', name: 'Second', stars: 5, message: '', createdAt: 1 },
    { donorId: 'secret-1', name: '@first', stars: 3, message: '', createdAt: 3 },
  ]);

  assert.equal(summary.totalStars, 10);
  assert.equal(summary.totalGifts, 3);
  assert.equal(summary.totalSupporters, 2);
  assert.deepEqual(summary.leaderboard[0], { name: '@first', stars: 5, gifts: 2 });
  assert.equal(summary.recent[0].createdAt, 2);
  assert.equal(JSON.stringify(summary).includes('secret-1'), false);
});
