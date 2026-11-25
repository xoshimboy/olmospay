import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSupportInvoicePayload, publicSupportSummary, validateSupportRequest } from './support.js';

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

test('builds a Stars invoice addressed to the donor chat with their chosen amount and message', () => {
  assert.deepEqual(buildSupportInvoicePayload({
    chatId: 123456,
    ref: 'support-ref',
    stars: 10,
    message: 'Movie Box rivoji uchun ❤️',
  }), {
    chat_id: '123456',
    title: 'Loyihani qo‘llab-quvvatlash',
    description: '10 Stars — Movie Box rivoji uchun ❤️',
    payload: 'support-ref',
    provider_token: '',
    currency: 'XTR',
    prices: [{ label: '10 Stars', amount: 10 }],
  });
  assert.ok(buildSupportInvoicePayload({ chatId: 1, ref: 'long', stars: 1, message: 'x'.repeat(250) }).description.length <= 255);
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
