import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateSmmPrice } from './smm-pricing.js';

test('scales SMM prices proportionally from the catalog base quantity', () => {
  assert.equal(calculateSmmPrice(1_000, 1_000, 1_000), 1_000);
  assert.equal(calculateSmmPrice(10_000, 1_000, 1_000), 10_000);
  assert.equal(calculateSmmPrice(10_000, 10_000, 3_000), 3_000);
  assert.equal(calculateSmmPrice(1_000, 500, 15_000), 30_000);
});

test('rejects invalid SMM price inputs', () => {
  assert.equal(calculateSmmPrice(0, 1_000, 1_000), 0);
  assert.equal(calculateSmmPrice(1_000, 0, 1_000), 0);
  assert.equal(calculateSmmPrice(1_000.5, 1_000, 1_000), 0);
});
