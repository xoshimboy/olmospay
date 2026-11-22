import { getPublicCatalog } from './_catalog-map.js';
import { getCorsHeaders, getStoreSettings, jsonResponse, soraRequest } from './_lib.js';

export async function handler(event) {
  const origin = event.headers?.origin || event.headers?.Origin || '';

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: getCorsHeaders(origin), body: '' };
  }
  if (event.httpMethod !== 'GET') {
    return jsonResponse(405, { ok: false, error: { code: 'method_not_allowed', message: 'Faqat GET ruxsat etilgan' } }, origin);
  }

  const params = event.queryStringParameters || {};
  const path = String(params.path || 'public-catalog').trim();

  if (path === 'public-catalog') {
    const storeSettings = await getStoreSettings();
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'public, max-age=30, stale-while-revalidate=120',
        ...getCorsHeaders(origin),
      },
      body: JSON.stringify({ ok: true, games: getPublicCatalog(), storeSettings }),
    };
  }

  // Strictly permit ONLY `services` and `catalog` from Sora API.
  // Never expose /me (balance) or /order (spends funds) on public endpoints.
  if (path === 'services') {
    const res = await soraRequest('/services', { method: 'GET', useCache: true });
    if (!res.ok) {
      return jsonResponse(res.status || 502, { ok: false, error: res.error }, origin);
    }
    return jsonResponse(200, res.data, origin);
  }

  if (path === 'catalog') {
    const service = String(params.service || '').trim();
    if (!/^[A-Za-z0-9_.-]{1,64}$/.test(service)) {
      return jsonResponse(400, { ok: false, error: { code: 'invalid_service', message: 'Service kodi noto‘g‘ri' } }, origin);
    }
    const query = new URLSearchParams({ service, lang: 'uz' });
    for (const opt of ['category', 'collection', 'region']) {
      const val = String(params[opt] || '').trim();
      if (val && /^[A-Za-z0-9_.:-]{1,64}$/.test(val)) {
        query.set(opt, val);
      }
    }
    const res = await soraRequest(`/catalog?${query.toString()}`, { method: 'GET', useCache: true });
    if (!res.ok) {
      return jsonResponse(res.status || 502, { ok: false, error: res.error }, origin);
    }
    return jsonResponse(200, res.data, origin);
  }

  return jsonResponse(403, { ok: false, error: { code: 'forbidden_path', message: 'Ushbu endpointga ruxsat yo‘q' } }, origin);
}
