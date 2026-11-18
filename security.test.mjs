import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {
  creditOrderCoins,
  escapeHtml,
  formatOrdLine,
  generateOrderRef,
  getOrder,
  getUserCoins,
  parseOrdLine,
  sanitizeServer,
  sanitizeTarget,
  saveOrder,
  signAdminSessionToken,
  validateReceiptDataUrl,
  verifyAdminSessionToken,
  verifyTelegramInitData,
} from './_lib.js';
import { calculatePackCoins, resolveCatalogPack, SORA_SERVICES } from './_catalog-map.js';
import { handler as soraHandler } from './sora.js';
import { handler as orderHandler } from './order.js';
import { handler as webhookHandler, buildSoraOrderBody, executeSoraApproval } from './tg-webhook.js';
import { handler as statusHandler } from './order-status.js';
import { handler as adminMediaHandler } from './admin-media.js';
import { handler as adminPanelHandler } from './admin-panel.js';
import { handler as userCoinsHandler } from './user-coins.js';
import { buildProjectZipBuffer } from './_zip.js';

function makeSignedInitData(userObj, botToken, authDateSec) {
  const params = new URLSearchParams();
  params.set('auth_date', String(authDateSec));
  params.set('query_id', 'AAHdF6IQAAAAAN0XohDhrOrc');
  params.set('user', JSON.stringify(userObj));

  const pairs = [...params.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  const checkStr = pairs.map(([k, v]) => `${k}=${v}`).join('\n');
  const secretKey = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
  const hash = crypto.createHmac('sha256', secretKey).update(checkStr).digest('hex');
  params.set('hash', hash);
  return params.toString();
}

function makeTinyPngDataUrl() {
  // Minimal valid PNG header + 64+ bytes payload
  const header = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const pad = Buffer.alloc(72, 0x00);
  return `data:image/png;base64,${Buffer.concat([header, pad]).toString('base64')}`;
}

test('verifyTelegramInitData accepts valid signature and rejects tampered/expired', () => {
  const token = '123456:TEST_BOT_TOKEN';
  const now = 1_700_000_000;
  const validInit = makeSignedInitData({ id: 998877, username: 'ali_uz', first_name: 'Ali' }, token, now - 60);

  const ok = verifyTelegramInitData(validInit, token, now);
  assert.equal(ok.valid, true);
  assert.equal(ok.user?.id, '998877');

  const expired = verifyTelegramInitData(
    makeSignedInitData({ id: 998877 }, token, now - 90_000),
    token,
    now
  );
  assert.equal(expired.valid, false);
  assert.equal(expired.reason, 'expired_init_data');

  const tampered = validInit.replace('ali_uz', 'hacker');
  const bad = verifyTelegramInitData(tampered, token, now);
  assert.equal(bad.valid, false);
  assert.equal(bad.reason, 'signature_mismatch');
});

test('input sanitization, HTML escaping, and receipt magic-bytes checks', () => {
  assert.equal(sanitizeTarget('5123456789', 'player_id').ok, true);
  assert.equal(sanitizeTarget('<script>alert(1)</script>', 'player_id').ok, false);
  assert.equal(sanitizeTarget('@test_user', 'username').value, 'test_user');
  assert.equal(sanitizeServer('1234', true).ok, true);
  assert.equal(sanitizeServer('', true).ok, false);
  assert.equal(escapeHtml('<img onerror="x">'), '&lt;img onerror=&quot;x&quot;&gt;');

  const pngOk = validateReceiptDataUrl(makeTinyPngDataUrl());
  assert.equal(pngOk.ok, true);
  assert.equal(pngOk.mimeType, 'image/png');

  const spoofed = validateReceiptDataUrl(
    `data:image/jpeg;base64,${Buffer.alloc(100, 0x41).toString('base64')}`
  );
  assert.equal(spoofed.ok, false);
  assert.equal(spoofed.error, 'invalid_receipt_magic');
});

test('#ORD line encoding/decoding and callback_data 64-byte limit', () => {
  const ref = generateOrderRef();
  assert.ok(Buffer.byteLength(`ok:${ref}`, 'utf8') <= 64);

  const line = formatOrdLine({
    service: 'pubg_uc',
    item: 'pubg_60',
    playerId: '5123456789',
    server: '',
    region: 'global',
    ref,
    tgUserId: '777111',
  });
  const parsed = parseOrdLine(`Buyurtma tafsiloti\n${line}`);
  assert.equal(parsed?.service, 'pubg_uc');
  assert.equal(parsed?.item, 'pubg_60');
  assert.equal(parsed?.playerId, '5123456789');
  assert.equal(parsed?.ref, ref);
  assert.equal(parsed?.tgUserId, '777111');

  const starsLine = formatOrdLine({
    service: 'gmvci7pul',
    item: '',
    quantity: 100,
    playerId: 'ali_uz',
    server: '',
    region: '',
    ref,
    tgUserId: '777111',
  });
  const parsedStars = parseOrdLine(starsLine);
  assert.equal(parsedStars?.service, 'gmvci7pul');
  assert.equal(parsedStars?.item, '');
  assert.equal(parsedStars?.quantity, 100);

  const smmBody = buildSoraOrderBody(
    { service: 'gmvqmt8mo', item: '513d81c82a18', quantity: 1000, playerId: 'https://t.me/test', ref },
    { soraType: 'smm' }
  );
  assert.deepEqual(smmBody, {
    service: 'gmvqmt8mo',
    ref,
    item: '513d81c82a18',
    quantity: 1000,
    link: 'https://t.me/test',
  });
});

test('sora.js blocks /me and /order from public access', async () => {
  const resMe = await soraHandler({ httpMethod: 'GET', queryStringParameters: { path: 'me' }, headers: {} });
  assert.equal(resMe.statusCode, 403);

  const resOrder = await soraHandler({ httpMethod: 'GET', queryStringParameters: { path: 'order' }, headers: {} });
  assert.equal(resOrder.statusCode, 403);

  const resPub = await soraHandler({
    httpMethod: 'GET',
    queryStringParameters: { path: 'public-catalog' },
    headers: {},
  });
  assert.equal(resPub.statusCode, 200);
  const pubData = JSON.parse(resPub.body);
  assert.ok(Array.isArray(pubData.games) && pubData.games.length === 14);
  assert.equal(pubData.games.some((g) => g.id === 'roblox'), false);
  const pubg = pubData.games.find((g) => g.id === 'pubg');
  assert.equal(pubg?.packs[0]?.autoDelivery, true);
  assert.equal(Object.keys(SORA_SERVICES).length, 9);
  assert.equal(SORA_SERVICES['tg-nft'].service, 'gmw3wk8p9');
});

test('order.js rejects tampered prices and accepts valid server-priced order', async () => {
  const pack = resolveCatalogPack('pubg', 'pubg_60');
  assert.ok(pack && pack.priceUzs === 13000);

  const tamperedRes = await orderHandler({
    httpMethod: 'POST',
    headers: { 'x-forwarded-for': '10.0.0.1' },
    body: JSON.stringify({
      gameId: 'pubg',
      packId: 'pubg_60',
      price: 100, // client tampered!
      playerID: '5123456789',
      photo: makeTinyPngDataUrl(),
    }),
  });
  assert.equal(tamperedRes.statusCode, 409);

  const validRes = await orderHandler({
    httpMethod: 'POST',
    headers: { 'x-forwarded-for': '10.0.0.2' },
    body: JSON.stringify({
      gameId: 'pubg',
      packId: 'pubg_60',
      price: pack.priceUzs,
      playerID: '5123456789',
      photo: makeTinyPngDataUrl(),
    }),
  });
  assert.equal(validRes.statusCode, 200);
  const data = JSON.parse(validRes.body);
  assert.equal(data.ok, true);
  assert.ok(data.ref.startsWith('GP-'));
  assert.ok(data.orderToken);

  // Verify customer can retrieve status only with valid orderToken
  const denied = await statusHandler({
    httpMethod: 'GET',
    queryStringParameters: { ref: data.ref },
    headers: { 'x-order-token': 'wrong-token' },
  });
  assert.equal(denied.statusCode, 403);

  const allowed = await statusHandler({
    httpMethod: 'GET',
    queryStringParameters: { ref: data.ref },
    headers: { 'x-order-token': data.orderToken },
  });
  assert.equal(allowed.statusCode, 200);
  const statusData = JSON.parse(allowed.body);
  assert.equal(statusData.order.status, 'pending');
});

test('tg-webhook.js enforces secret token and admin-only access', async () => {
  process.env.TG_WEBHOOK_SECRET = 'test_secret_xyz';
  process.env.TG_ADMIN_ID = '555000';

  const noSecret = await webhookHandler({
    httpMethod: 'POST',
    headers: { 'x-telegram-bot-api-secret-token': 'wrong' },
    body: JSON.stringify({}),
  });
  assert.equal(noSecret.statusCode, 401);

  const nonAdmin = await webhookHandler({
    httpMethod: 'POST',
    headers: { 'x-telegram-bot-api-secret-token': 'test_secret_xyz' },
    body: JSON.stringify({
      callback_query: {
        id: 'cq_1',
        from: { id: 999999 },
        data: 'ok:GP-TEST-1',
        message: { chat: { id: 555000 }, message_id: 1, caption: '' },
      },
    }),
  });
  assert.equal(nonAdmin.statusCode, 200);
});

test('sanitizeTarget validates SMM URLs and admin-media enforces ADMIN_PANEL_KEY', async () => {
  assert.equal(sanitizeTarget('https://t.me/my_channel', 'url').ok, true);
  assert.equal(sanitizeTarget('javascript:alert(1)', 'url').ok, false);

  const prevKey = process.env.ADMIN_PANEL_KEY;
  process.env.ADMIN_PANEL_KEY = 'secret_panel_123';

  const unauth = await adminMediaHandler({
    httpMethod: 'POST',
    headers: {},
    body: JSON.stringify({ gameId: 'pubg', photo: makeTinyPngDataUrl() }),
  });
  assert.equal(unauth.statusCode, 401);

  const authOk = await adminMediaHandler({
    httpMethod: 'POST',
    headers: { 'x-admin-key': 'secret_panel_123' },
    body: JSON.stringify({ gameId: 'pubg', photo: makeTinyPngDataUrl() }),
  });
  assert.equal(authOk.statusCode, 200);
  const saved = JSON.parse(authOk.body);
  assert.ok(saved.media.pubg);

  const delOk = await adminMediaHandler({
    httpMethod: 'DELETE',
    headers: { 'x-admin-key': 'secret_panel_123' },
    body: JSON.stringify({ gameId: 'pubg' }),
  });
  assert.equal(delOk.statusCode, 200);
  const afterDel = JSON.parse(delOk.body);
  assert.equal(afterDel.media.pubg, undefined);

  const packUpload = await adminMediaHandler({
    httpMethod: 'POST',
    headers: { 'x-admin-key': 'secret_panel_123' },
    body: JSON.stringify({ gameId: 'pack:pubg_60', photo: makeTinyPngDataUrl() }),
  });
  assert.equal(packUpload.statusCode, 200);
  assert.ok(JSON.parse(packUpload.body).media['pack:pubg_60']);

  const packDel = await adminMediaHandler({
    httpMethod: 'DELETE',
    headers: { 'x-admin-key': 'secret_panel_123' },
    body: JSON.stringify({ gameId: 'pack:pubg_60' }),
  });
  assert.equal(packDel.statusCode, 200);
  assert.equal(JSON.parse(packDel.body).media['pack:pubg_60'], undefined);

  if (prevKey === undefined) delete process.env.ADMIN_PANEL_KEY;
  else process.env.ADMIN_PANEL_KEY = prevKey;
});

test('signAdminSessionToken, banner-1 upload, and admin-panel endpoints work securely', async () => {
  const prevKey = process.env.ADMIN_PANEL_KEY;
  const prevAdminId = process.env.TG_ADMIN_ID;
  process.env.ADMIN_PANEL_KEY = 'panel_secret_xyz';
  process.env.TG_ADMIN_ID = '555000';

  const now = 1_750_000_000;
  const token = signAdminSessionToken('555000', now);
  assert.ok(token.startsWith('555000.'));
  assert.equal(verifyAdminSessionToken(token, now + 60), true);
  assert.equal(verifyAdminSessionToken(token, now + 13 * 3600), false);
  assert.equal(verifyAdminSessionToken(token.replace('555000', '999999'), now + 60), false);

  // Unauthenticated admin-panel GET returns 401
  const unauthPanel = await adminPanelHandler({ httpMethod: 'GET', headers: {} });
  assert.equal(unauthPanel.statusCode, 401);

  // Authenticated with ADMIN_PANEL_KEY returns stats, orders, and card
  const okPanel = await adminPanelHandler({
    httpMethod: 'GET',
    headers: { 'x-admin-key': 'panel_secret_xyz' },
  });
  assert.equal(okPanel.statusCode, 200);
  const panelData = JSON.parse(okPanel.body);
  assert.equal(panelData.ok, true);
  assert.ok(panelData.stats && typeof panelData.stats.totalOrders === 'number');
  assert.ok(panelData.card && panelData.card.number);

  // Update payment card via admin-panel POST
  const saveCardRes = await adminPanelHandler({
    httpMethod: 'POST',
    headers: { 'x-admin-key': 'panel_secret_xyz' },
    body: JSON.stringify({
      action: 'save-card',
      number: '8600 1234 5678 9012',
      holder: 'TEST HOLDER',
      bank: 'Uzcard',
    }),
  });
  assert.equal(saveCardRes.statusCode, 200);
  const cardPayload = JSON.parse(saveCardRes.body);
  assert.equal(cardPayload.card.number, '8600 1234 5678 9012');

  // Upload and delete hero banner-1 via admin-media
  const bannerUpload = await adminMediaHandler({
    httpMethod: 'POST',
    headers: { 'x-admin-key': 'panel_secret_xyz' },
    body: JSON.stringify({ gameId: 'banner-1', photo: makeTinyPngDataUrl() }),
  });
  assert.equal(bannerUpload.statusCode, 200);
  assert.ok(JSON.parse(bannerUpload.body).media['banner-1']);

  const publicMedia = await adminMediaHandler({ httpMethod: 'GET', headers: {} });
  assert.equal(publicMedia.statusCode, 200);
  const publicJson = JSON.parse(publicMedia.body);
  assert.ok(publicJson.media['banner-1']);
  assert.equal(publicJson.card.number, '8600 1234 5678 9012');

  const bannerDel = await adminMediaHandler({
    httpMethod: 'DELETE',
    headers: { 'x-admin-key': 'panel_secret_xyz' },
    body: JSON.stringify({ gameId: 'banner-1' }),
  });
  assert.equal(bannerDel.statusCode, 200);
  assert.equal(JSON.parse(bannerDel.body).media['banner-1'], undefined);

  if (prevKey === undefined) delete process.env.ADMIN_PANEL_KEY;
  else process.env.ADMIN_PANEL_KEY = prevKey;
  if (prevAdminId === undefined) delete process.env.TG_ADMIN_ID;
  else process.env.TG_ADMIN_ID = prevAdminId;
});

test('executeSoraApproval automatically sends UC for PUBG and Diamonds for Free Fire / MLBB', async () => {
  const pubgPack = resolveCatalogPack('pubg', 'pubg_60');
  assert.ok(pubgPack && pubgPack.sora);
  const refPubg = generateOrderRef();
  const storedPubg = await saveOrder({
    ref: refPubg,
    status: 'pending',
    gameId: 'pubg',
    gameName: 'PUBG Mobile',
    packId: 'pubg_60',
    packLabel: pubgPack.packLabel,
    priceUzs: pubgPack.priceUzs,
    playerId: '5123456789',
    playerDisplay: '5123456789',
    server: '',
    region: '',
    soraService: pubgPack.sora.service,
    soraType: pubgPack.sora.type,
    soraItem: pubgPack.sora.item,
    soraQuantity: null,
    expectedSoraPrice: pubgPack.sora.expectedSoraPrice,
    mapped: true,
    tgUserId: '777111',
  });

  const pubgCalls = [];
  const pubgRes = await executeSoraApproval({
    ref: refPubg,
    stored: storedPubg,
    waitMs: 0,
    adminId: '',
    soraClient: async (path, opts) => {
      pubgCalls.push({ path, opts });
      if (path.startsWith('/catalog')) {
        return {
          ok: true,
          data: { items: [{ item: 264, name: '60 UC', price: 12100, your_price: 11253, available: true }] },
        };
      }
      if (path === '/order') {
        assert.equal(opts.body.service, 'gmvdpia85');
        assert.strictEqual(opts.body.item, 264);
        assert.equal(opts.body.player_id, '5123456789');
        assert.equal(opts.body.price, 12100);
        return {
          ok: true,
          data: { order: { id: 'sr_pubg_1', status: 'completed', charged: 11253 } },
        };
      }
      return { ok: false };
    },
  });
  assert.equal(pubgRes.ok, true);
  assert.equal(pubgRes.order?.status, 'completed');
  assert.equal(pubgCalls.some((c) => c.path === '/order'), true);
  const pubgAfter = await getOrder(refPubg);
  assert.ok(pubgAfter?.customerNotifiedAt);

  // Free Fire Diamonds: initially processing -> status returns completed
  const ffPack = resolveCatalogPack('freefire', 'ff_100');
  assert.ok(ffPack && ffPack.sora);
  const refFf = generateOrderRef();
  const storedFf = await saveOrder({
    ref: refFf,
    status: 'pending',
    gameId: 'freefire',
    gameName: 'Free Fire',
    packId: 'ff_100',
    packLabel: ffPack.packLabel,
    priceUzs: ffPack.priceUzs,
    playerId: '1234567890',
    playerDisplay: '1234567890',
    server: '',
    region: ffPack.sora.region,
    soraService: ffPack.sora.service,
    soraType: ffPack.sora.type,
    soraItem: ffPack.sora.item,
    soraQuantity: null,
    expectedSoraPrice: ffPack.sora.expectedSoraPrice,
    mapped: true,
    tgUserId: '777222',
  });

  const ffRes = await executeSoraApproval({
    ref: refFf,
    stored: storedFf,
    waitMs: 1,
    adminId: '',
    soraClient: async (path, opts) => {
      if (path.startsWith('/catalog')) {
        return {
          ok: true,
          data: { items: [{ item: 2055, name: '110 💎', price: 10700, your_price: 9951, available: true }] },
        };
      }
      if (path === '/order') {
        assert.equal(opts.body.service, 'gmvdplqyx');
        assert.strictEqual(opts.body.item, 2055);
        assert.equal(opts.body.player_id, '1234567890');
        assert.equal(opts.body.region, '0');
        assert.equal(opts.body.price, 10700);
        return {
          ok: true,
          data: { order: { id: 'sr_ff_1', status: 'processing', charged: 9951 } },
        };
      }
      if (path.startsWith('/status')) {
        return {
          ok: true,
          data: { order: { id: 'sr_ff_1', status: 'completed', charged: 9951 } },
        };
      }
      return { ok: false };
    },
  });
  assert.equal(ffRes.ok, true);
  assert.equal(ffRes.order?.status, 'completed');

  // Mobile Legends Diamonds: includes server + numeric item
  const mlPack = resolveCatalogPack('mlbb', 'ml_86');
  assert.ok(mlPack && mlPack.sora);
  const mlBody = buildSoraOrderBody(
    {
      service: mlPack.sora.service,
      item: mlPack.sora.item,
      playerId: '987654321',
      server: '1234',
      region: mlPack.sora.region,
      ref: 'GP-ML-TEST',
    },
    { soraType: 'game' },
    15800
  );
  assert.deepEqual(mlBody, {
    service: 'g_mlbb',
    ref: 'GP-ML-TEST',
    item: 2794,
    player_id: '987654321',
    server: '1234',
    region: '0',
    price: 15800,
  });

  // Safety guard: blocks unavailable item before hitting POST /order
  const refOut = generateOrderRef();
  const storedOut = await saveOrder({
    ref: refOut,
    status: 'pending',
    gameId: 'pubg',
    gameName: 'PUBG Mobile',
    packId: 'pubg_60',
    packLabel: pubgPack.packLabel,
    priceUzs: pubgPack.priceUzs,
    playerId: '5123456789',
    soraService: pubgPack.sora.service,
    soraType: pubgPack.sora.type,
    soraItem: pubgPack.sora.item,
    mapped: true,
  });
  let orderEndpointHit = false;
  const blockedRes = await executeSoraApproval({
    ref: refOut,
    stored: storedOut,
    waitMs: 0,
    adminId: '',
    soraClient: async (path) => {
      if (path.startsWith('/catalog')) {
        return {
          ok: true,
          data: { items: [{ item: 264, name: '60 UC', price: 12100, your_price: 11253, available: false }] },
        };
      }
      if (path === '/order') orderEndpointHit = true;
      return { ok: false };
    },
  });
  assert.equal(blockedRes.ok, false);
  assert.equal(blockedRes.code, 'item_unavailable');
  assert.equal(orderEndpointHit, false);
});

test('buildProjectZipBuffer creates separated site and bot ZIP archives cleanly', () => {
  const botZip = buildProjectZipBuffer(process.cwd(), 'olmos-pay-bot', 'bot');
  assert.ok(Buffer.isBuffer(botZip) && botZip.length > 2_000);
  assert.equal(botZip.readUInt32LE(0), 0x04034b50); // PK\x03\x04
  assert.ok(botZip.includes(Buffer.from('olmos-pay-bot/index.mjs', 'utf8')));
  assert.ok(botZip.includes(Buffer.from('olmos-pay-bot/package.json', 'utf8')));
  assert.equal(botZip.includes(Buffer.from('olmos-pay-bot/src/', 'utf8')), false);
  assert.equal(botZip.includes(Buffer.from('olmos-pay-bot/.env\x00', 'utf8')), false);

  const siteZip = buildProjectZipBuffer(process.cwd(), 'olmos-pay-sayt', 'site');
  assert.ok(Buffer.isBuffer(siteZip) && siteZip.length > 10_000);
  assert.equal(siteZip.readUInt32LE(0), 0x04034b50);
  assert.ok(siteZip.includes(Buffer.from('olmos-pay-sayt/server.ts', 'utf8')));
  assert.ok(siteZip.includes(Buffer.from('olmos-pay-sayt/src/App.tsx', 'utf8')));
  assert.equal(siteZip.includes(Buffer.from('olmos-pay-sayt/bot/', 'utf8')), false);
  assert.equal(siteZip.includes(Buffer.from('node_modules/', 'utf8')), false);
});

test('Olmos Pay coin rewards (60 UC = 6 coins), idempotency, and user-coins endpoint', async () => {
  const pubg60 = resolveCatalogPack('pubg', 'pubg_60');
  assert.equal(pubg60?.coinsReward, 6);
  assert.equal(calculatePackCoins({ amount: 60, unit: 'UC', category: 'games', priceUzs: 13000 }), 6);
  assert.equal(calculatePackCoins({ amount: 110, unit: 'Olmos', category: 'games', priceUzs: 12000 }), 11);

  const prevBotToken = process.env.TG_BOT_TOKEN;
  const botToken = '123456:COINS_TEST_TOKEN';
  process.env.TG_BOT_TOKEN = botToken;

  const coinUserId = '888999777';
  const refCoin = generateOrderRef();
  const ord = await saveOrder({
    ref: refCoin,
    status: 'completed',
    gameId: 'pubg',
    gameName: 'PUBG Mobile',
    packId: 'pubg_60',
    packLabel: '60 UC',
    priceUzs: 13000,
    coinsReward: 6,
    playerId: '5123456789',
    tgUserId: coinUserId,
  });

  const firstCredit = await creditOrderCoins(ord);
  assert.equal(firstCredit.credited, true);
  assert.equal(firstCredit.coins, 6);
  assert.equal(firstCredit.newBalance, 6);

  // Calling again with same order must be idempotent (zero duplicate credit)
  const secondCredit = await creditOrderCoins(ord);
  assert.equal(secondCredit.credited, false);
  const state = await getUserCoins(coinUserId);
  assert.equal(state.balance, 6);

  const now = Math.floor(Date.now() / 1000);
  const signed = makeSignedInitData({ id: coinUserId, first_name: 'Aziz' }, botToken, now - 10);
  const coinsRes = await userCoinsHandler({
    httpMethod: 'POST',
    headers: {},
    body: JSON.stringify({ initData: signed }),
  });
  assert.equal(coinsRes.statusCode, 200);
  const coinsJson = JSON.parse(coinsRes.body);
  assert.equal(coinsJson.ok, true);
  assert.equal(coinsJson.balance, 6);
  assert.equal(coinsJson.history[0]?.ref, refCoin);

  if (prevBotToken === undefined) delete process.env.TG_BOT_TOKEN;
  else process.env.TG_BOT_TOKEN = prevBotToken;
});

