import { CATALOG, resolveCatalogPack } from './_catalog-map.js';
import {
  deleteServiceMedia,
  getAllServiceMedia,
  getCardSettings,
  getCorsHeaders,
  jsonResponse,
  saveCardSettings,
  saveServiceMedia,
  validateReceiptDataUrl,
  verifyAdminAccess,
} from './_lib.js';

const BANNER_IDS = new Set(['banner-1', 'banner-2', 'banner-3']);
const VALID_PACK_KEYS = new Set(
  CATALOG.flatMap((g) => g.packs.map((p) => `pack:${p.id}`))
);

export async function handler(event) {
  const origin = event.headers?.origin || event.headers?.Origin || '';

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: getCorsHeaders(origin), body: '' };
  }

  // Public GET: returns service covers, package covers, custom banners, and active payment card details
  if (event.httpMethod === 'GET') {
    const [media, card] = await Promise.all([getAllServiceMedia(), getCardSettings()]);
    const res = jsonResponse(200, { ok: true, media, card }, origin);
    res.headers['Cache-Control'] = 'public, max-age=30, stale-while-revalidate=120';
    return res;
  }

  let body = {};
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return jsonResponse(400, { ok: false, error: 'Noto‘g‘ri JSON ma’lumot' }, origin);
  }

  const auth = verifyAdminAccess({
    headers: event.headers,
    initData: typeof body.initData === 'string' ? body.initData : '',
    adminKey: typeof body.adminKey === 'string' ? body.adminKey : '',
    adminToken: typeof body.adminToken === 'string' ? body.adminToken : '',
  });
  if (!auth.ok) {
    const msg = auth.hasPanelSecret
      ? 'Admin kaliti noto‘g‘ri yoki kiritilmagan. Botda /panel yozing yoki ADMIN_PANEL_KEY ni kiriting.'
      : 'Kirish rad etildi. Telegram botda /panel yozib kirish havolasini oling yoki ADMIN_PANEL_KEY sozlang.';
    return jsonResponse(401, { ok: false, error: msg }, origin);
  }

  if (body.action === 'save-card') {
    try {
      const card = await saveCardSettings({
        number: body.number,
        holder: body.holder,
        bank: body.bank,
      });
      return jsonResponse(200, { ok: true, card }, origin);
    } catch {
      return jsonResponse(400, { ok: false, error: 'Karta raqami (16 ta raqam), egasi va bank nomi to‘liq kiriting' }, origin);
    }
  }

  const targetId = String(body.gameId || '').trim();
  const isBanner = BANNER_IDS.has(targetId);
  const isPack = VALID_PACK_KEYS.has(targetId) || /^pack:[a-z0-9_-]{2,48}$/.test(targetId);
  const isService = Boolean(resolveCatalogPack(targetId, '') || /^[a-z0-9-]{2,32}$/.test(targetId));

  if (!isBanner && !isPack && !isService) {
    return jsonResponse(400, { ok: false, error: 'Xizmat, paket yoki banner ID si noto‘g‘ri' }, origin);
  }

  if (event.httpMethod === 'DELETE' || body.action === 'delete') {
    const media = await deleteServiceMedia(targetId);
    return jsonResponse(200, { ok: true, media }, origin);
  }

  if (event.httpMethod === 'POST') {
    const imgCheck = validateReceiptDataUrl(body.photo);
    if (!imgCheck.ok) {
      return jsonResponse(400, {
        ok: false,
        error: 'Rasm JPEG, PNG yoki WebP bo‘lishi va 4 MB dan oshmasligi kerak',
      }, origin);
    }
    const media = await saveServiceMedia(targetId, body.photo);
    return jsonResponse(200, { ok: true, media }, origin);
  }

  return jsonResponse(405, { ok: false, error: 'Method not allowed' }, origin);
}
