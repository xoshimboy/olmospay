import {
  checkRateLimit,
  getClientIp,
  getCorsHeaders,
  jsonResponse,
  validatePromoCode,
} from './_lib.js';

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
    return jsonResponse(400, { ok: false, error: 'So‘rov ma’lumotlari noto‘g‘ri' }, origin);
  }

  const rateLimit = await checkRateLimit(`promo:${getClientIp(event.headers)}`, 20, 60_000);
  if (!rateLimit.allowed) {
    return jsonResponse(429, { ok: false, error: 'Juda ko‘p urinish. Birozdan keyin qayta urinib ko‘ring.' }, origin);
  }

  const result = await validatePromoCode(body.code);
  return jsonResponse(200, {
    ok: true,
    valid: result.valid,
    ...(result.valid ? { code: result.code, discountPercent: result.discountPercent } : {}),
  }, origin);
}
