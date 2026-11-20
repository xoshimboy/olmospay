import { CATALOG } from './_catalog-map.js';
import {
  creditOrderCoins,
  ensureTelegramWebhook,
  escapeHtml,
  getCardSettings,
  getCorsHeaders,
  getOrder,
  getAdminMessageLogs,
  jsonResponse,
  listAllOrders,
  listTelegramCustomerIds,
  recordAdminMessageLog,
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
    const [orders, card, soraMe, soraSvc, tgMe, customerIds, messageLogs] = await Promise.all([
      listAllOrders(60),
      getCardSettings(),
      soraRequest('/me', { method: 'GET' }),
      soraRequest('/services', { method: 'GET', useCache: true }),
      process.env.TG_BOT_TOKEN ? telegramApi('getMe', {}) : Promise.resolve(null),
      listTelegramCustomerIds(),
      getAdminMessageLogs(30),
    ]);
    const webhook = await ensureTelegramWebhook();

    let completedOrders = 0;
    let pendingOrders = 0;
    let processingOrders = 0;
    let canceledOrders = 0;
    let totalRevenueUzs = 0;

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
          uniqueCustomers: customerIds.length,
          storeServicesCount: CATALOG.length,
        },
        orders,
        messageLogs,
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
          connected: Boolean(tgMe?.ok),
          error: tgMe?.ok ? null : tgMe?.description || (process.env.TG_BOT_TOKEN ? 'Telegram bot bilan aloqa yo‘q' : 'TG_BOT_TOKEN sozlanmagan'),
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
      const targetType = String(body.targetType || target).trim();
      const text = String(body.text || '').trim();
      if (!text || text.length > 3500) {
        return jsonResponse(400, { ok: false, error: 'Xabar matni 1–3500 belgi bo‘lishi kerak' }, origin);
      }
      if (!process.env.TG_BOT_TOKEN) {
        return jsonResponse(503, { ok: false, error: 'TG_BOT_TOKEN sozlanmagan' }, origin);
      }

      const botCheck = await telegramApi('getMe', {});
      if (!botCheck?.ok) {
        return jsonResponse(503, { ok: false, error: botCheck?.description || 'Telegram bot tokeni ishlamayapti' }, origin);
      }

      if (targetType === 'broadcast') {
        const ids = await listTelegramCustomerIds();
        if (ids.length === 0) {
          return jsonResponse(400, { ok: false, error: 'Hali Telegram orqali buyurtma bergan mijozlar yo‘q' }, origin);
        }
        let sentCount = 0;
        let failedCount = 0;
        for (const uid of ids) {
          try {
            const result = await telegramApi('sendMessage', {
              chat_id: uid,
              text: escapeHtml(text),
              parse_mode: 'HTML',
            });
            if (result?.ok) sentCount += 1;
            else failedCount += 1;
          } catch {
            failedCount += 1;
          }
        }
        const status = failedCount === 0 ? 'sent' : sentCount > 0 ? 'partial' : 'failed';
        const messageLogs = await recordAdminMessageLog({
          target: 'broadcast',
          preview: text,
          totalTargets: ids.length,
          sentCount,
          failedCount,
          status,
        });
        return jsonResponse(
          sentCount > 0 ? 200 : 502,
          {
            ok: sentCount > 0,
            sentCount,
            failedCount,
            totalTargets: ids.length,
            messageLogs,
            error: sentCount === 0 ? 'Xabar hech bir mijozga yetkazilmadi.' : undefined,
          },
          origin
        );
      }

      const chatId = targetType === 'admin' || !targetType ? String(process.env.TG_ADMIN_ID || '').trim() : target;
      if (!/^-?\d{5,20}$/.test(chatId)) {
        return jsonResponse(400, { ok: false, error: 'Telegram Chat ID noto‘g‘ri' }, origin);
      }
      let result;
      try {
        result = await telegramApi('sendMessage', {
          chat_id: chatId,
          text: escapeHtml(text),
          parse_mode: 'HTML',
        });
      } catch {
        result = null;
      }
      const sentCount = result?.ok ? 1 : 0;
      const messageLogs = await recordAdminMessageLog({
        target: targetType === 'custom' ? 'custom' : 'admin',
        preview: text,
        totalTargets: 1,
        sentCount,
        failedCount: sentCount ? 0 : 1,
        status: sentCount ? 'sent' : 'failed',
      });
      if (!result?.ok) {
        return jsonResponse(502, {
          ok: false,
          error: result?.description || 'Telegram xabar yuborilmadi',
          messageLogs,
        }, origin);
      }
      return jsonResponse(200, { ok: true, sentCount, failedCount: 0, totalTargets: 1, messageLogs }, origin);
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
