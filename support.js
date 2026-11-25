import {
  checkRateLimit,
  generateOrderRef,
  ensureTelegramWebhook,
  getCorsHeaders,
  jsonResponse,
  telegramApi,
  verifyTelegramInitData,
} from './_lib.js';
import {
  getDeveloperSupportDonations,
  saveDeveloperSupportInvoice,
  updateDeveloperSupportInvoice,
} from './support-store.js';

export const MAX_SUPPORT_STARS = 10_000;
export const MAX_SUPPORT_MESSAGE_LENGTH = 250;

export function validateSupportRequest(starsInput, messageInput = '') {
  const stars = Number(starsInput);
  const message = String(messageInput || '').trim();
  if (!Number.isSafeInteger(stars) || stars < 1 || stars > MAX_SUPPORT_STARS) {
    return { ok: false, error: `Stars miqdori 1 dan ${MAX_SUPPORT_STARS.toLocaleString('uz-UZ')} gacha butun son bo‘lishi kerak.` };
  }
  if (Array.from(message).length > MAX_SUPPORT_MESSAGE_LENGTH) {
    return { ok: false, error: `Xabar ${MAX_SUPPORT_MESSAGE_LENGTH} ta belgidan oshmasin.` };
  }
  return { ok: true, stars, message };
}

export function buildSupportInvoicePayload({ chatId, ref, stars, message }) {
  const details = String(message || 'Loyiha rivoji uchun ❤️').trim();
  const description = Array.from(`${stars} Stars — ${details}`).slice(0, 255).join('');
  return {
    chat_id: String(chatId),
    title: 'Loyihani qo‘llab-quvvatlash',
    description,
    payload: ref,
    provider_token: '',
    currency: 'XTR',
    prices: [{ label: `${stars} Stars`, amount: stars }],
  };
}

export function publicSupportSummary(donations) {
  const supporters = new Map();
  let totalStars = 0;
  for (const donation of donations) {
    const stars = Number(donation.stars);
    if (!Number.isSafeInteger(stars) || stars < 1) continue;
    totalStars += stars;
    const key = String(donation.donorId || donation.name || 'supporter');
    const existing = supporters.get(key) || { name: donation.name || 'Telegram foydalanuvchisi', stars: 0, gifts: 0 };
    existing.stars += stars;
    existing.gifts += 1;
    supporters.set(key, existing);
  }

  return {
    totalStars,
    totalGifts: donations.length,
    totalSupporters: supporters.size,
    leaderboard: [...supporters.values()].sort((a, b) => b.stars - a.stars || b.gifts - a.gifts).slice(0, 10),
    recent: donations.slice(0, 20).map(({ name, stars, message, createdAt }) => ({ name, stars, message, createdAt })),
  };
}

export async function handler(event) {
  const origin = event.headers?.origin || event.headers?.Origin || '';
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: getCorsHeaders(origin), body: '' };

  if (event.httpMethod === 'GET') {
    const donations = await getDeveloperSupportDonations();
    const paid = donations
      .filter((donation) => donation.status === 'paid')
      .sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0));
    return jsonResponse(200, { ok: true, ...publicSupportSummary(paid) }, origin);
  }

  if (event.httpMethod !== 'POST') {
    return jsonResponse(405, { ok: false, error: 'Faqat GET yoki POST so‘rovi qabul qilinadi.' }, origin);
  }

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return jsonResponse(400, { ok: false, error: 'So‘rov ma’lumotlari noto‘g‘ri.' }, origin);
  }

  const token = String(process.env.TG_BOT_TOKEN || '');
  const auth = verifyTelegramInitData(typeof body.initData === 'string' ? body.initData : '', token);
  if (!auth.valid || !auth.user?.id) {
    return jsonResponse(401, { ok: false, error: 'Stars yuborish uchun Olmos Pay’ni Telegram ichida oching.' }, origin);
  }
  const validated = validateSupportRequest(body.stars, body.message);
  if (!validated.ok) return jsonResponse(400, { ok: false, error: validated.error }, origin);

  const rateLimit = await checkRateLimit(`developer-support:${auth.user.id}`, 5, 60_000);
  if (!rateLimit.allowed) {
    return jsonResponse(429, { ok: false, error: `Juda ko‘p urinish. ${rateLimit.retryAfterSec} soniyadan keyin urinib ko‘ring.` }, origin);
  }
  if (process.env.VERCEL_ENV !== 'production') {
    return jsonResponse(503, { ok: false, error: 'Stars orqali to‘lov faqat ishlab turgan ilovada mavjud.' }, origin);
  }
  const webhook = await ensureTelegramWebhook();
  if (!webhook.ok) {
    return jsonResponse(503, { ok: false, error: webhook.error || 'Telegram to‘lov webhooki hozircha tayyor emas.' }, origin);
  }

  const ref = generateOrderRef();
  const donation = {
    ref,
    status: 'pending',
    donorId: String(auth.user.id),
    name: auth.user.username ? `@${auth.user.username}` : auth.user.first_name || 'Telegram foydalanuvchisi',
    stars: validated.stars,
    message: validated.message,
    currency: 'XTR',
    createdAt: Date.now(),
  };
  await saveDeveloperSupportInvoice(ref, donation);

  const invoice = await telegramApi('sendInvoice', buildSupportInvoicePayload({
    chatId: auth.user.id,
    ref,
    stars: validated.stars,
    message: validated.message,
  }));

  if (!invoice?.ok) {
    await updateDeveloperSupportInvoice(ref, { status: 'failed' });
    return jsonResponse(502, { ok: false, error: invoice?.description || 'Telegram Stars invoice yuborilmadi.' }, origin);
  }

  return jsonResponse(200, { ok: true, sent: true }, origin);
}
