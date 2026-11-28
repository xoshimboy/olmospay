import crypto from 'node:crypto';
import {
  cancelCoinRewardOrder,
  creditOrderCoins,
  escapeHtml,
  getOrder,
  getStorefrontSettings,
  getUserCoins,
  getTelegramWebhookSecret,
  inferSoraTypeByService,
  jsonResponse,
  parseOrdLine,
  signAdminSessionToken,
  soraRequest,
  telegramApi,
  rememberTelegramCustomer,
  updateOrder,
} from './_lib.js';
import {
  getDeveloperSupportInvoice,
  recordDeveloperSupportDonation,
  updateDeveloperSupportInvoice,
} from './support-store.js';

const LOW_BALANCE_THRESHOLD_UZS = 100_000;
const activePollers = new Set();

function verifyWebhookSecret(headers = {}) {
  const expected = getTelegramWebhookSecret();
  if (!expected) return false;
  const normalized = Object.fromEntries(
    Object.entries(headers).map(([k, v]) => [k.toLowerCase(), String(v || '')])
  );
  const incoming = normalized['x-telegram-bot-api-secret-token'] || '';
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(incoming, 'utf8');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function isAdmin(fromUser) {
  const adminId = String(process.env.TG_ADMIN_ID || '').trim();
  return Boolean(adminId && fromUser && String(fromUser.id) === adminId);
}

function getMiniAppHttpsUrl() {
  const configured = String(process.env.OLMOSPAY_APP_URL || 'https://olmospay.vercel.app').trim();
  try {
    const url = new URL(configured);
    if (url.protocol === 'https:') return url.origin;
  } catch {
    // Fall through to the verified production domain.
  }
  return 'https://olmospay.vercel.app';
}

async function editAdminMessage(chatId, messageId, isCaption, text, replyMarkup = undefined) {
  if (!chatId || !messageId) return { ok: false };
  const method = isCaption ? 'editMessageCaption' : 'editMessageText';
  const payload = {
    chat_id: chatId,
    message_id: messageId,
    parse_mode: 'HTML',
    ...(isCaption ? { caption: text } : { text }),
  };
  if (replyMarkup !== undefined) {
    payload.reply_markup = replyMarkup;
  }
  return telegramApi(method, payload);
}

async function notifyCustomer(tgUserId, text) {
  if (!tgUserId) return;
  await telegramApi('sendMessage', {
    chat_id: tgUserId,
    text,
    parse_mode: 'HTML',
  });
}

async function handleSupportPreCheckout(query) {
  const ref = String(query.invoice_payload || '');
  const invoice = await getDeveloperSupportInvoice(ref);
  const valid = Boolean(
    invoice &&
      invoice.status === 'pending' &&
      invoice.currency === 'XTR' &&
      Number(query.total_amount) === Number(invoice.stars) &&
      String(query.from?.id || '') === String(invoice.donorId)
  );
  await telegramApi('answerPreCheckoutQuery', {
    pre_checkout_query_id: query.id,
    ok: valid,
    ...(!valid ? { error_message: 'Invoice muddati tugagan yoki ma’lumotlari mos emas. Yangidan urinib ko‘ring.' } : {}),
  });
}

async function handleSupportPayment(message) {
  const payment = message.successful_payment;
  const ref = String(payment.invoice_payload || '');
  const invoice = await getDeveloperSupportInvoice(ref);
  if (
    !invoice ||
    invoice.status !== 'pending' ||
    invoice.currency !== 'XTR' ||
    Number(payment.total_amount) !== Number(invoice.stars) ||
    String(message.from?.id || '') !== String(invoice.donorId)
  ) {
    return;
  }

  const paymentChargeId = String(payment.telegram_payment_charge_id || `support:${ref}`);
  const paidAt = Date.now();
  await recordDeveloperSupportDonation({
    ref,
    status: 'paid',
    donorId: String(invoice.donorId),
    name: String(invoice.name || 'Telegram foydalanuvchisi').slice(0, 80),
    stars: Number(invoice.stars),
    message: String(invoice.message || '').slice(0, 250),
    paymentChargeId,
    createdAt: paidAt,
  });
  await updateDeveloperSupportInvoice(ref, { status: 'paid', paidAt, paymentChargeId });
  await notifyCustomer(
    message.from?.id,
    `⭐ <b>${Number(invoice.stars).toLocaleString('uz-UZ')} Stars bilan qo‘llab-quvvatlaganingiz uchun rahmat!</b> Sovg‘angiz va xabaringiz umumiy reytingda ko‘rinadi.`
  );
}

export async function publishOrderProof(order) {
  if (!order?.ref || order.proofChannelNotifiedAt) return;
  const settings = await getStorefrontSettings();
  const channelId = String(settings.proofChannelId || '').trim();
  if (!channelId) return;
  const rawTarget = String(order.playerDisplay || order.playerId || '');
  const maskedTarget = rawTarget.length > 3 ? `${'•'.repeat(Math.min(rawTarget.length - 3, 8))}${rawTarget.slice(-3)}` : '•••';
  const result = await telegramApi('sendMessage', {
    chat_id: channelId,
    parse_mode: 'HTML',
    disable_web_page_preview: true,
    text: [
      '✅ <b>BUYURTMA BAJARILDI</b>',
      `<b>Xizmat:</b> ${escapeHtml(order.gameName || '')}`,
      `<b>Paket:</b> ${escapeHtml(order.packLabel || '')}`,
      `<b>To‘lov:</b> ${Number(order.priceUzs || 0).toLocaleString('uz-UZ')} so‘m`,
      `<b>O‘yinchi:</b> <code>${escapeHtml(maskedTarget)}</code>`,
      `<b>Buyurtma:</b> <code>${escapeHtml(order.ref)}</code>`,
    ].join('\n'),
  });
  if (result?.ok) {
    await updateOrder(order.ref, {
      proofChannelNotifiedAt: Date.now(),
      proofChannelMessageId: result.result?.message_id || null,
    });
  }
  return result;
}

async function maybeAlertLowBalance(adminId, soraClient = soraRequest) {
  if (!adminId) return;
  const me = await soraClient('/me', { method: 'GET' });
  if (me.ok && typeof me.data?.balance === 'number' && me.data.balance < LOW_BALANCE_THRESHOLD_UZS) {
    await telegramApi('sendMessage', {
      chat_id: adminId,
      parse_mode: 'HTML',
      text: `⚠️ <b>Sora balansi kam qoldi:</b> ${me.data.balance.toLocaleString('uz-UZ')} so‘m. Iltimos, balansni to‘ldiring.`,
    });
  }
}

export function buildSoraOrderBody(ord, stored, verifiedLivePrice = undefined) {
  const type = stored?.soraType || inferSoraTypeByService(ord.service);
  const body = {
    service: ord.service,
    ref: ord.ref,
  };

  if (ord.item !== undefined && ord.item !== null && ord.item !== '') {
    const rawItem = String(ord.item);
    body.item = type === 'game' && /^\d{1,8}$/.test(rawItem) ? Number(rawItem) : rawItem;
  }
  const qty = ord.quantity || stored?.soraQuantity;
  if (qty) {
    body.quantity = Number(qty);
  }

  if (type === 'telegram' || type === 'nft' || type === 'gift') {
    body.target = ord.playerId;
  } else if (type === 'smm') {
    body.link = ord.playerId;
  } else if (type === 'shop') {
    // shop orders require only service, ref, item
  } else {
    body.player_id = ord.playerId;
    if (ord.server) body.server = ord.server;
    if (ord.region) body.region = ord.region;
  }

  if (typeof verifiedLivePrice === 'number' && verifiedLivePrice > 0) {
    body.price = verifiedLivePrice;
  }
  return body;
}

export async function applySoraStatusOutcome({
  chatId,
  messageId,
  isCaption = true,
  ord,
  stored,
  soraOrder,
  adminId,
  soraClient = soraRequest,
}) {
  const status = soraOrder.status; // processing | completed | canceled
  const charged = typeof soraOrder.charged === 'number' ? `${soraOrder.charged.toLocaleString('uz-UZ')} so‘m` : '—';
  const targetLine = ord.server ? `${ord.playerId} (${ord.server})` : ord.playerId;
  const tgUserId = ord.tgUserId || stored?.tgUserId || '';
  const effChatId = chatId || stored?.adminChatId;
  const effMsgId = messageId || stored?.adminMessageId;

  if (status === 'completed') {
    const latest = await getOrder(ord.ref);
    const alreadyNotified = Boolean(latest?.customerNotifiedAt);
    const updated = await updateOrder(ord.ref, {
      status: 'completed',
      soraOrderId: soraOrder.id || stored?.soraOrderId || null,
      charged: soraOrder.charged ?? stored?.charged ?? null,
      ...(alreadyNotified ? {} : { customerNotifiedAt: Date.now() }),
    });

    const coinRes = await creditOrderCoins(updated || { ...latest, ...ord, status: 'completed' });
    const coinTextAdmin = coinRes.coins > 0 ? `\n<b>Bonus:</b> 🪙 +${coinRes.coins} tanga` : '';

    const caption = [
      `✅ <b>BAJARILDI · ${escapeHtml(ord.ref)}</b>`,
      `<b>Xizmat:</b> ${escapeHtml(stored?.gameName || ord.service)} — ${escapeHtml(stored?.packLabel || ord.item || String(ord.quantity || ''))}`,
      `<b>Qabul qiluvchi:</b> <code>${escapeHtml(targetLine)}</code>`,
      `<b>Yechilgan summa:</b> ${escapeHtml(charged)}`,
      coinRes.coins > 0 ? `<b>Tanga:</b> 🪙 +${coinRes.coins} tanga` : null,
      soraOrder.id ? `<b>Sora ID:</b> <code>${escapeHtml(soraOrder.id)}</code>` : null,
    ]
      .filter(Boolean)
      .join('\n');

    await editAdminMessage(effChatId, effMsgId, isCaption, caption, { inline_keyboard: [] });

    if (!alreadyNotified && tgUserId) {
      const shopDataLine =
        soraOrder.data && stored?.soraType === 'shop'
          ? `\n\n🎁 <b>Sizning kodingiz / ma’lumotingiz:</b>\n<code>${escapeHtml(String(soraOrder.data))}</code>`
          : '';
      const customerCoinLine =
        coinRes.coins > 0
          ? `\n\n🪙 <b>+${coinRes.coins} tanga</b> hisobingizga qo‘shildi!${
              typeof coinRes.newBalance === 'number' ? ` (Jami: <b>${coinRes.newBalance} tanga</b>)` : ''
            }`
          : '';

      await notifyCustomer(
        tgUserId,
        `✅ <b>Buyurtmangiz bajarildi!</b>\n<b>Xizmat:</b> ${escapeHtml(stored?.gameName || '')}\n<b>Paket:</b> ${escapeHtml(stored?.packLabel || ord.item || '')}\n<b>ID:</b> <code>${escapeHtml(targetLine)}</code>\n<b>Raqam:</b> <code>${escapeHtml(ord.ref)}</code>${customerCoinLine}${shopDataLine}`
      );
    } else {
      void coinTextAdmin;
    }

    await publishOrderProof(updated || { ...latest, ...ord, ...stored, status: 'completed' });
    await maybeAlertLowBalance(adminId, soraClient);
    return updated;
  }

  if (status === 'canceled') {
    const latest = await getOrder(ord.ref);
    const alreadyNotified = Boolean(latest?.customerNotifiedAt);
    const updated = await updateOrder(ord.ref, {
      status: 'canceled',
      refunded: Boolean(soraOrder.refunded),
      soraOrderId: soraOrder.id || stored?.soraOrderId || null,
      ...(alreadyNotified ? {} : { customerNotifiedAt: Date.now() }),
    });

    const caption = [
      `↩️ <b>BEKOR QILINDI · ${escapeHtml(ord.ref)}</b>`,
      `<b>Qabul qiluvchi:</b> <code>${escapeHtml(targetLine)}</code>`,
      soraOrder.refunded ? '💰 Balansga avtomatik qaytarildi (refunded).' : '⚠️ Buyurtma bekor qilindi.',
    ].join('\n');

    await editAdminMessage(effChatId, effMsgId, isCaption, caption, { inline_keyboard: [] });
    if (!alreadyNotified && tgUserId) {
      await notifyCustomer(
        tgUserId,
        `❌ <b>Buyurtma bekor qilindi</b>\nRaqam: <code>${escapeHtml(ord.ref)}</code>\nBatafsil ma’lumot uchun qo‘llab-quvvatlashga murojaat qiling.`
      );
    }
    return updated;
  }

  // Still processing — show live status & manual refresh fallback button
  const updated = await updateOrder(ord.ref, {
    status: 'processing',
    soraOrderId: soraOrder.id || stored?.soraOrderId || null,
    charged: soraOrder.charged ?? stored?.charged ?? null,
  });

  const itemSlot = ord.quantity ? `${ord.item || ''}~${ord.quantity}` : ord.item || 'manual';
  const caption = [
    `⏳ <b>YETKAZILMOQDA · ${escapeHtml(ord.ref)}</b>`,
    `<b>Xizmat:</b> ${escapeHtml(stored?.gameName || ord.service)} — ${escapeHtml(stored?.packLabel || ord.item || String(ord.quantity || ''))}`,
    `<b>Qabul qiluvchi:</b> <code>${escapeHtml(targetLine)}</code>`,
    `<b>Yechilgan summa:</b> ${escapeHtml(charged)}`,
    `<i>Tizim avtomatik yakunlanishini kutmoqda...</i>`,
    `<code>#ORD ${escapeHtml(ord.service)}|${escapeHtml(itemSlot)}|${escapeHtml(ord.playerId)}|${escapeHtml(ord.server || '-')}|${escapeHtml(ord.region || '-')}|${escapeHtml(ord.ref)}|${escapeHtml(tgUserId || '-')}</code>`,
  ].join('\n');

  await editAdminMessage(effChatId, effMsgId, isCaption, caption, {
    inline_keyboard: [[{ text: '🔄 Holatni yangilash', callback_data: `st:${ord.ref}` }]],
  });
  return updated;
}

function scheduleBackgroundSoraPoll({ ref, ord, stored, chatId, messageId, isCaption, adminId, soraClient = soraRequest }) {
  if (activePollers.has(ref)) return;
  activePollers.add(ref);
  void (async () => {
    try {
      for (let attempt = 0; attempt < 20; attempt += 1) {
        await new Promise((r) => setTimeout(r, 3_000));
        const current = await getOrder(ref);
        if (!current || current.status === 'completed' || current.status === 'canceled') {
          break;
        }
        const statusRes = await soraClient(`/status?ref=${encodeURIComponent(ref)}`, { method: 'GET' });
        if (statusRes.ok && statusRes.data?.order) {
          const s = statusRes.data.order;
          if (s.status === 'completed' || s.status === 'canceled') {
            await applySoraStatusOutcome({
              chatId,
              messageId,
              isCaption,
              ord,
              stored: current,
              soraOrder: s,
              adminId,
              soraClient,
            });
            break;
          }
        }
      }
    } catch {
      // Non-fatal background polling error
    } finally {
      activePollers.delete(ref);
    }
  })();
}

export async function executeSoraApproval({
  ref,
  ord,
  stored,
  chatId,
  messageId,
  isCaption = true,
  adminId = String(process.env.TG_ADMIN_ID || '').trim(),
  soraClient = soraRequest,
  waitMs = 2500,
}) {
  const effectiveOrd = {
    service: ord?.service || stored?.soraService || '',
    item: ord?.item || stored?.soraItem || '',
    quantity: ord?.quantity || stored?.soraQuantity || undefined,
    playerId: stored?.playerId || ord?.playerId || '',
    server: stored?.server || ord?.server || '',
    region: stored?.region || ord?.region || '',
    ref,
    tgUserId: stored?.tgUserId || ord?.tgUserId || '',
  };

  if (!effectiveOrd.service || (!effectiveOrd.item && !effectiveOrd.quantity)) {
    const updated = await updateOrder(ref, { status: 'manual_pending' });
    await editAdminMessage(
      chatId || stored?.adminChatId,
      messageId || stored?.adminMessageId,
      isCaption,
      [
        `🛠 <b>QO‘LDA BAJARING · ${escapeHtml(ref)}</b>`,
        `<b>O‘yin:</b> ${escapeHtml(stored?.gameName || 'Noma’lum')}`,
        `<b>Paket:</b> ${escapeHtml(stored?.packLabel || '')}`,
        `<b>ID:</b> <code>${escapeHtml(effectiveOrd.playerId)}</code>${effectiveOrd.server ? ` (${escapeHtml(effectiveOrd.server)})` : ''}`,
        `<i>Izoh: Ushbu xizmat qo‘lda bajariladi.</i>`,
      ].join('\n'),
      {
        inline_keyboard: [
          [
            { text: '✅ Qo‘lda bajarildi', callback_data: `mdone:${ref}` },
            { text: '❌ Rad etish', callback_data: `no:${ref}` },
          ],
        ],
      }
    );
    return { ok: true, manual: true, order: updated };
  }

  // Check live Sora availability and price for fixed-item services before spending balance
  let verifiedLivePrice;
  const effType = stored?.soraType || inferSoraTypeByService(effectiveOrd.service);
  if (effectiveOrd.item && effType !== 'smm') {
    const liveCat = await soraClient(`/catalog?service=${encodeURIComponent(effectiveOrd.service)}&lang=uz`, {
      method: 'GET',
      useCache: true,
    });
    if (liveCat.ok && Array.isArray(liveCat.data?.items)) {
      const liveItem = liveCat.data.items.find((it) => String(it.item) === String(effectiveOrd.item));
      if (liveItem) {
        if (liveItem.available === false) {
          return {
            ok: false,
            code: 'item_unavailable',
            error: `Tanlangan paket (${stored?.packLabel || effectiveOrd.item}) hozirda Sora omborida mavjud emas.`,
          };
        }
        if (stored?.priceUzs && Number(liveItem.your_price) > Number(stored.priceUzs)) {
          return {
            ok: false,
            code: 'wholesale_above_retail',
            error: `Sora ulgurji narxi (${liveItem.your_price} so‘m) sotuv narxidan (${stored.priceUzs} so‘m) yuqori!`,
          };
        }
        if (typeof liveItem.price === 'number') {
          verifiedLivePrice = liveItem.price;
        }
      }
    }
  }

  await updateOrder(ref, { status: 'processing', lastError: '' });
  await editAdminMessage(
    chatId || stored?.adminChatId,
    messageId || stored?.adminMessageId,
    isCaption,
    `⏳ <b>Yuborilmoqda...</b> (${escapeHtml(ref)})\nSora API orqali ${escapeHtml(stored?.packLabel || effectiveOrd.service)} jo‘natilmoqda...`,
    { inline_keyboard: [] }
  );

  const soraBody = buildSoraOrderBody(effectiveOrd, stored, verifiedLivePrice);
  const orderRes = await soraClient('/order', { method: 'POST', body: soraBody });

  if (!orderRes.ok || !orderRes.data?.order) {
    const code = orderRes.error?.code || 'unknown_error';
    const errMsg = orderRes.error?.message || 'Noma’lum Sora xatosi';
    await updateOrder(ref, { status: 'pending', lastError: `${code}: ${errMsg}` });
    return { ok: false, code, error: errMsg, effectiveOrd };
  }

  let soraOrder = orderRes.data.order;

  if (soraOrder.status === 'processing' && waitMs > 0) {
    await new Promise((r) => setTimeout(r, waitMs));
    const check = await soraClient(`/status?ref=${encodeURIComponent(ref)}`, { method: 'GET' });
    if (check.ok && check.data?.order) {
      soraOrder = check.data.order;
    }
  }

  const updated = await applySoraStatusOutcome({
    chatId: chatId || stored?.adminChatId,
    messageId: messageId || stored?.adminMessageId,
    isCaption,
    ord: effectiveOrd,
    stored,
    soraOrder,
    adminId,
    soraClient,
  });

  if (soraOrder.status === 'processing') {
    scheduleBackgroundSoraPoll({
      ref,
      ord: effectiveOrd,
      stored,
      chatId: chatId || stored?.adminChatId,
      messageId: messageId || stored?.adminMessageId,
      isCaption,
      adminId,
      soraClient,
    });
  }

  return { ok: true, order: updated, soraOrder };
}

/**
 * Shared update processor used by both Netlify webhook handler and local server polling.
 */
export async function processTelegramUpdate(update) {
  if (!update || typeof update !== 'object') return;
  const adminId = String(process.env.TG_ADMIN_ID || '').trim();
  const activeUser =
    update.message?.from ||
    update.edited_message?.from ||
    update.callback_query?.from ||
    update.inline_query?.from ||
    update.chosen_inline_result?.from ||
    update.pre_checkout_query?.from;
  if (activeUser?.id && String(activeUser.id) !== adminId) {
    try {
      await rememberTelegramCustomer(activeUser);
    } catch {
      console.error('[tg-webhook] Failed to record user activity');
    }
  }

  if (update.pre_checkout_query) {
    await handleSupportPreCheckout(update.pre_checkout_query);
    return;
  }

  // 1. Incoming text commands (customers & admin)
  if (update.message && update.message.chat) {
    if (update.message.successful_payment) {
      await handleSupportPayment(update.message);
      return;
    }
    const chatId = update.message.chat.id;
    const fromUser = update.message.from;
    const text = String(update.message.text || '').trim();
    const adminUser = isAdmin(fromUser);
    const webAppUrl = getMiniAppHttpsUrl();

    if (text === '/start' || text.startsWith('/start ') || text.startsWith('/start@') || text === '/help' || text === '/menu') {
      const firstName = escapeHtml(fromUser?.first_name || 'Do‘st');
      const coinState = fromUser?.id ? await getUserCoins(fromUser.id) : { balance: 0 };
      const lines = [
        `👋 <b>Assalomu alaykum, ${firstName}!</b>`,
        '',
        `<b>Olmos Pay</b> do‘koniga xush kelibsiz — PUBG Mobile UC, Free Fire, Mobile Legends, Bigo Live, Telegram Stars/Premium/Gifts va SMM xizmatlari.`,
        '',
        `⚡ Buyurtmalar tasdiqlangandan so‘ng <b>1 daqiqada</b> avtomatik tushadi!`,
        `🪙 Har bir xarid uchun tanga beriladi (60 UC = <b>6 tanga</b>). Balansingiz: <b>${coinState.balance} tanga</b> (/tanga)`,
        `🛒 Buyurtma berish uchun pastdagi <b>Do‘konni ochish</b> tugmasini bosing.`,
      ];

      if (adminUser) {
        lines.push(
          '',
          `🔐 <b>Admin buyruqlari:</b>`,
          `• /panel — Admin panelni ochish`,
          `• /balans — Sora balansini ko‘rish`,
          `• /xizmatlar — Sora faol xizmatlari`,
          `• /holat GP-XXXX — Buyurtma holatini tekshirish`
        );
      }

      await telegramApi('sendMessage', {
        chat_id: chatId,
        parse_mode: 'HTML',
        text: lines.join('\n'),
        reply_markup: {
          inline_keyboard: [[{ text: '🛒 Do‘konni ochish', web_app: { url: webAppUrl } }]],
        },
      });
      return;
    }

    if (text === '/tanga' || text.startsWith('/tanga@')) {
      const coinState = fromUser?.id ? await getUserCoins(fromUser.id) : { balance: 0, totalEarned: 0, history: [] };
      const recentLines = (coinState.history || [])
        .slice(0, 5)
        .map((h) => `• ${escapeHtml(h.gameName)} (${escapeHtml(h.packLabel)}) — <b>+${h.coins} tanga</b>`)
        .join('\n');
      await telegramApi('sendMessage', {
        chat_id: chatId,
        parse_mode: 'HTML',
        text: [
          `🪙 <b>Olmos Pay Tanga Balansingiz</b>`,
          '',
          `<b>Joriy balans:</b> ${coinState.balance} tanga`,
          `<b>Jami ishlangan:</b> ${coinState.totalEarned} tanga`,
          `<i>Har bir xizmatda 60 UC uchun 6 tanga (10%) beriladi.</i>`,
          recentLines ? `\n<b>So‘nggi tushumlar:</b>\n${recentLines}` : '',
        ]
          .filter(Boolean)
          .join('\n'),
        reply_markup: {
          inline_keyboard: [[{ text: '🛒 Do‘konni ochish', web_app: { url: webAppUrl } }]],
        },
      });
      return;
    }

    if (adminUser && (text === '/panel' || text.startsWith('/panel@'))) {
      const token = signAdminSessionToken(fromUser?.id || adminId);
      const base = webAppUrl.replace(/\/+$/, '');
      const panelUrl = token ? `${base}/panel?admin_token=${encodeURIComponent(token)}` : `${base}/panel`;
      await telegramApi('sendMessage', {
        chat_id: chatId,
        parse_mode: 'HTML',
        text: [
          `🛡 <b>Olmos Pay · Admin Panel</b>`,
          '',
          `Panelga Telegram Mini App ichidan yoki brauzerdan kirishingiz mumkin (havola 12 soat amal qiladi):`,
        ].join('\n'),
        reply_markup: {
          inline_keyboard: [
            [{ text: '🛡 Admin panel (Mini App)', web_app: { url: panelUrl } }],
            [{ text: '🌐 Brauzerda /panel ochish', url: panelUrl }],
          ],
        },
      });
      return;
    }

    if (!adminUser) {
      await telegramApi('sendMessage', {
        chat_id: chatId,
        parse_mode: 'HTML',
        text: `🛒 Buyurtma berish uchun <b>Do‘konni ochish</b> tugmasidan foydalaning:`,
        reply_markup: {
          inline_keyboard: [[{ text: '🛒 Do‘konni ochish', web_app: { url: webAppUrl } }]],
        },
      });
      return;
    }

    if (text === '/balans' || text.startsWith('/balans@')) {
      const me = await soraRequest('/me', { method: 'GET' });
      if (!me.ok) {
        await telegramApi('sendMessage', {
          chat_id: chatId,
          text: `❌ Sora balansini olishda xato: ${me.error?.message || me.error?.code || 'noma’lum'}`,
        });
      } else {
        const d = me.data;
        const limitText = d.daily_limit === 0 ? 'Cheksiz' : `${Number(d.daily_limit).toLocaleString('uz-UZ')} so‘m`;
        await telegramApi('sendMessage', {
          chat_id: chatId,
          parse_mode: 'HTML',
          text: [
            `💳 <b>Sora Reseller Balansi</b>`,
            `<b>Balans:</b> ${Number(d.balance).toLocaleString('uz-UZ')} ${escapeHtml(d.currency || 'UZS')}`,
            `<b>Chegirma:</b> ${Number(d.discount_percent || 0)}%`,
            `<b>Bugungi xarajat:</b> ${Number(d.spent_today || 0).toLocaleString('uz-UZ')} so‘m`,
            `<b>Kunlik limit:</b> ${escapeHtml(limitText)}`,
          ].join('\n'),
        });
      }
      return;
    }

    if (text === '/xizmatlar' || text.startsWith('/xizmatlar@')) {
      const svc = await soraRequest('/services', { method: 'GET' });
      if (!svc.ok || !Array.isArray(svc.data?.services)) {
        await telegramApi('sendMessage', {
          chat_id: chatId,
          text: `❌ Sora xizmatlarini olishda xato: ${svc.error?.message || svc.error?.code || 'noma’lum'}`,
        });
      } else {
        const list = svc.data.services
          .map((s) => `• <b>${escapeHtml(s.name)}</b> — <code>${escapeHtml(s.service)}</code> (${escapeHtml(s.type)})`)
          .join('\n');
        await telegramApi('sendMessage', {
          chat_id: chatId,
          parse_mode: 'HTML',
          text: `⚡ <b>Sora faol xizmatlari (${svc.data.services.length}):</b>\n\n${list}`,
        });
      }
      return;
    }

    if (text.startsWith('/holat')) {
      const ref = text.split(/\s+/)[1] || '';
      if (!/^[A-Za-z0-9_.:-]{1,64}$/.test(ref)) {
        await telegramApi('sendMessage', {
          chat_id: chatId,
          text: 'Foydalanish: /holat GP-XXXX-XXXX',
        });
        return;
      }
      const stored = await getOrder(ref);
      const soraRes = await soraRequest(`/status?ref=${encodeURIComponent(ref)}`, { method: 'GET' });
      const lines = [
        `📦 <b>Buyurtma:</b> <code>${escapeHtml(ref)}</code>`,
        stored ? `<b>Ichki holat:</b> ${escapeHtml(stored.status)}` : '<b>Ichki baza:</b> topilmadi',
        soraRes.ok && soraRes.data?.order
          ? `<b>Sora holati:</b> ${escapeHtml(soraRes.data.order.status)} (charged: ${soraRes.data.order.charged ?? '—'})`
          : `<b>Sora javobi:</b> ${escapeHtml(soraRes.error?.message || 'topilmadi')}`,
      ];
      await telegramApi('sendMessage', { chat_id: chatId, parse_mode: 'HTML', text: lines.join('\n') });
      return;
    }

    return;
  }

  // 2. Inline callback_query handling (strictly TG_ADMIN_ID only)
  const cq = update.callback_query;
  if (!cq) return;

  if (!isAdmin(cq.from)) {
    return;
  }

  const data = String(cq.data || '');
  const [action, ref] = data.split(':');
  if (!ref || !/^[A-Za-z0-9_.:-]{1,64}$/.test(ref)) {
    await telegramApi('answerCallbackQuery', { callback_query_id: cq.id, text: 'Noto‘g‘ri buyurtma kodi' });
    return;
  }

  const msg = cq.message;
  const chatId = msg.chat.id;
  const messageId = msg.message_id;
  const isCaption = typeof msg.caption === 'string';
  const rawContent = msg.caption || msg.text || '';
  const ord = parseOrdLine(rawContent);
  const stored = await getOrder(ref);

  if (action === 'no') {
    await telegramApi('answerCallbackQuery', { callback_query_id: cq.id, text: 'Buyurtma rad etildi' });
    const isCoinReward = stored?.sourceType === 'coin_reward';
    const cancellation = isCoinReward
      ? await cancelCoinRewardOrder(ref)
      : { order: await updateOrder(ref, { status: 'canceled' }), refundedCoins: 0 };
    await editAdminMessage(
      chatId,
      messageId,
      isCaption,
      `RAD ETILDI · ${escapeHtml(ref)}\nAdmin tomonidan bekor qilindi.${cancellation.refundedCoins ? ` ${cancellation.refundedCoins} tanga qaytarildi.` : ''}`,
      { inline_keyboard: [] }
    );
    await notifyCustomer(
      ord?.tgUserId || stored?.tgUserId,
      isCoinReward
        ? `Mukofot so‘rovingiz bekor qilindi. Buyurtma: <code>${escapeHtml(ref)}</code>${cancellation.refundedCoins ? `\n${cancellation.refundedCoins} tanga balansingizga qaytarildi.` : ''}`
        : `Buyurtmangiz rad etildi. Raqam: <code>${escapeHtml(ref)}</code>\nSabab: to‘lov tasdiqlanmadi.`
    );
    return;
  }

  if (action === 'mdone') {
    await telegramApi('answerCallbackQuery', { callback_query_id: cq.id, text: 'Qo‘lda bajarilgan deb belgilandi' });
    const doneOrd = await updateOrder(ref, { status: 'completed', customerNotifiedAt: Date.now() });
    const coinRes = await creditOrderCoins(doneOrd || { ...stored, ref, status: 'completed' });
    await editAdminMessage(
      chatId,
      messageId,
      isCaption,
      `✅ <b>QO‘LDA BAJARILDI · ${escapeHtml(ref)}</b>\nAdmin tomonidan tasdiqlandi.${coinRes.coins > 0 ? `\n🪙 +${coinRes.coins} tanga` : ''}`,
      { inline_keyboard: [] }
    );
    await notifyCustomer(
      ord?.tgUserId || stored?.tgUserId,
      `✅ <b>Buyurtmangiz bajarildi!</b>\nRaqam: <code>${escapeHtml(ref)}</code>\nPaket: ${escapeHtml(stored?.packLabel || '')}${
        coinRes.coins > 0 ? `\n\n🪙 <b>+${coinRes.coins} tanga</b> hisobingizga qo‘shildi!` : ''
      }`
    );
    return;
  }

  if (action === 'st') {
    await telegramApi('answerCallbackQuery', { callback_query_id: cq.id, text: 'Holat tekshirilmoqda...' });
    const statusRes = await soraRequest(`/status?ref=${encodeURIComponent(ref)}`, { method: 'GET' });
    if (!statusRes.ok || !statusRes.data?.order) {
      await telegramApi('sendMessage', {
        chat_id: chatId,
        text: `⚠️ ${ref} holatini olishda xato: ${statusRes.error?.message || statusRes.error?.code || 'noma’lum'}`,
      });
      return;
    }
    const effectiveOrd = ord || {
      service: stored?.soraService || '',
      item: stored?.soraItem || '',
      quantity: stored?.soraQuantity || undefined,
      playerId: stored?.playerId || '',
      server: stored?.server || '',
      region: stored?.region || '',
      ref,
      tgUserId: stored?.tgUserId || '',
    };
    await applySoraStatusOutcome({
      chatId,
      messageId,
      isCaption,
      ord: effectiveOrd,
      stored,
      soraOrder: statusRes.data.order,
      adminId,
    });
    return;
  }

  if (action === 'ok') {
    if (stored && (stored.status === 'processing' || stored.status === 'completed' || stored.status === 'canceled')) {
      await telegramApi('answerCallbackQuery', {
        callback_query_id: cq.id,
        text: `Allaqachon holati: ${stored.status}`,
      });
      return;
    }

    await telegramApi('answerCallbackQuery', { callback_query_id: cq.id, text: 'Tasdiqlandi! Sora orqali yuborilmoqda...' });

    if (!ord && !stored) {
      await editAdminMessage(
        chatId,
        messageId,
        isCaption,
        `⚠️ <b>Xatolik · ${escapeHtml(ref)}</b>\n#ORD qatori ham, buyurtma yozuvi ham topilmadi.`,
        { inline_keyboard: [[{ text: '✅ Qo‘lda bajarildi', callback_data: `mdone:${ref}` }]] }
      );
      return;
    }

    const res = await executeSoraApproval({
      ref,
      ord,
      stored,
      chatId,
      messageId,
      isCaption,
      adminId,
    });

    if (!res.ok) {
      const code = res.code || 'error';
      const errMsg = res.error || 'Sora xatosi';
      const ordLineRaw = rawContent.match(/#ORD[^\n]*/)?.[0] || '';

      if (code === 'insufficient_balance') {
        await editAdminMessage(
          chatId,
          messageId,
          isCaption,
          [
            `🚨 <b>BALANS YETARLI EMAS · ${escapeHtml(ref)}</b>`,
            `Sora hisobida mablag‘ yetishmayapti. Balansni to‘ldirib qayta «Tasdiqlash» bosing.`,
            ordLineRaw ? `<code>${escapeHtml(ordLineRaw)}</code>` : '',
          ]
            .filter(Boolean)
            .join('\n'),
          {
            inline_keyboard: [
              [
                { text: '✅ Qayta urinish', callback_data: `ok:${ref}` },
                { text: '❌ Rad etish', callback_data: `no:${ref}` },
              ],
            ],
          }
        );
      } else {
        await editAdminMessage(
          chatId,
          messageId,
          isCaption,
          [
            `❌ <b>SORA XATOSI (${escapeHtml(code)}) · ${escapeHtml(ref)}</b>`,
            `${escapeHtml(errMsg)}`,
            ordLineRaw ? `<code>${escapeHtml(ordLineRaw)}</code>` : '',
          ]
            .filter(Boolean)
            .join('\n'),
          {
            inline_keyboard: [
              [
                { text: '✅ Qayta urinish', callback_data: `ok:${ref}` },
                { text: '✅ Qo‘lda bajarildi', callback_data: `mdone:${ref}` },
                { text: '❌ Rad etish', callback_data: `no:${ref}` },
              ],
            ],
          }
        );
      }
    }
  }
}

export async function handler(event) {
  if (event.httpMethod !== 'POST') {
    return jsonResponse(405, { ok: false });
  }

  if (!verifyWebhookSecret(event.headers)) {
    return jsonResponse(401, { ok: false, error: 'Unauthorized webhook' });
  }

  let update;
  try {
    update = JSON.parse(event.body || '{}');
  } catch {
    return jsonResponse(400, { ok: false });
  }

  await processTelegramUpdate(update);
  return jsonResponse(200, { ok: true });
}
