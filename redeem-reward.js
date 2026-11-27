import {
  checkRateLimit,
  redeemCoinReward,
  escapeHtml,
  getCorsHeaders,
  jsonResponse,
  sanitizeTarget,
  telegramApi,
  updateOrder,
  verifyTelegramInitData,
} from './_lib.js';
import { getCoinReward } from './data/coin-rewards.js';

export async function handler(event) {
  const origin = event.headers?.origin || event.headers?.Origin || '';
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: getCorsHeaders(origin), body: '' };
  }
  if (event.httpMethod !== 'POST') {
    return jsonResponse(405, { ok: false, error: 'Faqat POST so‘rovi qabul qilinadi' }, origin);
  }

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return jsonResponse(400, { ok: false, error: 'So‘rov ma’lumotlari noto‘g‘ri (JSON)' }, origin);
  }

  const initData = String(body.initData || '').trim();
  const auth = verifyTelegramInitData(initData, process.env.TG_BOT_TOKEN || '');
  if (!auth.valid || !auth.user) {
    return jsonResponse(401, {
      ok: false,
      code: 'telegram_required',
      error: 'Almashtirish uchun Telegram Mini App ichidan kiring.',
    }, origin);
  }

  const reward = getCoinReward(body.rewardId);
  if (!reward) {
    return jsonResponse(400, { ok: false, code: 'invalid_reward', error: 'Mukofot topilmadi.' }, origin);
  }

  const requestId = String(body.requestId || '').trim();
  if (!/^[A-Za-z0-9-]{16,64}$/.test(requestId)) {
    return jsonResponse(400, { ok: false, code: 'invalid_request', error: 'So‘rov identifikatori noto‘g‘ri.' }, origin);
  }

  let target = '';
  if (reward.targetType === 'username') {
    const result = sanitizeTarget(body.target, 'username');
    if (!result.ok) {
      return jsonResponse(400, { ok: false, code: 'invalid_target', error: 'Telegram username noto‘g‘ri.' }, origin);
    }
    target = result.display;
  } else if (reward.targetType === 'pubg-id') {
    target = String(body.target || '').trim();
    if (!/^\d{5,15}$/.test(target)) {
      return jsonResponse(400, { ok: false, code: 'invalid_target', error: 'PUBG Character ID 5–15 ta raqam bo‘lishi kerak.' }, origin);
    }
  }

  const userId = String(auth.user.id);
  const rateLimit = await checkRateLimit(`coin-reward:${userId}`, 5, 60_000);
  if (!rateLimit.allowed) {
    return jsonResponse(429, {
      ok: false,
      code: 'rate_limited',
      error: `Juda ko‘p so‘rov yuborildi. ${rateLimit.retryAfterSec} soniyadan keyin urinib ko‘ring.`,
    }, origin);
  }

  const result = await redeemCoinReward({
    tgUserId: userId,
    rewardId: reward.id,
    requestId,
    target,
    username: auth.user.username,
    firstName: auth.user.first_name,
  });
  if (!result.ok) {
    const statusCode = result.code === 'insufficient_coins' ? 409 : result.code === 'storage_unavailable' ? 503 : 400;
    const error = result.code === 'insufficient_coins'
      ? 'Tangalar yetarli emas.'
      : result.code === 'storage_unavailable'
        ? 'Mukofotlar xizmati vaqtincha ishlamayapti.'
        : 'Mukofot so‘rovini tekshirib bo‘lmadi.';
    return jsonResponse(statusCode, { ...result, error }, origin);
  }

  if (result.order && !result.replayed && process.env.TG_BOT_TOKEN && process.env.TG_ADMIN_ID) {
    const order = result.order;
    const userLabel = [
      order.tgFirstName,
      order.tgUsername ? `@${order.tgUsername}` : '',
      `ID ${order.tgUserId}`,
    ].filter(Boolean).join(' · ');
    const telegramResult = await telegramApi('sendMessage', {
      chat_id: process.env.TG_ADMIN_ID,
      parse_mode: 'HTML',
      text: [
        `<b>YANGI TANGA MUKOFOTI · ${escapeHtml(order.ref)}</b>`,
        '',
        `<b>Mukofot:</b> ${escapeHtml(order.packLabel)}`,
        `<b>Qabul qiluvchi:</b> <code>${escapeHtml(order.playerDisplay)}</code>`,
        `<b>Mijoz:</b> ${escapeHtml(userLabel)}`,
        `<b>Yechilgan tanga:</b> ${reward.coinCost}`,
      ].join('\n'),
      reply_markup: {
        inline_keyboard: [[
          { text: 'Bajarildi', callback_data: `mdone:${order.ref}` },
          { text: 'Rad etish', callback_data: `no:${order.ref}` },
        ]],
      },
    });
    if (telegramResult?.ok && telegramResult.result?.message_id) {
      await updateOrder(order.ref, {
        adminChatId: String(telegramResult.result.chat?.id || process.env.TG_ADMIN_ID),
        adminMessageId: telegramResult.result.message_id,
      });
    }
  }

  return jsonResponse(200, result, origin);
}
