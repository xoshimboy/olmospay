import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeSoraApiKey, summarizeOrderStatistics } from './_lib.js';
import { isOrderAwaitingPaymentReview } from './admin-panel.js';

test('allows payment review only for orders awaiting admin review', () => {
  assert.equal(isOrderAwaitingPaymentReview({ status: 'pending' }), true);
  assert.equal(isOrderAwaitingPaymentReview({ status: 'manual_pending' }), true);
  assert.equal(isOrderAwaitingPaymentReview({ status: 'processing' }), false);
  assert.equal(isOrderAwaitingPaymentReview({ status: 'completed' }), false);
  assert.equal(isOrderAwaitingPaymentReview({ status: 'canceled' }), false);
  assert.equal(isOrderAwaitingPaymentReview(null), false);
});

test('normalizes Sora API keys copied with whitespace or common header prefixes', () => {
  assert.equal(normalizeSoraApiKey('  api-key-value  '), 'api-key-value');
  assert.equal(normalizeSoraApiKey('Bearer api-key-value'), 'api-key-value');
  assert.equal(normalizeSoraApiKey('X-API-Key: api-key-value'), 'api-key-value');
  assert.equal(normalizeSoraApiKey('"api-key-value"'), 'api-key-value');
  assert.equal(normalizeSoraApiKey('  '), '');
});

test('summarizes all order states and counts only completed revenue', () => {
  assert.deepEqual(
    summarizeOrderStatistics([
      { status: 'completed', priceUzs: 12_000 },
      { status: 'completed', priceUzs: '18500' },
      { status: 'processing', priceUzs: 99_000 },
      { status: 'canceled', priceUzs: 500 },
      { status: 'manual_pending', priceUzs: 3_000 },
      null,
    ]),
    {
      totalOrders: 5,
      completedOrders: 2,
      pendingOrders: 1,
      processingOrders: 1,
      canceledOrders: 1,
      totalRevenueUzs: 30_500,
    }
  );
});
