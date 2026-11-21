import type { TelegramWebApp, ThemeMode, TgUser } from '../types';

export function getTg(): TelegramWebApp | null {
  if (typeof window === 'undefined') return null;
  return window.Telegram?.WebApp || null;
}

export function initTelegramApp(): { user: TgUser | null; initData: string; preferredTheme: ThemeMode | null } {
  const tg = getTg();
  if (!tg) {
    return { user: null, initData: '', preferredTheme: null };
  }
  try {
    tg.expand?.();
  } catch {
    // Ignore outside Telegram client
  }
  return {
    user: tg.initDataUnsafe?.user || null,
    initData: tg.initData || '',
    preferredTheme: tg.colorScheme === 'light' ? 'light' : tg.colorScheme === 'dark' ? 'dark' : null,
  };
}

export function readyTelegramApp(): void {
  try {
    getTg()?.ready?.();
  } catch {
    // Ignore outside Telegram client
  }
}

export function triggerHaptic(kind: 'light' | 'medium' | 'success' | 'error' = 'light'): void {
  const tg = getTg();
  if (!tg?.HapticFeedback) return;
  try {
    if (kind === 'success' || kind === 'error') {
      tg.HapticFeedback.notificationOccurred?.(kind);
    } else {
      tg.HapticFeedback.impactOccurred?.(kind);
    }
  } catch {
    // Ignore unsupported platform
  }
}
