import { useEffect, useRef, useState } from 'react';
import { Check, Copy, ImagePlus, Loader2, RefreshCw, ShieldCheck, AlertCircle, CheckCircle2 } from 'lucide-react';
import { CARD_INFO } from '../data/catalog';
import type { I18nDict } from '../data/i18n';
import type { CardInfo, GameItem, GameRegion, Lang, OrderHistoryItem, PackItem } from '../types';
import {
  calculatePackCoins,
  CHECKOUT_SECONDS,
  compressReceiptImage,
  formatTimer,
  formatUzs,
} from '../utils/format';
import { triggerHaptic } from '../utils/telegram';

const REGION_LABELS: Record<GameRegion, string> = {
  global: 'GLOBAL',
  cis: 'RU / CIS',
  br: 'BR',
  eu: 'EU',
  me: 'AE / ME',
};

interface CheckoutPageProps {
  t: I18nDict;
  lang: Lang;
  game: GameItem;
  pack: PackItem;
  playerID: string;
  serverID: string;
  region: GameRegion;
  initData: string;
  cardInfo?: CardInfo;
  onOrderCreated: (order: OrderHistoryItem) => void;
  onGoHistory: () => void;
}

export function CheckoutPage({
  t,
  game,
  pack,
  playerID,
  serverID,
  region,
  initData,
  cardInfo = CARD_INFO,
  onOrderCreated,
  onGoHistory,
}: CheckoutPageProps) {
  const [secondsLeft, setSecondsLeft] = useState(CHECKOUT_SECONDS);
  const [copied, setCopied] = useState(false);
  const [receiptDataUrl, setReceiptDataUrl] = useState<string>('');
  const [fileName, setFileName] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);
  const [submittedRef, setSubmittedRef] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const formattedCardNumber = cardInfo.number.replace(/\s+/g, '').replace(/(\d{4})(?=\d)/g, '$1 ');
  const coinsReward =
    pack.coinsReward ??
    calculatePackCoins({
      amount: pack.amount,
      unit: pack.unit,
      category: game.category,
      priceUzs: pack.priceUzs,
    });

  useEffect(() => {
    setSecondsLeft(CHECKOUT_SECONDS);
  }, [game.id, pack.id]);

  useEffect(() => {
    if (secondsLeft <= 0 || submittedRef) return;
    const id = window.setInterval(() => {
      setSecondsLeft((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => window.clearInterval(id);
  }, [secondsLeft, submittedRef]);

  const timerExpired = secondsLeft <= 0;

  async function copyCardNum() {
    const clean = cardInfo.number.replace(/\s+/g, '');
    try {
      await navigator.clipboard.writeText(clean);
      setCopied(true);
      triggerHaptic('light');
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  async function onFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    setErrorMsg('');
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const compressed = await compressReceiptImage(file);
      setReceiptDataUrl(compressed);
      setFileName(file.name);
      triggerHaptic('light');
    } catch (err) {
      const code = err instanceof Error ? err.message : '';
      if (code === 'FILE_TOO_LARGE') setErrorMsg(t.errFileTooLarge);
      else setErrorMsg(t.errFileType);
      setReceiptDataUrl('');
      setFileName('');
    }
  }

  async function sendOrder() {
    if (submitting) return;
    setErrorMsg('');

    if (timerExpired) {
      setErrorMsg(t.errTimerExpired);
      triggerHaptic('error');
      return;
    }

    if (!receiptDataUrl) {
      setErrorMsg(t.errReceiptRequired);
      triggerHaptic('error');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/.netlify/functions/order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          gameId: game.id,
          packId: pack.id,
          price: pack.priceUzs,
          ...(game.category === 'smm' ? { quantity: pack.amount } : {}),
          playerID,
          server: serverID,
          region,
          photo: receiptDataUrl,
          initData,
        }),
      });

      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) {
        setErrorMsg(data?.error || t.errNetwork);
        triggerHaptic('error');
        return;
      }

      const newOrder: OrderHistoryItem = {
        ref: data.ref,
        orderToken: data.orderToken,
        gameId: game.id,
        gameName: game.name,
        packId: pack.id,
        packLabel: pack.label,
        priceUzs: data.priceUzs ?? pack.priceUzs,
        coinsReward: data.coinsReward ?? coinsReward,
        playerDisplay: playerID,
        server: serverID,
        region,
        status: data.status || 'pending',
        createdAt: Date.now(),
      };
      onOrderCreated(newOrder);
      setSubmittedRef(data.ref);
      triggerHaptic('success');
    } catch {
      setErrorMsg(t.errNetwork);
      triggerHaptic('error');
    } finally {
      setSubmitting(false);
    }
  }

  if (submittedRef) {
    return (
      <div className="max-w-xl mx-auto rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-6 sm:p-8 text-center shadow-sm">
        <div className="mx-auto h-14 w-14 rounded-2xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
          <CheckCircle2 size={28} />
        </div>
        <h1 className="mt-4 font-display text-2xl font-bold text-[var(--ink)]">{t.orderSuccessTitle}</h1>
        <p className="mt-2 text-sm text-[var(--ink-muted)]">{t.orderSuccessDesc}</p>
        <div className="mt-5 rounded-xl border border-[var(--line)] bg-[var(--surface-muted)] px-4 py-3 text-left text-sm space-y-1.5">
          <div className="flex justify-between gap-4">
            <span className="text-[var(--ink-muted)]">Buyurtma raqami</span>
            <span className="font-mono-num font-semibold text-[var(--ink)]">{submittedRef}</span>
          </div>
          <div className="flex justify-between gap-4">
            <span className="text-[var(--ink-muted)]">{game.name}</span>
            <span className="font-medium text-[var(--ink)]">{pack.label}</span>
          </div>
          <div className="flex justify-between gap-4">
            <span className="text-[var(--ink-muted)]">ID</span>
            <span className="font-mono-num text-[var(--ink)]">
              {playerID}
              {serverID ? ` (${serverID})` : ''}
            </span>
          </div>
          {game.id === 'freefire' && (
            <div className="flex justify-between gap-4">
              <span className="text-[var(--ink-muted)]">Region</span>
              <span className="font-medium text-[var(--ink)]">{REGION_LABELS[region]}</span>
            </div>
          )}
          <div className="flex justify-between gap-4">
            <span className="text-[var(--ink-muted)]">Olmos tanga bonusi</span>
            <span className="font-mono-num font-semibold text-amber-600 dark:text-[#E5B94C]">
              🪙 +{coinsReward} {t.coinsUnit}
            </span>
          </div>
        </div>
        <button
          type="button"
          onClick={onGoHistory}
          className="mt-6 w-full min-h-[48px] rounded-xl bg-[#007AFF] hover:bg-[#0066D6] text-white dark:bg-[#E5B94C] dark:hover:bg-[#d6a938] dark:text-[#09090B] font-semibold text-sm transition-transform active:scale-[0.98] cursor-pointer"
        >
          {t.goToHistory}
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-5 pb-28 md:pb-8">
      <div className="flex items-center justify-between gap-4 rounded-2xl border border-[var(--line)] bg-[var(--surface)] px-5 py-4">
        <div>
          <p className="text-xs text-[var(--ink-muted)]">{t.timerLabel}</p>
          <h1 className="font-display text-lg font-bold text-[var(--ink)]">{t.checkoutTitle}</h1>
        </div>
        <div className="text-right">
          <span
            className={`font-mono-num text-xl font-bold ${
              timerExpired ? 'text-red-500' : secondsLeft < 60 ? 'text-amber-500' : 'text-[var(--gold-2)] dark:text-[#E5B94C]'
            }`}
          >
            {formatTimer(secondsLeft)}
          </span>
          {timerExpired && (
            <button
              type="button"
              onClick={() => {
                setSecondsLeft(CHECKOUT_SECONDS);
                setErrorMsg('');
              }}
              className="mt-1 flex items-center gap-1 text-xs font-medium text-[var(--gold-2)] dark:text-[#E5B94C] hover:underline cursor-pointer"
            >
              <RefreshCw size={12} />
              <span>{t.restartTimer}</span>
            </button>
          )}
        </div>
      </div>

      {/* Order Summary */}
      <div className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-5 space-y-3">
        <div className="flex items-center justify-between gap-4 text-sm">
          <span className="text-[var(--ink-muted)]">{t.selectedPack}</span>
          <span className="font-semibold text-[var(--ink)]">
            {game.name} · {pack.label}
          </span>
        </div>
        <div className="flex items-center justify-between gap-4 text-sm">
          <span className="text-[var(--ink-muted)]">ID</span>
          <span className="font-mono-num font-medium text-[var(--ink)]">
            {playerID}
            {serverID ? ` (${serverID})` : ''}
          </span>
        </div>
        {game.id === 'freefire' && (
          <div className="flex items-center justify-between gap-4 text-sm">
            <span className="text-[var(--ink-muted)]">Region</span>
            <span className="font-medium text-[var(--ink)]">{REGION_LABELS[region]}</span>
          </div>
        )}
        <div className="flex items-center justify-between gap-4 text-sm">
          <span className="text-[var(--ink-muted)]">Bonus tanga</span>
          <span className="font-mono-num font-semibold text-amber-600 dark:text-[#E5B94C]">
            🪙 +{coinsReward} {t.coinsUnit}
          </span>
        </div>
        <div className="pt-3 border-t border-[var(--line)] flex items-center justify-between gap-4">
          <span className="text-sm font-medium text-[var(--ink-muted)]">{t.totalLabel}</span>
          <span className="font-mono-num text-xl font-bold text-[var(--gold-2)] dark:text-[#E5B94C]">
            {formatUzs(pack.priceUzs, t.uzs)}
          </span>
        </div>
      </div>

      {/* Card Transfer */}
      <div className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-5 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="font-display text-base font-semibold text-[var(--ink)]">{t.cardPayTitle}</h3>
            <p className="text-xs text-[var(--ink-muted)]">
              {cardInfo.bank} · {cardInfo.holder}
            </p>
          </div>
          <ShieldCheck size={20} className="text-[var(--gold-2)] dark:text-[#E5B94C] shrink-0" />
        </div>

        <div className="flex flex-col gap-3 rounded-xl border border-[var(--line)] bg-[var(--surface-muted)] px-3.5 sm:flex-row sm:items-center sm:justify-between sm:gap-2 sm:px-4 py-3">
          <span className="font-mono-num text-base sm:text-lg font-semibold tracking-wider text-[var(--ink)] whitespace-nowrap">
            {formattedCardNumber}
          </span>
          <button
            type="button"
            onClick={copyCardNum}
            className="min-h-[44px] px-3.5 rounded-lg border border-[var(--line)] bg-[var(--surface)] hover:border-[#E5B94C]/60 text-xs font-semibold text-[var(--ink)] inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
          >
            {copied ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} />}
            <span>{copied ? t.cardCopied : t.cardCopy}</span>
          </button>
        </div>
        <p className="text-xs text-[var(--ink-muted)]">{t.cardHint}</p>
      </div>

      {/* Receipt Upload */}
      <div className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-5 space-y-3">
        <h3 className="font-display text-base font-semibold text-[var(--ink)]">{t.uploadTitle}</h3>
        <p className="text-xs text-[var(--ink-muted)]">{t.uploadHint}</p>

        <input
          ref={fileInputRef}
          id="receipt-upload"
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={onFileSelected}
          className="sr-only"
        />

        {receiptDataUrl ? (
          <div className="space-y-3">
            <div className="relative overflow-hidden rounded-xl border border-[var(--line)] bg-black/5 dark:bg-black/30">
              <img
                src={receiptDataUrl}
                alt="To'lov cheki ko'rinishi"
                className="max-h-60 w-full object-contain mx-auto"
              />
            </div>
            <div className="flex items-center justify-between gap-3 text-xs">
              <span className="text-emerald-600 dark:text-emerald-400 font-medium truncate">
                {t.uploadSelected}: {fileName}
              </span>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="min-h-[44px] px-3 rounded-lg border border-[var(--line)] text-[var(--ink)] font-medium whitespace-nowrap shrink-0 cursor-pointer"
              >
                {t.uploadChange}
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="w-full min-h-[112px] rounded-xl border border-dashed border-[var(--gold-2)]/45 dark:border-[#E5B94C]/35 bg-[var(--surface-muted)] hover:border-[#E5B94C] flex flex-col items-center justify-center gap-2 p-4 text-center transition-colors cursor-pointer"
          >
            <ImagePlus size={24} className="text-[var(--gold-2)] dark:text-[#E5B94C]" />
            <span className="text-sm font-medium text-[var(--ink)]">{t.uploadTitle}</span>
          </button>
        )}
      </div>

      {errorMsg && (
        <div
          role="alert"
          className="rounded-xl border border-red-500/35 bg-red-500/10 px-4 py-3 text-sm text-red-700 dark:text-red-300 flex items-start gap-2.5"
        >
          <AlertCircle size={18} className="shrink-0 mt-0.5" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Sticky mobile CTA (BottomNav is hidden on checkout so zero overlap) */}
      <div className="fixed bottom-0 left-0 right-0 z-30 p-4 pb-safe bg-gradient-to-t from-[var(--bg)] via-[var(--bg)] to-transparent md:static md:p-0 md:bg-none">
        <button
          type="button"
          disabled={submitting || timerExpired}
          onClick={sendOrder}
          className="w-full min-h-[48px] rounded-xl bg-[#007AFF] hover:bg-[#0066D6] disabled:opacity-50 disabled:cursor-not-allowed text-white dark:bg-[#E5B94C] dark:hover:bg-[#d6a938] dark:text-[#09090B] font-semibold text-sm flex items-center justify-center gap-2 shadow-lg shadow-black/10 active:scale-[0.98] transition-transform cursor-pointer"
        >
          {submitting && <Loader2 size={18} className="animate-spin" />}
          <span>{submitting ? t.sendingOrderBtn : t.sendOrderBtn}</span>
        </button>
      </div>
    </div>
  );
}
