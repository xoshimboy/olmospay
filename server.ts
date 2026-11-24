import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { createServer as createViteServer } from 'vite';
import { handler as soraHandler } from './sora.js';
import { handler as orderHandler } from './order.js';
import { handler as orderStatusHandler } from './order-status.js';
import { handler as tgWebhookHandler } from './tg-webhook.js';
import { handler as adminMediaHandler } from './admin-media.js';
import { handler as adminPanelHandler } from './admin-panel.js';
import { handler as userCoinsHandler } from './user-coins.js';
import { handler as subscriptionHandler } from './subscription.js';
import { soraRequest, telegramApi, verifyAdminAccess } from './_lib.js';
import { buildProjectZipBuffer } from './_zip.js';

dotenv.config({ path: '.env.development.local' });
dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 3000);
const isProd = process.env.NODE_ENV === 'production';

type NetlifyEvent = {
  httpMethod: string;
  headers: Record<string, string>;
  queryStringParameters: Record<string, string>;
  body: string;
};

type NetlifyResult = {
  statusCode?: number;
  headers?: Record<string, string>;
  body?: string;
};

type BotRuntimeState = {
  botConfigured: boolean;
  botConnected: boolean;
  botError: string | null;
  botUsername: string | null;
  botMode: 'off' | 'webhook';
  soraConfigured: boolean;
  soraServicesCount: number | null;
};

const runtimeState: BotRuntimeState = {
  botConfigured: Boolean(process.env.TG_BOT_TOKEN),
  botConnected: false,
  botError: null,
  botUsername: null,
  botMode: 'off',
  soraConfigured: Boolean(process.env.SORA_API_KEY),
  soraServicesCount: null,
};

function adaptNetlify(fnHandler: (event: NetlifyEvent) => Promise<NetlifyResult>) {
  return async (req: express.Request, res: express.Response) => {
    try {
      const rawBody =
        typeof req.body === 'string'
          ? req.body
          : req.body && Object.keys(req.body).length > 0
            ? JSON.stringify(req.body)
            : '';

      const headers: Record<string, string> = {};
      for (const [k, v] of Object.entries(req.headers)) {
        if (typeof v === 'string') headers[k] = v;
        else if (Array.isArray(v)) headers[k] = v.join(',');
      }
      headers['x-forwarded-for'] = req.ip || headers['x-forwarded-for'] || '127.0.0.1';

      const queryStringParameters: Record<string, string> = {};
      for (const [k, v] of Object.entries(req.query || {})) {
        if (typeof v === 'string') queryStringParameters[k] = v;
      }

      const event: NetlifyEvent = {
        httpMethod: req.method,
        headers,
        queryStringParameters,
        body: rawBody,
      };

      const result = await fnHandler(event);
      if (result.headers) {
        for (const [k, v] of Object.entries(result.headers)) {
          res.setHeader(k, v);
        }
      }
      res.status(result.statusCode || 200).send(result.body ?? '');
    } catch {
      res.status(500).json({ ok: false, error: 'Serverda kutilmagan xato yuz berdi' });
    }
  };
}

async function startTelegramBotRunner() {
  if (!process.env.TG_BOT_TOKEN || process.env.NETLIFY === 'true') {
    runtimeState.botMode = 'off';
    runtimeState.botConnected = false;
    runtimeState.botError = process.env.TG_BOT_TOKEN ? null : 'TG_BOT_TOKEN sozlanmagan';
    return;
  }

  try {
    const me = await telegramApi('getMe', {});
    if (!me?.ok || !me?.result?.username) {
      runtimeState.botMode = 'off';
      runtimeState.botConnected = false;
      runtimeState.botError = me?.description || 'Telegram bot tokeni tasdiqlanmadi';
      console.error(`[TG Bot Init Error] ${runtimeState.botError}`);
      return;
    }

    runtimeState.botConnected = true;
    runtimeState.botError = null;
    runtimeState.botUsername = String(me.result.username);
    if (me.result.first_name !== 'Olmos Pay') {
      try {
        await telegramApi('setMyName', { name: 'Olmos Pay' });
        await telegramApi('setMyShortDescription', {
          short_description: 'Olmos Pay — PUBG UC, Free Fire/MLBB olmoslar, Telegram Stars va SMM avto-do‘kon',
        });
      } catch {
        // Non-fatal if Telegram rate-limits setMyName
      }
    }

    const customerCommands = [
      { command: 'start', description: 'Do‘konni ochish va boshlash' },
      { command: 'tanga', description: 'Olmos tanga balansim (60 UC = 6 tanga)' },
    ];
    const adminCommands = [
      ...customerCommands,
      { command: 'panel', description: 'Admin panelni ochish' },
      { command: 'balans', description: 'Sora balansini tekshirish' },
      { command: 'xizmatlar', description: 'Sora faol xizmatlari' },
      { command: 'holat', description: 'Buyurtma holatini tekshirish' },
    ];

    await telegramApi('setMyCommands', { commands: customerCommands });
    if (process.env.TG_ADMIN_ID) {
      await telegramApi('setMyCommands', {
        scope: { type: 'chat', chat_id: process.env.TG_ADMIN_ID },
        commands: adminCommands,
      });
    }

    const webhookInfo = await telegramApi('getWebhookInfo', {});
    const webhookUrl = String(webhookInfo?.result?.url || '');
    const hasWebhookError = Boolean(webhookInfo?.result?.last_error_message);
    runtimeState.botMode = webhookUrl && !hasWebhookError ? 'webhook' : 'off';
    if (runtimeState.botMode === 'webhook') {
      console.log(`[TG Bot] @${runtimeState.botUsername} active in webhook mode`);
    } else {
      runtimeState.botError = hasWebhookError
        ? String(webhookInfo.result.last_error_message)
        : 'Telegram webhook hali sozlanmagan';
      console.error('[TG Bot Webhook]', runtimeState.botError);
    }
  } catch (err) {
    runtimeState.botConnected = false;
    runtimeState.botMode = 'off';
    runtimeState.botError = err instanceof Error ? err.message : 'Telegram bot ishga tushmadi';
    console.error('[TG Bot Init Error]', runtimeState.botError);
  }
}

async function checkSoraConnection() {
  if (!process.env.SORA_API_KEY) return;
  try {
    const res = await soraRequest('/services', { method: 'GET', useCache: true });
    if (res.ok && Array.isArray(res.data?.services)) {
      runtimeState.soraServicesCount = res.data.services.length;
      console.log(`[Sora API] Connected · ${runtimeState.soraServicesCount} active services`);
    }
  } catch {
    // Non-fatal startup check
  }
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '8mb' }));

  // Non-sensitive runtime readiness endpoint
  app.get('/api/health', (_req, res) => {
    res.json({
      ok: true,
      botConfigured: runtimeState.botConfigured,
      botConnected: runtimeState.botConnected,
      botError: runtimeState.botError,
      botUsername: runtimeState.botUsername,
      botMode: runtimeState.botMode,
      soraConfigured: runtimeState.soraConfigured,
      soraServicesCount: runtimeState.soraServicesCount,
    });
  });

  // Mount Netlify Functions locally so dev & preview match production routes identically
  app.all('/.netlify/functions/sora', adaptNetlify(soraHandler));
  app.all('/.netlify/functions/order', adaptNetlify(orderHandler));
  app.all('/.netlify/functions/order-status', adaptNetlify(orderStatusHandler));
  app.all('/.netlify/functions/tg-webhook', adaptNetlify(tgWebhookHandler));
  app.all('/.netlify/functions/admin-media', adaptNetlify(adminMediaHandler));
  app.all('/.netlify/functions/admin-panel', adaptNetlify(adminPanelHandler));
  app.all('/.netlify/functions/user-coins', adaptNetlify(userCoinsHandler));
  app.all('/.netlify/functions/subscription', adaptNetlify(subscriptionHandler));

  app.get('/api/export-zip', (req, res) => {
    const headers: Record<string, string> = {};
    for (const [k, v] of Object.entries(req.headers)) {
      if (typeof v === 'string') headers[k] = v;
      else if (Array.isArray(v)) headers[k] = v.join(',');
    }
    const auth = verifyAdminAccess({
      headers,
      initData: typeof req.query.initData === 'string' ? req.query.initData : '',
      adminKey: typeof req.query.adminKey === 'string' ? req.query.adminKey : '',
      adminToken: typeof req.query.adminToken === 'string' ? req.query.adminToken : '',
    });
    if (!auth.ok) {
      res.status(401).json({ ok: false, error: 'ZIP yuklash uchun admin ruxsati kerak' });
      return;
    }
    const partParam = typeof req.query.part === 'string' ? req.query.part : 'all';
    const mode = partParam === 'bot' ? 'bot' : partParam === 'site' ? 'site' : 'all';
    const archiveBase =
      mode === 'bot' ? 'olmos-pay-bot' : mode === 'site' ? 'olmos-pay-sayt' : 'olmos-pay';
    const zipBuffer = buildProjectZipBuffer(__dirname, archiveBase, mode);
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${archiveBase}.zip"`);
    res.setHeader('Cache-Control', 'no-store');
    res.status(200).send(zipBuffer);
  });

  if (!isProd) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Olmos Pay server listening on http://localhost:${PORT}`);
    void checkSoraConnection();
    void startTelegramBotRunner();
  });

}

startServer();
