import { CATALOG } from './_catalog-map.js';
import {
  creditOrderCoins,
  ensureTelegramWebhook,
  escapeHtml,
  getCardSettings,
  getCorsHeaders,
  getOrder,
  jsonResponse,
  listAllOrders,
  saveCardSettings,
  soraRequest,
  telegramApi,
  updateOrder,
  verifyAdminAccess,
} from './_lib.js';
import { applySoraStatusOutcome, executeSoraApproval } from './tg-webhook.js';

export async function handler(event) {
  const origin = event.headers?.origin || event.headers?.Origin || '';

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: getCorsHeaders(origin), body: '' };
  }

  let body = {};
  if (event.httpMethod === 'POST') {
    try {
      body = JSON.parse(event.body || '{}');
    } catch {
      return jsonResponse(400, { ok: false, error: 'Noto‘g‘ri JSON ma’lumot' }, origin);
    }
  }

  const auth = verifyAdminAccess({
    headers: event.headers,
    initData: typeof body.initData === 'string' ? body.initData : '',
    adminKey: typeof body.adminKey === 'string' ? body.adminKey : '',
    adminToken: typeof body.adminToken === 'string' ? body.adminToken : '',
  });

  const lowerHeaders = Object.fromEntries(
    Object.entries(event.headers || {}).map(([k, v]) => [k.toLowerCase(), String(v || '')])
  );
  const hasAnyCredential = Boolean(
    body.initData ||
      body.adminKey ||
      body.adminToken ||
      lowerHeaders['x-tg-init-data'] ||
      lowerHeaders['x-admin-key'] ||
      lowerHeaders['x-admin-token']
  );

  if (!auth.ok) {
    return jsonResponse(
      401,
      {
        ok: false,
        code: hasAnyCredential ? 'invalid_credentials' : 'auth_required',
        error: hasAnyCredential
          ? 'Admin kaliti yoki sessiya havolasi noto‘g‘ri. Qaytadan kiriting yoki botda /panel yozing.'
          : 'Kirish uchun Telegram botda /panel yozing yoki ADMIN_PANEL_KEY ni kiriting.',
      },
      origin
    );
  }

  if (event.httpMethod === 'GET') {
    const [orders, card, soraMe, soraSvc, tgMe] = await Promise.all([
      listAllOrders(60),
      getCardSettings(),
      soraRequest('/me', { method: 'GET' }),
      soraRequest('/services', { method: 'GET', useCache: true }),
      process.env.TG_BOT_TOKEN ? telegramApi('getMe', {}) : Promise.resolve(null),
    ]);
    const webhook = await ensureTelegramWebhook();

    let completedOrders = 0;
    let pendingOrders = 0;
    let processingOrders = 0;
    let canceledOrders = 0;
    let totalRevenueUzs = 0;
    const customerSet = new Set();

    for (const o of orders) {
      if (o.status === 'completed') {
        completedOrders += 1;
        totalRevenueUzs += Number(o.priceUzs || 0);
      } else if (o.status === 'canceled') {
        canceledOrders += 1;
      } else if (o.status === 'processing') {
        processingOrders += 1;
      } else {
        pendingOrders += 1;
      }
      if (o.tgUserId) customerSet.add(String(o.tgUserId));
      else if (o.playerId) customerSet.add(`p:${o.playerId}`);
    }

    return jsonResponse(
      200,
      {
        ok: true,
        authMode: auth.mode,
        stats: {
          totalOrders: orders.length,
          completedOrders,
          pendingOrders,
          processingOrders,
          canceledOrders,
          totalRevenueUzs,
          uniqueCustomers: customerSet.size,
          storeServicesCount: CATALOG.length,
        },
        orders,
        card,
        sora: {
          ok: soraMe.ok,
          balance: soraMe.ok ? soraMe.data?.balance : null,
          currency: soraMe.ok ? soraMe.data?.currency || 'UZS' : 'UZS',
          discountPercent: soraMe.ok ? soraMe.data?.discount_percent ?? 0 : null,
          spentToday: soraMe.ok ? soraMe.data?.spent_today ?? 0 : null,
          dailyLimit: soraMe.ok ? soraMe.data?.daily_limit ?? 0 : null,
          servicesCount: soraSvc.ok && Array.isArray(soraSvc.data?.services) ? soraSvc.data.services.length : 0,
          services: soraSvc.ok && Array.isArray(soraSvc.data?.services) ? soraSvc.data.services : [],
          error: !soraMe.ok ? soraMe.error?.message || soraMe.error?.code : null,
        },
        bot: {
          configured: Boolean(process.env.TG_BOT_TOKEN),
          adminIdSet: Boolean(process.env.TG_ADMIN_ID),
          username: tgMe?.ok && tgMe.result?.username ? tgMe.result.username : null,
          webhookConfigured: Boolean(webhook.ok),
        },
      },
      origin
    );
  }

  if (event.httpMethod === 'POST') {
    const action = String(body.action || '').trim();

    if (action === 'save-card') {
      try {
        const card = await saveCardSettings({
          number: body.number,
          holder: body.holder,
          bank: body.bank,
        });
        return jsonResponse(200, { ok: true, card }, origin);
      } catch {
        return jsonResponse(400, { ok: false, error: '16 xonali karta raqami, egasi va bank nomini kiriting' }, origin);
      }
    }

    if (action === 'send-message') {
      const target = String(body.target || '').trim();
      const text = String(body.text || '').trim();
      if (!text || text.length > 3500) {
        return jsonResponse(400, { ok: false, error: 'Xabar matni 1–3500 belgi bo‘lishi kerak' }, origin);
      }
      if (!process.env.TG_BOT_TOKEN) {
        return jsonResponse(503, { ok: false, error: 'TG_BOT_TOKEN sozlanmagan' }, origin);
      }

      if (target === 'broadcast') {
        const orders = await listAllOrders(100);
        const ids = [...new Set(orders.map((o) => o.tgUserId).filter(Boolean))];
        if (ids.length === 0) {
          return jsonResponse(400, { ok: false, error: 'Hali Telegram orqali buyurtma bergan mijozlar yo‘q' }, origin);
        }
        let sentCount = 0;
        for (const uid of ids) {
          const r = await telegramApi('sendMessage', {
            chat_id: uid,
            text: escapeHtml(text),
            parse_mode: 'HTML',
          });
          if (r?.ok) sentCount += 1;
        }
        return jsonResponse(200, { ok: true, sentCount, totalTargets: ids.length }, origin);
      }

      const chatId = target === 'admin' || !target ? String(process.env.TG_ADMIN_ID || '').trim() : target;
      if (!/^-?\d{5,20}$/.test(chatId)) {
        return jsonResponse(400, { ok: false, error: 'Telegram Chat ID noto‘g‘ri' }, origin);
      }
      const res = await telegramApi('sendMessage', {
        chat_id: chatId,
        text: escapeHtml(text),
        parse_mode: 'HTML',
      });
      if (!res?.ok) {
        return jsonResponse(502, { ok: false, error: res?.description || 'Telegram xabar yuborilmadi' }, origin);
      }
      return jsonResponse(200, { ok: true, sentCount: 1, totalTargets: 1 }, origin);
    }

    const ref = String(body.ref || '').trim();
    const order = await getOrder(ref);
    if (!order) {
      return jsonResponse(404, { ok: false, error: 'Buyurtma topilmadi' }, origin);
    }

    if (action === 'reject-order') {
      const updated = await updateOrder(ref, {
        status: 'canceled',
        customerNotifiedAt: order.customerNotifiedAt || Date.now(),
      });
      if (order.adminChatId && order.adminMessageId) {
        await telegramApi('editMessageCaption', {
          chat_id: order.adminChatId,
          message_id: order.adminMessageId,
          parse_mode: 'HTML',
          caption: `❌ <b>RAD ETILDI · ${escapeHtml(ref)}</b>\nAdmin panel orqali bekor qilindi.`,
          reply_markup: { inline_keyboard: [] },
        });
      }
      if (order.tgUserId && !order.customerNotifiedAt) {
        await telegramApi('sendMessage', {
          chat_id: order.tgUserId,
          parse_mode: 'HTML',
          text: `❌ <b>Buyurtmangiz rad etildi</b>\nRaqam: <code>${escapeHtml(ref)}</code>\nSabab: to‘lov tasdiqlanmadi.`,
        });
      }
      return jsonResponse(200, { ok: true, order: updated }, origin);
    }

    if (action === 'manual-done') {
      const updated = await updateOrder(ref, {
        status: 'completed',
        customerNotifiedAt: order.customerNotifiedAt || Date.now(),
      });
      const coinRes = await creditOrderCoins(updated || { ...order, status: 'completed' });
      if (order.adminChatId && order.adminMessageId) {
        await telegramApi('editMessageCaption', {
          chat_id: order.adminChatId,
          message_id: order.adminMessageId,
          parse_mode: 'HTML',
          caption: `✅ <b>QO‘LDA BAJARILDI · ${escapeHtml(ref)}</b>\nAdmin panel orqali tasdiqlandi.${
            coinRes.coins > 0 ? `\n🪙 +${coinRes.coins} tanga` : ''
          }`,
          reply_markup: { inline_keyboard: [] },
        });
      }
      if (order.tgUserId && !order.customerNotifiedAt) {
        await telegramApi('sendMessage', {
          chat_id: order.tgUserId,
          parse_mode: 'HTML',
          text: `✅ <b>Buyurtmangiz bajarildi!</b>\nRaqam: <code>${escapeHtml(ref)}</code>\nPaket: ${escapeHtml(order.packLabel)}${
            coinRes.coins > 0 ? `\n\n🪙 <b>+${coinRes.coins} tanga</b> hisobingizga qo‘shildi!` : ''
          }`,
        });
      }
      return jsonResponse(200, { ok: true, order: updated, coinsAwarded: coinRes.coins }, origin);
    }

    if (action === 'check-order') {
      if (!order.mapped) {
        return jsonResponse(200, { ok: true, order }, origin);
      }
      const soraRes = await soraRequest(`/status?ref=${encodeURIComponent(ref)}`, { method: 'GET' });
      if (!soraRes.ok || !soraRes.data?.order) {
        return jsonResponse(502, { ok: false, error: soraRes.error?.message || 'Sora holatini olib bo‘lmadi' }, origin);
      }
      const s = soraRes.data.order;
      const ordObj = {
        service: order.soraService || '',
        item: order.soraItem || '',
        quantity: order.soraQuantity || undefined,
        playerId: order.playerId || '',
        server: order.server || '',
        region: order.region || '',
        ref: order.ref,
        tgUserId: order.tgUserId || '',
      };
      const synced = await applySoraStatusOutcome({
        chatId: order.adminChatId,
        messageId: order.adminMessageId,
        isCaption: true,
        ord: ordObj,
        stored: order,
        soraOrder: s,
        adminId: String(process.env.TG_ADMIN_ID || '').trim(),
      });
      const updated = (await updateOrder(ref, { lastSoraPollAt: Date.now() })) || synced || order;
      return jsonResponse(200, { ok: true, order: updated }, origin);
    }

    if (action === 'approve-order') {
      if (order.status === 'processing' || order.status === 'completed' || order.status === 'canceled') {
        return jsonResponse(200, { ok: true, order }, origin);
      }

      const res = await executeSoraApproval({
        ref,
        stored: order,
        chatId: order.adminChatId,
        messageId: order.adminMessageId,
        isCaption: true,
      });

      if (!res.ok) {
        return jsonResponse(502, {
          ok: false,
          code: res.code || 'sora_error',
          error: res.error || 'Sora API buyurtmani qabul qilmadi',
        }, origin);
      }

      return jsonResponse(
        200,
        {
          ok: true,
          order: res.order,
          ...(res.manual ? { note: 'Qo‘lda bajarish navbatiga o‘tkazildi' } : {}),
        },
        origin
      );
    }

    return jsonResponse(400, { ok: false, error: 'Noma’lum amal' }, origin);
  }

  return jsonResponse(405, { ok: false, error: 'Method not allowed' }, origin);
}
