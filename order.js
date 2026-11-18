import { resolveCatalogPack } from './_catalog-map.js';
import {
  checkRateLimit,
  escapeHtml,
  formatOrdLine,
  generateOrderRef,
  getClientIp,
  getCorsHeaders,
  jsonResponse,
  sanitizeServer,
  sanitizeTarget,
  saveOrder,
  signOrderToken,
  telegramApi,
  updateOrder,
  validateReceiptDataUrl,
  verifyTelegramInitData,
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
    return jsonResponse(400, { ok: false, error: 'So‘rov ma’lumotlari noto‘g‘ri (JSON)' }, origin);
  }

  const botToken = process.env.TG_BOT_TOKEN || '';
  const adminId = process.env.TG_ADMIN_ID || '';

  // 1. Verify Telegram Mini App initData if provided
  let tgUser = null;
  let sourceType = 'web';
  const initData = typeof body.initData === 'string' ? body.initData : '';

  if (initData) {
    const auth = verifyTelegramInitData(initData, botToken);
    if (!auth.valid) {
      return jsonResponse(401, { ok: false, error: 'Telegram sessiyasi tasdiqlanmadi. Ilovani qayta oching.' }, origin);
    }
    tgUser = auth.user;
    sourceType = 'miniapp';
  }

  // 2. Rate limiting (per Telegram user ID or per IP)
  const ip = getClientIp(event.headers);
  const rlKey = tgUser ? `tg:${tgUser.id}` : `ip:${ip}`;
  const rl = await checkRateLimit(rlKey, 4, 60_000);
  if (!rl.allowed) {
    return jsonResponse(
      429,
      { ok: false, error: `Juda ko‘p so‘rov yuborildi. ${rl.retryAfterSec} soniyadan keyin urinib ko‘ring.` },
      origin
    );
  }

  // 3. Server-side authoritative catalog & price validation (never trust client price)
  const gameId = String(body.gameId || body.game || '').trim();
  const packId = String(body.packId || body.item || '').trim();
  const pack = resolveCatalogPack(gameId, packId);
  if (!pack) {
    return jsonResponse(400, { ok: false, error: 'Tanlangan o‘yin yoki paket topilmadi' }, origin);
  }

  const clientPrice = Number(body.price);
  if (!Number.isInteger(clientPrice) || clientPrice <= 0 || clientPrice !== pack.priceUzs) {
    return jsonResponse(409, {
      ok: false,
      code: 'price_mismatch',
      serverPrice: pack.priceUzs,
      error: 'Paket narxi yangilangan. Sahifani yangilab qayta urining.',
    }, origin);
  }

  // 4. Sanitize and validate target (playerID / @username / url) & optional server
  const targetCheck = sanitizeTarget(body.playerID, pack.inputType);
  if (!targetCheck.ok) {
    const msg =
      pack.inputType === 'username'
        ? 'Username noto‘g‘ri (3–32 ta harf, raqam yoki _ bo‘lishi kerak)'
        : pack.inputType === 'url'
          ? 'Havola noto‘g‘ri (masalan: https://t.me/... yoki https://instagram.com/...)'
          : 'O‘yinchi ID noto‘g‘ri (3–32 ta harf, raqam yoki _ . : -)';
    return jsonResponse(400, { ok: false, error: msg }, origin);
  }

  const serverCheck = sanitizeServer(body.server, pack.requiresServer);
  if (!serverCheck.ok) {
    return jsonResponse(400, { ok: false, error: 'Server / Zone ID noto‘g‘ri yoki kiritilmagan' }, origin);
  }

  // 5. Validate payment receipt image (type, magic bytes, <= 4 MB)
  const receipt = validateReceiptDataUrl(body.photo);
  if (!receipt.ok) {
    const errMap = {
      receipt_required: 'To‘lov cheki rasmini yuklang',
      receipt_too_large: 'Chek rasmi hajmi 4 MB dan oshmasligi kerak',
      invalid_receipt_format: 'Faqat JPEG, PNG yoki WebP rasm yuklang',
      invalid_receipt_magic: 'Rasm fayli buzilgan yoki noto‘g‘ri formatda',
    };
    return jsonResponse(400, { ok: false, error: errMap[receipt.error] || 'Chek rasmi noto‘g‘ri' }, origin);
  }

  // 6. Generate unique idempotent reference & persist initial order
  const ref = generateOrderRef();
  const orderToken = signOrderToken(ref);
  const tgUserId = tgUser?.id || '';

  const orderRecord = {
    ref,
    status: 'pending', // pending | processing | completed | canceled | manual_pending
    gameId: pack.gameId,
    gameName: pack.gameName,
    packId: pack.packId,
    packLabel: pack.packLabel,
    priceUzs: pack.priceUzs,
    coinsReward: pack.coinsReward,
    playerId: targetCheck.value,
    playerDisplay: targetCheck.display,
    server: serverCheck.value,
    region: pack.sora?.region || '',
    soraService: pack.sora?.service || '',
    soraItem: pack.sora?.item || '',
    soraQuantity: pack.sora?.quantity || null,
    soraType: pack.sora?.type || 'game',
    expectedSoraPrice: pack.sora?.expectedSoraPrice || null,
    mapped: Boolean(pack.sora && pack.sora.service && (pack.sora.item || pack.sora.quantity)),
    tgUserId,
    tgUsername: tgUser?.username || '',
    tgFirstName: tgUser?.first_name || '',
    sourceType,
    charged: null,
    refunded: false,
    soraOrderId: null,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  await saveOrder(orderRecord);

  // 7. Send receipt & inline approval controls to Telegram Admin (if configured)
  let adminNotified = false;
  if (botToken && adminId) {
    const userDisplay = tgUser
      ? `${escapeHtml(tgUser.first_name || 'Mijoz')} ${tgUser.username ? `(@${escapeHtml(tgUser.username)})` : ''} · ID: <code>${escapeHtml(tgUser.id)}</code>`
      : `Veb-brauzer mehmoni`;

    const ordLine = formatOrdLine({
      service: orderRecord.soraService || 'manual',
      item: orderRecord.soraItem || '',
      quantity: orderRecord.soraQuantity || undefined,
      playerId: orderRecord.playerId,
      server: orderRecord.server,
      region: orderRecord.region,
      ref,
      tgUserId: tgUserId || '-',
    });

    const autoModeNote = orderRecord.mapped
      ? '⚡ <b>Avto-yetkazish tayyor:</b> Tasdiqlash Sora API ga yuboradi'
      : '🛠 <b>Qo‘lda bajarish:</b> Sora item xaritasi ulanmagan';

    const caption = [
      `<b>YANGI BUYURTMA · ${escapeHtml(ref)}</b>`,
      '',
      `<b>O‘yin:</b> ${escapeHtml(pack.gameName)}`,
      `<b>Paket:</b> ${escapeHtml(pack.packLabel)}`,
      `<b>Summa:</b> ${pack.priceUzs.toLocaleString('uz-UZ')} so‘m (+${pack.coinsReward} tanga)`,
      `<b>Kiritilgan ID:</b> <code>${escapeHtml(targetCheck.display)}</code>`,
      serverCheck.value ? `<b>Server ID:</b> <code>${escapeHtml(serverCheck.value)}</code>` : null,
      `<b>Mijoz:</b> ${userDisplay}`,
      '',
      autoModeNote,
      `<code>${escapeHtml(ordLine)}</code>`,
    ]
      .filter((line) => line !== null)
      .join('\n');

    const form = new FormData();
    form.append('chat_id', adminId);
    form.append('photo', new Blob([receipt.buffer], { type: receipt.mimeType }), `receipt-${ref}.${receipt.ext}`);
    form.append('caption', caption);
    form.append('parse_mode', 'HTML');
    form.append(
      'reply_markup',
      JSON.stringify({
        inline_keyboard: [
          [
            { text: '✅ Tasdiqlash', callback_data: `ok:${ref}` },
            { text: '❌ Rad etish', callback_data: `no:${ref}` },
          ],
        ],
      })
    );

    const tgRes = await telegramApi('sendPhoto', form, true);
    adminNotified = Boolean(tgRes?.ok);
    if (tgRes?.ok && tgRes.result?.message_id) {
      await updateOrder(ref, {
        adminChatId: String(tgRes.result.chat?.id || adminId),
        adminMessageId: tgRes.result.message_id,
      });
    } else if (!tgRes?.ok) {
      console.error('[Order TG sendPhoto error]', tgRes?.description || 'unknown');
    }
  }

  return jsonResponse(
    200,
    {
      ok: true,
      ref,
      orderToken,
      status: 'pending',
      priceUzs: pack.priceUzs,
      coinsReward: pack.coinsReward,
      mapped: orderRecord.mapped,
      adminNotified,
    },
    origin
  );
}
