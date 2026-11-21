import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Coins,
  Copy,
  Moon,
  ShieldCheck,
  Sun,
  User,
  Zap,
  Headphones,
  AlertCircle,
} from 'lucide-react';
import { AppLoader } from './components/AppLoader';
import { BannerCarousel } from './components/BannerCarousel';
import { BottomNav } from './components/BottomNav';
import { CheckoutPage } from './components/CheckoutPage';
import { GameEmblem } from './components/GameEmblem';
import { HistoryPage } from './components/HistoryPage';
import { CARD_INFO, DEFAULT_GAMES } from './data/catalog';
import { I18N } from './data/i18n';
import type {
  CardInfo,
  CoinsState,
  GameCategory,
  GameItem,
  Lang,
  OrderHistoryItem,
  PackItem,
  GameRegion,
  PageId,
  ThemeMode,
  TgUser,
} from './types';
import { calculatePackCoins, formatUzs, validatePlayerInput } from './utils/format';
import { calculateSmmPrice } from './smm-pricing.js';
import { getTg, initTelegramApp, readyTelegramApp, triggerHaptic } from './utils/telegram';

const AdminPanelPage = lazy(() =>
  import('./components/AdminPanelPage').then((m) => ({ default: m.AdminPanelPage }))
);

const ADMIN_TOKEN_STORAGE = 'gamepin_admin_token_v1';
const HISTORY_STORAGE_KEY = 'gamepin_orders_v2';
const LANG_STORAGE_KEY = 'gamepin_lang_v2';
const THEME_STORAGE_KEY = 'olmospay_theme_v3';
const CATALOG_CACHE_KEY = 'olmospay_catalog_cache_v1';
const MEDIA_CACHE_KEY = 'olmospay_media_cache_v1';
const CARD_CACHE_KEY = 'olmospay_card_cache_v1';
const COINS_CACHE_KEY = 'olmospay_coins_cache_v1';

const GAME_REGIONS: Array<{ id: GameRegion; label: string }> = [
  { id: 'global', label: 'GLOBAL' },
  { id: 'cis', label: 'RU / CIS' },
  { id: 'br', label: 'BR' },
  { id: 'eu', label: 'EU' },
  { id: 'me', label: 'AE / ME' },
];

function getPackGroup(gameId: string, pack: PackItem): string {
  if (gameId === 'pubg') {
    if (pack.id === 'pubg_elite') return 'elite';
    if (pack.id.startsWith('pubg_prime')) return 'prime';
    if (pack.id.startsWith('pubg_') && pack.id !== 'pubg_60' && pack.id !== 'pubg_325' && pack.id !== 'pubg_660' && pack.id !== 'pubg_1800' && pack.id !== 'pubg_2460') return 'bundles';
    return 'uc';
  }
  if (gameId === 'freefire') return pack.unit.toLowerCase() === 'pass' ? 'pass' : 'diamonds';
  if (gameId === 'mlbb') return pack.unit.toLowerCase() === 'pass' ? 'pass' : 'diamonds';
  if (gameId.startsWith('smm-')) {
    if (pack.id.includes('view') || pack.id.includes('reels')) return 'views';
    if (pack.id.includes('like')) return 'likes';
    if (pack.id.includes('react')) return 'reactions';
    if (pack.id.includes('comment')) return 'comments';
    if (pack.id.includes('share')) return 'shares';
    if (pack.id.includes('sub') || pack.id.includes('follow')) return 'followers';
    return 'other';
  }
  return 'all';
}

const PACKAGE_GROUP_LABELS: Record<string, string> = {
  all: 'Barchasi',
  uc: 'UC',
  elite: 'Elite Pass',
  bundles: 'Paketlar',
  prime: 'Prime',
  diamonds: 'Olmoslar',
  pass: 'Pass',
  views: 'Ko‘rishlar',
  likes: 'Layklar',
  reactions: 'Reaksiyalar',
  comments: 'Izohlar',
  shares: 'Ulashishlar',
  followers: 'Obunachilar',
  other: 'Boshqa',
};

function readCacheJson<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
}

function writeCacheJson(key: string, value: unknown) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Ignore storage quota errors
  }
}

function detectPanelRoute(): boolean {
  if (typeof window === 'undefined') return false;
  const cleanPath = window.location.pathname.replace(/\/+$/, '');
  return cleanPath === '/panel' || window.location.hash === '#/panel';
}

function consumeAdminTokenFromUrl(): string {
  if (typeof window === 'undefined') return '';
  try {
    const url = new URL(window.location.href);
    const token = url.searchParams.get('admin_token') || '';
    if (token) {
      window.sessionStorage.setItem(ADMIN_TOKEN_STORAGE, token);
      url.searchParams.delete('admin_token');
      window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
      return token;
    }
    return window.sessionStorage.getItem(ADMIN_TOKEN_STORAGE) || '';
  } catch {
    return '';
  }
}

export default function App() {
  const [isPanelRoute, setIsPanelRoute] = useState<boolean>(() => detectPanelRoute());
  const [isBootReady, setIsBootReady] = useState(false);
  const telegramReadyRef = useRef(false);
  const [urlAdminToken] = useState<string>(() => consumeAdminTokenFromUrl());
  const [pageStack, setPageStack] = useState<PageId[]>(['p-home']);
  const activePage = pageStack[pageStack.length - 1];

  const [lang, setLang] = useState<Lang>(() => {
    const saved = typeof window !== 'undefined' ? window.localStorage.getItem(LANG_STORAGE_KEY) : null;
    return saved === 'ru' || saved === 'en' ? saved : 'uz';
  });

  const [theme, setThemeState] = useState<ThemeMode>(() => {
    const saved = typeof window !== 'undefined' ? window.localStorage.getItem(THEME_STORAGE_KEY) : null;
    return saved === 'dark' ? 'dark' : 'light';
  });

  const [games, setGames] = useState<GameItem[]>(() => {
    const cached = readCacheJson<GameItem[]>(CATALOG_CACHE_KEY, DEFAULT_GAMES);
    return Array.isArray(cached) && cached.length > 0 ? cached : DEFAULT_GAMES;
  });
  const [customMedia, setCustomMedia] = useState<Record<string, string>>(() =>
    readCacheJson<Record<string, string>>(MEDIA_CACHE_KEY, {})
  );
  const [cardInfo, setCardInfo] = useState<CardInfo>(() =>
    readCacheJson<CardInfo>(CARD_CACHE_KEY, CARD_INFO)
  );
  const [coinsState, setCoinsState] = useState<CoinsState>(() =>
    readCacheJson<CoinsState>(COINS_CACHE_KEY, { balance: 0, totalEarned: 0, history: [] })
  );
  const [category, setCategory] = useState<GameCategory>('all');
  const [selectedGameId, setSelectedGameId] = useState<string>('pubg');
  const [selectedPackId, setSelectedPackId] = useState<string>('');
  const [packageGroup, setPackageGroup] = useState<string>('all');
  const [selectedRegion, setSelectedRegion] = useState<GameRegion>('global');
  const [playerID, setPlayerID] = useState<string>('');
  const [serverID, setServerID] = useState<string>('');
  const [smmQuantity, setSmmQuantity] = useState('1000');
  const [gameFormError, setGameFormError] = useState<string>('');

  const [checkoutData, setCheckoutData] = useState<{
    game: GameItem;
    pack: PackItem;
    playerID: string;
    serverID: string;
    region: GameRegion;
  } | null>(null);

  const [tgUser, setTgUser] = useState<TgUser | null>(null);
  const [initData, setInitData] = useState<string>('');
  const [sessionHistory, setSessionHistory] = useState<OrderHistoryItem[]>(() => {
    try {
      const raw = window.localStorage.getItem(HISTORY_STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  });
  const [refreshingHistory, setRefreshingHistory] = useState(false);
  const [walletCopied, setWalletCopied] = useState(false);

  const t = I18N[lang];

  const applyTheme = useCallback((nextTheme: ThemeMode) => {
    setThemeState(nextTheme);
    window.localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
    const root = document.documentElement;
    const body = document.body;
    if (nextTheme === 'dark') {
      root.classList.add('dark');
      body.classList.add('theme-dark');
    } else {
      root.classList.remove('dark');
      body.classList.remove('theme-dark');
    }
  }, []);

  const applyLanguage = useCallback((nextLang: Lang) => {
    setLang(nextLang);
    window.localStorage.setItem(LANG_STORAGE_KEY, nextLang);
    document.documentElement.lang = nextLang;
  }, []);

  useEffect(() => {
    const { user, initData: rawInit } = initTelegramApp();
    if (user) setTgUser(user);
    if (rawInit) setInitData(rawInit);
  }, []);

  useEffect(() => {
    if (isPanelRoute) {
      setIsBootReady(true);
      return;
    }

    let active = true;
    const images = Array.from(document.images);
    images.forEach((image) => {
      image.loading = 'eager';
    });

    const urls = new Set<string>([
      ...images.map((image) => image.currentSrc || image.src),
      ...Object.values(customMedia),
    ]);
    urls.delete('');

    const imageLoads = Array.from(urls, (src) =>
      new Promise<void>((resolve) => {
        const image = new Image();
        image.onload = () => resolve();
        image.onerror = () => resolve();
        image.src = src;
        if (image.complete) {
          if (typeof image.decode === 'function') {
            void image.decode().catch(() => undefined).finally(resolve);
          } else {
            resolve();
          }
        }
      })
    );
    const minimumDisplay = new Promise<void>((resolve) => window.setTimeout(resolve, 650));
    const maximumWait = new Promise<void>((resolve) => window.setTimeout(resolve, 12000));

    void Promise.race([Promise.allSettled(imageLoads).then(() => undefined), maximumWait])
      .then(() => minimumDisplay)
      .then(() => {
        if (active) {
          setIsBootReady(true);
          if (!telegramReadyRef.current) {
            readyTelegramApp();
            telegramReadyRef.current = true;
          }
        }
      });

    return () => {
      active = false;
    };
  }, [customMedia, isPanelRoute]);

  useEffect(() => {
    applyTheme(theme);
  }, [applyTheme, theme]);

  useEffect(() => {
    applyLanguage(lang);
  }, [applyLanguage, lang]);

  useEffect(() => {
    const syncRoute = () => setIsPanelRoute(detectPanelRoute());
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName || '';
      const isEditable = tag === 'INPUT' || tag === 'TEXTAREA' || target?.isContentEditable;
      const hasSelection = Boolean(window.getSelection()?.toString());
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'x' && !isEditable && !hasSelection) {
        e.preventDefault();
        if (window.location.pathname !== '/panel') {
          window.history.pushState({}, '', '/panel');
        }
        setIsPanelRoute(true);
      }
    };
    window.addEventListener('popstate', syncRoute);
    window.addEventListener('hashchange', syncRoute);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('popstate', syncRoute);
      window.removeEventListener('hashchange', syncRoute);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, []);

  // Background revalidation of catalog, custom media covers/banners, and card details (0ms instant start from cache)
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const [catRes, mediaRes] = await Promise.all([
          fetch('/.netlify/functions/sora?path=public-catalog'),
          fetch('/.netlify/functions/admin-media', { cache: 'no-store' }),
        ]);
        if (catRes.ok) {
          const data = await catRes.json();
          if (active && Array.isArray(data?.games) && data.games.length > 0) {
            setGames(data.games);
            writeCacheJson(CATALOG_CACHE_KEY, data.games);
          }
        }
        if (mediaRes.ok) {
          const mData = await mediaRes.json();
          if (active && mData?.media && typeof mData.media === 'object') {
            setCustomMedia(mData.media);
            writeCacheJson(MEDIA_CACHE_KEY, mData.media);
          }
          if (active && mData?.card && mData.card.number) {
            setCardInfo(mData.card);
            writeCacheJson(CARD_CACHE_KEY, mData.card);
          }
        }
      } catch {
        // Retain cached / static DEFAULT_GAMES fallback offline
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const refreshCoins = useCallback(
    async (ordersOverride?: OrderHistoryItem[]) => {
      const list = ordersOverride ?? sessionHistory;
      if (!initData && list.length === 0) return;
      try {
        const res = await fetch('/.netlify/functions/user-coins', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            initData,
            items: list.map((o) => ({ ref: o.ref, orderToken: o.orderToken || '' })),
          }),
        });
        if (!res.ok) return;
        const data = await res.json();
        if (data?.ok) {
          const nextCoins: CoinsState = {
            balance: Number(data.balance || 0),
            totalEarned: Number(data.totalEarned || 0),
            history: Array.isArray(data.history) ? data.history : [],
          };
          setCoinsState(nextCoins);
          writeCacheJson(COINS_CACHE_KEY, nextCoins);
        }
      } catch {
        // Silent fallback to cached coins
      }
    },
    [initData, sessionHistory]
  );

  useEffect(() => {
    void refreshCoins();
  }, [initData]); // eslint-disable-line react-hooks/exhaustive-deps

  const saveHistory = useCallback((items: OrderHistoryItem[]) => {
    setSessionHistory(items);
    try {
      window.localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(items.slice(0, 30)));
    } catch {
      // Ignore storage quota errors
    }
  }, []);

  const refreshOrderStatuses = useCallback(async () => {
    if (sessionHistory.length === 0 && !initData) return;
    setRefreshingHistory(true);
    try {
      const res = await fetch('/.netlify/functions/order-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          initData,
          items: sessionHistory.map((o) => ({ ref: o.ref, orderToken: o.orderToken || '' })),
        }),
      });
      if (!res.ok) return;
      const data = await res.json();
      if (Array.isArray(data?.orders)) {
        const remoteMap = new Map<string, OrderHistoryItem>();
        for (const r of data.orders) {
          remoteMap.set(r.ref, r);
        }
        const merged = sessionHistory.map((local) => {
          const remote = remoteMap.get(local.ref);
          if (!remote) return local;
          return {
            ...local,
            status: remote.status,
            coinsReward: remote.coinsReward ?? local.coinsReward,
            refunded: remote.refunded,
            updatedAt: remote.updatedAt,
          };
        });
        for (const r of data.orders) {
          if (!merged.some((m) => m.ref === r.ref)) {
            merged.push(r);
          }
        }
        merged.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
        saveHistory(merged);
        void refreshCoins(merged);
      }
    } catch {
      // Silent retry later
    } finally {
      setRefreshingHistory(false);
    }
  }, [initData, refreshCoins, saveHistory, sessionHistory]);

  const navPage = useCallback((next: PageId) => {
    triggerHaptic('light');
    setPageStack((prev) => {
      if (['p-home', 'p-games', 'p-wallet', 'p-history', 'p-profile'].includes(next)) {
        return [next];
      }
      if (prev[prev.length - 1] === next) return prev;
      return [...prev, next];
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const goBack = useCallback(() => {
    triggerHaptic('light');
    setPageStack((prev) => (prev.length > 1 ? prev.slice(0, -1) : ['p-home']));
  }, []);

  // Sync Telegram WebApp BackButton
  useEffect(() => {
    const tg = getTg();
    if (!tg?.BackButton) return;
    const isSubpage = pageStack.length > 1;
    if (isSubpage) {
      tg.BackButton.show();
      tg.BackButton.onClick(goBack);
    } else {
      tg.BackButton.hide();
    }
    return () => {
      tg.BackButton?.offClick(goBack);
    };
  }, [goBack, pageStack.length]);

  useEffect(() => {
    if (activePage === 'p-history') {
      refreshOrderStatuses();
    } else if (activePage === 'p-profile') {
      void refreshCoins();
    }
  }, [activePage]); // eslint-disable-line react-hooks/exhaustive-deps

  const openGame = useCallback(
    (gameId: string) => {
      const target = games.find((g) => g.id === gameId) || games[0];
      setSelectedGameId(target.id);
      setSelectedPackId(target.packs[0]?.id || '');
      setPackageGroup(target.packs[0] ? getPackGroup(target.id, target.packs[0]) : 'all');
      setSelectedRegion('global');
      setPlayerID('');
      setServerID('');
      setSmmQuantity(String(target.packs[0]?.amount || 1000));
      setGameFormError('');
      navPage('p-game');
    },
    [games, navPage]
  );

  const selectedGame = useMemo(
    () => games.find((g) => g.id === selectedGameId) || games[0],
    [games, selectedGameId]
  );

  const selectedPack = useMemo(
    () => selectedGame.packs.find((p) => p.id === selectedPackId) || null,
    [selectedGame, selectedPackId]
  );
  const selectedOrderPack = useMemo(() => {
    if (!selectedPack) return null;
    if (selectedGame.category !== 'smm') return selectedPack;

    const quantity = Number(smmQuantity);
    if (!Number.isSafeInteger(quantity) || quantity < selectedPack.amount || quantity > 1_000_000) return null;

    const quantityLabel = quantity.toLocaleString('uz-UZ');
    return {
      ...selectedPack,
      amount: quantity,
      label: selectedPack.label.replace(/^[\d\s,._]+/, `${quantityLabel} `),
      priceUzs: calculateSmmPrice(quantity, selectedPack.amount, selectedPack.priceUzs),
      coinsReward: calculatePackCoins({
        amount: quantity,
        unit: selectedPack.unit,
        category: selectedGame.category,
        priceUzs: calculateSmmPrice(quantity, selectedPack.amount, selectedPack.priceUzs),
      }),
    };
  }, [selectedGame.category, selectedPack, smmQuantity]);

  const packageGroups = Array.from(new Set(selectedGame.packs.map((pack) => getPackGroup(selectedGame.id, pack))));
  const visiblePacks = selectedGame.packs.filter(
    (pack) => packageGroup === 'all' || getPackGroup(selectedGame.id, pack) === packageGroup
  );

  const filteredGames = useMemo(() => {
    if (category === 'all') return games;
    return games.filter((g) => g.category === category);
  }, [category, games]);

  const homeSections = useMemo(
    () => [
      {
        id: 'games' as GameCategory,
        title: t.sectionGamesTitle,
        items: games.filter((g) => g.category === 'games'),
      },
      {
        id: 'telegram' as GameCategory,
        title: t.sectionTelegramTitle,
        items: games.filter((g) => g.category === 'telegram'),
      },
      {
        id: 'smm' as GameCategory,
        title: t.sectionSmmTitle,
        items: games.filter((g) => g.category === 'smm'),
      },
      {
        id: 'cards' as GameCategory,
        title: t.sectionCardsTitle,
        items: games.filter((g) => g.category === 'cards'),
      },
    ],
    [games, t.sectionCardsTitle, t.sectionGamesTitle, t.sectionSmmTitle, t.sectionTelegramTitle]
  );

  function confirmSelection() {
    setGameFormError('');
    if (!selectedPack) {
      setGameFormError(t.errSelectPack);
      triggerHaptic('error');
      return;
    }
    if (!selectedOrderPack) {
      setGameFormError('Miqdor paket minimumidan 1 000 000 gacha bo‘lishi kerak.');
      triggerHaptic('error');
      return;
    }
    const check = validatePlayerInput(
      playerID,
      selectedGame.inputType,
      selectedGame.requiresServer,
      serverID
    );
    if (!check.ok) {
      if (check.code === 'username') setGameFormError(t.errInvalidUsername);
      else if (check.code === 'url') setGameFormError(t.errInvalidUrl);
      else if (check.code === 'server') setGameFormError(t.errServerRequired);
      else setGameFormError(t.errInvalidId);
      triggerHaptic('error');
      return;
    }

    setCheckoutData({
      game: selectedGame,
      pack: selectedOrderPack,
      playerID: check.cleanId,
      serverID: check.cleanServer,
      region: selectedRegion,
    });
    navPage('p-checkout');
  }

  async function copyWalletCard() {
    try {
      await navigator.clipboard.writeText(cardInfo.number.replace(/\s+/g, ''));
      setWalletCopied(true);
      triggerHaptic('light');
      window.setTimeout(() => setWalletCopied(false), 2000);
    } catch {
      setWalletCopied(false);
    }
  }

  if (isPanelRoute) {
    return (
      <Suspense
        fallback={
          <div className="min-h-screen bg-[#F2F2F7] text-[#6C6C70] flex items-center justify-center text-sm font-medium">
            Admin panel yuklanmoqda...
          </div>
        }
      >
        <AdminPanelPage
          t={t}
          lang={lang}
          theme={theme}
          onToggleTheme={applyTheme}
          games={games}
          customMedia={customMedia}
          cardInfo={cardInfo}
          initData={initData}
          initialAdminToken={urlAdminToken}
          onMediaUpdated={(nextMedia) => {
            setCustomMedia(nextMedia);
            writeCacheJson(MEDIA_CACHE_KEY, nextMedia);
          }}
          onCardUpdated={(nextCard) => {
            setCardInfo(nextCard);
            writeCacheJson(CARD_CACHE_KEY, nextCard);
          }}
          onBackToStore={() => {
            window.history.pushState({}, '', '/');
            setIsPanelRoute(false);
          }}
        />
      </Suspense>
    );
  }

  const isSubpage = activePage === 'p-game' || activePage === 'p-checkout';

  return (
    <div className="relative min-h-screen text-[var(--ink)] flex flex-col">
      <AppLoader visible={!isBootReady} />
      {/* Global Animated Apple iOS Mesh Wallpaper */}
      <div
        aria-hidden="true"
        className="fixed inset-0 -z-10 overflow-hidden pointer-events-none bg-gradient-to-br from-[#F4F7FC] via-[#FAFCFF] to-[#EEF4FF] dark:from-[#09090B] dark:via-[#0B0D14] dark:to-[#09090B]"
      >
        <div className="animate-ios-orb-a absolute -top-28 -left-20 h-[420px] w-[420px] rounded-full bg-[#93C5FD]/35 blur-3xl dark:bg-[#1D4ED8]/15" />
        <div className="animate-ios-orb-b absolute top-1/4 -right-24 h-[460px] w-[460px] rounded-full bg-[#67E8F9]/30 blur-3xl dark:bg-[#E5B94C]/10" />
        <div className="animate-ios-orb-c absolute -bottom-28 left-1/3 h-[440px] w-[440px] rounded-full bg-[#A5B4FC]/30 blur-3xl dark:bg-[#3B82F6]/10" />
      </div>

      {/* Top Bar */}
      <header className="sticky top-0 z-30 border-b border-black/[0.06] dark:border-[var(--line)] bg-white/75 dark:bg-[var(--surface)]/85 backdrop-blur-2xl pt-safe">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-13 md:h-16 flex items-center justify-between gap-4 md:gap-8">
          <div className="flex items-center gap-2.5 shrink-0">
            {isSubpage && (
              <button
                type="button"
                onClick={goBack}
                aria-label={t.backLabel}
                className="min-h-[44px] min-w-[44px] -ml-2 flex items-center justify-center rounded-full text-[var(--ink)] hover:bg-black/[0.05] dark:hover:bg-[var(--surface-muted)] cursor-pointer"
              >
                <ArrowLeft size={20} />
              </button>
            )}
            <button
              type="button"
              onClick={() => navPage('p-home')}
              className="font-display text-lg font-bold tracking-tight text-[var(--ink)] whitespace-nowrap shrink-0 cursor-pointer"
            >
              Olmos <span className="text-[var(--gold-2)] dark:text-[#E5B94C]">Pay</span>
            </button>
          </div>

          <nav aria-label="Primary navigation" className="hidden md:flex items-center gap-6 text-sm font-medium">
            {(
              [
                ['p-home', t.navHome],
                ['p-games', t.navGames],
                ['p-history', t.navHistory],
                ['p-profile', t.navProfile],
              ] as Array<[PageId, string]>
            ).map(([id, label]) => {
              const active = activePage === id;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => navPage(id)}
                  className={`py-1.5 whitespace-nowrap shrink-0 border-b-2 transition-colors cursor-pointer ${
                    active
                      ? 'border-[#007AFF] dark:border-[#E5B94C] text-[var(--ink)] font-semibold'
                      : 'border-transparent text-[var(--ink-muted)] hover:text-[var(--ink)]'
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </nav>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => navPage('p-profile')}
              aria-label={t.coinsBalanceTitle}
              className="min-h-[36px] px-2.5 rounded-full bg-amber-500/12 dark:bg-[#E5B94C]/14 text-amber-700 dark:text-[#E5B94C] text-xs font-mono-num font-bold inline-flex items-center gap-1 whitespace-nowrap shrink-0 cursor-pointer hover:bg-amber-500/18 transition-colors"
            >
              <Coins size={13} />
              <span>{coinsState.balance}</span>
            </button>
            <button
              type="button"
              onClick={() => navPage('p-games')}
              className="hidden md:inline-flex min-h-[40px] px-4 py-2 rounded-full bg-[#007AFF] hover:bg-[#0066D6] text-white dark:bg-[#E5B94C] dark:hover:bg-[#d6a938] dark:text-[#09090B] text-xs font-semibold items-center gap-1.5 shadow-[0_4px_12px_rgba(0,122,255,0.22)] dark:shadow-none whitespace-nowrap shrink-0 cursor-pointer"
            >
              <span>{t.heroCta}</span>
              <ArrowRight size={14} />
            </button>
            <button
              type="button"
              onClick={() => navPage('p-profile')}
              aria-label={t.navProfile}
              className="md:hidden min-h-[44px] min-w-[44px] -mr-2 flex items-center justify-center rounded-full text-[var(--ink-muted)] hover:text-[var(--ink)] cursor-pointer"
            >
              <User size={20} />
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 w-full max-w-6xl mx-auto px-4 sm:px-6 py-5 sm:py-8 pb-24 md:pb-12">
        {/* HOME PAGE */}
        {activePage === 'p-home' && (
          <div className="space-y-8">
            <BannerCarousel t={t} customMedia={customMedia} onSelectGame={openGame} />

            {/* Trust strip */}
            <div className="ios-glass-card grid grid-cols-1 sm:grid-cols-3 gap-3 rounded-[22px] px-5 py-4">
              <div className="flex items-center gap-3">
                <Zap size={18} className="text-[var(--gold-2)] dark:text-[#E5B94C] shrink-0" />
                <span className="text-sm font-medium text-[var(--ink)]">{t.trustFast}</span>
              </div>
              <div className="flex items-center gap-3">
                <ShieldCheck size={18} className="text-[var(--gold-2)] dark:text-[#E5B94C] shrink-0" />
                <span className="text-sm font-medium text-[var(--ink)]">{t.trustSecure}</span>
              </div>
              <div className="flex items-center gap-3">
                <Headphones size={18} className="text-[var(--gold-2)] dark:text-[#E5B94C] shrink-0" />
                <span className="text-sm font-medium text-[var(--ink)]">{t.trustSupport}</span>
              </div>
            </div>

            {/* Home Catalog Sections — Side-by-side compact cards */}
            <div className="space-y-6">
              {homeSections.map((section) => (
                <section key={section.id} className="space-y-2.5">
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-baseline gap-2">
                      <h2 className="font-display text-lg sm:text-xl font-bold text-[var(--ink)]">
                        {section.title}
                      </h2>
                      <span className="text-xs text-[var(--ink-muted)] font-mono-num">
                        {section.items.length}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setCategory(section.id);
                        navPage('p-games');
                      }}
                      className="min-h-[38px] px-2 text-xs sm:text-sm font-semibold text-[var(--gold-2)] dark:text-[#E5B94C] hover:underline whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      {t.viewAll}
                    </button>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5 sm:gap-3">
                    {section.items.map((game) => {
                      const minPrice = Math.min(...game.packs.map((p) => p.priceUzs));
                      const firstPack = game.packs[0];
                      const firstCoins =
                        firstPack?.coinsReward ??
                        calculatePackCoins({
                          amount: firstPack?.amount,
                          unit: firstPack?.unit,
                          category: game.category,
                          priceUzs: minPrice,
                        });
                      return (
                        <button
                          key={game.id}
                          type="button"
                          onClick={() => openGame(game.id)}
                          className="ios-glass-card group text-left rounded-[18px] hover:border-[#007AFF]/45 dark:hover:border-[#E5B94C]/60 p-2.5 sm:p-3.5 transition-all duration-150 active:scale-[0.98] flex items-center gap-2.5 sm:gap-3 cursor-pointer"
                        >
                          <GameEmblem
                            gameId={game.id}
                            name={game.name}
                            coverUrl={customMedia[game.id]}
                            size="sm"
                          />
                          <div className="min-w-0 flex-1">
                            <h3 className="font-display text-[13px] sm:text-sm font-bold text-[var(--ink)] truncate">
                              {game.name}
                            </h3>
                            <p className="mt-0.5 text-[11px] sm:text-xs font-mono-num font-semibold text-[var(--gold-2)] dark:text-[#E5B94C] truncate">
                              {formatUzs(minPrice, t.uzs)}
                            </p>
                            <p className="mt-0.5 text-[10px] text-[var(--ink-muted)] truncate">
                              {game.packs.length} {t.packsCount} · +{firstCoins} {t.coinsUnit}
                            </p>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </section>
              ))}
            </div>
          </div>
        )}

        {/* CATALOG PAGE — Side-by-side compact grid */}
        {activePage === 'p-games' && (
          <div className="space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <h1 className="font-display text-xl sm:text-2xl font-bold text-[var(--ink)]">{t.navGames}</h1>

              <div
                role="tablist"
                aria-label="Katalog toifalari"
                className="inline-flex items-center gap-1 p-1 rounded-xl border border-[var(--line)] bg-[var(--surface)] overflow-x-auto max-w-full"
              >
                {(
                  [
                    ['all', t.catAll],
                    ['games', t.catGames],
                    ['telegram', t.catTelegram],
                    ['smm', t.catSmm],
                    ['cards', t.catCards],
                  ] as Array<[GameCategory, string]>
                ).map(([catId, label]) => {
                  const active = category === catId;
                  return (
                    <button
                      key={catId}
                      type="button"
                      role="tab"
                      aria-selected={active}
                      onClick={() => setCategory(catId)}
                      className={`min-h-[38px] px-3 rounded-lg text-xs font-semibold whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                        active
                          ? 'bg-[#007AFF] text-white dark:bg-[#E5B94C] dark:text-[#09090B]'
                          : 'text-[var(--ink-muted)] hover:text-[var(--ink)]'
                      }`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5 sm:gap-3">
              {filteredGames.map((game) => {
                const minPrice = Math.min(...game.packs.map((p) => p.priceUzs));
                const firstPack = game.packs[0];
                const firstCoins =
                  firstPack?.coinsReward ??
                  calculatePackCoins({
                    amount: firstPack?.amount,
                    unit: firstPack?.unit,
                    category: game.category,
                    priceUzs: minPrice,
                  });
                return (
                  <button
                    key={game.id}
                    type="button"
                    onClick={() => openGame(game.id)}
                    className="ios-glass-card text-left rounded-[18px] hover:border-[#007AFF]/45 dark:hover:border-[#E5B94C]/60 p-2.5 sm:p-3.5 transition-all active:scale-[0.98] flex items-center gap-2.5 sm:gap-3 cursor-pointer"
                  >
                    <GameEmblem
                      gameId={game.id}
                      name={game.name}
                      coverUrl={customMedia[game.id]}
                      size="sm"
                    />
                    <div className="min-w-0 flex-1">
                      <h2 className="font-display text-[13px] sm:text-sm font-bold text-[var(--ink)] truncate">
                        {game.name}
                      </h2>
                      <p className="mt-0.5 text-[11px] sm:text-xs font-mono-num font-bold text-[var(--gold-2)] dark:text-[#E5B94C] truncate">
                        {formatUzs(minPrice, t.uzs)}
                      </p>
                      <p className="mt-0.5 text-[10px] text-[var(--ink-muted)] truncate">
                        {game.packs.length} {t.packsCount} · +{firstCoins} {t.coinsUnit}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* SINGLE SERVICE / PACKAGE SELECTION PAGE */}
        {activePage === 'p-game' && (
          <div className="max-w-3xl mx-auto space-y-6 pb-28 md:pb-8">
            <div className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-5 flex items-center gap-4">
              <GameEmblem
                gameId={selectedGame.id}
                name={selectedGame.name}
                coverUrl={customMedia[selectedGame.id]}
                size="lg"
              />
              <div className="min-w-0">
                <h1 className="font-display text-xl sm:text-2xl font-bold text-[var(--ink)]">
                  {selectedGame.name}
                </h1>
                <p className="text-sm text-[var(--ink-muted)]">
                  {t.gameSubtitles[selectedGame.id] || selectedGame.subtitle}
                </p>
              </div>
            </div>

            {/* Put player details before the package grid so the game ID stays visible on mobile. */}
            <section aria-labelledby="recipient-id-title" className="ios-glass-card scroll-mt-24 rounded-[22px] border border-[#007AFF]/20 p-5 space-y-4">
              <div className="flex items-center justify-between gap-3">
                <h2 id="recipient-id-title" className="font-display text-base font-bold text-[var(--ink)]">{t.enterDetails}</h2>
                <span className="rounded-full bg-[#007AFF]/10 px-2.5 py-1 text-[10px] font-bold tracking-wide text-[#007AFF] dark:bg-[#E5B94C]/15 dark:text-[#E5B94C]">1-QADAM</span>
              </div>
              <p className="text-xs text-[var(--ink-muted)]">O‘yin ID raqamini paket tanlashdan oldin kiriting.</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className={selectedGame.requiresServer ? '' : 'sm:col-span-2'}>
                  <label htmlFor="player-id-input" className="block text-xs font-semibold text-[var(--ink)] mb-1.5">
                    {selectedGame.inputLabel[lang] || selectedGame.inputLabel.uz}
                  </label>
                  <input
                    id="player-id-input"
                    type={selectedGame.inputType === 'url' ? 'url' : 'text'}
                    value={playerID}
                    onChange={(e) => {
                      setPlayerID(e.target.value);
                      setGameFormError('');
                    }}
                    placeholder={selectedGame.inputPlaceholder}
                    autoComplete="off"
                    className="w-full min-h-[56px] rounded-xl border border-[#007AFF]/30 bg-[var(--surface)] px-4 text-base sm:text-lg font-mono-num font-semibold text-[var(--ink)] placeholder:text-[var(--ink-muted)]/70 focus:outline-none focus:ring-2 focus:ring-[#007AFF]/25 focus:border-[#007AFF] dark:focus:border-[#E5B94C]"
                  />
                </div>
                {selectedGame.requiresServer && (
                  <div>
                    <label htmlFor="server-id-input" className="block text-xs font-semibold text-[var(--ink)] mb-1.5">
                      {selectedGame.serverLabel?.[lang] || 'Server ID'}
                    </label>
                    <input
                      id="server-id-input"
                      type="text"
                      value={serverID}
                      onChange={(e) => {
                        setServerID(e.target.value);
                        setGameFormError('');
                      }}
                      placeholder={selectedGame.serverPlaceholder || '1234'}
                      autoComplete="off"
                      className="w-full min-h-[56px] rounded-xl border border-[#007AFF]/30 bg-[var(--surface)] px-4 text-base sm:text-lg font-mono-num font-semibold text-[var(--ink)] placeholder:text-[var(--ink-muted)]/70 focus:outline-none focus:ring-2 focus:ring-[#007AFF]/25 focus:border-[#007AFF] dark:focus:border-[#E5B94C]"
                    />
                  </div>
                )}
              </div>
              {gameFormError && (
                <div role="alert" className="rounded-xl border border-red-500/35 bg-red-500/10 px-4 py-3 text-sm text-red-700 dark:text-red-300 flex items-start gap-2">
                  <AlertCircle size={18} className="shrink-0 mt-0.5" />
                  <span>{gameFormError}</span>
                </div>
              )}
            </section>

            {selectedGame.id === 'freefire' && (
              <section aria-label="O‘yin regionini tanlang" className="space-y-2">
                <h2 className="text-xs font-semibold text-[var(--ink-muted)]">REGIONNI TANLANG</h2>
                <div role="group" aria-label="Free Fire regioni" className="flex flex-wrap gap-2">
                  {GAME_REGIONS.map((region) => (
                    <button
                      key={region.id}
                      type="button"
                      aria-pressed={selectedRegion === region.id}
                      onClick={() => setSelectedRegion(region.id)}
                      className={`min-h-[44px] px-3 rounded-xl border border-[var(--line)] text-xs font-semibold cursor-pointer ${
                        selectedRegion === region.id
                          ? 'bg-[#007AFF] text-white dark:bg-[#E5B94C] dark:text-[#09090B]'
                          : 'bg-[var(--surface)] text-[var(--ink)]'
                      }`}
                    >
                      {region.label}
                    </button>
                  ))}
                </div>
              </section>
            )}

            <section aria-labelledby="pkg-grid-title" className="space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <h2 id="pkg-grid-title" className="font-display text-base font-bold text-[var(--ink)]">
                  {t.selectPackage}
                </h2>
                {packageGroups.length > 1 && (
                  <div role="tablist" aria-label="Paket turlari" className="inline-flex items-center gap-1 p-1 rounded-xl border border-[var(--line)] bg-[var(--surface)] overflow-x-auto max-w-full">
                    {['all', ...packageGroups].map((group) => {
                      const active = packageGroup === group;
                      return (
                        <button
                          key={group}
                          type="button"
                          role="tab"
                          aria-selected={active}
                          onClick={() => {
                            setPackageGroup(group);
                            const nextPack = selectedGame.packs.find(
                              (pack) => group === 'all' || getPackGroup(selectedGame.id, pack) === group
                            );
                            if (nextPack) {
                              setSelectedPackId(nextPack.id);
                              setSmmQuantity(String(nextPack.amount));
                            }
                            setGameFormError('');
                          }}
                          className={`min-h-[38px] px-3 rounded-lg text-xs font-semibold whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                            active
                              ? 'bg-[#007AFF] text-white dark:bg-[#E5B94C] dark:text-[#09090B]'
                              : 'text-[var(--ink-muted)] hover:text-[var(--ink)]'
                          }`}
                        >
                          {PACKAGE_GROUP_LABELS[group] || group}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 sm:gap-3">
                {visiblePacks.map((pack) => {
                  const selected = selectedPackId === pack.id;
                  const packCover = customMedia[`pack:${pack.id}`];
                  const automaticForRegion = Boolean(pack.autoDelivery) && (selectedGame.id !== 'freefire' || selectedRegion === 'global');
                  const packCoins =
                    pack.coinsReward ??
                    calculatePackCoins({
                      amount: pack.amount,
                      unit: pack.unit,
                      category: selectedGame.category,
                      priceUzs: pack.priceUzs,
                    });
                  return (
                    <button
                      key={pack.id}
                      type="button"
                      onClick={() => {
                        setSelectedPackId(pack.id);
                        setSmmQuantity(String(pack.amount));
                        setGameFormError('');
                        triggerHaptic('light');
                      }}
                      aria-pressed={selected}
                      className={`min-h-[88px] text-left rounded-2xl border p-3 transition-all active:scale-[0.98] cursor-pointer flex flex-col justify-between gap-2 shadow-sm ${
                        selected
                          ? 'border-[#007AFF] bg-[#007AFF]/8 ring-1 ring-[#007AFF] dark:border-[#E5B94C] dark:bg-[#E5B94C]/12 dark:ring-[#E5B94C]'
                          : 'border-[var(--line)] bg-[var(--surface)] hover:border-[#007AFF]/45 dark:hover:border-[#E5B94C]/50'
                      }`}
                    >
                      <div className="flex items-start gap-2">
                        {packCover ? (
                          <img
                            src={packCover}
                            alt={pack.label}
                            loading="lazy"
                            decoding="async"
                            referrerPolicy="no-referrer"
                            className="h-9 w-9 rounded-xl object-cover border border-black/[0.06] shrink-0"
                          />
                        ) : (
                          <GameEmblem
                            gameId={selectedGame.id}
                            name={pack.label}
                            coverUrl={customMedia[selectedGame.id]}
                            size="sm"
                          />
                        )}
                        <span className="font-display text-[13px] sm:text-sm font-bold text-[var(--ink)] leading-snug">
                          {pack.label}
                        </span>
                      </div>
                      <div className="space-y-0.5">
                        <span className="block font-mono-num text-[13px] sm:text-sm font-bold text-[var(--gold-2)] dark:text-[#E5B94C]">
                          {formatUzs(pack.priceUzs, t.uzs)}
                        </span>
                        <span className="block text-[11px] font-mono-num font-semibold text-amber-600 dark:text-[#E5B94C]">
                          🪙 +{packCoins} {t.coinsUnit} ·{' '}
                          <span className="font-normal text-[var(--ink-muted)]">
                            {automaticForRegion ? t.autoLabel : t.manualLabel}
                          </span>
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </section>

            {selectedGame.category === 'smm' && selectedPack && (
              <section aria-labelledby="smm-quantity-title" className="ios-glass-card rounded-[22px] border border-[#007AFF]/20 p-5 space-y-3">
                <label id="smm-quantity-title" htmlFor="smm-quantity" className="block text-sm font-semibold text-[var(--ink)]">
                  Buyurtma miqdori ({selectedPack.unit})
                </label>
                <input
                  id="smm-quantity"
                  type="number"
                  inputMode="numeric"
                  min={selectedPack.amount}
                  max={1_000_000}
                  step={1}
                  value={smmQuantity}
                  aria-invalid={!selectedOrderPack}
                  onChange={(event) => {
                    setSmmQuantity(event.target.value);
                    setGameFormError('');
                  }}
                  className="w-full min-h-[52px] rounded-xl border border-[#007AFF]/30 bg-[var(--surface)] px-4 text-lg font-mono-num font-semibold text-[var(--ink)] focus:outline-none focus:ring-2 focus:ring-[#007AFF]/25"
                />
                <p className="text-xs text-[var(--ink-muted)]">
                  Minimal miqdor {selectedPack.amount.toLocaleString('uz-UZ')}. Narx tanlangan xizmat tarifiga qarab avtomatik hisoblanadi.
                </p>
              </section>
            )}

            {/* Sticky Purchase Bar */}
            <div className="fixed bottom-0 left-0 right-0 z-30 border-t border-[var(--line)] bg-[var(--surface)]/95 backdrop-blur-md px-4 py-3 pb-safe md:static md:rounded-2xl md:border md:p-5">
              <div className="max-w-3xl mx-auto flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-xs text-[var(--ink-muted)] truncate">
                    {selectedOrderPack ? (
                      <>
                        <span>{selectedOrderPack.label}</span>
                        <span className="text-amber-600 dark:text-[#E5B94C] font-mono-num font-semibold whitespace-nowrap">
                          {' '}
                          · 🪙 +
                          {calculatePackCoins({
                            amount: selectedOrderPack.amount,
                            unit: selectedOrderPack.unit,
                            category: selectedGame.category,
                            priceUzs: selectedOrderPack.priceUzs,
                          })}{' '}
                          {t.coinsUnit}
                        </span>
                      </>
                    ) : (
                      t.selectedPack
                    )}
                  </p>
                  <p className="font-mono-num text-base sm:text-lg font-bold text-[var(--gold-2)] dark:text-[#E5B94C] whitespace-nowrap">
                    {selectedOrderPack ? formatUzs(selectedOrderPack.priceUzs, t.uzs) : '—'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={confirmSelection}
                  className="min-h-[46px] px-6 rounded-xl bg-[#007AFF] hover:bg-[#0066D6] active:scale-[0.98] text-white dark:bg-[#E5B94C] dark:hover:bg-[#d6a938] dark:text-[#09090B] font-semibold text-sm inline-flex items-center gap-2 whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <span>{t.confirmOrder}</span>
                  <ArrowRight size={16} />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* CHECKOUT PAGE */}
        {activePage === 'p-checkout' && checkoutData && (
          <CheckoutPage
            t={t}
            lang={lang}
            game={checkoutData.game}
            pack={checkoutData.pack}
            playerID={checkoutData.playerID}
            serverID={checkoutData.serverID}
            region={checkoutData.region}
            initData={initData}
            cardInfo={cardInfo}
            onOrderCreated={(ord) => saveHistory([ord, ...sessionHistory])}
            onGoHistory={() => navPage('p-history')}
          />
        )}

        {/* WALLET / PAYMENT DETAILS PAGE */}
        {activePage === 'p-wallet' && (
          <div className="max-w-2xl mx-auto space-y-6">
            <div>
              <h1 className="font-display text-2xl font-bold text-[var(--ink)]">{t.walletTitle}</h1>
              <p className="mt-1 text-sm text-[var(--ink-muted)]">{t.walletSubtitle}</p>
            </div>

            <div className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-6 space-y-4">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-xs text-[var(--ink-muted)]">{cardInfo.bank}</p>
                  <p className="font-display text-base font-bold text-[var(--ink)]">{cardInfo.holder}</p>
                </div>
                <ShieldCheck size={22} className="text-[var(--gold-2)] dark:text-[#E5B94C]" />
              </div>

              <div className="flex items-center justify-between gap-2 rounded-xl border border-[var(--line)] bg-[var(--surface-muted)] px-3.5 sm:px-4 py-3.5">
                <span className="font-mono-num text-sm sm:text-lg font-bold tracking-wider text-[var(--ink)] whitespace-nowrap">
                    {cardInfo.number.replace(/\s+/g, '').replace(/(\d{4})(?=\d)/g, '$1 ')}

                </span>
                <button
                  type="button"
                  onClick={copyWalletCard}
                  className="min-h-[44px] px-4 rounded-lg border border-[var(--line)] bg-[var(--surface)] text-xs font-semibold text-[var(--ink)] inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
                >
                  {walletCopied ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} />}
                  <span>{walletCopied ? t.cardCopied : t.cardCopy}</span>
                </button>
              </div>
            </div>

            <div className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-6 space-y-3 text-sm text-[var(--ink-muted)]">
              <p className="text-[var(--ink)] font-medium">{t.walletStep1}</p>
              <p>{t.walletStep2}</p>
              <p>{t.walletStep3}</p>
            </div>
          </div>
        )}

        {/* HISTORY PAGE */}
        {activePage === 'p-history' && (
          <HistoryPage
            t={t}
            lang={lang}
            orders={sessionHistory}
            refreshing={refreshingHistory}
            onRefresh={refreshOrderStatuses}
            onBrowseGames={() => navPage('p-games')}
          />
        )}

        {/* PROFILE & SETTINGS PAGE */}
        {activePage === 'p-profile' && (
          <div className="max-w-2xl mx-auto space-y-5">
            <h1 className="font-display text-2xl font-bold text-[var(--ink)]">{t.profileTitle}</h1>

            <div className="ios-glass-card rounded-[22px] p-5 flex items-center gap-4">
              <div className="h-12 w-12 rounded-2xl bg-[#007AFF]/12 text-[#007AFF] dark:bg-[#18181D] dark:text-[#E5B94C] border border-[#007AFF]/20 dark:border-[#E5B94C]/25 flex items-center justify-center shrink-0">
                <User size={22} />
              </div>
              <div className="min-w-0">
                <p className="font-display text-base font-bold text-[var(--ink)] truncate">
                  {tgUser ? `${tgUser.first_name || ''} ${tgUser.last_name || ''}`.trim() || 'Telegram User' : 'Olmos Pay'}
                </p>
                <p className="text-xs text-[var(--ink-muted)] truncate">
                  {tgUser?.username ? `@${tgUser.username} · ID ${tgUser.id}` : t.profileGuest}
                </p>
              </div>
            </div>

            {/* Olmos Coin Balance Card */}
            <div className="ios-glass-card rounded-[22px] p-5 space-y-3">
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="h-11 w-11 rounded-2xl bg-amber-500/14 text-amber-600 dark:text-[#E5B94C] flex items-center justify-center shrink-0">
                    <Coins size={22} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs text-[var(--ink-muted)]">{t.coinsBalanceTitle}</p>
                    <p className="font-mono-num text-xl font-bold text-[var(--ink)]">
                      {coinsState.balance} {t.coinsUnit}
                    </p>
                  </div>
                </div>
                <span className="text-xs font-mono-num font-semibold text-amber-600 dark:text-[#E5B94C] shrink-0">
                  60 UC = 6 {t.coinsUnit}
                </span>
              </div>
              <p className="text-xs text-[var(--ink-muted)]">{t.coinsRuleHint}</p>

              {coinsState.history.length > 0 && (
                <div className="pt-2 border-t border-[var(--line)] space-y-1.5">
                  {coinsState.history.slice(0, 5).map((entry) => (
                    <div key={entry.ref} className="flex items-center justify-between gap-3 text-xs">
                      <span className="text-[var(--ink-muted)] truncate">
                        {entry.gameName} · {entry.packLabel}
                      </span>
                      <span className="font-mono-num font-semibold text-amber-600 dark:text-[#E5B94C] shrink-0">
                        +{entry.coins} {t.coinsUnit}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Language Selector */}
            <div className="ios-glass-card rounded-[22px] p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <span className="text-sm font-semibold text-[var(--ink)]">{t.profileLanguage}</span>
              <div className="inline-flex items-center gap-1 p-1 rounded-xl border border-[var(--line)] bg-[var(--surface-muted)]">
                {(['uz', 'ru', 'en'] as Lang[]).map((code) => (
                  <button
                    key={code}
                    type="button"
                    onClick={() => applyLanguage(code)}
                    className={`min-h-[40px] px-4 rounded-lg text-xs font-semibold uppercase whitespace-nowrap cursor-pointer ${
                      lang === code
                        ? 'bg-[#007AFF] text-white dark:bg-[#E5B94C] dark:text-[#09090B]'
                        : 'text-[var(--ink-muted)] hover:text-[var(--ink)]'
                    }`}
                  >
                    {code}
                  </button>
                ))}
              </div>
            </div>

            {/* Theme Selector */}
            <div className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <span className="text-sm font-semibold text-[var(--ink)]">{t.profileTheme}</span>
              <div className="inline-flex items-center gap-1 p-1 rounded-xl border border-[var(--line)] bg-[var(--surface-muted)]">
                <button
                  type="button"
                  onClick={() => applyTheme('light')}
                  className={`min-h-[40px] px-4 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
                    theme === 'light'
                      ? 'bg-[#007AFF] text-white shadow-sm'
                      : 'text-[var(--ink-muted)] hover:text-[var(--ink)]'
                  }`}
                >
                  <Sun size={14} />
                  <span>{t.themeLight}</span>
                </button>
                <button
                  type="button"
                  onClick={() => applyTheme('dark')}
                  className={`min-h-[40px] px-4 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
                    theme === 'dark'
                      ? 'bg-[#E5B94C] text-[#09090B]'
                      : 'text-[var(--ink-muted)] hover:text-[var(--ink)]'
                  }`}
                >
                  <Moon size={14} />
                  <span>{t.themeDark}</span>
                </button>
              </div>
            </div>

            {/* Support */}
            <div className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-5 space-y-1.5">
              <h2 className="font-display text-base font-bold text-[var(--ink)]">{t.profileSupport}</h2>
              <p className="text-sm text-[var(--ink-muted)]">{t.supportDesc}</p>
            </div>
          </div>
        )}
      </main>

      {/* Bottom Tab Navigation */}
      {!isSubpage && <BottomNav activePage={activePage} t={t} onNavigate={navPage} />}
    </div>
  );
}
