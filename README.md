# Olmos Pay — Telegram Mini App & Auto-Delivery Bot

**Olmos Pay** — PUBG Mobile UC, Free Fire Olmos, Mobile Legends Olmos, Bigo Live, Steam, Telegram Stars/Premium/Gifts va SMM xizmatlari uchun xavfsiz Telegram Mini App hamda avtomatik yetkazib beruvchi Telegram bot.

## Ishga tushirish

1. Paketlarni o‘rnating:
   ```bash
   npm install
   ```
2. `.env.example` faylidan nusxa olib `.env` yarating va quyidagi o‘zgaruvchilarni kiriting:
   - `TG_BOT_TOKEN` — Telegram bot tokeni (`@BotFather`)
   - `TG_ADMIN_ID` — Admin Telegram ID raqami
   - `TG_WEBHOOK_SECRET` — Webhook uchun maxfiy token
   - `SORA_API_KEY` — Sora Reseller API kaliti
   - `ADMIN_PANEL_KEY` — `/panel` admin paneliga kirish kaliti
3. Serverni ishga tushiring:
   ```bash
   npm run dev
   ```
   Yoki production build:
   ```bash
   npm run build
   npm start
   ```

## Admin Panel

- Telegram botda `/panel` yozing yoki brauzerda `/panel` sahifasini oching.
- Buyurtmani tasdiqlash (`✅ Tasdiqlash`) bosilganda Sora API orqali UC / Olmos / Stars / SMM avtomatik yetkazib beriladi.
