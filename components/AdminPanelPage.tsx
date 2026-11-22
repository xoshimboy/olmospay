import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  BarChart3,
  Bot,
  Check,
  CheckCircle2,
  ChevronRight,
  Clock3,
  CreditCard,
  Download,
  ExternalLink,
  ImageIcon,
  ImagePlus,
  Images,
  KeyRound,
  Layers,
  Loader2,
  LogOut,
  RefreshCw,
  Search,
  Send,
  Settings,
  ShieldCheck,
  ShoppingBag,
  Store,
  Trash2,
  Users,
  Zap,
} from 'lucide-react';
import { BANNER_IMAGES, CARD_INFO } from '../data/catalog';
import type { I18nDict } from '../data/i18n';
import type { CardInfo, GameItem, Lang, OrderStatus, ThemeMode } from '../types';
import { compressBannerImage, compressCoverImage, formatOrderDate, formatUzs } from '../utils/format';
import { GameEmblem } from './GameEmblem';

type AdminTab = 'stats' | 'orders' | 'covers' | 'banners' | 'message' | 'settings';
type CoverScope = 'services' | 'packs';

interface AdminOrderRecord {
  ref: string;
  status: OrderStatus;
  gameId: string;
  gameName: string;
  packId: string;
  packLabel: string;
  priceUzs: number;
  coinsReward?: number;
  playerId: string;
  playerDisplay: string;
  server?: string;
  tgUserId?: string;
  tgUsername?: string;
  tgFirstName?: string;
  sourceType?: string;
  mapped?: boolean;
  soraService?: string;
  soraOrderId?: string | null;
  charged?: number | null;
  refunded?: boolean;
  lastError?: string;
  createdAt: number;
  updatedAt?: number;
}

interface AdminMessageLog {
  id: string;
  createdAt: number;
  target: 'broadcast' | 'admin' | 'custom';
  preview: string;
  totalTargets: number;
  sentCount: number;
  failedCount: number;
  status: 'sent' | 'partial' | 'failed';
}

interface AdminDashboardData {
  ok: boolean;
  authMode: string;
  stats: {
    totalOrders: number;
    completedOrders: number;
    pendingOrders: number;
    processingOrders: number;
    canceledOrders: number;
    totalRevenueUzs: number;
    uniqueCustomers: number;
    storeServicesCount: number;
  };
  orders: AdminOrderRecord[];
  messageLogs: AdminMessageLog[];
  card: CardInfo;
  sora: {
    ok: boolean;
    balance: number | null;
    currency: string;
    discountPercent: number | null;
    spentToday: number | null;
    dailyLimit: number | null;
    servicesCount: number;
    services: Array<{ service: string; name: string; type: string }>;
    error: string | null;
  };
  bot: {
    configured: boolean;
    connected: boolean;
    error: string | null;
    adminIdSet: boolean;
    username: string | null;
  };
}

interface AdminPanelPageProps {
  t: I18nDict;
  lang: Lang;
  theme?: ThemeMode;
  onToggleTheme?: (mode: ThemeMode) => void;
  games: GameItem[];
  customMedia: Record<string, string>;
  cardInfo: CardInfo;
  initData: string;
  initialAdminToken?: string;
  onMediaUpdated: (media: Record<string, string>) => void;
  onCardUpdated: (card: CardInfo) => void;
  onBackToStore?: () => void;
}

const ADMIN_KEY_STORAGE = 'gamepin_admin_key_v1';
export const ADMIN_TOKEN_STORAGE = 'gamepin_admin_token_v1';

export function AdminPanelPage({
  t,
  lang,
  games,
  customMedia,
  cardInfo,
  initData,
  initialAdminToken = '',
  onMediaUpdated,
  onCardUpdated,
  onBackToStore,
}: AdminPanelPageProps) {
  const [activeTab, setActiveTab] = useState<AdminTab>('stats');

  const [adminKey, setAdminKey] = useState<string>(() => {
    try {
      return window.sessionStorage.getItem(ADMIN_KEY_STORAGE) || '';
    } catch {
      return '';
    }
  });
  const [keyInput, setKeyInput] = useState<string>(() => {
    try {
      return window.sessionStorage.getItem(ADMIN_KEY_STORAGE) || '';
    } catch {
      return '';
    }
  });
  const [adminToken, setAdminToken] = useState<string>(() => {
    if (initialAdminToken) return initialAdminToken;
    try {
      return window.sessionStorage.getItem(ADMIN_TOKEN_STORAGE) || '';
    } catch {
      return '';
    }
  });

  const [loading, setLoading] = useState<boolean>(true);
  const [unauthorizedMsg, setUnauthorizedMsg] = useState<string>('');
  const [dashboard, setDashboard] = useState<AdminDashboardData | null>(null);
  const [bannerNotice, setBannerNotice] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [downloadingPart, setDownloadingPart] = useState<'' | 'site' | 'bot'>('');

  // Orders tab state
  const [orderFilter, setOrderFilter] = useState<'all' | 'pending' | 'processing' | 'completed' | 'canceled'>('all');
  const [orderSearch, setOrderSearch] = useState('');
  const [busyOrderRef, setBusyOrderRef] = useState('');

  // Covers & banners upload state
  const [coverScope, setCoverScope] = useState<CoverScope>('services');
  const [selectedCoverGameId, setSelectedCoverGameId] = useState<string>('all');
  const [busyMediaId, setBusyMediaId] = useState('');
  const coverInputsRef = useRef<Record<string, HTMLInputElement | null>>({});
  const bannerInputsRef = useRef<Record<string, HTMLInputElement | null>>({});

  // Settings / Card form state
  const [cardNumber, setCardNumber] = useState(cardInfo.number || CARD_INFO.number);
  const [cardHolder, setCardHolder] = useState(cardInfo.holder || CARD_INFO.holder);
  const [cardBank, setCardBank] = useState(cardInfo.bank || CARD_INFO.bank);
  const [savingCard, setSavingCard] = useState(false);

  // Telegram broadcast / direct message state
  const [msgTarget, setMsgTarget] = useState<'admin' | 'broadcast' | 'custom'>('admin');
  const [customChatId, setCustomChatId] = useState('');
  const [msgText, setMsgText] = useState('');
  const [broadcastConfirmed, setBroadcastConfirmed] = useState(false);
  const [sendingMsg, setSendingMsg] = useState(false);

  const buildAuthHeaders = useCallback(
    (overrideKey?: string) => {
      const effectiveKey = overrideKey !== undefined ? overrideKey : adminKey;
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (initData) headers['X-Tg-Init-Data'] = initData;
      if (adminToken) headers['X-Admin-Token'] = adminToken;
      if (effectiveKey) headers['X-Admin-Key'] = effectiveKey;
      return headers;
    },
    [adminKey, adminToken, initData]
  );

  const loadDashboard = useCallback(
    async (overrideKey?: string) => {
      setLoading(true);
      setUnauthorizedMsg('');
      try {
        const res = await fetch('/.netlify/functions/admin-panel', {
          method: 'GET',
          headers: buildAuthHeaders(overrideKey),
        });
        const data = await res.json().catch(() => null);
        if (res.status === 401 || !res.ok || !data?.ok) {
          setDashboard(null);
          if (data?.code === 'auth_required') {
            setUnauthorizedMsg('');
          } else {
            setUnauthorizedMsg(
              data?.error || 'Kirish tasdiqlanmadi. Botda /panel yozing yoki ADMIN_PANEL_KEY ni kiriting.'
            );
          }
          return;
        }
        setDashboard(data);
        if (data.card) {
          onCardUpdated(data.card);
          setCardNumber(data.card.number);
          setCardHolder(data.card.holder);
          setCardBank(data.card.bank);
        }
      } catch {
        setUnauthorizedMsg('Server bilan bog‘lanib bo‘lmadi.');
      } finally {
        setLoading(false);
      }
    },
    [buildAuthHeaders, onCardUpdated]
  );

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  function handleKeySubmit(e: React.FormEvent) {
    e.preventDefault();
    const clean = keyInput.trim();
    setAdminKey(clean);
    try {
      window.sessionStorage.setItem(ADMIN_KEY_STORAGE, clean);
    } catch {
      // Ignore storage error
    }
    loadDashboard(clean);
  }

  function handleSignOut() {
    setAdminKey('');
    setKeyInput('');
    setAdminToken('');
    setDashboard(null);
    try {
      window.sessionStorage.removeItem(ADMIN_KEY_STORAGE);
      window.sessionStorage.removeItem(ADMIN_TOKEN_STORAGE);
    } catch {
      // Ignore
    }
    loadDashboard('');
  }

  async function runOrderAction(ref: string, action: 'approve-order' | 'check-order' | 'manual-done' | 'reject-order' | 'delete-order') {
    if (action === 'delete-order' && !window.confirm('Faqat kutilayotgan yoki bekor qilingan buyurtma o‘chiriladi. Davom etasizmi?')) return;
    setBannerNotice(null);
    setBusyOrderRef(ref);
    try {
      const res = await fetch('/.netlify/functions/admin-panel', {
        method: 'POST',
        headers: buildAuthHeaders(),
        body: JSON.stringify({ action, ref, initData, adminKey, adminToken }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) {
        setBannerNotice({ type: 'err', text: data?.error || 'Buyurtma amalini bajarib bo‘lmadi.' });
        return;
      }
      if (action === 'delete-order') {
        setDashboard((prev) => prev ? { ...prev, orders: prev.orders.filter((o) => o.ref !== ref) } : prev);
      } else if (data.order) {
        setDashboard((prev) => {
          if (!prev) return prev;
          const nextOrders = prev.orders.map((o) => (o.ref === ref ? { ...o, ...data.order } : o));
          return { ...prev, orders: nextOrders };
        });
      }
      setBannerNotice({
        type: 'ok',
        text: data.note || `Buyurtma (${ref}) yangilandi.`,
      });
      if (action === 'approve-order') {
        loadDashboard();
      }
    } catch {
      setBannerNotice({ type: 'err', text: t.errNetwork });
    } finally {
      setBusyOrderRef('');
    }
  }

  async function handleMediaUpload(targetId: string, file?: File, isBanner = false) {
    if (!file) return;
    setBannerNotice(null);
    setBusyMediaId(targetId);
    try {
      const compressed = isBanner ? await compressBannerImage(file) : await compressCoverImage(file);
      const res = await fetch('/.netlify/functions/admin-media', {
        method: 'POST',
        headers: buildAuthHeaders(),
        body: JSON.stringify({
          gameId: targetId,
          photo: compressed,
          initData,
          adminKey,
          adminToken,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) {
        setBannerNotice({ type: 'err', text: data?.error || t.errNetwork });
        return;
      }
      onMediaUpdated(data.media || {});
      setBannerNotice({
        type: 'ok',
        text: isBanner ? 'Banner oblojkasi saqlandi va do‘konda yangilandi.' : t.adminSavedMsg,
      });
    } catch (err) {
      const code = err instanceof Error ? err.message : '';
      if (code === 'FILE_TOO_LARGE') setBannerNotice({ type: 'err', text: t.errFileTooLarge });
      else if (code === 'UNSUPPORTED_TYPE') setBannerNotice({ type: 'err', text: t.errFileType });
      else setBannerNotice({ type: 'err', text: t.errNetwork });
    } finally {
      setBusyMediaId('');
    }
  }

  async function handleMediaDelete(targetId: string, isBanner = false) {
    setBannerNotice(null);
    setBusyMediaId(targetId);
    try {
      const res = await fetch('/.netlify/functions/admin-media', {
        method: 'DELETE',
        headers: buildAuthHeaders(),
        body: JSON.stringify({ gameId: targetId, initData, adminKey, adminToken }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) {
        setBannerNotice({ type: 'err', text: data?.error || t.errNetwork });
        return;
      }
      onMediaUpdated(data.media || {});
      setBannerNotice({
        type: 'ok',
        text: isBanner ? 'Banner asl rasmga qaytarildi.' : t.adminDeletedMsg,
      });
    } catch {
      setBannerNotice({ type: 'err', text: t.errNetwork });
    } finally {
      setBusyMediaId('');
    }
  }

  async function handleSaveCard(e: React.FormEvent) {
    e.preventDefault();
    setBannerNotice(null);
    setSavingCard(true);
    try {
      const res = await fetch('/.netlify/functions/admin-panel', {
        method: 'POST',
        headers: buildAuthHeaders(),
        body: JSON.stringify({
          action: 'save-card',
          number: cardNumber,
          holder: cardHolder,
          bank: cardBank,
          initData,
          adminKey,
          adminToken,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) {
        setBannerNotice({ type: 'err', text: data?.error || 'Karta ma’lumotlari noto‘g‘ri.' });
        return;
      }
      if (data.card) {
        onCardUpdated(data.card);
        setCardNumber(data.card.number);
        setCardHolder(data.card.holder);
        setCardBank(data.card.bank);
      }
      setBannerNotice({ type: 'ok', text: 'To‘lov kartasi saqlandi va do‘konda yangilandi.' });
    } catch {
      setBannerNotice({ type: 'err', text: t.errNetwork });
    } finally {
      setSavingCard(false);
    }
  }

  async function handleSendMessage(e: React.FormEvent) {
    e.preventDefault();
    if (!msgText.trim()) return;
    setBannerNotice(null);
    setSendingMsg(true);
    try {
      const targetValue = msgTarget === 'custom' ? customChatId.trim() : msgTarget;
      const res = await fetch('/.netlify/functions/admin-panel', {
        method: 'POST',
        headers: buildAuthHeaders(),
        body: JSON.stringify({
          action: 'send-message',
          target: targetValue,
          targetType: msgTarget,
          text: msgText.trim(),
          initData,
          adminKey,
          adminToken,
        }),
      });
      const data = await res.json().catch(() => null);
      if (Array.isArray(data?.messageLogs)) {
        setDashboard((current) => (current ? { ...current, messageLogs: data.messageLogs } : current));
      }
      if (!res.ok || !data?.ok) {
        setBannerNotice({ type: 'err', text: data?.error || 'Xabar yuborib bo‘lmadi.' });
        return;
      }
      setMsgText('');
      setBroadcastConfirmed(false);
      setBannerNotice({
        type: data.failedCount > 0 ? 'err' : 'ok',
        text: data.failedCount > 0
          ? `${data.sentCount} ta yuborildi, ${data.failedCount} ta yetkazilmadi.`
          : `Xabar yuborildi (${data.sentCount || 1} ta qabul qiluvchiga).`,
      });
    } catch {
      setBannerNotice({ type: 'err', text: t.errNetwork });
    } finally {
      setSendingMsg(false);
    }
  }

  async function handleDownloadZip(part: 'site' | 'bot') {
    setBannerNotice(null);
    setDownloadingPart(part);
    const filename = part === 'bot' ? 'olmos-pay-bot.zip' : 'olmos-pay-sayt.zip';
    try {
      const res = await fetch(`/api/export-zip?part=${part}`, {
        method: 'GET',
        headers: buildAuthHeaders(),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        setBannerNotice({ type: 'err', text: err?.error || 'ZIP arxivni yuklab bo‘lmadi.' });
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
      setBannerNotice({ type: 'ok', text: `${filename} yuklab olindi.` });
    } catch {
      setBannerNotice({ type: 'err', text: t.errNetwork });
    } finally {
      setDownloadingPart('');
    }
  }

  const filteredOrders = useMemo(() => {
    const list = dashboard?.orders || [];
    const q = orderSearch.trim().toLowerCase();
    return list.filter((o) => {
      if (orderFilter !== 'all') {
        if (orderFilter === 'pending' && o.status !== 'pending' && o.status !== 'manual_pending') return false;
        if (orderFilter !== 'pending' && o.status !== orderFilter) return false;
      }
      if (!q) return true;
      return (
        o.ref.toLowerCase().includes(q) ||
        o.gameName.toLowerCase().includes(q) ||
        o.playerDisplay.toLowerCase().includes(q) ||
        (o.tgUsername || '').toLowerCase().includes(q)
      );
    });
  }, [dashboard?.orders, orderFilter, orderSearch]);

  const coverSections = useMemo(
    () => [
      {
        title: `${t.sectionGamesTitle} va ${t.sectionCardsTitle}`,
        items: games.filter((g) => g.category === 'games' || g.category === 'cards'),
      },
      {
        title: t.sectionTelegramTitle,
        items: games.filter((g) => g.category === 'telegram'),
      },
      {
        title: t.sectionSmmTitle,
        items: games.filter((g) => g.category === 'smm'),
      },
    ],
    [games, t.sectionCardsTitle, t.sectionGamesTitle, t.sectionSmmTitle, t.sectionTelegramTitle]
  );

  const visiblePackGroups = useMemo(() => {
    if (selectedCoverGameId === 'all') return games;
    return games.filter((g) => g.id === selectedCoverGameId);
  }, [games, selectedCoverGameId]);

  const navTabs: Array<{ id: AdminTab; label: string; icon: typeof BarChart3 }> = [
    { id: 'stats', label: 'Statistika', icon: BarChart3 },
    { id: 'orders', label: 'Buyurtmalar', icon: ShoppingBag },
    { id: 'covers', label: 'Oblojkalar', icon: Images },
    { id: 'banners', label: 'Bannerlar', icon: ImageIcon },
    { id: 'message', label: 'Xabar', icon: Send },
    { id: 'settings', label: 'Sozlamalar', icon: Settings },
  ];

  function getStatusMeta(status: OrderStatus) {
    switch (status) {
      case 'completed':
        return { label: t.statusMap.completed, cls: 'text-[#1F8B4D] bg-[#34C759]/12' };
      case 'processing':
        return { label: t.statusMap.processing, cls: 'text-[#C96B00] bg-[#FF9500]/14' };
      case 'canceled':
        return { label: t.statusMap.canceled, cls: 'text-[#D70015] bg-[#FF3B30]/12' };
      case 'manual_pending':
        return { label: t.statusMap.manual_pending, cls: 'text-[#0066D6] bg-[#007AFF]/12' };
      default:
        return { label: t.statusMap.pending, cls: 'text-[#0066D6] bg-[#007AFF]/10' };
    }
  }

  return (
    <div className="min-h-screen bg-[#F2F2F7] text-[#1C1C1E] flex flex-col">
      {/* Apple iOS Translucent Frosted Top Navigation Bar */}
      <header className="sticky top-0 z-30 border-b border-black/[0.08] bg-white/85 backdrop-blur-xl pt-safe">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 h-16 flex items-center justify-between gap-3 sm:gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="h-10 w-10 rounded-[12px] bg-[#007AFF] text-white flex items-center justify-center shrink-0 shadow-sm shadow-[#007AFF]/25">
              <ShieldCheck size={22} strokeWidth={2.1} />
            </div>
            <div className="min-w-0">
              <p className="text-[11px] font-semibold tracking-wider text-[#8E8E93] uppercase truncate">
                OLMOS PAY
              </p>
              <h1 className="font-display text-lg font-bold text-[#1C1C1E] leading-tight whitespace-nowrap">
                Admin panel
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {dashboard && (
              <>
                <button
                  type="button"
                  onClick={() => handleDownloadZip('site')}
                  aria-label="Sayt ZIP faylini yuklab olish"
                  disabled={Boolean(downloadingPart)}
                  className="min-h-[40px] px-3 rounded-full border border-black/[0.08] bg-white hover:bg-[#F2F2F7] text-[#1C1C1E] text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-60"
                >
                  {downloadingPart === 'site' ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
                  <span className="hidden sm:inline">Sayt ZIP</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleDownloadZip('bot')}
                  aria-label="Bot ZIP faylini yuklab olish"
                  disabled={Boolean(downloadingPart)}
                  className="min-h-[40px] px-3.5 rounded-full bg-[#007AFF] hover:bg-[#0066D6] text-white text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-60 shadow-sm"
                >
                  {downloadingPart === 'bot' ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
                  <span className="hidden sm:inline">Bot ZIP</span>
                </button>
              </>
            )}

            <button
              type="button"
              onClick={() => loadDashboard()}
              disabled={loading}
              aria-label="Yangilash"
              className="min-h-[40px] min-w-[40px] rounded-full border border-black/[0.08] bg-[#F2F2F7] hover:bg-[#E5E5EA] flex items-center justify-center text-[#1C1C1E] cursor-pointer disabled:opacity-50"
            >
              <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
            </button>

            <button
              type="button"
              onClick={() => {
                if (onBackToStore) {
                  onBackToStore();
                } else {
                  window.location.href = '/';
                }
              }}
              aria-label="Do‘konga qaytish"
              className="min-h-[40px] px-3.5 rounded-full border border-black/[0.08] bg-white hover:bg-[#F2F2F7] text-xs font-semibold text-[#007AFF] inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer shadow-[0_1px_2px_rgba(0,0,0,0.04)]"
            >
              <Store size={15} />
              <span className="hidden sm:inline">Do‘kon</span>
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 w-full max-w-7xl mx-auto px-3 sm:px-6 py-4 sm:py-6 space-y-5 sm:space-y-6">
        {/* Initial loading or iOS Sign-In Sheet */}
        {!dashboard ? (
          loading ? (
            <div className="max-w-md mx-auto rounded-[24px] border border-black/[0.06] bg-white p-8 text-center space-y-3 shadow-sm">
              <Loader2 size={28} className="mx-auto animate-spin text-[#007AFF]" />
              <p className="text-sm text-[#6C6C70]">Admin panel yuklanmoqda...</p>
            </div>
          ) : (
            <div className="max-w-md mx-auto rounded-[24px] border border-black/[0.06] bg-white p-6 sm:p-8 space-y-5 shadow-[0_4px_20px_rgba(0,0,0,0.04)]">
              <div className="flex items-start gap-3.5">
                <div className="h-12 w-12 rounded-[14px] bg-[#007AFF]/12 text-[#007AFF] flex items-center justify-center shrink-0">
                  <KeyRound size={22} />
                </div>
                <div>
                  <h2 className="font-display text-xl font-bold text-[#1C1C1E]">Admin kirishi</h2>
                  <p className="mt-1 text-sm text-[#6C6C70]">
                    Telegram botda <span className="font-mono-num font-semibold text-[#1C1C1E]">/panel</span> buyrug‘ini yuboring yoki <span className="font-mono-num font-semibold text-[#1C1C1E]">ADMIN_PANEL_KEY</span> ni kiriting.
                  </p>
                </div>
              </div>

              {unauthorizedMsg && (
                <div
                  role="alert"
                  className="rounded-2xl border border-[#FF3B30]/25 bg-[#FF3B30]/8 px-4 py-3 text-sm text-[#D70015] flex items-start gap-2.5"
                >
                  <AlertCircle size={18} className="shrink-0 mt-0.5" />
                  <span>{unauthorizedMsg}</span>
                </div>
              )}

              <form onSubmit={handleKeySubmit} className="space-y-3.5">
                <div>
                  <label htmlFor="admin-gate-key" className="block text-xs font-medium text-[#6C6C70] mb-1.5">
                    Admin kaliti (ADMIN_PANEL_KEY)
                  </label>
                  <input
                    id="admin-gate-key"
                    type="password"
                    value={keyInput}
                    onChange={(e) => setKeyInput(e.target.value)}
                    placeholder="Maxfiy kalitni kiriting"
                    autoComplete="off"
                    className="w-full min-h-[48px] rounded-[14px] border border-black/[0.08] bg-[#F2F2F7] px-4 text-sm font-mono-num text-[#1C1C1E] placeholder:text-[#8E8E93] focus:outline-none focus:bg-white focus:border-[#007AFF] transition-colors"
                  />
                </div>
                <button
                  type="submit"
                  className="w-full min-h-[48px] rounded-[14px] bg-[#007AFF] hover:bg-[#0066D6] active:scale-[0.99] text-white font-semibold text-sm cursor-pointer transition-all shadow-sm"
                >
                  Panelga kirish
                </button>
              </form>
            </div>
          )
        ) : (
          <>
            {/* Apple iOS Segmented Tab Bar */}
            <nav
              aria-label="Admin bo‘limlari"
              className="grid grid-cols-3 sm:grid-cols-6 gap-1.5 p-1.5 rounded-[20px] bg-[#E5E5EA]/85 border border-black/[0.04]"
            >
              {navTabs.map((tab) => {
                const Icon = tab.icon;
                const active = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => {
                      setActiveTab(tab.id);
                      setBannerNotice(null);
                    }}
                    aria-current={active ? 'page' : undefined}
                    className={`min-h-[60px] rounded-[15px] px-2.5 py-2 flex flex-col items-center justify-center gap-1 transition-all cursor-pointer ${
                      active
                        ? 'bg-white text-[#007AFF] shadow-[0_2px_8px_rgba(0,0,0,0.08)]'
                        : 'text-[#6C6C70] hover:text-[#1C1C1E]'
                    }`}
                  >
                    <Icon size={19} strokeWidth={active ? 2.2 : 1.8} />
                    <span className="text-[11px] font-semibold whitespace-nowrap">{tab.label}</span>
                  </button>
                );
              })}
            </nav>

            {bannerNotice && (
              <div
                role="alert"
                className={`rounded-2xl border px-4 py-3 text-sm flex items-center gap-2.5 bg-white shadow-sm ${
                  bannerNotice.type === 'ok'
                    ? 'border-[#34C759]/35 text-[#1F8B4D]'
                    : 'border-[#FF3B30]/35 text-[#D70015]'
                }`}
              >
                {bannerNotice.type === 'ok' ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
                <span>{bannerNotice.text}</span>
              </div>
            )}

            {/* TAB 1: STATISTIKA */}
            {activeTab === 'stats' && (
              <div className="space-y-6">
                <div className="flex items-center justify-between gap-4">
                  <h2 className="font-display text-2xl font-bold text-[#1C1C1E]">Statistika</h2>
                  <button
                    type="button"
                    onClick={() => loadDashboard()}
                    className="min-h-[40px] px-4 rounded-full border border-black/[0.08] bg-white hover:bg-[#F9F9FB] text-xs font-semibold text-[#007AFF] inline-flex items-center gap-1.5 whitespace-nowrap cursor-pointer shadow-xs"
                  >
                    <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
                    <span>API tekshirish</span>
                  </button>
                </div>

                {/* 4 iOS White KPI Cards */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
                  <div className="rounded-[20px] border border-black/[0.05] bg-white p-5 space-y-1 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
                    <p className="text-xs font-medium text-[#8E8E93]">Jami buyurtmalar</p>
                    <p className="font-mono-num text-2xl font-bold text-[#1C1C1E]">
                      {dashboard.stats.totalOrders}
                    </p>
                  </div>
                  <div className="rounded-[20px] border border-black/[0.05] bg-white p-5 space-y-1 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
                    <p className="text-xs font-medium text-[#8E8E93]">Bajarilgan</p>
                    <p className="font-mono-num text-2xl font-bold text-[#248A3D]">
                      {dashboard.stats.completedOrders}
                    </p>
                  </div>
                  <div className="rounded-[20px] border border-black/[0.05] bg-white p-5 space-y-1 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
                    <p className="text-xs font-medium text-[#8E8E93]">Kutilmoqda / Jarayonda</p>
                    <p className="font-mono-num text-2xl font-bold text-[#FF9500]">
                      {dashboard.stats.pendingOrders + dashboard.stats.processingOrders}
                    </p>
                  </div>
                  <div className="rounded-[20px] border border-black/[0.05] bg-white p-5 space-y-1 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
                    <p className="text-xs font-medium text-[#8E8E93]">Tasdiqlangan tushum</p>
                    <p className="font-mono-num text-xl sm:text-2xl font-bold text-[#007AFF]">
                      {formatUzs(dashboard.stats.totalRevenueUzs, t.uzs)}
                    </p>
                  </div>
                </div>

                {/* Live Sora API & Telegram Bot Status */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-stretch">
                  <section className="rounded-[22px] border border-black/[0.05] bg-white p-5 space-y-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2.5">
                        <div className="h-9 w-9 rounded-xl bg-[#007AFF]/10 text-[#007AFF] flex items-center justify-center">
                          <Zap size={18} />
                        </div>
                        <h3 className="font-display text-base font-bold text-[#1C1C1E]">Sora Reseller API</h3>
                      </div>
                      <span
                        className={`px-2.5 py-1 rounded-full text-xs font-semibold ${
                          dashboard.sora.ok
                            ? 'bg-[#34C759]/14 text-[#1F8B4D]'
                            : 'bg-[#FF3B30]/12 text-[#D70015]'
                        }`}
                      >
                        {dashboard.sora.ok ? 'Ulangan · Faol' : 'Ulanish xatosi'}
                      </span>
                    </div>

                    {dashboard.sora.ok ? (
                      <div className="grid grid-cols-2 gap-3 text-sm">
                        <div className="rounded-2xl bg-[#F2F2F7] p-3.5">
                          <p className="text-xs text-[#6C6C70]">Joriy balans</p>
                          <p className="font-mono-num font-bold text-lg text-[#1C1C1E] mt-0.5">
                            {formatUzs(Number(dashboard.sora.balance || 0), dashboard.sora.currency || 'so‘m')}
                          </p>
                        </div>
                        <div className="rounded-2xl bg-[#F2F2F7] p-3.5">
                          <p className="text-xs text-[#6C6C70]">Chegirma</p>
                          <p className="font-mono-num font-bold text-lg text-[#1C1C1E] mt-0.5">
                            {Number(dashboard.sora.discountPercent || 0)}%
                          </p>
                        </div>
                        <div className="rounded-2xl bg-[#F2F2F7] p-3.5">
                          <p className="text-xs text-[#6C6C70]">Bugungi xarajat</p>
                          <p className="font-mono-num font-semibold text-[#1C1C1E] mt-0.5">
                            {formatUzs(Number(dashboard.sora.spentToday || 0), 'so‘m')}
                          </p>
                        </div>
                        <div className="rounded-2xl bg-[#F2F2F7] p-3.5">
                          <p className="text-xs text-[#6C6C70]">Kunlik limit</p>
                          <p className="font-mono-num font-semibold text-[#1C1C1E] mt-0.5">
                            {dashboard.sora.dailyLimit === 0
                              ? 'Cheksiz'
                              : formatUzs(Number(dashboard.sora.dailyLimit || 0), 'so‘m')}
                          </p>
                        </div>
                      </div>
                    ) : (
                      <div className="rounded-2xl border border-[#FF3B30]/25 bg-[#FF3B30]/8 px-4 py-3 text-sm text-[#D70015]">
                        {dashboard.sora.error || 'SORA_API_KEY tekshirilmadi.'}
                      </div>
                    )}

                    {dashboard.sora.services.length > 0 && (
                      <div className="pt-3 border-t border-black/[0.06] space-y-2">
                        <p className="text-xs font-semibold text-[#6C6C70]">
                          Faol Sora xizmatlari ({dashboard.sora.servicesCount})
                        </p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 text-xs">
                          {dashboard.sora.services.map((svc) => (
                            <div
                              key={svc.service}
                              className="flex items-center justify-between gap-2 rounded-xl bg-[#F2F2F7] px-3 py-2"
                            >
                              <span className="font-medium text-[#1C1C1E] truncate">{svc.name}</span>
                              <span className="font-mono-num text-[#6C6C70] shrink-0">{svc.service}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </section>

                  <section className="rounded-[22px] border border-black/[0.05] bg-white p-5 space-y-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2.5">
                        <div className="h-9 w-9 rounded-xl bg-[#34C759]/12 text-[#1F8B4D] flex items-center justify-center">
                          <Bot size={18} />
                        </div>
                        <h3 className="font-display text-base font-bold text-[#1C1C1E]">Olmos Pay Bot</h3>
                      </div>
                      <span
                        className={`px-2.5 py-1 rounded-full text-xs font-semibold ${
                          dashboard.bot.connected
                            ? 'bg-[#34C759]/14 text-[#1F8B4D]'
                            : 'bg-[#FF3B30]/12 text-[#D70015]'
                        }`}
                      >
                        {dashboard.bot.connected ? 'Ulangan · Faol' : dashboard.bot.configured ? 'Token xatosi' : 'Token yo‘q'}
                      </span>
                    </div>

                    {!dashboard.bot.connected && (
                      <div role="status" className="flex items-start gap-2 rounded-2xl border border-[#FF3B30]/20 bg-[#FF3B30]/8 px-4 py-3 text-xs text-[#D70015]">
                        <AlertCircle size={16} className="mt-0.5 shrink-0" />
                        <span>{dashboard.bot.error || 'Bot tokenini tekshiring.'}</span>
                      </div>
                    )}

                    <div className="rounded-2xl bg-[#F2F2F7] divide-y divide-black/[0.06] text-sm overflow-hidden">
                      <div className="flex items-center justify-between gap-4 px-4 py-3">
                        <span className="text-[#6C6C70]">Bot username</span>
                        {dashboard.bot.username ? (
                          <a
                            href={`https://t.me/${dashboard.bot.username}`}
                            target="_blank"
                            rel="noreferrer"
                            className="font-mono-num font-semibold text-[#007AFF] inline-flex items-center gap-1 hover:underline"
                          >
                            <span>@{dashboard.bot.username}</span>
                            <ExternalLink size={13} />
                          </a>
                        ) : (
                          <span className="text-[#8E8E93]">—</span>
                        )}
                      </div>
                      <div className="flex items-center justify-between gap-4 px-4 py-3">
                        <span className="text-[#6C6C70]">Yetkazish tezligi</span>
                        <span className="font-semibold text-[#1F8B4D]">1 daqiqa (avto)</span>
                      </div>
                      <div className="flex items-center justify-between gap-4 px-4 py-3">
                        <span className="text-[#6C6C70]">Admin Telegram ID</span>
                        <span className="font-mono-num font-medium text-[#1C1C1E]">
                          {dashboard.bot.adminIdSet ? 'Kiritilgan' : 'Kiritilmagan'}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-4 px-4 py-3">
                        <span className="text-[#6C6C70]">Do‘kon xizmatlari</span>
                        <span className="font-mono-num font-medium text-[#1C1C1E]">
                          {dashboard.stats.storeServicesCount} ta
                        </span>
                      </div>
                    </div>

                    <div className="pt-1 text-xs text-[#6C6C70] space-y-1">
                      <p className="font-semibold text-[#1C1C1E]">Ajratilgan bot (/bot) va buyruqlar:</p>
                      <p>
                        <span className="font-mono-num">/tanga</span> · <span className="font-mono-num">/panel</span> ·{' '}
                        <span className="font-mono-num">/balans</span> · <span className="font-mono-num">/holat GP-...</span> ·{' '}
                        <span className="font-mono-num font-semibold text-[#007AFF]">Ctrl + X</span>
                      </p>
                      <p>
                        Tokenni almashtirish: <span className="font-mono-num">bot/.env</span> ichidagi <span className="font-mono-num">TG_BOT_TOKEN</span>.
                      </p>
                    </div>
                  </section>
                </div>
              </div>
            )}

            {/* TAB 2: BUYURTMALAR */}
            {activeTab === 'orders' && (
              <div className="space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <h2 className="font-display text-2xl font-bold text-[#1C1C1E]">Buyurtmalar</h2>
                  <div className="relative w-full sm:w-72">
                    <Search
                      size={16}
                      className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#8E8E93] pointer-events-none"
                    />
                    <input
                      type="search"
                      value={orderSearch}
                      onChange={(e) => setOrderSearch(e.target.value)}
                      placeholder="GP-... yoki ID bo‘yicha qidirish"
                      className="w-full min-h-[42px] rounded-full border border-black/[0.08] bg-white pl-9 pr-4 text-sm text-[#1C1C1E] placeholder:text-[#8E8E93] focus:outline-none focus:border-[#007AFF]"
                    />
                  </div>
                </div>

                <div className="inline-flex items-center gap-1 p-1 rounded-2xl bg-[#E5E5EA]/85 overflow-x-auto max-w-full">
                  {(
                    [
                      ['all', 'Barchasi'],
                      ['pending', 'Kutilmoqda'],
                      ['processing', 'Jarayonda'],
                      ['completed', 'Bajarildi'],
                      ['canceled', 'Bekor qilindi'],
                    ] as const
                  ).map(([id, label]) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setOrderFilter(id)}
                      className={`min-h-[36px] px-3.5 rounded-xl text-xs font-semibold whitespace-nowrap cursor-pointer transition-all ${
                        orderFilter === id
                          ? 'bg-white text-[#1C1C1E] shadow-xs'
                          : 'text-[#6C6C70] hover:text-[#1C1C1E]'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                {filteredOrders.length === 0 ? (
                  <div className="rounded-[22px] border border-black/[0.05] bg-white p-10 text-center space-y-2 shadow-xs">
                    <ShoppingBag size={28} className="mx-auto text-[#8E8E93]" />
                    <p className="font-display text-base font-bold text-[#1C1C1E]">Buyurtmalar topilmadi</p>
                    <p className="text-sm text-[#6C6C70]">
                      Yangi chek yuborilganida buyurtmalar shu ro‘yxatda paydo bo‘ladi.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {filteredOrders.map((ord) => {
                      const meta = getStatusMeta(ord.status);
                      const isBusy = busyOrderRef === ord.ref;
                      const canApprove = ord.status === 'pending' || ord.status === 'manual_pending';
                      const canCheck = ord.status === 'processing' && ord.mapped;
                      const canFinishOrReject =
                        ord.status === 'pending' || ord.status === 'manual_pending' || ord.status === 'processing';
                      const canDelete = ord.status === 'pending' || ord.status === 'manual_pending' || ord.status === 'canceled';

                      return (
                        <div
                          key={ord.ref}
                          className="rounded-[20px] border border-black/[0.05] bg-white p-4 sm:p-5 space-y-3 shadow-[0_1px_3px_rgba(0,0,0,0.04)]"
                        >
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div className="space-y-1 min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="font-display text-base font-bold text-[#1C1C1E]">
                                  {ord.gameName} · {ord.packLabel}
                                </span>
                                <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${meta.cls}`}>
                                  {meta.label}
                                </span>
                              </div>
                              <p className="text-xs text-[#6C6C70] font-mono-num">
                                {ord.ref} · {ord.playerDisplay}
                                {ord.server ? ` (${ord.server})` : ''} · {formatOrderDate(ord.createdAt, lang)}
                              </p>
                              {ord.lastError && <p className="text-xs text-[#D70015]">{ord.lastError}</p>}
                            </div>

                            <div className="text-right shrink-0">
                              <p className="font-mono-num text-base font-bold text-[#007AFF]">
                                {formatUzs(ord.priceUzs, t.uzs)}
                              </p>
                              {typeof ord.coinsReward === 'number' && ord.coinsReward > 0 && (
                                <p className="text-[11px] font-mono-num font-semibold text-[#C96B00]">
                                  🪙 +{ord.coinsReward} tanga
                                </p>
                              )}
                              {ord.tgUserId && (
                                <p className="text-[11px] text-[#8E8E93] font-mono-num">TG {ord.tgUserId}</p>
                              )}
                            </div>
                          </div>

                          {(canFinishOrReject || canDelete) && (
                            <div className="pt-3 border-t border-black/[0.06] flex flex-wrap items-center gap-2">
                              {canApprove && (
                                <button
                                  type="button"
                                  disabled={isBusy}
                                  onClick={() => runOrderAction(ord.ref, 'approve-order')}
                                  className="min-h-[40px] px-4 rounded-full bg-[#007AFF] hover:bg-[#0066D6] text-white text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap cursor-pointer disabled:opacity-50"
                                >
                                  {isBusy ? <Loader2 size={14} className="animate-spin" /> : <Zap size={14} />}
                                  <span>{ord.mapped ? 'Tasdiqlash (Sora)' : 'Qo‘lda navbat'}</span>
                                </button>
                              )}

                              {canCheck && (
                                <button
                                  type="button"
                                  disabled={isBusy}
                                  onClick={() => runOrderAction(ord.ref, 'check-order')}
                                  className="min-h-[40px] px-4 rounded-full border border-black/[0.08] bg-[#F2F2F7] hover:bg-[#E5E5EA] text-xs font-semibold text-[#1C1C1E] inline-flex items-center gap-1.5 whitespace-nowrap cursor-pointer disabled:opacity-50"
                                >
                                  <RefreshCw size={14} className={isBusy ? 'animate-spin' : ''} />
                                  <span>Holatni tekshirish</span>
                                </button>
                              )}

                              {canFinishOrReject && (
                                <>
                                  <button
                                    type="button"
                                    disabled={isBusy}
                                    onClick={() => runOrderAction(ord.ref, 'manual-done')}
                                    className="min-h-[40px] px-4 rounded-full bg-[#34C759]/14 hover:bg-[#34C759]/22 text-[#1F8B4D] text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap cursor-pointer disabled:opacity-50"
                                  >
                                    <Check size={14} />
                                    <span>Bajarildi</span>
                                  </button>

                                  <button
                                    type="button"
                                    disabled={isBusy}
                                    onClick={() => runOrderAction(ord.ref, 'reject-order')}
                                    className="min-h-[40px] px-4 rounded-full bg-[#FF3B30]/12 hover:bg-[#FF3B30]/20 text-[#D70015] text-xs font-semibold whitespace-nowrap cursor-pointer disabled:opacity-50"
                                  >
                                    Rad etish
                                  </button>
                                </>
                              )}

                              {canDelete && (
                                <button
                                  type="button"
                                  disabled={isBusy}
                                  onClick={() => runOrderAction(ord.ref, 'delete-order')}
                                  className="min-h-[40px] px-4 rounded-full border border-[#FF3B30]/20 text-[#D70015] text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap cursor-pointer disabled:opacity-50"
                                >
                                  {isBusy ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                                  <span>O‘chirish</span>
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* TAB 3: OBLOJKA VA RASMLAR (O'yinlar + Barcha UC/Olmos paketlari) */}
            {activeTab === 'covers' && (
              <div className="space-y-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <h2 className="font-display text-2xl font-bold text-[#1C1C1E]">Oblojkalar va Paket rasmlari</h2>
                    <p className="mt-1 text-sm text-[#6C6C70]">
                      O‘yinlar, Telegram/SMM xizmatlari hamda barcha UC / Olmos paketlariga alohida rasm yuklang.
                    </p>
                  </div>

                  {/* iOS Segmented Scope Switcher */}
                  <div className="inline-flex items-center gap-1 p-1 rounded-2xl bg-[#E5E5EA]/90 self-start">
                    <button
                      type="button"
                      onClick={() => setCoverScope('services')}
                      className={`min-h-[38px] px-4 rounded-xl text-xs font-semibold whitespace-nowrap cursor-pointer transition-all ${
                        coverScope === 'services'
                          ? 'bg-white text-[#1C1C1E] shadow-xs'
                          : 'text-[#6C6C70] hover:text-[#1C1C1E]'
                      }`}
                    >
                      O‘yinlar va xizmatlar ({games.length})
                    </button>
                    <button
                      type="button"
                      onClick={() => setCoverScope('packs')}
                      className={`min-h-[38px] px-4 rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap cursor-pointer transition-all ${
                        coverScope === 'packs'
                          ? 'bg-white text-[#007AFF] shadow-xs'
                          : 'text-[#6C6C70] hover:text-[#1C1C1E]'
                      }`}
                    >
                      <Layers size={14} />
                      <span>UC, Olmos va paketlar</span>
                    </button>
                  </div>
                </div>

                {coverScope === 'services' ? (
                  <div className="space-y-6">
                    {coverSections.map((section) => (
                      <section key={section.title} className="space-y-3">
                        <h3 className="font-display text-sm font-semibold uppercase tracking-wider text-[#8E8E93] px-1">
                          {section.title}
                        </h3>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          {section.items.map((game) => {
                            const coverUrl = customMedia[game.id];
                            const isBusy = busyMediaId === game.id;
                            return (
                              <div
                                key={game.id}
                                className="rounded-[18px] border border-black/[0.05] bg-white p-4 flex items-center justify-between gap-3 shadow-[0_1px_2px_rgba(0,0,0,0.03)]"
                              >
                                <div className="flex items-center gap-3 min-w-0">
                                  <GameEmblem gameId={game.id} name={game.name} coverUrl={coverUrl} size="md" />
                                  <div className="min-w-0">
                                    <p className="font-display text-sm font-bold text-[#1C1C1E] truncate">
                                      {game.name}
                                    </p>
                                    <p className="text-xs text-[#6C6C70] truncate">
                                      {t.gameSubtitles[game.id] || game.subtitle}
                                    </p>
                                  </div>
                                </div>

                                <div className="flex items-center gap-1.5 shrink-0">
                                  <input
                                    ref={(el) => {
                                      coverInputsRef.current[game.id] = el;
                                    }}
                                    type="file"
                                    accept="image/jpeg,image/png,image/webp"
                                    aria-label={`${t.adminUploadBtn}: ${game.name}`}
                                    onChange={(e) => {
                                      handleMediaUpload(game.id, e.target.files?.[0], false);
                                      e.target.value = '';
                                    }}
                                    className="sr-only"
                                  />
                                  <button
                                    type="button"
                                    disabled={isBusy}
                                    onClick={() => coverInputsRef.current[game.id]?.click()}
                                    className="min-h-[38px] px-3.5 rounded-full bg-[#F2F2F7] hover:bg-[#E5E5EA] text-xs font-semibold text-[#007AFF] inline-flex items-center gap-1.5 whitespace-nowrap cursor-pointer disabled:opacity-50"
                                  >
                                    {isBusy ? <Loader2 size={14} className="animate-spin" /> : <ImagePlus size={14} />}
                                    <span>{coverUrl ? t.adminChangeBtn : t.adminUploadBtn}</span>
                                  </button>

                                  {coverUrl && (
                                    <button
                                      type="button"
                                      disabled={isBusy}
                                      aria-label={`${t.adminDeleteBtn}: ${game.name}`}
                                      onClick={() => handleMediaDelete(game.id, false)}
                                      className="min-h-[38px] min-w-[38px] rounded-full bg-[#FF3B30]/10 hover:bg-[#FF3B30]/20 text-[#D70015] flex items-center justify-center cursor-pointer disabled:opacity-50"
                                    >
                                      <Trash2 size={14} />
                                    </button>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </section>
                    ))}
                  </div>
                ) : (
                  <div className="space-y-5">
                    {/* Game filter pills for UC / Olmos / Stars / SMM pack images */}
                    <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
                      <button
                        type="button"
                        onClick={() => setSelectedCoverGameId('all')}
                        className={`min-h-[36px] px-3.5 rounded-full text-xs font-semibold whitespace-nowrap cursor-pointer transition-all ${
                          selectedCoverGameId === 'all'
                            ? 'bg-[#007AFF] text-white shadow-xs'
                            : 'bg-white text-[#6C6C70] border border-black/[0.06] hover:text-[#1C1C1E]'
                        }`}
                      >
                        Barchasi ({games.reduce((acc, g) => acc + g.packs.length, 0)})
                      </button>
                      {games.map((g) => (
                        <button
                          key={g.id}
                          type="button"
                          onClick={() => setSelectedCoverGameId(g.id)}
                          className={`min-h-[36px] px-3.5 rounded-full text-xs font-semibold whitespace-nowrap cursor-pointer transition-all ${
                            selectedCoverGameId === g.id
                              ? 'bg-[#007AFF] text-white shadow-xs'
                              : 'bg-white text-[#6C6C70] border border-black/[0.06] hover:text-[#1C1C1E]'
                          }`}
                        >
                          {g.name} ({g.packs.length})
                        </button>
                      ))}
                    </div>

                    {visiblePackGroups.map((game) => (
                      <section key={game.id} className="space-y-2.5">
                        <div className="flex items-center gap-2 px-1">
                          <GameEmblem gameId={game.id} name={game.name} coverUrl={customMedia[game.id]} size="sm" />
                          <h3 className="font-display text-base font-bold text-[#1C1C1E]">{game.name}</h3>
                          <ChevronRight size={14} className="text-[#8E8E93]" />
                          <span className="text-xs text-[#6C6C70]">{game.packs.length} ta paket</span>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                          {game.packs.map((pack) => {
                            const packKey = `pack:${pack.id}`;
                            const packCover = customMedia[packKey];
                            const isBusy = busyMediaId === packKey;
                            return (
                              <div
                                key={packKey}
                                className="rounded-[18px] border border-black/[0.05] bg-white p-3.5 flex items-center justify-between gap-3 shadow-[0_1px_2px_rgba(0,0,0,0.03)]"
                              >
                                <div className="flex items-center gap-3 min-w-0">
                                  {packCover ? (
                                    <img
                                      src={packCover}
                                      alt={pack.label}
                                      referrerPolicy="no-referrer"
                                      className="h-11 w-11 rounded-xl object-cover border border-black/[0.06] shrink-0"
                                    />
                                  ) : (
                                    <GameEmblem
                                      gameId={game.id}
                                      name={pack.label}
                                      coverUrl={customMedia[game.id]}
                                      size="md"
                                    />
                                  )}
                                  <div className="min-w-0">
                                    <p className="font-display text-sm font-bold text-[#1C1C1E] truncate">
                                      {pack.label}
                                    </p>
                                    <p className="font-mono-num text-xs text-[#007AFF] font-semibold">
                                      {formatUzs(pack.priceUzs, t.uzs)}
                                    </p>
                                  </div>
                                </div>

                                <div className="flex items-center gap-1.5 shrink-0">
                                  <input
                                    ref={(el) => {
                                      coverInputsRef.current[packKey] = el;
                                    }}
                                    type="file"
                                    accept="image/jpeg,image/png,image/webp"
                                    aria-label={`Rasm yuklash: ${pack.label}`}
                                    onChange={(e) => {
                                      handleMediaUpload(packKey, e.target.files?.[0], false);
                                      e.target.value = '';
                                    }}
                                    className="sr-only"
                                  />
                                  <button
                                    type="button"
                                    disabled={isBusy}
                                    onClick={() => coverInputsRef.current[packKey]?.click()}
                                    className="min-h-[36px] px-3 rounded-full bg-[#F2F2F7] hover:bg-[#E5E5EA] text-xs font-semibold text-[#007AFF] inline-flex items-center gap-1 whitespace-nowrap cursor-pointer disabled:opacity-50"
                                  >
                                    {isBusy ? <Loader2 size={13} className="animate-spin" /> : <ImagePlus size={13} />}
                                    <span>{packCover ? 'Almashtir' : 'Yuklash'}</span>
                                  </button>

                                  {packCover && (
                                    <button
                                      type="button"
                                      disabled={isBusy}
                                      aria-label={`Rasm o‘chirish: ${pack.label}`}
                                      onClick={() => handleMediaDelete(packKey, false)}
                                      className="min-h-[36px] min-w-[36px] rounded-full bg-[#FF3B30]/10 hover:bg-[#FF3B30]/20 text-[#D70015] flex items-center justify-center cursor-pointer disabled:opacity-50"
                                    >
                                      <Trash2 size={13} />
                                    </button>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </section>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* TAB 4: BANNERLAR */}
            {activeTab === 'banners' && (
              <div className="space-y-6">
                <div>
                  <h2 className="font-display text-2xl font-bold text-[#1C1C1E]">Bosh sahifa bannerlari</h2>
                  <p className="mt-1 text-sm text-[#6C6C70]">
                    Asosiy sahifadagi 3 ta slayd bannerga oblojka yuklang yoki almashtiring (tavsiya: 16:9).
                  </p>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                  {t.banners.map((slide, idx) => {
                    const bannerId = `banner-${idx + 1}`;
                    const customSrc = customMedia[bannerId];
                    const previewSrc = customSrc || BANNER_IMAGES[idx] || BANNER_IMAGES[0];
                    const isBusy = busyMediaId === bannerId;

                    return (
                      <div
                        key={bannerId}
                        className="rounded-[22px] border border-black/[0.05] bg-white overflow-hidden flex flex-col shadow-[0_2px_8px_rgba(0,0,0,0.04)]"
                      >
                        <div className="relative aspect-video bg-[#1C1C1E] overflow-hidden">
                          <img
                            src={previewSrc}
                            alt={slide.title}
                            referrerPolicy="no-referrer"
                            className="h-full w-full object-cover"
                          />
                          <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/20 to-transparent" />
                          <div className="absolute bottom-3 left-3.5 right-3.5 text-white">
                            <p className="text-[11px] font-semibold text-[#60A5FA]">
                              Banner {idx + 1} · {customSrc ? 'Maxsus oblojka' : 'Standart rasm'}
                            </p>
                            <p className="font-display text-sm font-bold line-clamp-1">{slide.title}</p>
                          </div>
                        </div>

                        <div className="p-4 flex-1 flex flex-col justify-between gap-4">
                          <p className="text-xs text-[#6C6C70]">{slide.desc}</p>

                          <div className="flex items-center gap-2">
                            <input
                              ref={(el) => {
                                bannerInputsRef.current[bannerId] = el;
                              }}
                              type="file"
                              accept="image/jpeg,image/png,image/webp"
                              aria-label={`Banner ${idx + 1} yuklash`}
                              onChange={(e) => {
                                handleMediaUpload(bannerId, e.target.files?.[0], true);
                                e.target.value = '';
                              }}
                              className="sr-only"
                            />
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => bannerInputsRef.current[bannerId]?.click()}
                              className="flex-1 min-h-[42px] px-4 rounded-full bg-[#007AFF] hover:bg-[#0066D6] text-white text-xs font-semibold inline-flex items-center justify-center gap-1.5 whitespace-nowrap cursor-pointer disabled:opacity-50"
                            >
                              {isBusy ? <Loader2 size={14} className="animate-spin" /> : <ImagePlus size={14} />}
                              <span>{customSrc ? 'Oblojkani almashtirish' : 'Oblojka yuklash'}</span>
                            </button>

                            {customSrc && (
                              <button
                                type="button"
                                disabled={isBusy}
                                aria-label={`Banner ${idx + 1} o‘chirish`}
                                onClick={() => handleMediaDelete(bannerId, true)}
                                className="min-h-[42px] px-3.5 rounded-full bg-[#FF3B30]/12 hover:bg-[#FF3B30]/20 text-[#D70015] text-xs font-semibold inline-flex items-center gap-1 whitespace-nowrap cursor-pointer disabled:opacity-50"
                              >
                                <Trash2 size={14} />
                                <span>O‘chirish</span>
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* TAB 5: XABAR */}
            {activeTab === 'message' && (
              <form
                onSubmit={handleSendMessage}
                className="grid max-w-none grid-cols-1 gap-5 items-start xl:grid-cols-[minmax(0,1.1fr)_minmax(360px,0.9fr)]"
              >
                <div className="space-y-5">
                  <div>
                    <h2 className="font-display text-2xl font-bold text-[#1C1C1E]">Telegram xabarlar</h2>
                    <p className="mt-1 text-sm text-[#6C6C70]">
                      Olmos Pay boti orqali admin, aniq mijoz yoki barcha Telegram mijozlariga xabar yuboring.
                    </p>
                  </div>

                  {!dashboard.bot.connected && (
                    <div role="status" className="flex items-start gap-2.5 rounded-2xl border border-[#FF3B30]/25 bg-[#FF3B30]/8 px-4 py-3 text-sm text-[#D70015]">
                      <AlertCircle size={18} className="mt-0.5 shrink-0" />
                      <span>{dashboard.bot.error || 'Telegram bot ulanmagan. Token va bot holatini tekshiring.'}</span>
                    </div>
                  )}

                  <div className="rounded-[22px] border border-black/[0.05] bg-white p-5 space-y-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
                    <div className="space-y-2">
                      <span className="block text-xs font-medium text-[#6C6C70]">Qabul qiluvchi</span>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-1.5 p-1 rounded-2xl bg-[#E5E5EA]/85">
                        {(
                          [
                            ['admin', 'Admin (Test)'],
                            ['broadcast', 'Barcha mijozlar'],
                            ['custom', 'Aniq Chat ID'],
                          ] as const
                        ).map(([mode, label]) => (
                          <button
                            key={mode}
                            type="button"
                            onClick={() => {
                              setMsgTarget(mode);
                              setBroadcastConfirmed(false);
                            }}
                            aria-pressed={msgTarget === mode}
                            className={`min-h-[44px] px-3 rounded-xl text-xs font-semibold cursor-pointer transition-all ${
                              msgTarget === mode
                                ? 'bg-white text-[#007AFF] shadow-xs'
                                : 'text-[#6C6C70] hover:text-[#1C1C1E]'
                            }`}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {msgTarget === 'broadcast' && (
                      <div className="space-y-3 rounded-2xl border border-[#007AFF]/15 bg-[#007AFF]/[0.04] p-4">
                        <div className="flex items-center gap-3">
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#007AFF]/10 text-[#007AFF]">
                            <Users size={19} />
                          </div>
                          <div>
                            <p className="text-sm font-bold text-[#1C1C1E]">{dashboard.stats.uniqueCustomers} ta Telegram mijoz</p>
                            <p className="text-xs text-[#6C6C70]">Xabar buyurtma bergan noyob mijozlarga yuboriladi.</p>
                          </div>
                        </div>
                        <label className="flex items-start gap-2.5 text-sm text-[#1C1C1E]">
                          <input
                            type="checkbox"
                            checked={broadcastConfirmed}
                            onChange={(event) => setBroadcastConfirmed(event.target.checked)}
                            className="mt-0.5 h-4 w-4 accent-[#007AFF]"
                          />
                          <span>Barcha mijozlarga yuborishni tasdiqlayman.</span>
                        </label>
                      </div>
                    )}

                    {msgTarget === 'custom' && (
                      <div>
                        <label htmlFor="custom-chat-id" className="block text-xs font-medium text-[#6C6C70] mb-1.5">
                          Telegram Chat ID
                        </label>
                        <input
                          id="custom-chat-id"
                          type="text"
                          value={customChatId}
                          onChange={(e) => setCustomChatId(e.target.value)}
                          placeholder="Masalan: 123456789"
                          className="w-full min-h-[48px] rounded-[14px] border border-black/[0.08] bg-[#F2F2F7] px-3.5 text-sm font-mono-num text-[#1C1C1E] focus:outline-none focus:bg-white focus:border-[#007AFF]"
                        />
                      </div>
                    )}

                    <div>
                      <label htmlFor="admin-msg-text" className="block text-xs font-medium text-[#6C6C70] mb-1.5">
                        Xabar matni
                      </label>
                      <textarea
                        id="admin-msg-text"
                        rows={7}
                        maxLength={3500}
                        value={msgText}
                        onChange={(e) => setMsgText(e.target.value)}
                        placeholder="Aksiya yoki muhim xabar matnini yozing..."
                        className="w-full min-h-[190px] rounded-[16px] border border-black/[0.08] bg-[#F2F2F7] p-3.5 text-sm text-[#1C1C1E] focus:outline-none focus:bg-white focus:border-[#007AFF]"
                      />
                      <p className="mt-1.5 text-right text-xs text-[#8E8E93]">{msgText.length}/3500</p>
                    </div>

                    <button
                      type="submit"
                      disabled={sendingMsg || !msgText.trim() || !dashboard.bot.connected || (msgTarget === 'broadcast' && !broadcastConfirmed)}
                      className="min-h-[48px] w-full sm:w-auto px-6 rounded-full bg-[#007AFF] hover:bg-[#0066D6] disabled:opacity-50 text-white font-semibold text-sm inline-flex items-center justify-center gap-2 cursor-pointer shadow-sm"
                    >
                      {sendingMsg ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                      <span>{sendingMsg ? 'Yuborilmoqda...' : 'Xabarni yuborish'}</span>
                    </button>
                  </div>
                </div>

                <aside aria-labelledby="message-history-title" className="rounded-[22px] border border-black/[0.05] bg-white p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
                  <div className="mb-4 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5">
                      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#007AFF]/10 text-[#007AFF]">
                        <Clock3 size={19} />
                      </div>
                      <div>
                        <h3 id="message-history-title" className="font-display text-lg font-bold text-[#1C1C1E]">Xabarlar tarixi</h3>
                        <p className="text-xs text-[#6C6C70]">So‘nggi yuborishlar va natijalar</p>
                      </div>
                    </div>
                    <span className="rounded-full bg-[#F2F2F7] px-2.5 py-1 text-xs font-semibold text-[#6C6C70]">
                      {(dashboard.messageLogs || []).length}
                    </span>
                  </div>

                  <div className="max-h-[720px] min-h-[420px] space-y-3 overflow-y-auto pr-1 sm:min-h-[520px]">
                    {(dashboard.messageLogs || []).length === 0 ? (
                      <div className="flex min-h-[400px] flex-col items-center justify-center rounded-2xl border border-dashed border-black/10 bg-[#F8F9FC] px-6 text-center">
                        <Send size={24} className="text-[#8E8E93]" />
                        <p className="mt-3 text-sm font-semibold text-[#1C1C1E]">Hali xabar yuborilmagan</p>
                        <p className="mt-1 text-xs text-[#6C6C70]">Yuborilgan xabarlar natijasi shu yerda saqlanadi.</p>
                      </div>
                    ) : (
                      (dashboard.messageLogs || []).map((log) => (
                        <article key={log.id} className="rounded-2xl border border-black/[0.06] bg-[#F8F9FC] p-4">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="text-sm font-bold text-[#1C1C1E]">
                                {log.target === 'broadcast' ? 'Barcha mijozlar' : log.target === 'custom' ? 'Aniq mijoz' : 'Admin (test)'}
                              </p>
                              <p className="mt-0.5 text-[11px] text-[#8E8E93]">{new Date(log.createdAt).toLocaleString('uz-UZ')}</p>
                            </div>
                            <span className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold ${log.status === 'sent' ? 'bg-[#34C759]/14 text-[#1F8B4D]' : log.status === 'partial' ? 'bg-[#FF9500]/14 text-[#A65F00]' : 'bg-[#FF3B30]/12 text-[#D70015]'}`}>
                              {log.status === 'sent' ? 'Yuborildi' : log.status === 'partial' ? 'Qisman' : 'Xato'}
                            </span>
                          </div>
                          <p className="mt-3 whitespace-pre-wrap break-words text-sm text-[#3A3A3C]">{log.preview}</p>
                          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-black/[0.06] pt-3 text-xs text-[#6C6C70]">
                            <span>Yuborildi: <strong className="text-[#1F8B4D]">{log.sentCount}</strong></span>
                            <span>Yetkazilmadi: <strong className="text-[#D70015]">{log.failedCount}</strong></span>
                            <span>Jami: <strong className="text-[#1C1C1E]">{log.totalTargets}</strong></span>
                          </div>
                        </article>
                      ))
                    )}
                  </div>
                </aside>
              </form>
            )}

            {/* TAB 6: SOZLAMALAR */}
            {activeTab === 'settings' && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">
                <form
                  onSubmit={handleSaveCard}
                  className="rounded-[22px] border border-black/[0.05] bg-white p-5 space-y-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)]"
                >
                  <div className="flex items-center gap-2.5">
                    <div className="h-9 w-9 rounded-xl bg-[#007AFF]/10 text-[#007AFF] flex items-center justify-center">
                      <CreditCard size={18} />
                    </div>
                    <h2 className="font-display text-lg font-bold text-[#1C1C1E]">To‘lov kartasi sozlamalari</h2>
                  </div>

                  <div>
                    <label htmlFor="card-num-input" className="block text-xs font-medium text-[#6C6C70] mb-1.5">
                      Karta raqami (16 ta raqam)
                    </label>
                    <input
                      id="card-num-input"
                      type="text"
                      inputMode="numeric"
                      autoComplete="cc-number"
                      maxLength={24}
                      value={cardNumber}
                      onChange={(e) => setCardNumber(e.target.value)}
                      placeholder="4916 9903 5856 6955"
                      className="w-full min-h-[48px] rounded-[14px] border border-black/[0.08] bg-[#F2F2F7] px-3.5 text-base font-mono-num text-[#1C1C1E] focus:outline-none focus:bg-white focus:border-[#007AFF]"
                    />
                    <p className="mt-2 text-xs text-[#6C6C70]">Saqlangandan so‘ng karta raqami mijozlarning to‘lov oynasida avtomatik ko‘rinadi.</p>
                  </div>

                  <div>
                    <label htmlFor="card-holder-input" className="block text-xs font-medium text-[#6C6C70] mb-1.5">
                      Karta egasi
                    </label>
                    <input
                      id="card-holder-input"
                      type="text"
                      value={cardHolder}
                      onChange={(e) => setCardHolder(e.target.value)}
                      placeholder="OLMOS PAY"
                      className="w-full min-h-[44px] rounded-[14px] border border-black/[0.08] bg-[#F2F2F7] px-3.5 text-sm text-[#1C1C1E] focus:outline-none focus:bg-white focus:border-[#007AFF]"
                    />
                  </div>

                  <div>
                    <label htmlFor="card-bank-input" className="block text-xs font-medium text-[#6C6C70] mb-1.5">
                      Bank / To‘lov tizimi
                    </label>
                    <input
                      id="card-bank-input"
                      type="text"
                      value={cardBank}
                      onChange={(e) => setCardBank(e.target.value)}
                      placeholder="Humo / Uzcard"
                      className="w-full min-h-[44px] rounded-[14px] border border-black/[0.08] bg-[#F2F2F7] px-3.5 text-sm text-[#1C1C1E] focus:outline-none focus:bg-white focus:border-[#007AFF]"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={savingCard}
                    className="min-h-[44px] px-5 rounded-full bg-[#007AFF] hover:bg-[#0066D6] disabled:opacity-50 text-white font-semibold text-sm inline-flex items-center gap-2 cursor-pointer"
                  >
                    {savingCard && <Loader2 size={15} className="animate-spin" />}
                    <span>Kartani saqlash</span>
                  </button>
                </form>

                <div className="rounded-[22px] border border-black/[0.05] bg-white p-5 space-y-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
                  <div className="flex items-center gap-2.5">
                    <div className="h-9 w-9 rounded-xl bg-[#34C759]/12 text-[#1F8B4D] flex items-center justify-center">
                      <KeyRound size={18} />
                    </div>
                    <h2 className="font-display text-lg font-bold text-[#1C1C1E]">Kirish va tezkor klavish</h2>
                  </div>

                  <div className="text-sm space-y-2 text-[#6C6C70]">
                    <p>
                      Faol kirish usuli:{' '}
                      <span className="font-mono-num font-semibold text-[#1C1C1E]">{dashboard.authMode}</span>
                    </p>
                    <p>
                      Admin panel Mini App foydalanuvchilariga ko‘rinmaydi — brauzerda{' '}
                      <span className="font-mono-num font-semibold text-[#007AFF]">Ctrl + X</span> bosilganda,{' '}
                      <span className="font-mono-num">/panel</span> manzilida yoki botda{' '}
                      <span className="font-mono-num">/panel</span> yozilganda ochiladi.
                    </p>
                  </div>

                  <form onSubmit={handleKeySubmit} className="space-y-3 pt-3 border-t border-black/[0.06]">
                    <label htmlFor="settings-admin-key" className="block text-xs font-medium text-[#6C6C70]">
                      ADMIN_PANEL_KEY yangilash
                    </label>
                    <input
                      id="settings-admin-key"
                      type="password"
                      value={keyInput}
                      onChange={(e) => setKeyInput(e.target.value)}
                      placeholder="Netlify ADMIN_PANEL_KEY"
                      className="w-full min-h-[44px] rounded-[14px] border border-black/[0.08] bg-[#F2F2F7] px-3.5 text-sm font-mono-num text-[#1C1C1E] focus:outline-none focus:bg-white focus:border-[#007AFF]"
                    />
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="submit"
                        className="min-h-[42px] px-4 rounded-full bg-[#F2F2F7] hover:bg-[#E5E5EA] text-xs font-semibold text-[#1C1C1E] cursor-pointer"
                      >
                        Kalitni qo‘llash
                      </button>
                      <button
                        type="button"
                        onClick={handleSignOut}
                        className="min-h-[42px] px-4 rounded-full bg-[#FF3B30]/12 hover:bg-[#FF3B30]/20 text-[#D70015] text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
                      >
                        <LogOut size={14} />
                        <span>Sessiyani yopish</span>
                      </button>
                    </div>
                  </form>
                </div>

                <div className="rounded-[22px] border border-black/[0.05] bg-white p-5 space-y-4 lg:col-span-2 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2.5">
                        <Download size={18} className="text-[#007AFF]" />
                        <h2 className="font-display text-lg font-bold text-[#1C1C1E]">
                          Ajratilgan sayt va bot kodlari (.zip)
                        </h2>
                      </div>
                      <p className="text-sm text-[#6C6C70]">
                        Sayt (<span className="font-mono-num">olmos-pay-sayt.zip</span>, bot polling o‘chiq) va Telegram bot (
                        <span className="font-mono-num">olmos-pay-bot.zip</span>, mustaqil <span className="font-mono-num">/bot</span>) alohida arxivlanadi — alohida joylashda kirish muammosi va 409 xatosi bo‘lmaydi. Tokenni <span className="font-mono-num">bot/.env</span> faylida almashtiring.
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleDownloadZip('site')}
                        disabled={Boolean(downloadingPart)}
                        className="min-h-[44px] px-4 rounded-full border border-black/[0.08] bg-[#F2F2F7] hover:bg-[#E5E5EA] disabled:opacity-50 text-[#1C1C1E] font-semibold text-xs sm:text-sm inline-flex items-center justify-center gap-2 whitespace-nowrap cursor-pointer"
                      >
                        {downloadingPart === 'site' ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />}
                        <span>Sayt kodi (.zip)</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDownloadZip('bot')}
                        disabled={Boolean(downloadingPart)}
                        className="min-h-[44px] px-5 rounded-full bg-[#007AFF] hover:bg-[#0066D6] disabled:opacity-50 text-white font-semibold text-xs sm:text-sm inline-flex items-center justify-center gap-2 whitespace-nowrap cursor-pointer shadow-sm"
                      >
                        {downloadingPart === 'bot' ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />}
                        <span>Bot kodi (.zip)</span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
