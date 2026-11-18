import {
  getCorsHeaders,
  getOrder,
  getUserOrders,
  jsonResponse,
  soraRequest,
  updateOrder,
  verifyOrderToken,
  verifyTelegramInitData,
} from './_lib.js';
import { applySoraStatusOutcome } from './tg-webhook.js';

const STATUS_REFRESH_INTERVAL_MS = 3_000;

function serializePublicOrder(o) {
  return {
    ref: o.ref,
    status: o.status,
    gameId: o.gameId,
    gameName: o.gameName,
    packId: o.packId,
    packLabel: o.packLabel,
    priceUzs: o.priceUzs,
    coinsReward: Number(o.coinsReward || 0),
    coinsCredited: Boolean(o.coinsCreditedAt),
    playerDisplay: o.playerDisplay,
    server: o.server || '',
    mapped: Boolean(o.mapped),
    refunded: Boolean(o.refunded),
    createdAt: o.createdAt,
    updatedAt: o.updatedAt,
  };
}

async function maybeRefreshOrderFromSora(order) {
  if (!order || order.status !== 'processing' || !order.mapped) {
    return order;
  }
  const elapsed = Date.now() - (order.lastSoraPollAt || 0);
  if (elapsed < STATUS_REFRESH_INTERVAL_MS) {
    return order;
  }
  const soraRes = await soraRequest(`/status?ref=${encodeURIComponent(order.ref)}`, { method: 'GET' });
  if (!soraRes.ok || !soraRes.data?.order) {
    return (await updateOrder(order.ref, { lastSoraPollAt: Date.now() })) || order;
  }
  const s = soraRes.data.order;
  if (s.status === 'completed' || s.status === 'canceled') {
    const synced = await applySoraStatusOutcome({
      chatId: order.adminChatId,
      messageId: order.adminMessageId,
      isCaption: true,
      ord: {
        service: order.soraService || '',
        item: order.soraItem || '',
        quantity: order.soraQuantity || undefined,
        playerId: order.playerId || '',
        server: order.server || '',
        region: order.region || '',
        ref: order.ref,
        tgUserId: order.tgUserId || '',
      },
      stored: order,
      soraOrder: s,
      adminId: String(process.env.TG_ADMIN_ID || '').trim(),
    });
    return (await updateOrder(order.ref, { lastSoraPollAt: Date.now() })) || synced || order;
  }

  return (
    (await updateOrder(order.ref, {
      status: s.status,
      refunded: Boolean(s.refunded),
      charged: s.charged ?? order.charged,
      lastSoraPollAt: Date.now(),
    })) || order
  );
}

export async function handler(event) {
  const origin = event.headers?.origin || event.headers?.Origin || '';

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: getCorsHeaders(origin), body: '' };
  }

  if (event.httpMethod !== 'POST' && event.httpMethod !== 'GET') {
    return jsonResponse(405, { ok: false, error: 'Method not allowed' }, origin);
  }

  const botToken = process.env.TG_BOT_TOKEN || '';

  // Support GET ?ref=GP-... with X-Order-Token or X-Tg-Init-Data
  if (event.httpMethod === 'GET') {
    const ref = String(event.queryStringParameters?.ref || '').trim();
    const token = event.headers?.['x-order-token'] || event.headers?.['X-Order-Token'] || '';
    const initData = event.headers?.['x-tg-init-data'] || event.headers?.['X-Tg-Init-Data'] || '';

    const order = await getOrder(ref);
    if (!order) {
      return jsonResponse(404, { ok: false, error: 'Buyurtma topilmadi' }, origin);
    }

    let authorized = verifyOrderToken(ref, token);
    if (!authorized && initData && order.tgUserId) {
      const auth = verifyTelegramInitData(initData, botToken);
      authorized = Boolean(auth.valid && auth.user && auth.user.id === order.tgUserId);
    }

    if (!authorized) {
      return jsonResponse(403, { ok: false, error: 'Buyurtmani ko‘rishga ruxsat yo‘q' }, origin);
    }

    const fresh = await maybeRefreshOrderFromSora(order);
    return jsonResponse(200, { ok: true, order: serializePublicOrder(fresh) }, origin);
  }

  // POST: batch status check for customer's history page
  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return jsonResponse(400, { ok: false, error: 'Noto‘g‘ri JSON' }, origin);
  }

  const results = [];
  const seenRefs = new Set();

  // 1. If authenticated Telegram Mini App user, return their linked server orders
  if (typeof body.initData === 'string' && body.initData) {
    const auth = verifyTelegramInitData(body.initData, botToken);
    if (auth.valid && auth.user) {
      const userOrders = await getUserOrders(auth.user.id);
      for (const ord of userOrders) {
        const fresh = await maybeRefreshOrderFromSora(ord);
        results.push(serializePublicOrder(fresh));
        seenRefs.add(fresh.ref);
      }
    }
  }

  // 2. Also allow signed guest tokens stored in local browser history
  const items = Array.isArray(body.items) ? body.items.slice(0, 20) : [];
  for (const item of items) {
    const ref = String(item?.ref || '').trim();
    const orderToken = String(item?.orderToken || '').trim();
    if (!ref || seenRefs.has(ref)) continue;
    if (!verifyOrderToken(ref, orderToken)) continue;
    const ord = await getOrder(ref);
    if (ord) {
      const fresh = await maybeRefreshOrderFromSora(ord);
      results.push(serializePublicOrder(fresh));
      seenRefs.add(fresh.ref);
    }
  }

  results.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  return jsonResponse(200, { ok: true, orders: results }, origin);
}
