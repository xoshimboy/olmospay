import crypto from 'node:crypto';
import { getStore } from '@netlify/blobs';
import { and, desc, eq, gt, like, lt, sql } from 'drizzle-orm';
import { getDatabase, olmosAppState, olmosOrders, olmosPromoCodes, olmosRateLimits } from './db.js';
import { CATALOG, PAYMENT_CARD, resolveCatalogPack } from './_catalog-map.js';

const SORA_BASE_URL = 'https://sorapay.xuss.us/reseller/v1';
const MAX_RECEIPT_BYTES = 3 * 1024 * 1024; // Keep base64 JSON payload below Vercel's 4.5 MB function limit
const AUTH_MAX_AGE_SECONDS = 86400; // 24 hours
const CATALOG_CACHE_TTL_MS = 120_000; // 2 minutes (respecting 30 req/min Sora limit)
const ADMIN_TOKEN_TTL_SEC = 12 * 3600; // 12 hours

// In-memory fallback stores for local dev / unit tests when Netlify Blobs context is unavailable
const memoryOrders = new Map();
const memoryAllOrderRefs = [];
const memoryUserOrders = new Map();
const memoryUserCoins = new Map();
const memoryTelegramCustomers = new Map();
const memoryRateLimits = new Map();
const memoryServiceMedia = new Map();
const memoryAdminMessageLogs = [];
let memoryCardSettings = null;
let memoryShopSettings = null;
const memoryPromoCodes = new Map();
const soraCache = new Map();
let telegramWebhookConfiguredAt = 0;

async function getAppStateValue(key) {
  const database = getDatabase();
  if (!database) return null;
  const [row] = await database
    .select({ value: olmosAppState.value })
    .from(olmosAppState)
    .where(eq(olmosAppState.key, key))
    .limit(1);
  return row?.value ?? null;
}

async function setAppStateValue(key, value) {
  const database = getDatabase();
  if (!database) return null;
  await database
    .insert(olmosAppState)
    .values({ key, value, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: olmosAppState.key,
      set: { value, updatedAt: new Date() },
    });
  return value;
}

export function getTelegramWebhookSecret() {
  const configured = String(process.env.TG_WEBHOOK_SECRET || '').trim();
  if (configured) return configured;
  const botToken = String(process.env.TG_BOT_TOKEN || '');
  return botToken ? crypto.createHmac('sha256', botToken).update('olmos-pay-telegram-webhook').digest('hex') : '';
}

export function getCorsHeaders(requestOrigin = '') {
  const allowedRaw = process.env.ALLOWED_ORIGIN || 'https://olmospay.vercel.app';
  const allowedList = allowedRaw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  for (const extra of [
    process.env.APP_URL,
    process.env.URL,
    process.env.VERCEL_PROJECT_PRODUCTION_URL,
    process.env.VERCEL_URL,
    'https://olmospay.vercel.app',
  ]) {
    const raw = String(extra || '').trim();
    if (!raw || raw.includes('MY_APP_URL')) continue;
    let clean;
    try {
      clean = raw.startsWith('http') ? new URL(raw).origin : `https://${raw}`;
    } catch {
      continue;
    }
    if (!allowedList.includes(clean)) allowedList.push(clean);
  }

  if (process.env.NODE_ENV !== 'production' || process.env.NETLIFY_DEV === 'true') {
    allowedList.push('http://localhost:3000', 'http://127.0.0.1:3000');
  }

  const origin = allowedList.includes(requestOrigin) ? requestOrigin : allowedList[0];
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Tg-Init-Data, X-Order-Token, X-Admin-Key, X-Admin-Token',
    Vary: 'Origin',
  };
}

export function jsonResponse(statusCode, payload, requestOrigin = '') {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      ...getCorsHeaders(requestOrigin),
    },
    body: JSON.stringify(payload),
  };
}

export function escapeHtml(str) {
  return String(str ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function sanitizeTarget(rawValue, inputType = 'player_id') {
  const trimmed = String(rawValue ?? '').trim();
  if (inputType === 'username') {
    const clean = trimmed.startsWith('@') ? trimmed.slice(1) : trimmed;
    if (!/^[A-Za-z0-9_]{3,32}$/.test(clean)) {
      return { ok: false, error: 'invalid_username' };
    }
    return { ok: true, value: clean, display: `@${clean}` };
  }

  if (inputType === 'url') {
    if (trimmed.length < 4 || trimmed.length > 200 || /[\s<>"'`]/.test(trimmed)) {
      return { ok: false, error: 'invalid_url' };
    }
    const normalized = /^https?:\/\//i.test(trimmed)
      ? trimmed
      : trimmed.startsWith('@')
        ? `https://t.me/${trimmed.slice(1)}`
        : `https://${trimmed}`;
    try {
      const parsed = new URL(normalized);
      if ((parsed.protocol !== 'https:' && parsed.protocol !== 'http:') || !parsed.hostname.includes('.')) {
        return { ok: false, error: 'invalid_url' };
      }
      return { ok: true, value: parsed.toString(), display: parsed.toString() };
    } catch {
      return { ok: false, error: 'invalid_url' };
    }
  }

  if (!/^[A-Za-z0-9_.:-]{3,32}$/.test(trimmed)) {
    return { ok: false, error: 'invalid_player_id' };
  }
  return { ok: true, value: trimmed, display: trimmed };
}

export function sanitizeServer(rawValue, required = false) {
  const trimmed = String(rawValue ?? '').trim();
  if (!trimmed) {
    return required ? { ok: false, error: 'server_required' } : { ok: true, value: '' };
  }
  if (!/^[A-Za-z0-9_-]{1,16}$/.test(trimmed)) {
    return { ok: false, error: 'invalid_server' };
  }
  return { ok: true, value: trimmed };
}

export function validateReceiptDataUrl(dataUrl) {
  if (typeof dataUrl !== 'string') {
    return { ok: false, error: 'receipt_required' };
  }
  const match = dataUrl.match(/^data:image\/(jpeg|jpg|png|webp);base64,([A-Za-z0-9+/=]+)$/i);
  if (!match) {
    return { ok: false, error: 'invalid_receipt_format' };
  }

  const ext = match[1].toLowerCase() === 'jpg' ? 'jpeg' : match[1].toLowerCase();
  const buffer = Buffer.from(match[2], 'base64');

  if (buffer.length < 64 || buffer.length > MAX_RECEIPT_BYTES) {
    return { ok: false, error: buffer.length > MAX_RECEIPT_BYTES ? 'receipt_too_large' : 'invalid_receipt_format' };
  }

  const isJpeg = buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  const isPng = buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47;
  const isWebp =
    buffer.length >= 12 &&
    buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buffer.subarray(8, 12).toString('ascii') === 'WEBP';

  if ((ext === 'jpeg' && !isJpeg) || (ext === 'png' && !isPng) || (ext === 'webp' && !isWebp)) {
    return { ok: false, error: 'invalid_receipt_magic' };
  }

  return {
    ok: true,
    mimeType: `image/${ext}`,
    ext: ext === 'jpeg' ? 'jpg' : ext,
    buffer,
    bytes: buffer.length,
  };
}

/**
 * Verifies Telegram Mini App `initData` via HMAC-SHA256 using TG_BOT_TOKEN.
 * Rejects signatures older than 24 hours.
 */
export function verifyTelegramInitData(initData, botToken, nowSec = Math.floor(Date.now() / 1000)) {
  if (!initData || typeof initData !== 'string') {
    return { valid: false, reason: 'missing_init_data', user: null };
  }
  if (!botToken) {
    return { valid: false, reason: 'bot_token_missing', user: null };
  }

  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  const authDate = Number(params.get('auth_date'));

  if (!hash || !/^[a-f0-9]{64}$/i.test(hash)) {
    return { valid: false, reason: 'invalid_hash_format', user: null };
  }
  if (!Number.isFinite(authDate) || nowSec - authDate > AUTH_MAX_AGE_SECONDS || authDate - nowSec > 300) {
    return { valid: false, reason: 'expired_init_data', user: null };
  }

  const pairs = [];
  for (const [k, v] of params.entries()) {
    if (k !== 'hash') pairs.push([k, v]);
  }
  pairs.sort((a, b) => a[0].localeCompare(b[0]));
  const dataCheckString = pairs.map(([k, v]) => `${k}=${v}`).join('\n');

  const secretKey = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
  const computedHex = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

  const a = Buffer.from(computedHex, 'hex');
  const b = Buffer.from(hash, 'hex');
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return { valid: false, reason: 'signature_mismatch', user: null };
  }

  let user = null;
  const userRaw = params.get('user');
  if (userRaw) {
    try {
      const parsed = JSON.parse(userRaw);
      if (parsed && parsed.id) {
        user = {
          id: String(parsed.id),
          username: parsed.username ? String(parsed.username).slice(0, 64) : '',
          first_name: parsed.first_name ? String(parsed.first_name).slice(0, 64) : '',
        };
      }
    } catch {
      return { valid: false, reason: 'invalid_user_json', user: null };
    }
  }

  return { valid: true, reason: null, user, authDate };
}

export function generateOrderRef() {
  const ts = Date.now().toString(36).toUpperCase();
  const rand = crypto.randomBytes(2).toString('hex').toUpperCase();
  return `GP-${ts}-${rand}`;
}

function getTokenSecret() {
  return (
    process.env.ORDER_TOKEN_SECRET ||
    process.env.TG_WEBHOOK_SECRET ||
    process.env.TG_BOT_TOKEN ||
    'local-dev-order-secret'
  );
}

export function signOrderToken(ref) {
  return crypto.createHmac('sha256', getTokenSecret()).update(String(ref)).digest('hex').slice(0, 32);
}

export function verifyOrderToken(ref, token) {
  if (!ref || !token || typeof token !== 'string') return false;
  const expected = signOrderToken(ref);
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(token, 'utf8');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function getAdminSessionSecret() {
  return (
    process.env.ADMIN_PANEL_KEY ||
    process.env.TG_WEBHOOK_SECRET ||
    process.env.TG_BOT_TOKEN ||
    process.env.ORDER_TOKEN_SECRET ||
    ''
  );
}

export function signAdminSessionToken(adminId, nowSec = Math.floor(Date.now() / 1000)) {
  const secret = getAdminSessionSecret();
  if (!secret || !adminId) return '';
  const exp = nowSec + ADMIN_TOKEN_TTL_SEC;
  const payload = `${String(adminId).trim()}.${exp}`;
  const sig = crypto.createHmac('sha256', secret).update(`panel:${payload}`).digest('hex').slice(0, 32);
  return `${payload}.${sig}`;
}

export function verifyAdminSessionToken(token, nowSec = Math.floor(Date.now() / 1000)) {
  const secret = getAdminSessionSecret();
  const expectedAdminId = String(process.env.TG_ADMIN_ID || '').trim();
  if (!secret || !expectedAdminId || !token || typeof token !== 'string') return false;
  const parts = token.trim().split('.');
  if (parts.length !== 3) return false;
  const [uid, expStr, sig] = parts;
  if (uid !== expectedAdminId) return false;
  const exp = Number(expStr);
  if (!Number.isFinite(exp) || exp < nowSec) return false;
  const expectedSig = crypto
    .createHmac('sha256', secret)
    .update(`panel:${uid}.${expStr}`)
    .digest('hex')
    .slice(0, 32);
  const a = Buffer.from(expectedSig, 'utf8');
  const b = Buffer.from(sig, 'utf8');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function cleanPipe(val) {
  return String(val ?? '').replaceAll('|', '').replace(/\s+/g, '').slice(0, 128);
}

export function inferSoraTypeByService(service) {
  const s = String(service || '').trim();
  if (s === 'gmvci7pul' || s === 'gmvci8gu6') return 'telegram';
  if (s === 'gmvgsbfg4') return 'gift';
  if (s === 'gmw3wk8p9') return 'nft';
  if (s === 'gmvqmt8mo') return 'smm';
  return 'game';
}

export function formatOrdLine({ service, item, quantity, playerId, server, region, ref, tgUserId }) {
  const cleanItem = cleanPipe(item || '');
  const cleanQty = quantity && Number(quantity) > 0 ? String(Math.round(Number(quantity))) : '';
  const itemSlot = cleanQty ? `${cleanItem}~${cleanQty}` : cleanItem || 'manual';
  return `#ORD ${cleanPipe(service || 'manual')}|${itemSlot}|${cleanPipe(playerId)}|${cleanPipe(server || '-')}|${cleanPipe(region || '-')}|${cleanPipe(ref)}|${cleanPipe(tgUserId || '-')}`;
}

export function parseOrdLine(text) {
  if (!text) return null;
  const match = String(text).match(
    /#ORD\s+([^\s|]*)\|([^\s|]*)\|([^\s|]*)\|([^\s|]*)\|([^\s|]*)\|([A-Za-z0-9_.:-]{1,64})\|([^\s|]*)/
  );
  if (!match) return null;
  const rawItem = match[2] === 'manual' ? '' : match[2];
  const [itemPart, qtyPart] = rawItem.split('~');
  const parsedQty = qtyPart && /^\d+$/.test(qtyPart) ? Number(qtyPart) : undefined;
  return {
    service: match[1] === 'manual' ? '' : match[1],
    item: itemPart || '',
    quantity: parsedQty,
    playerId: match[3],
    server: match[4] === '-' ? '' : match[4],
    region: match[5] === '-' ? '' : match[5],
    ref: match[6],
    tgUserId: match[7] === '-' ? '' : match[7],
  };
}

function getOrdersBlobStore() {
  try {
    if (process.env.NETLIFY === 'true' || process.env.NETLIFY_BLOBS_CONTEXT) {
      return getStore('gamepin-orders');
    }
  } catch {
    // Fallback to in-memory store outside Netlify runtime
  }
  return null;
}

export async function saveOrder(order) {
  const database = getDatabase();
  if (database) {
    await database
      .insert(olmosOrders)
      .values({
        ref: order.ref,
        tgUserId: order.tgUserId ? String(order.tgUserId) : null,
        orderData: order,
        createdAt: Number(order.createdAt || Date.now()),
        updatedAt: Number(order.updatedAt || Date.now()),
      })
      .onConflictDoUpdate({
        target: olmosOrders.ref,
        set: {
          tgUserId: order.tgUserId ? String(order.tgUserId) : null,
          orderData: order,
          updatedAt: Number(order.updatedAt || Date.now()),
        },
      });
    return order;
  }

  const store = getOrdersBlobStore();
  if (store) {
    await store.setJSON(`order:${order.ref}`, order);
    const allRefs = (await store.get('all-order-refs', { type: 'json' }).catch(() => null)) || [];
    const nextAll = [order.ref, ...allRefs.filter((r) => r !== order.ref)].slice(0, 100);
    await store.setJSON('all-order-refs', nextAll);

    if (order.tgUserId) {
      const key = `user:${order.tgUserId}`;
      const existing = (await store.get(key, { type: 'json' }).catch(() => null)) || [];
      const next = [order.ref, ...existing.filter((r) => r !== order.ref)].slice(0, 40);
      await store.setJSON(key, next);
    }
    return order;
  }

  memoryOrders.set(order.ref, order);
  const idx = memoryAllOrderRefs.indexOf(order.ref);
  if (idx !== -1) memoryAllOrderRefs.splice(idx, 1);
  memoryAllOrderRefs.unshift(order.ref);
  if (memoryAllOrderRefs.length > 100) memoryAllOrderRefs.length = 100;

  if (order.tgUserId) {
    const existing = memoryUserOrders.get(order.tgUserId) || [];
    memoryUserOrders.set(
      order.tgUserId,
      [order.ref, ...existing.filter((r) => r !== order.ref)].slice(0, 40)
    );
  }
  return order;
}

export async function getOrder(ref) {
  if (!ref || !/^[A-Za-z0-9_.:-]{1,64}$/.test(ref)) return null;
  const database = getDatabase();
  if (database) {
    const [row] = await database.select({ orderData: olmosOrders.orderData }).from(olmosOrders).where(eq(olmosOrders.ref, ref)).limit(1);
    return row?.orderData || null;
  }

  const store = getOrdersBlobStore();
  if (store) {
    return (await store.get(`order:${ref}`, { type: 'json' }).catch(() => null)) || null;
  }
  return memoryOrders.get(ref) || null;
}

export async function updateOrder(ref, patch) {
  const current = await getOrder(ref);
  if (!current) return null;
  const updated = { ...current, ...patch, updatedAt: Date.now() };
  await saveOrder(updated);
  return updated;
}

export async function deleteOrder(ref) {
  const order = await getOrder(ref);
  if (!order) return { ok: false, reason: 'not_found' };
  if (!['pending', 'manual_pending', 'canceled'].includes(order.status)) {
    return { ok: false, reason: 'protected_status' };
  }

  const database = getDatabase();
  if (database) {
    await database.delete(olmosOrders).where(eq(olmosOrders.ref, ref));
    return { ok: true };
  }

  const store = getOrdersBlobStore();
  if (store) {
    await store.delete(`order:${ref}`);
    const refs = (await store.get('all-order-refs', { type: 'json' }).catch(() => null)) || [];
    await store.setJSON('all-order-refs', refs.filter((item) => item !== ref));
    if (order.tgUserId) {
      const key = `user:${order.tgUserId}`;
      const userRefs = (await store.get(key, { type: 'json' }).catch(() => null)) || [];
      await store.setJSON(key, userRefs.filter((item) => item !== ref));
    }
    return { ok: true };
  }

  memoryOrders.delete(ref);
  const allIndex = memoryAllOrderRefs.indexOf(ref);
  if (allIndex !== -1) memoryAllOrderRefs.splice(allIndex, 1);
  if (order.tgUserId) {
    const userRefs = memoryUserOrders.get(String(order.tgUserId)) || [];
    memoryUserOrders.set(String(order.tgUserId), userRefs.filter((item) => item !== ref));
  }
  return { ok: true };
}

export async function getUserOrders(tgUserId) {
  if (!tgUserId) return [];
  const database = getDatabase();
  if (database) {
    const rows = await database
      .select({ orderData: olmosOrders.orderData })
      .from(olmosOrders)
      .where(eq(olmosOrders.tgUserId, String(tgUserId)))
      .orderBy(desc(olmosOrders.createdAt))
      .limit(20);
    return rows.map((row) => row.orderData).filter(Boolean);
  }

  const store = getOrdersBlobStore();
  let refs = [];
  if (store) {
    refs = (await store.get(`user:${tgUserId}`, { type: 'json' }).catch(() => null)) || [];
  } else {
    refs = memoryUserOrders.get(String(tgUserId)) || [];
  }
  const orders = await Promise.all(refs.slice(0, 20).map((ref) => getOrder(ref)));
  return orders.filter(Boolean);
}

export async function listAllOrders(limit = 60) {
  const database = getDatabase();
  if (database) {
    const safeLimit = Math.max(1, Math.min(100, Number(limit) || 60));
    const rows = await database
      .select({ orderData: olmosOrders.orderData })
      .from(olmosOrders)
      .orderBy(desc(olmosOrders.createdAt))
      .limit(safeLimit);
    return rows.map((row) => row.orderData).filter(Boolean);
  }

  const store = getOrdersBlobStore();
  let refs = [];
  if (store) {
    refs = (await store.get('all-order-refs', { type: 'json' }).catch(() => null)) || [];
  } else {
    refs = [...memoryAllOrderRefs];
  }
  const orders = await Promise.all(refs.slice(0, limit).map((ref) => getOrder(ref)));
  return orders.filter(Boolean);
}

export async function rememberTelegramCustomer(user) {
  const id = String(user?.id || '').trim();
  if (!/^\d{1,20}$/.test(id)) return null;

  const customer = {
    id,
    username: String(user?.username || '').trim().slice(0, 64),
    firstName: String(user?.first_name || '').trim().slice(0, 64),
    lastName: String(user?.last_name || '').trim().slice(0, 64),
  };
  const database = getDatabase();
  if (database) {
    await setAppStateValue(`telegram-customer:${id}`, customer);
  } else {
    memoryTelegramCustomers.set(id, customer);
  }
  return customer;
}

export async function listTelegramCustomerIds() {
  const database = getDatabase();
  if (database) {
    const [orderRows, customerRows] = await Promise.all([
      database
        .selectDistinct({ tgUserId: olmosOrders.tgUserId })
        .from(olmosOrders)
        .where(sql`${olmosOrders.tgUserId} is not null and ${olmosOrders.tgUserId} <> ''`),
      database.select({ key: olmosAppState.key }).from(olmosAppState).where(like(olmosAppState.key, 'telegram-customer:%')),
    ]);
    const orderIds = orderRows.map((row) => String(row.tgUserId || '').trim());
    const registeredIds = customerRows.map(({ key }) => key.slice('telegram-customer:'.length));
    return [...new Set([...orderIds, ...registeredIds].filter(Boolean))];
  }

  const orders = await listAllOrders(10000);
  const orderIds = orders.map((order) => String(order.tgUserId || '').trim());
  return [...new Set([...memoryTelegramCustomers.keys(), ...orderIds].filter(Boolean))];
}

export async function getAdminMessageLogs(limit = 20) {
  const database = getDatabase();
  const stored = database ? await getAppStateValue('admin-message-logs') : memoryAdminMessageLogs;
  const safeLimit = Math.max(1, Math.min(50, Number(limit) || 20));
  return Array.isArray(stored) ? stored.slice(0, safeLimit) : [];
}

export async function recordAdminMessageLog(entry) {
  const log = {
    id: crypto.randomUUID(),
    createdAt: Date.now(),
    target: ['broadcast', 'admin', 'custom'].includes(String(entry.target)) ? String(entry.target) : 'admin',
    preview: String(entry.preview || '').slice(0, 220),
    totalTargets: Math.max(0, Number(entry.totalTargets) || 0),
    sentCount: Math.max(0, Number(entry.sentCount) || 0),
    failedCount: Math.max(0, Number(entry.failedCount) || 0),
    status: ['sent', 'partial', 'failed'].includes(String(entry.status)) ? String(entry.status) : 'failed',
  };
  const database = getDatabase();
  const previous = database ? await getAdminMessageLogs(50) : memoryAdminMessageLogs;
  const logs = [log, ...previous].slice(0, 50);

  if (database) {
    await setAppStateValue('admin-message-logs', logs);
  } else {
    memoryAdminMessageLogs.splice(0, memoryAdminMessageLogs.length, ...logs);
  }

  return logs;
}

export async function getUserCoins(tgUserId) {
  const uid = String(tgUserId || '').trim();
  if (!uid) {
    return { balance: 0, totalEarned: 0, history: [] };
  }
  const database = getDatabase();
  const store = getOrdersBlobStore();
  let data = null;
  if (database) {
    data = await getAppStateValue(`coins:${uid}`);
  } else if (store) {
    data = await store.get(`coins:${uid}`, { type: 'json' }).catch(() => null);
  } else {
    data = memoryUserCoins.get(uid) || null;
  }
  if (!data || typeof data !== 'object') {
    return { balance: 0, totalEarned: 0, history: [] };
  }
  return {
    balance: Number(data.balance || 0),
    totalEarned: Number(data.totalEarned || 0),
    history: Array.isArray(data.history) ? data.history : [],
  };
}

export async function creditOrderCoins(order) {
  if (!order || !order.ref || order.status !== 'completed') {
    return { credited: false, coins: 0, newBalance: null };
  }
  const latest = (await getOrder(order.ref)) || order;
  if (latest.coinsCreditedAt) {
    const existing = latest.tgUserId ? await getUserCoins(latest.tgUserId) : null;
    return {
      credited: false,
      coins: Number(latest.coinsReward || 0),
      newBalance: existing ? existing.balance : null,
    };
  }

  let reward = Number(latest.coinsReward || 0);
  if (!reward && latest.gameId && latest.packId) {
    const resolved = resolveCatalogPack(latest.gameId, latest.packId);
    if (resolved) reward = resolved.coinsReward;
  }
  if (reward <= 0) {
    return { credited: false, coins: 0, newBalance: null };
  }

  const now = Date.now();
  await updateOrder(latest.ref, {
    coinsReward: reward,
    coinsCreditedAt: now,
  });

  const uid = String(latest.tgUserId || '').trim();
  if (!uid) {
    return { credited: true, coins: reward, newBalance: null };
  }

  const current = await getUserCoins(uid);
  if (current.history.some((h) => h.ref === latest.ref)) {
    return { credited: false, coins: reward, newBalance: current.balance };
  }

  const next = {
    balance: current.balance + reward,
    totalEarned: current.totalEarned + reward,
    history: [
      {
        ref: latest.ref,
        gameName: latest.gameName || latest.gameId,
        packLabel: latest.packLabel || latest.packId,
        coins: reward,
        at: now,
      },
      ...current.history,
    ].slice(0, 50),
  };

  const database = getDatabase();
  const store = getOrdersBlobStore();
  if (database) {
    await setAppStateValue(`coins:${uid}`, next);
  } else if (store) {
    await store.setJSON(`coins:${uid}`, next);
  } else {
    memoryUserCoins.set(uid, next);
  }

  return { credited: true, coins: reward, newBalance: next.balance };
}

function getMediaBlobStore() {
  try {
    if (process.env.NETLIFY === 'true' || process.env.NETLIFY_BLOBS_CONTEXT) {
      return getStore('gamepin-media');
    }
  } catch {
    // Fallback to in-memory store outside Netlify runtime
  }
  return null;
}

export async function getAllServiceMedia() {
  const database = getDatabase();
  if (database) {
    const rows = await database
      .select({ key: olmosAppState.key, value: olmosAppState.value })
      .from(olmosAppState)
      .where(like(olmosAppState.key, 'service-media:%'));
    return Object.fromEntries(rows.map(({ key, value }) => [key.slice('service-media:'.length), value]));
  }

  const store = getMediaBlobStore();
  if (store) {
    const data = (await store.get('service-covers', { type: 'json' }).catch(() => null)) || {};
    return typeof data === 'object' && data ? data : {};
  }
  return Object.fromEntries(memoryServiceMedia.entries());
}

export async function saveServiceMedia(gameId, dataUrl) {
  const cleanId = String(gameId || '').trim();
  if (!/^(?:[a-z0-9-]{2,32}|pack:[a-z0-9_-]{2,48})$/.test(cleanId)) {
    throw new Error('invalid_game_id');
  }
  const database = getDatabase();
  if (database) {
    await setAppStateValue(`service-media:${cleanId}`, dataUrl);
    return getAllServiceMedia();
  }

  const store = getMediaBlobStore();
  if (store) {
    const current = await getAllServiceMedia();
    current[cleanId] = dataUrl;
    await store.setJSON('service-covers', current);
    return current;
  }
  memoryServiceMedia.set(cleanId, dataUrl);
  return Object.fromEntries(memoryServiceMedia.entries());
}

export async function deleteServiceMedia(gameId) {
  const cleanId = String(gameId || '').trim();
  if (!/^(?:[a-z0-9-]{2,32}|pack:[a-z0-9_-]{2,48})$/.test(cleanId)) {
    throw new Error('invalid_game_id');
  }
  const database = getDatabase();
  if (database) {
    await database.delete(olmosAppState).where(eq(olmosAppState.key, `service-media:${cleanId}`));
    return getAllServiceMedia();
  }

  const store = getMediaBlobStore();
  if (store) {
    const current = await getAllServiceMedia();
    delete current[cleanId];
    await store.setJSON('service-covers', current);
    return current;
  }
  memoryServiceMedia.delete(cleanId);
  return Object.fromEntries(memoryServiceMedia.entries());
}

export async function getCardSettings() {
  const database = getDatabase();
  if (database) {
    const saved = await getAppStateValue('card-settings');
    if (saved && saved.number && saved.holder) return saved;
    return { ...PAYMENT_CARD };
  }

  const store = getMediaBlobStore();
  if (store) {
    const saved = await store.get('store-card', { type: 'json' }).catch(() => null);
    if (saved && saved.number && saved.holder) return saved;
  } else if (memoryCardSettings) {
    return memoryCardSettings;
  }
  return { ...PAYMENT_CARD };
}

export async function saveCardSettings({ number, holder, bank }) {
  const cleanNumber = String(number || '')
    .replace(/[^0-9 ]/g, '')
    .trim()
    .slice(0, 24);
  const cleanHolder = String(holder || '').trim().slice(0, 48);
  const cleanBank = String(bank || '').trim().slice(0, 48);
  if (cleanNumber.replace(/\s+/g, '').length < 16 || !cleanHolder || !cleanBank) {
    throw new Error('invalid_card_settings');
  }
  const next = {
    number: cleanNumber.replace(/\s+/g, '').replace(/(\d{4})(?=\d)/g, '$1 '),
    holder: cleanHolder,
    bank: cleanBank,
  };
  const database = getDatabase();
  if (database) {
    await setAppStateValue('card-settings', next);
    return next;
  }

  const store = getMediaBlobStore();
  if (store) {
    await store.setJSON('store-card', next);
  } else {
    memoryCardSettings = next;
  }
  return next;
}

const DEFAULT_STOREFRONT_SETTINGS = {
  priceOverrides: {},
  mandatorySubscription: false,
  subscriptionChannelId: '',
  subscriptionLink: '',
  proofChannelId: '',
};

function cleanPriceOverrides(input) {
  const clean = {};
  if (!input || typeof input !== 'object' || Array.isArray(input)) return clean;
  for (const game of CATALOG) {
    const requested = input[game.id];
    if (!requested || typeof requested !== 'object' || Array.isArray(requested)) continue;
    const packs = {};
    for (const pack of game.packs) {
      const price = Number(requested[pack.id]);
      if (Number.isSafeInteger(price) && price >= 1 && price <= 100_000_000) packs[pack.id] = price;
    }
    if (Object.keys(packs).length) clean[game.id] = packs;
  }
  return clean;
}

function cleanTelegramChannelId(value) {
  let channelId = String(value || '').trim();
  if (!channelId) return '';

  if (/^https:\/\/(?:www\.)?(?:t\.me|telegram\.me)\//i.test(channelId)) {
    try {
      const url = new URL(channelId);
      const [username, extraPath] = url.pathname.split('/').filter(Boolean);
      if (
        ['t.me', 'www.t.me', 'telegram.me', 'www.telegram.me'].includes(url.hostname.toLowerCase()) &&
        username &&
        !extraPath &&
        /^[A-Za-z0-9_]{5,32}$/.test(username)
      ) {
        channelId = `@${username}`;
      }
    } catch {
      throw new Error('invalid_telegram_channel');
    }
  }

  if (/^@[A-Za-z0-9_]{5,32}$/.test(channelId) || /^-100\d{5,16}$/.test(channelId)) return channelId;
  throw new Error('invalid_telegram_channel');
}

function cleanTelegramChannelLink(value) {
  const link = String(value || '').trim();
  if (!link) return '';
  try {
    const url = new URL(link);
    if (url.protocol === 'https:' && (url.hostname === 't.me' || url.hostname === 'telegram.me')) return url.toString();
  } catch {
    // Reject non-URL channel links below.
  }
  throw new Error('invalid_telegram_link');
}

export async function getStorefrontSettings() {
  const database = getDatabase();
  const stored = database ? await getAppStateValue('storefront-settings') : memoryShopSettings;
  return {
    ...DEFAULT_STOREFRONT_SETTINGS,
    ...(stored && typeof stored === 'object' ? stored : {}),
    priceOverrides: cleanPriceOverrides(stored?.priceOverrides),
  };
}

export async function saveStorefrontSettings(input = {}) {
  const current = await getStorefrontSettings();
  const next = {
    priceOverrides: input.priceOverrides === undefined ? current.priceOverrides : cleanPriceOverrides(input.priceOverrides),
    mandatorySubscription: input.mandatorySubscription === undefined
      ? current.mandatorySubscription
      : input.mandatorySubscription === true,
    subscriptionChannelId: input.subscriptionChannelId === undefined
      ? current.subscriptionChannelId
      : cleanTelegramChannelId(input.subscriptionChannelId),
    subscriptionLink: input.subscriptionLink === undefined
      ? current.subscriptionLink
      : cleanTelegramChannelLink(input.subscriptionLink),
    proofChannelId: input.proofChannelId === undefined
      ? current.proofChannelId
      : cleanTelegramChannelId(input.proofChannelId),
  };
  if (next.mandatorySubscription && !next.subscriptionChannelId) {
    throw new Error('subscription_channel_required');
  }
  const database = getDatabase();
  if (database) await setAppStateValue('storefront-settings', next);
  else memoryShopSettings = next;
  return next;
}

function normalizePromoCode(value) {
  const code = String(value || '').trim().toUpperCase();
  if (!/^[A-Z0-9_-]{3,32}$/.test(code)) throw new Error('invalid_promo_code');
  return code;
}

export async function listPromoCodes() {
  const database = getDatabase();
  if (database) {
    return database.select().from(olmosPromoCodes).orderBy(desc(olmosPromoCodes.createdAt)).limit(100);
  }
  return [...memoryPromoCodes.values()].sort((a, b) => b.createdAt - a.createdAt).slice(0, 100);
}

export async function getPromoCode(value) {
  let code;
  try {
    code = normalizePromoCode(value);
  } catch {
    return null;
  }
  const database = getDatabase();
  if (database) {
    const [row] = await database.select().from(olmosPromoCodes).where(eq(olmosPromoCodes.code, code)).limit(1);
    return row || null;
  }
  return memoryPromoCodes.get(code) || null;
}

export async function savePromoCode({ code: rawCode, maxUses }) {
  const code = normalizePromoCode(rawCode);
  const uses = Number(maxUses);
  if (!Number.isSafeInteger(uses) || uses < 1 || uses > 1_000_000) throw new Error('invalid_promo_limit');
  const database = getDatabase();
  if (database) {
    const [saved] = await database
      .insert(olmosPromoCodes)
      .values({ code, discountPercent: 2, maxUses: uses, usedCount: 0, enabled: true, createdAt: Date.now() })
      .onConflictDoUpdate({
        target: olmosPromoCodes.code,
        set: { discountPercent: 2, maxUses: uses, enabled: true },
      })
      .returning();
    return saved;
  }
  const existing = memoryPromoCodes.get(code);
  const saved = { code, discountPercent: 2, maxUses: uses, usedCount: existing?.usedCount || 0, enabled: true, createdAt: existing?.createdAt || Date.now() };
  memoryPromoCodes.set(code, saved);
  return saved;
}

export async function setPromoCodeEnabled(value, enabled) {
  const code = normalizePromoCode(value);
  const database = getDatabase();
  if (database) {
    await database.update(olmosPromoCodes).set({ enabled: enabled === true }).where(eq(olmosPromoCodes.code, code));
    return getPromoCode(code);
  }
  const existing = memoryPromoCodes.get(code);
  if (!existing) return null;
  const updated = { ...existing, enabled: enabled === true };
  memoryPromoCodes.set(code, updated);
  return updated;
}

export async function deletePromoCode(value) {
  const code = normalizePromoCode(value);
  const database = getDatabase();
  if (database) {
    const [deleted] = await database.delete(olmosPromoCodes).where(eq(olmosPromoCodes.code, code)).returning({ code: olmosPromoCodes.code });
    return Boolean(deleted);
  }
  return memoryPromoCodes.delete(code);
}

export async function consumePromoCode(value) {
  const code = normalizePromoCode(value);
  const database = getDatabase();
  if (database) {
    const [used] = await database
      .update(olmosPromoCodes)
      .set({ usedCount: sql`${olmosPromoCodes.usedCount} + 1` })
      .where(and(eq(olmosPromoCodes.code, code), eq(olmosPromoCodes.enabled, true), lt(olmosPromoCodes.usedCount, olmosPromoCodes.maxUses)))
      .returning();
    return used || null;
  }
  const existing = memoryPromoCodes.get(code);
  if (!existing?.enabled || existing.usedCount >= existing.maxUses) return null;
  const updated = { ...existing, usedCount: existing.usedCount + 1 };
  memoryPromoCodes.set(code, updated);
  return updated;
}

export async function releasePromoUse(value) {
  const code = normalizePromoCode(value);
  const database = getDatabase();
  if (database) {
    await database
      .update(olmosPromoCodes)
      .set({ usedCount: sql`${olmosPromoCodes.usedCount} - 1` })
      .where(and(eq(olmosPromoCodes.code, code), gt(olmosPromoCodes.usedCount, 0)));
    return;
  }
  const existing = memoryPromoCodes.get(code);
  if (existing && existing.usedCount > 0) memoryPromoCodes.set(code, { ...existing, usedCount: existing.usedCount - 1 });
}

export async function checkTelegramChannelMembership(userId, settings) {
  if (!settings?.mandatorySubscription) return { configured: false, subscribed: true, channelLink: '' };
  const channelId = String(settings.subscriptionChannelId || '').trim();
  let channelLink = String(settings.subscriptionLink || '').trim();
  if (!channelLink && channelId.startsWith('@')) channelLink = `https://t.me/${channelId.slice(1)}`;
  if (!userId || !process.env.TG_BOT_TOKEN || !channelId) {
    return { configured: true, subscribed: false, channelLink, error: 'Telegram orqali tekshirish imkoni yo‘q.' };
  }
  const result = await telegramApi('getChatMember', { chat_id: channelId, user_id: Number(userId) });
  const member = result?.result;
  const subscribed = Boolean(result?.ok && (
    member?.status === 'creator' || member?.status === 'administrator' || member?.status === 'member' ||
    (member?.status === 'restricted' && member?.is_member === true)
  ));
  return {
    configured: true,
    subscribed,
    channelLink,
    error: result?.ok ? '' : result?.description || 'Kanal a’zoligini tekshirib bo‘lmadi.',
  };
}

export function verifyAdminAccess({ headers = {}, initData = '', adminKey = '', adminToken = '' } = {}) {
  const botToken = process.env.TG_BOT_TOKEN || '';
  const tgAdminId = String(process.env.TG_ADMIN_ID || '').trim();
  const panelSecret = String(process.env.ADMIN_PANEL_KEY || '').trim();

  const normalizedHeaders = Object.fromEntries(
    Object.entries(headers).map(([k, v]) => [k.toLowerCase(), String(v || '')])
  );

  const effectiveInitData = String(initData || normalizedHeaders['x-tg-init-data'] || '');
  // 1. Telegram Mini App admin verification
  if (effectiveInitData && botToken && tgAdminId) {
    const auth = verifyTelegramInitData(effectiveInitData, botToken);
    if (auth.valid && auth.user && String(auth.user.id) === tgAdminId) {
      return { ok: true, mode: 'telegram' };
    }
  }

  // 2. Signed /panel one-tap token sent by Telegram bot
  const effectiveToken = String(adminToken || normalizedHeaders['x-admin-token'] || '').trim();
  if (effectiveToken && verifyAdminSessionToken(effectiveToken)) {
    return { ok: true, mode: 'bot-token' };
  }

  // 3. Admin Panel secret key (timing-safe)
  const providedKey = String(adminKey || normalizedHeaders['x-admin-key'] || '').trim();
  if (panelSecret && providedKey) {
    const a = Buffer.from(panelSecret, 'utf8');
    const b = Buffer.from(providedKey, 'utf8');
    if (a.length === b.length && crypto.timingSafeEqual(a, b)) {
      return { ok: true, mode: 'key' };
    }
  }

  // 4. Allow unconfigured local/AI Studio preview when not on Netlify and no admin secrets exist
  const isUnconfiguredPreview =
    process.env.NETLIFY !== 'true' &&
    !process.env.NETLIFY_BLOBS_CONTEXT &&
    !panelSecret &&
    (!tgAdminId || !botToken);
  if (isUnconfiguredPreview) {
    return { ok: true, mode: 'preview' };
  }

  return { ok: false, reason: 'unauthorized', hasPanelSecret: Boolean(panelSecret) };
}

export async function checkRateLimit(key, maxRequests = 10, windowMs = 60_000) {
  const now = Date.now();
  const database = getDatabase();
  if (database) {
    const rateKey = crypto.createHash('sha256').update(key).digest('hex').slice(0, 24);
    const [record] = await database
      .insert(olmosRateLimits)
      .values({ rateKey, windowStartedAt: now, hits: 1 })
      .onConflictDoUpdate({
        target: olmosRateLimits.rateKey,
        set: {
          windowStartedAt: sql`CASE WHEN ${now} - ${olmosRateLimits.windowStartedAt} >= ${windowMs} THEN ${now} ELSE ${olmosRateLimits.windowStartedAt} END`,
          hits: sql`CASE WHEN ${now} - ${olmosRateLimits.windowStartedAt} >= ${windowMs} THEN 1 ELSE ${olmosRateLimits.hits} + 1 END`,
        },
      })
      .returning({ windowStartedAt: olmosRateLimits.windowStartedAt, hits: olmosRateLimits.hits });

    if (record.hits > maxRequests) {
      return {
        allowed: false,
        retryAfterSec: Math.max(1, Math.ceil((windowMs - (now - record.windowStartedAt)) / 1000)),
      };
    }
    return { allowed: true, remaining: maxRequests - record.hits };
  }

  const store = getOrdersBlobStore();

  if (store) {
    const rlKey = `rl:${crypto.createHash('sha256').update(key).digest('hex').slice(0, 24)}`;
    const record = (await store.get(rlKey, { type: 'json' }).catch(() => null)) || { timestamps: [] };
    const recent = record.timestamps.filter((t) => now - t < windowMs);
    if (recent.length >= maxRequests) {
      return { allowed: false, retryAfterSec: Math.ceil((windowMs - (now - recent[0])) / 1000) };
    }
    recent.push(now);
    await store.setJSON(rlKey, { timestamps: recent });
    return { allowed: true, remaining: maxRequests - recent.length };
  }

  const recent = (memoryRateLimits.get(key) || []).filter((t) => now - t < windowMs);
  if (recent.length >= maxRequests) {
    return { allowed: false, retryAfterSec: Math.ceil((windowMs - (now - recent[0])) / 1000) };
  }
  recent.push(now);
  memoryRateLimits.set(key, recent);
  return { allowed: true, remaining: maxRequests - recent.length };
}

export function getClientIp(headers = {}) {
  const normalized = Object.fromEntries(
    Object.entries(headers).map(([k, v]) => [k.toLowerCase(), String(v || '')])
  );
  const raw =
    normalized['x-nf-client-connection-ip'] ||
    normalized['x-forwarded-for']?.split(',')[0]?.trim() ||
    normalized['client-ip'] ||
    'unknown';
  return raw.slice(0, 64);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function soraRequest(pathAndQuery, { method = 'GET', body = null, useCache = false, retryCount = 0 } = {}) {
  const apiKey = process.env.SORA_API_KEY;
  if (!apiKey) {
    return {
      ok: false,
      status: 503,
      error: { code: 'sora_not_configured', message: 'SORA_API_KEY sozlanmagan' },
    };
  }

  const cacheKey = `${method}:${pathAndQuery}`;
  if (useCache && method === 'GET') {
    const cached = soraCache.get(cacheKey);
    if (cached && Date.now() - cached.ts < CATALOG_CACHE_TTL_MS) {
      return cached.data;
    }
  }

  const url = `${SORA_BASE_URL}${pathAndQuery}`;
  const response = await fetch(url, {
    method,
    headers: {
      'X-API-Key': apiKey,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  let data = null;
  try {
    data = await response.json();
  } catch {
    data = { ok: false, error: { code: 'invalid_json', message: 'Sora javobi o‘qilmadi' } };
  }

  if (response.status === 429 && retryCount < 1) {
    const retryAfterSec = Math.min(Number(response.headers.get('Retry-After')) || 2, 4);
    await sleep(retryAfterSec * 1000);
    return soraRequest(pathAndQuery, { method, body, useCache, retryCount: retryCount + 1 });
  }

  if (response.status === 409 && method === 'POST' && retryCount < 1) {
    await sleep(1500);
    return soraRequest(pathAndQuery, { method, body, useCache, retryCount: retryCount + 1 });
  }

  if (!response.ok || data?.ok === false) {
    return {
      ok: false,
      status: response.status,
      error: data?.error || { code: `http_${response.status}`, message: 'Sora API xatosi' },
    };
  }

  const result = { ok: true, status: response.status, data };
  if (useCache && method === 'GET') {
    soraCache.set(cacheKey, { ts: Date.now(), data: result });
  }
  return result;
}

export async function telegramApi(method, payload, isMultipart = false) {
  const token = process.env.TG_BOT_TOKEN;
  if (!token) {
    return { ok: false, description: 'TG_BOT_TOKEN not configured' };
  }

  const url = `https://api.telegram.org/bot${token}/${method}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: isMultipart ? undefined : { 'Content-Type': 'application/json' },
    body: isMultipart ? payload : JSON.stringify(payload),
  });
  return res.json().catch(() => ({ ok: false, description: 'Invalid Telegram response' }));
}

async function ensureTelegramCommandScopes() {
  const me = await telegramApi('getMe', {});
  if (!me?.ok || !me.result?.id) return { ok: false, error: me?.description || 'Telegram bot token invalid' };

  const adminId = String(process.env.TG_ADMIN_ID || '').trim();
  const marker = `v1:${me.result.id}:${adminId}`;
  if ((await getAppStateValue('telegram-command-scopes')) === marker) return { ok: true, cached: true };

  const customerCommands = [
    { command: 'start', description: 'Do‘konni ochish va boshlash' },
    { command: 'tanga', description: 'Olmos tanga balansim (60 UC = 6 tanga)' },
  ];
  const globalResult = await telegramApi('setMyCommands', { commands: customerCommands });
  if (!globalResult?.ok) return { ok: false, error: globalResult?.description || 'Customer commands setup failed' };

  if (adminId) {
    const adminResult = await telegramApi('setMyCommands', {
      scope: { type: 'chat', chat_id: adminId },
      commands: [
        ...customerCommands,
        { command: 'panel', description: 'Admin panelni ochish' },
        { command: 'balans', description: 'Sora balansini tekshirish' },
        { command: 'xizmatlar', description: 'Sora faol xizmatlari' },
        { command: 'holat', description: 'Buyurtma holatini tekshirish' },
      ],
    });
    if (!adminResult?.ok) return { ok: false, error: adminResult?.description || 'Admin commands setup failed' };
  }

  await setAppStateValue('telegram-command-scopes', marker);
  return { ok: true };
}

export async function ensureTelegramWebhook() {
  if (process.env.VERCEL_ENV !== 'production' || !process.env.TG_BOT_TOKEN) {
    return { ok: false, skipped: true };
  }
  if (Date.now() - telegramWebhookConfiguredAt < 5 * 60_000) {
    return { ok: true, cached: true };
  }

  const host =
    process.env.OLMOSPAY_APP_URL ||
    process.env.VERCEL_PROJECT_PRODUCTION_URL ||
    process.env.APP_URL ||
    process.env.URL ||
    'https://olmospay.vercel.app';
  let baseUrl;
  try {
    const parsed = new URL(host.startsWith('http') ? host : `https://${host}`);
    if (parsed.protocol !== 'https:') return { ok: false, error: 'Telegram webhook requires HTTPS' };
    baseUrl = parsed.origin;
  } catch {
    return { ok: false, error: 'Production URL is invalid' };
  }

  const url = `${baseUrl}/.netlify/functions/tg-webhook`;
  const info = await telegramApi('getWebhookInfo', {});
  if (!info?.ok || info.result?.url !== url) {
    const result = await telegramApi('setWebhook', {
      url,
      secret_token: getTelegramWebhookSecret(),
      allowed_updates: ['message', 'callback_query'],
    });
    if (!result?.ok) {
      return { ok: false, error: result?.description || 'Telegram webhook setup failed' };
    }
  }

  let commands = { ok: false, error: 'Telegram commands setup did not run' };
  try {
    commands = await ensureTelegramCommandScopes();
  } catch {
    commands = { ok: false, error: 'Telegram command setup could not be persisted' };
  }
  if (!commands.ok) console.error('[Telegram commands setup error]', commands.error);
  telegramWebhookConfiguredAt = Date.now();
  return { ok: true, url, commandsConfigured: commands.ok };
}
