import {
  checkTelegramChannelMembership,
  getCorsHeaders,
  getStorefrontSettings,
  jsonResponse,
  verifyTelegramInitData,
} from './_lib.js';

export async function handler(event) {
  const origin = event.headers?.origin || event.headers?.Origin || '';
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: getCorsHeaders(origin), body: '' };
  if (event.httpMethod !== 'POST') {
    return jsonResponse(405, { ok: false, error: 'Faqat POST so‘rovi qabul qilinadi' }, origin);
  }

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return jsonResponse(400, { ok: false, error: 'So‘rov ma’lumotlari noto‘g‘ri' }, origin);
  }

  const settings = await getStorefrontSettings();
  if (!settings.mandatorySubscription) {
    return jsonResponse(200, { ok: true, required: false, subscribed: true }, origin);
  }

  const initData = typeof body.initData === 'string' ? body.initData : '';
  const auth = initData && process.env.TG_BOT_TOKEN
    ? verifyTelegramInitData(initData, process.env.TG_BOT_TOKEN)
    : { valid: false };
  if (!auth.valid || !auth.user?.id) {
    return jsonResponse(200, {
      ok: true,
      required: true,
      subscribed: false,
      needsTelegram: true,
      channelLink: settings.subscriptionLink || (settings.subscriptionChannelId.startsWith('@')
        ? `https://t.me/${settings.subscriptionChannelId.slice(1)}`
        : ''),
    }, origin);
  }

  const membership = await checkTelegramChannelMembership(auth.user.id, settings);
  return jsonResponse(200, {
    ok: true,
    required: true,
    subscribed: membership.subscribed,
    channelLink: membership.channelLink,
    error: membership.error || undefined,
  }, origin);
}
