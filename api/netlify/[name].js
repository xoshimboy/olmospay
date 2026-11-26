import { handler as adminMediaHandler } from '../../admin-media.js';
import { handler as adminPanelHandler } from '../../admin-panel.js';
import { handler as orderHandler } from '../../order.js';
import { handler as orderStatusHandler } from '../../order-status.js';
import { handler as soraHandler } from '../../sora.js';
import { handler as subscriptionHandler } from '../../subscription.js';
import { handler as supportHandler } from '../../support.js';
import { handler as telegramWebhookHandler } from '../../tg-webhook.js';
import { handler as userCoinsHandler } from '../../user-coins.js';
import { ensureTelegramWebhook } from '../../_lib.js';

const handlers = {
  'admin-media': adminMediaHandler,
  'admin-panel': adminPanelHandler,
  order: orderHandler,
  'order-status': orderStatusHandler,
  sora: soraHandler,
  subscription: subscriptionHandler,
  support: supportHandler,
  'tg-webhook': telegramWebhookHandler,
  'user-coins': userCoinsHandler,
};

function normalizeHeaders(headers = {}) {
  return Object.fromEntries(
    Object.entries(headers).map(([name, value]) => [
      name.toLowerCase(),
      Array.isArray(value) ? value.join(', ') : String(value ?? ''),
    ])
  );
}

function normalizeQuery(query = {}) {
  return Object.fromEntries(
    Object.entries(query)
      .filter(([key]) => key !== 'name')
      .map(([key, value]) => [key, Array.isArray(value) ? value[0] : String(value ?? '')])
  );
}

export const config = {
  api: { bodyParser: { sizeLimit: '4.5mb' } },
};

export default async function netlifyFunctionAdapter(req, res) {
  const name = Array.isArray(req.query?.name) ? req.query.name[0] : req.query?.name;
  const handler = handlers[String(name || '')];
  if (!handler) {
    return res.status(404).json({ ok: false, error: 'API endpoint topilmadi' });
  }

  try {
    if (name === 'sora' && req.method === 'GET' && req.query?.path === 'public-catalog') {
      const webhook = await ensureTelegramWebhook();
      if (!webhook.ok && !webhook.skipped) {
        console.error('[Telegram webhook setup error]', webhook.error || 'unknown');
      }
    }

    const body =
      typeof req.body === 'string'
        ? req.body
        : Buffer.isBuffer(req.body)
          ? req.body.toString('utf8')
          : JSON.stringify(req.body ?? {});
    const result = await handler({
      httpMethod: req.method || 'GET',
      headers: normalizeHeaders(req.headers),
      queryStringParameters: normalizeQuery(req.query),
      body,
    });

    for (const [key, value] of Object.entries(result.headers || {})) {
      res.setHeader(key, value);
    }
    return res.status(result.statusCode || 200).send(result.body ?? '');
  } catch (error) {
    console.error('[Vercel function error]', name, error);
    return res.status(500).json({ ok: false, error: 'Serverda xatolik yuz berdi' });
  }
}
