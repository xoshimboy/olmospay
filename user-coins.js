import {
  getCorsHeaders,
  getOrder,
  getUserCoins,
  jsonResponse,
  verifyOrderToken,
  verifyTelegramInitData,
} from './_lib.js';

export async function handler(event) {
  const origin = event.headers?.origin || event.headers?.Origin || '';

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: getCorsHeaders(origin), body: '' };
  }
  if (event.httpMethod !== 'GET' && event.httpMethod !== 'POST') {
    return jsonResponse(405, { ok: false, error: 'Method not allowed' }, origin);
  }

  let body = {};
  if (event.httpMethod === 'POST') {
    try {
      body = JSON.parse(event.body || '{}');
    } catch {
      return jsonResponse(400, { ok: false, error: 'Noto‘g‘ri JSON' }, origin);
    }
  }

  const botToken = process.env.TG_BOT_TOKEN || '';
  const initData = String(
    body.initData || event.headers?.['x-tg-init-data'] || event.headers?.['X-Tg-Init-Data'] || ''
  ).trim();

  if (initData) {
    const auth = verifyTelegramInitData(initData, botToken);
    if (auth.valid && auth.user) {
      const state = await getUserCoins(auth.user.id);
      return jsonResponse(200, { ok: true, mode: 'telegram', ...state }, origin);
    }
  }

  // Verified guest order history fallback (never trusts raw client coins)
  const items = Array.isArray(body.items) ? body.items.slice(0, 30) : [];
  let guestBalance = 0;
  const guestHistory = [];
  const seen = new Set();

  for (const item of items) {
    const ref = String(item?.ref || '').trim();
    const orderToken = String(item?.orderToken || '').trim();
    if (!ref || seen.has(ref) || !verifyOrderToken(ref, orderToken)) continue;
    seen.add(ref);
    const ord = await getOrder(ref);
    if (ord && ord.status === 'completed' && Number(ord.coinsReward || 0) > 0) {
      const coins = Number(ord.coinsReward || 0);
      guestBalance += coins;
      guestHistory.push({
        ref: ord.ref,
        gameName: ord.gameName || ord.gameId,
        packLabel: ord.packLabel || ord.packId,
        coins,
        at: ord.coinsCreditedAt || ord.updatedAt || ord.createdAt || Date.now(),
      });
    }
  }

  return jsonResponse(
    200,
    {
      ok: true,
      mode: 'guest',
      balance: guestBalance,
      totalEarned: guestBalance,
      history: guestHistory,
    },
    origin
  );
}
