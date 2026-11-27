export const COIN_REWARDS = [
  {
    id: 'telegram-gift',
    coinCost: 30,
    kind: 'manual',
    targetType: 'username',
    orderLabel: 'Telegram Gift · 1 dona',
  },
  {
    id: 'discount-5',
    coinCost: 15,
    kind: 'discount',
    targetType: null,
    orderLabel: '5% chegirma · bir martalik',
  },
  {
    id: 'telegram-premium-3m',
    coinCost: 500,
    kind: 'manual',
    targetType: 'username',
    orderLabel: 'Telegram Premium · 3 oy',
  },
  {
    id: 'pubg-60-uc',
    coinCost: 80,
    kind: 'manual',
    targetType: 'pubg-id',
    orderLabel: 'PUBG Mobile · 60 UC',
  },
  {
    id: 'pubg-120-uc',
    coinCost: 200,
    kind: 'manual',
    targetType: 'pubg-id',
    orderLabel: 'PUBG Mobile · 120 UC',
  },
];

export function getCoinReward(rewardId) {
  return COIN_REWARDS.find((reward) => reward.id === rewardId) || null;
}
