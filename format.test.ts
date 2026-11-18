import test from 'node:test';
import assert from 'node:assert/strict';
import { calculatePackCoins, formatTimer, formatUzs, validatePlayerInput } from './format';

test('formatUzs formats integer UZS amounts with space separators', () => {
  assert.equal(formatUzs(13000, 'so‘m'), '13 000 so‘m');
  assert.equal(formatUzs(1190000, 'UZS'), '1 190 000 UZS');
});

test('calculatePackCoins computes 60 UC -> 6 coins and proportional rewards for other services', () => {
  assert.equal(calculatePackCoins({ amount: 60, unit: 'UC', category: 'games', priceUzs: 13000 }), 6);
  assert.equal(calculatePackCoins({ amount: 110, unit: 'Olmos', category: 'games', priceUzs: 12000 }), 11);
  assert.equal(calculatePackCoins({ amount: 50, unit: 'Stars', category: 'telegram', priceUzs: 13000 }), 5);
  assert.equal(calculatePackCoins({ amount: 1, unit: 'Pass', category: 'games', priceUzs: 19000 }), 9);
});

test('formatTimer renders MM:SS and clamps negative seconds to 00:00', () => {
  assert.equal(formatTimer(300), '05:00');
  assert.equal(formatTimer(65), '01:05');
  assert.equal(formatTimer(-5), '00:00');
});

test('validatePlayerInput validates player_id, username, and Mobile Legends server ID', () => {
  const validId = validatePlayerInput('5123456789', 'player_id');
  assert.equal(validId.ok, true);

  const badId = validatePlayerInput('x', 'player_id');
  assert.equal(badId.ok, false);
  if (!badId.ok) assert.equal(badId.code, 'id');

  const validUser = validatePlayerInput('ali_uz', 'username');
  assert.equal(validUser.ok, true);
  if (validUser.ok) assert.equal(validUser.cleanId, '@ali_uz');

  const missingServer = validatePlayerInput('123456789', 'player_id', true, '');
  assert.equal(missingServer.ok, false);
  if (!missingServer.ok) assert.equal(missingServer.code, 'server');

  const validUrl = validatePlayerInput('https://t.me/gamepinuz', 'url');
  assert.equal(validUrl.ok, true);

  const badUrl = validatePlayerInput('javascript:alert(1)', 'url');
  assert.equal(badUrl.ok, false);
  if (!badUrl.ok) assert.equal(badUrl.code, 'url');
});
