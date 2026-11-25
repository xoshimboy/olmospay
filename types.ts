export type PageId =
  | 'p-home'
  | 'p-games'
  | 'p-game'
  | 'p-wallet'
  | 'p-history'
  | 'p-profile'
  | 'p-checkout';

export interface CardInfo {
  number: string;
  holder: string;
  bank: string;
}

export type Lang = 'uz' | 'ru' | 'en';
export type ThemeMode = 'dark' | 'light';
export type GameCategory = 'all' | 'games' | 'telegram' | 'smm' | 'cards';

export type OrderStatus =
  | 'pending'
  | 'processing'
  | 'completed'
  | 'canceled'
  | 'manual_pending';

export interface PackItem {
  id: string;
  label: string;
  amount: number;
  unit: string;
  priceUzs: number;
  coinsReward?: number;
  autoDelivery?: boolean;
}

export type GameRegion = 'global' | 'cis' | 'br' | 'eu' | 'me';

export interface GameItem {
  id: string;
  name: string;
  badge?: string;
  category: Exclude<GameCategory, 'all'>;
  subtitle: string;
  inputType: 'player_id' | 'username' | 'url';
  inputLabel: Record<Lang, string>;
  inputPlaceholder: string;
  requiresServer: boolean;
  serverLabel?: Record<Lang, string> | null;
  serverPlaceholder?: string | null;
  packs: PackItem[];
}

export interface OrderHistoryItem {
  ref: string;
  orderToken?: string;
  gameId: string;
  gameName: string;
  packId: string;
  packLabel: string;
  priceUzs: number;
  coinsReward?: number;
  playerDisplay: string;
  server?: string;
  region?: string;
  status: OrderStatus;
  refunded?: boolean;
  createdAt: number;
  updatedAt?: number;
}

export interface CoinsState {
  balance: number;
  totalEarned: number;
  history: Array<{
    ref: string;
    gameName: string;
    packLabel: string;
    coins: number;
    at: number;
  }>;
}

export interface TgUser {
  id?: number | string;
  first_name?: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
}

export interface TelegramWebApp {
  initData?: string;
  initDataUnsafe?: {
    user?: TgUser;
  };
  themeParams?: {
    bg_color?: string;
    secondary_bg_color?: string;
    text_color?: string;
    hint_color?: string;
    button_color?: string;
    button_text_color?: string;
  };
  colorScheme?: 'dark' | 'light';
  expand?: () => void;
  ready?: () => void;
  openInvoice?: (url: string, callback?: (status: 'paid' | 'cancelled' | 'failed') => void) => void;
  BackButton?: {
    show: () => void;
    hide: () => void;
    onClick: (cb: () => void) => void;
    offClick: (cb: () => void) => void;
  };
  HapticFeedback?: {
    impactOccurred?: (style: 'light' | 'medium' | 'heavy') => void;
    notificationOccurred?: (type: 'error' | 'success' | 'warning') => void;
    selectionChanged?: () => void;
  };
}

declare global {
  interface Window {
    Telegram?: {
      WebApp?: TelegramWebApp;
    };
  }
}
