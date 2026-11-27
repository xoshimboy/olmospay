import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { handler } from './redeem-reward.js';
import { COIN_REWARDS } from './data/coin-rewards.js';

const BOT_TOKEN = '123456:test-only-token';
process.env.TG_BOT_TOKEN = BOT_TOKEN;

function createInitData(user = { id: 123456789, username: 'test_user', first_name: 'Test' }) {
  const params = new URLSearchParams({
    auth_date: String(Math.floor(Date.now() / 1000)),
    user: JSON.stringify(user),
  });
  const dataCheckString = [...params.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');
  const secretKey = crypto.createHmac('sha256', 'WebAppData').update(BOT_TOKEN).digest();
  const hash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');
  params.set('hash', hash);
  return params.toString();
}

function createEvent(body) {
  return {
    httpMethod: 'POST',
    headers: {},
    body: JSON.stringify(body),
  };
}

test('reward prices match the requested coin costs and have unique IDs', () => {
  assert.deepEqual(
    Object.fromEntries(COIN_REWARDS.map(({ id, coinCost }) => [id, coinCost])),
    {
      'telegram-gift': 30,
      'discount-5': 15,
      'telegram-premium-3m': 500,
      'pubg-60-uc': 80,
      'pubg-120-uc': 200,
    }
  );
  assert.equal(new Set(COIN_REWARDS.map(({ id }) => id)).size, COIN_REWARDS.length);
});

test('requires Telegram Mini App authentication before redemption', async () => {
  const response = await handler(createEvent({}));
  assert.equal(response.statusCode, 401);
  assert.equal(JSON.parse(response.body).code, 'telegram_required');
});

test('rejects unknown rewards and invalid PUBG IDs before database access', async () => {
  const initData = createInitData();
  const unknownReward = await handler(createEvent({ initData, rewardId: 'not-a-reward', requestId: crypto.randomUUID() }));
  assert.equal(unknownReward.statusCode, 400);
  assert.equal(JSON.parse(unknownReward.body).code, 'invalid_reward');

  const invalidTarget = await handler(createEvent({
    initData,
    rewardId: 'pubg-60-uc',
    requestId: crypto.randomUUID(),
    target: 'not-an-id',
  }));
  assert.equal(invalidTarget.statusCode, 400);
  assert.equal(JSON.parse(invalidTarget.body).code, 'invalid_target');
});
