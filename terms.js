import { getCorsHeaders, getTermsAcceptance, jsonResponse, saveTermsAcceptance, verifyTelegramInitData } from './_lib.js';
import { TERMS_VERSION } from './data/terms.js';

function getInitData(event, body) {
  const headers = Object.fromEntries(
    Object.entries(event.headers || {}).map(([name, value]) => [name.toLowerCase(), String(value || '')])
  );
  return String(body?.initData || headers['x-tg-init-data'] || '');
}

function getVerifiedUser(initData) {
  const token = String(process.env.TG_BOT_TOKEN || '').trim();
  if (!token || !initData) return null;
  const auth = verifyTelegramInitData(initData, token);
  return auth.valid && auth.user?.id ? auth.user : null;
}

export async function handler(event) {
  const origin = event.headers?.origin || event.headers?.Origin || '';
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: getCorsHeaders(origin), body: '' };

  let body = {};
  if (event.httpMethod === 'POST') {
    try {
      body = JSON.parse(event.body || '{}');
    } catch {
      return jsonResponse(400, { ok: false, error: 'So‘rov ma’lumotlari noto‘g‘ri.' }, origin);
    }
  }

  if (event.httpMethod !== 'GET' && event.httpMethod !== 'POST') {
    return jsonResponse(405, { ok: false, error: 'Faqat GET yoki POST ruxsat etiladi.' }, origin);
  }

  const user = getVerifiedUser(getInitData(event, body));
  if (!user) {
    return jsonResponse(401, { ok: false, error: 'Telegram sessiyasi tasdiqlanmadi. Ilovani Telegram ichidan qayta oching.' }, origin);
  }

  if (event.httpMethod === 'GET') {
    const acceptance = await getTermsAcceptance(user.id);
    return jsonResponse(200, {
      ok: true,
      version: TERMS_VERSION,
      accepted: acceptance?.version === TERMS_VERSION,
      acceptedAt: acceptance?.version === TERMS_VERSION ? acceptance.acceptedAt : null,
    }, origin);
  }

  if (String(body.version || '') !== TERMS_VERSION) {
    return jsonResponse(409, { ok: false, code: 'terms_version_changed', version: TERMS_VERSION, error: 'Qoidalar yangilangan. Yangi versiyani qayta ko‘rib chiqing.' }, origin);
  }

  const acceptance = await saveTermsAcceptance(user.id, TERMS_VERSION);
  if (!acceptance) {
    return jsonResponse(503, { ok: false, error: 'Rozilikni saqlab bo‘lmadi. Qayta urinib ko‘ring.' }, origin);
  }

  return jsonResponse(200, { ok: true, accepted: true, version: TERMS_VERSION, acceptedAt: acceptance.acceptedAt }, origin);
}
