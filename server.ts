import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { createServer as createViteServer } from 'vite';
import { handler as soraHandler } from './sora.js';
import { handler as orderHandler } from './order.js';
import { handler as orderStatusHandler } from './order-status.js';
import { handler as tgWebhookHandler, processTelegramUpdate } from './tg-webhook.js';
import { handler as adminMediaHandler } from './admin-media.js';
import { handler as adminPanelHandler } from './admin-panel.js';
import { handler as userCoinsHandler } from './user-coins.js';
import { soraRequest, telegramApi, verifyAdminAccess } from './_lib.js';
import { buildProjectZipBuffer } from './_zip.js';

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
  botUsername: string | null;
  botMode: 'off' | 'polling' | 'webhook';
  soraConfigured: boolean;
  soraServicesCount: number | null;
};

const runtimeState: BotRuntimeState = {
  botConfigured: Boolean(process.env.TG_BOT_TOKEN),
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

let pollingActive = false;

async function startTelegramBotRunner() {
  if (!process.env.TG_BOT_TOKEN || process.env.NETLIFY === 'true' || process.env.DISABLE_BOT_POLLING === 'true') {
    if (process.env.DISABLE_BOT_POLLING === 'true') {
      runtimeState.botMode = 'off';
    }
    return;
  }

  try {
    const me = await telegramApi('getMe', {});
    if (me?.ok && me?.result?.username) {
      runtimeState.botUsername = String(me.result.username);
    }
    if (me?.ok && me?.result?.first_name !== 'Olmos Pay') {
      try {
        await telegramApi('setMyName', { name: 'Olmos Pay' });
        await telegramApi('setMyShortDescription', {
          short_description: 'Olmos Pay — PUBG UC, Free Fire/MLBB olmoslar, Telegram Stars va SMM avto-do‘kon',
        });
      } catch {
        // Non-fatal if Telegram rate-limits setMyName
      }
    }

    await telegramApi('setMyCommands', {
      commands: [
        { command: 'start', description: 'Do‘konni ochish va boshlash' },
        { command: 'tanga', description: 'Olmos tanga balansim (60 UC = 6 tanga)' },
        { command: 'panel', description: 'Admin panelni ochish (Admin)' },
        { command: 'balans', description: 'Sora balansini tekshirish (Admin)' },
        { command: 'xizmatlar', description: 'Sora faol xizmatlari (Admin)' },
        { command: 'holat', description: 'Buyurtma holatini tekshirish (Admin)' },
      ],
    });

    const wh = await telegramApi('getWebhookInfo', {});
    const whUrl = String(wh?.result?.url || '');
    const whHasError = Boolean(wh?.result?.last_error_message);
    const isPreviewOrEmpty =
      !whUrl ||
      whUrl.includes('ais-dev-') ||
      whUrl.includes('ais-pre-') ||
      whUrl.includes('localhost') ||
      whUrl.includes('127.0.0.1') ||
      whHasError ||
      process.env.TG_USE_POLLING === 'true';

    if (!isPreviewOrEmpty) {
      runtimeState.botMode = 'webhook';
      console.log(`[TG Bot] @${runtimeState.botUsername || 'bot'} active in webhook mode`);
      return;
    }

    if (whUrl) {
      await telegramApi('deleteWebhook', { drop_pending_updates: false });
    }

    runtimeState.botMode = 'polling';
    pollingActive = true;
    console.log(`[TG Bot] @${runtimeState.botUsername || 'bot'} active in live polling mode`);

    let offset = 0;
    const pollLoop = async () => {
      while (pollingActive) {
        try {
          const res = await telegramApi('getUpdates', {
            offset,
            timeout: 20,
            allowed_updates: ['message', 'callback_query'],
          });
          if (res?.ok && Array.isArray(res.result)) {
            for (const update of res.result) {
              if (typeof update.update_id === 'number' && update.update_id >= offset) {
                offset = update.update_id + 1;
              }
              try {
                await processTelegramUpdate(update);
              } catch (err) {
                console.error('[TG Update Error]', err instanceof Error ? err.message : 'unknown');
              }
            }
          } else {
            await new Promise((r) => setTimeout(r, 3000));
          }
        } catch {
          await new Promise((r) => setTimeout(r, 3000));
        }
      }
    };

    void pollLoop();
  } catch (err) {
    console.error('[TG Bot Init Error]', err instanceof Error ? err.message : 'unknown');
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

  const stopPolling = () => {
    pollingActive = false;
  };
  process.on('SIGINT', stopPolling);
  process.on('SIGTERM', stopPolling);
}

startServer();
