import test from 'node:test';
import assert from 'node:assert/strict';
import { TERMS_SECTIONS, TERMS_VERSION } from './data/terms.js';
import { handler as termsHandler } from './terms.js';

test('publishes the complete eight-part Uzbek terms document', () => {
  assert.match(TERMS_VERSION, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(TERMS_SECTIONS.length, 8);
  assert.ok(TERMS_SECTIONS.every((section) => section.title && section.clauses.length > 0));
  assert.ok(TERMS_SECTIONS.flatMap((section) => section.clauses).some((clause) => clause.startsWith('7.3.')));
  assert.ok(TERMS_SECTIONS.flatMap((section) => section.clauses).some((clause) => clause.startsWith('8.4.')));
});

test('requires verified Telegram init data before reading a consent record', async () => {
  const response = await termsHandler({ httpMethod: 'GET', headers: {}, body: '' });
  assert.equal(response.statusCode, 401);
  assert.equal(JSON.parse(response.body).ok, false);
});
