export const MAX_FILE_MB = 10;
export const MAX_SERVER_BYTES = 4 * 1024 * 1024;
export const CHECKOUT_SECONDS = 300; // 5 minutes

export function formatUzs(amount: number, unit = 'so‘m'): string {
  const safe = Number.isFinite(amount) ? Math.round(amount) : 0;
  return `${safe.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ')} ${unit}`;
}

export function calculatePackCoins({
  amount = 0,
  unit = '',
  category = 'games',
  priceUzs = 0,
}: {
  amount?: number;
  unit?: string;
  category?: string;
  priceUzs?: number;
}): number {
  const qty = Number(amount || 0);
  const price = Number(priceUzs || 0);
  const cleanUnit = String(unit || '').trim().toLowerCase();

  // 10% coin reward for direct UC / Olmos / Diamonds / Stars (e.g. 60 UC -> 6 coins)
  if ((category === 'games' && qty >= 10 && cleanUnit !== 'pass') || cleanUnit === 'stars') {
    return Math.max(1, Math.floor(qty / 10));
  }

  // Proportional rate for passes, cards, Telegram gifts/premium/accounts, and SMM
  return Math.max(1, Math.round(price / 2200));
}

export function formatTimer(seconds: number): string {
  const clamped = Math.max(0, Math.floor(seconds));
  const m = Math.floor(clamped / 60)
    .toString()
    .padStart(2, '0');
  const s = (clamped % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

export function validatePlayerInput(
  value: string,
  inputType: 'player_id' | 'username' | 'url',
  requiresServer = false,
  serverValue = ''
):
  | { ok: true; cleanId: string; cleanServer: string }
  | { ok: false; code: 'id' | 'username' | 'server' | 'url' } {
  const trimmed = String(value ?? '').trim();
  if (inputType === 'username') {
    const clean = trimmed.startsWith('@') ? trimmed.slice(1) : trimmed;
    if (!/^[A-Za-z0-9_]{3,32}$/.test(clean)) {
      return { ok: false, code: 'username' };
    }
    return { ok: true, cleanId: `@${clean}`, cleanServer: '' };
  }

  if (inputType === 'url') {
    if (trimmed.length < 4 || trimmed.length > 200 || /[\s<>"'`]/.test(trimmed)) {
      return { ok: false, code: 'url' };
    }
    const normalized = /^https?:\/\//i.test(trimmed)
      ? trimmed
      : trimmed.startsWith('@')
        ? `https://t.me/${trimmed.slice(1)}`
        : `https://${trimmed}`;
    try {
      const parsed = new URL(normalized);
      if ((parsed.protocol !== 'https:' && parsed.protocol !== 'http:') || !parsed.hostname.includes('.')) {
        return { ok: false, code: 'url' };
      }
      return { ok: true, cleanId: parsed.toString(), cleanServer: '' };
    } catch {
      return { ok: false, code: 'url' };
    }
  }

  if (!/^[A-Za-z0-9_.:-]{3,32}$/.test(trimmed)) {
    return { ok: false, code: 'id' };
  }

  const cleanServer = String(serverValue ?? '').trim();
  if (requiresServer && !/^[A-Za-z0-9_-]{1,16}$/.test(cleanServer)) {
    return { ok: false, code: 'server' };
  }

  return { ok: true, cleanId: trimmed, cleanServer };
}

export function formatOrderDate(timestamp: number, lang: 'uz' | 'ru' | 'en'): string {
  const locale = lang === 'ru' ? 'ru-RU' : lang === 'en' ? 'en-US' : 'uz-UZ';
  try {
    return new Intl.DateTimeFormat(locale, {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(timestamp));
  } catch {
    return new Date(timestamp).toLocaleString();
  }
}

async function resizeImageToJpeg(file: File, maxSide: number, maxBytes: number, initialQuality = 0.86): Promise<string> {
  if (file.size > MAX_FILE_MB * 1024 * 1024) {
    throw new Error('FILE_TOO_LARGE');
  }
  const allowed = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
  if (!allowed.includes(file.type.toLowerCase())) {
    throw new Error('FILE_TYPE');
  }

  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('READ_FAIL'));
    reader.readAsDataURL(file);
  });

  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('IMG_DECODE_FAIL'));
    image.src = dataUrl;
  });

  let { width, height } = img;
  if (width > maxSide || height > maxSide) {
    const ratio = Math.min(maxSide / width, maxSide / height);
    width = Math.max(1, Math.round(width * ratio));
    height = Math.max(1, Math.round(height * ratio));
  }

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('CANVAS_FAIL');
  }
  ctx.drawImage(img, 0, 0, width, height);

  let quality = initialQuality;
  let out = canvas.toDataURL('image/jpeg', quality);
  while (out.length * 0.75 > maxBytes && quality > 0.45) {
    quality -= 0.1;
    out = canvas.toDataURL('image/jpeg', quality);
  }
  return out;
}

export async function compressReceiptImage(file: File): Promise<string> {
  return resizeImageToJpeg(file, 1280, MAX_SERVER_BYTES, 0.86);
}

export async function compressCoverImage(file: File): Promise<string> {
  return resizeImageToJpeg(file, 512, 350 * 1024, 0.85);
}

export async function compressBannerImage(file: File): Promise<string> {
  return resizeImageToJpeg(file, 1400, 750 * 1024, 0.88);
}
