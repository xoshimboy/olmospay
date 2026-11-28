import { useState, type FormEvent } from 'react';
import { BadgePercent, Check, Coins, Crown, Gamepad2, Gift, LoaderCircle, X } from 'lucide-react';
import { COIN_REWARDS } from '../data/coin-rewards.js';
import type { Lang, OrderHistoryItem } from '../types';

type Reward = (typeof COIN_REWARDS)[number];

interface RedemptionResult {
  balance: number;
  promoCode?: string;
  order?: OrderHistoryItem;
}

interface RewardShopProps {
  lang: Lang;
  initData: string;
  balance: number;
  customMedia: Record<string, string>;
  onSuccess: (result: RedemptionResult) => void;
}

const copy = {
  uz: {
    title: 'Tanga evaziga mukofotlar',
    subtitle: 'Yig‘ilgan tangalaringizni sovg‘a va chegirmalarga almashtiring.',
    items: {
      'telegram-gift': ['Telegram sovg‘asi', '1 ta Telegram Gift — @username ga yuboriladi.'],
      'discount-5': ['5% chegirma', 'Keyingi xaridingiz uchun bir martalik promo-kod.'],
      'telegram-premium-3m': ['Telegram Premium', '3 oylik Premium — Telegram username orqali.'],
      'pubg-60-uc': ['PUBG Mobile · 60 UC', 'UC tushishi uchun o‘yinchi ID raqamingiz kerak.'],
      'pubg-120-uc': ['PUBG Mobile · 120 UC', 'UC tushishi uchun o‘yinchi ID raqamingiz kerak.'],
    },
    redeem: 'Almashtirish',
    available: 'Sizda',
    coins: 'tanga',
    notEnough: 'Tanga yetarli emas',
    telegramButton: 'Telegramda oching',
    openTelegram: 'Almashtirish uchun ilovani Telegram ichidan oching.',
    fulfillment: 'Telegram sovg‘asi, Premium va UC buyurtmalari admin tekshiruvidan so‘ng yetkaziladi.',
    modalTitle: 'Mukofotni olish',
    usernameLabel: 'Qabul qiluvchining Telegram username’i',
    pubgLabel: 'PUBG Character ID',
    usernamePlaceholder: '@username',
    pubgPlaceholder: '5123456789',
    confirm: 'Tasdiqlash',
    cancel: 'Bekor qilish',
    processing: 'Yuborilmoqda…',
    error: 'So‘rovni bajarib bo‘lmadi. Qayta urinib ko‘ring.',
    insufficient: 'Tangalar yetarli emas.',
    invalidTarget: 'Kiritilgan username yoki o‘yinchi ID noto‘g‘ri.',
    telegramRequired: 'Almashtirish uchun Telegram ilovasini oching.',
    successTitle: 'Mukofot so‘rovi qabul qilindi',
    orderNote: 'Buyurtma adminga yuborildi. Holatini Buyurtmalar bo‘limidan kuzating.',
    couponTitle: 'Sizning 5% promo-kodingiz',
    couponNote: 'Kodni xarid vaqtida kiriting. Bir marta ishlatiladi.',
    copy: 'Nusxalash',
    copied: 'Nusxalandi',
    history: 'Buyurtma tarixi',
  },
  ru: {
    title: 'Награды за монеты',
    subtitle: 'Обменивайте накопленные монеты на подарки и скидки.',
    items: {
      'telegram-gift': ['Подарок Telegram', '1 подарок Telegram — отправка на @username.'],
      'discount-5': ['Скидка 5%', 'Одноразовый промокод для следующей покупки.'],
      'telegram-premium-3m': ['Telegram Premium', 'Premium на 3 месяца — по username.'],
      'pubg-60-uc': ['PUBG Mobile · 60 UC', 'Для начисления UC понадобится ваш игровой ID.'],
      'pubg-120-uc': ['PUBG Mobile · 120 UC', 'Для начисления UC понадобится ваш игровой ID.'],
    },
    redeem: 'Обменять',
    available: 'Баланс',
    coins: 'монет',
    notEnough: 'Недостаточно монет',
    telegramButton: 'Открыть Telegram',
    openTelegram: 'Откройте приложение внутри Telegram, чтобы обменять монеты.',
    fulfillment: 'Telegram Gifts, Premium и UC будут доставлены после проверки администратором.',
    modalTitle: 'Получить награду',
    usernameLabel: 'Telegram username получателя',
    pubgLabel: 'PUBG Character ID',
    usernamePlaceholder: '@username',
    pubgPlaceholder: '5123456789',
    confirm: 'Подтвердить',
    cancel: 'Отмена',
    processing: 'Отправка…',
    error: 'Не удалось выполнить запрос. Попробуйте ещё раз.',
    insufficient: 'Недостаточно монет.',
    invalidTarget: 'Неверный username или игровой ID.',
    telegramRequired: 'Откройте Telegram, чтобы обменять монеты.',
    successTitle: 'Запрос на награду принят',
    orderNote: 'Заказ отправлен администратору. Следите за статусом в истории заказов.',
    couponTitle: 'Ваш промокод на 5%',
    couponNote: 'Введите код при покупке. Он действует один раз.',
    copy: 'Скопировать',
    copied: 'Скопировано',
    history: 'История заказов',
  },
  en: {
    title: 'Redeem your coins',
    subtitle: 'Trade your earned coins for gifts and discounts.',
    items: {
      'telegram-gift': ['Telegram gift', 'One Telegram Gift, sent to an @username.'],
      'discount-5': ['5% discount', 'A one-time promo code for your next purchase.'],
      'telegram-premium-3m': ['Telegram Premium', '3 months of Premium, delivered by username.'],
      'pubg-60-uc': ['PUBG Mobile · 60 UC', 'Your PUBG player ID is required for delivery.'],
      'pubg-120-uc': ['PUBG Mobile · 120 UC', 'Your PUBG player ID is required for delivery.'],
    },
    redeem: 'Redeem',
    available: 'Balance',
    coins: 'coins',
    notEnough: 'Not enough coins',
    telegramButton: 'Open in Telegram',
    openTelegram: 'Open the app inside Telegram to redeem coins.',
    fulfillment: 'Telegram Gifts, Premium, and UC are delivered after admin review.',
    modalTitle: 'Redeem reward',
    usernameLabel: 'Recipient Telegram username',
    pubgLabel: 'PUBG Character ID',
    usernamePlaceholder: '@username',
    pubgPlaceholder: '5123456789',
    confirm: 'Confirm redemption',
    cancel: 'Cancel',
    processing: 'Submitting…',
    error: 'Could not submit your request. Please try again.',
    insufficient: 'You do not have enough coins.',
    invalidTarget: 'Enter a valid username or player ID.',
    telegramRequired: 'Open Telegram to redeem your coins.',
    successTitle: 'Reward request received',
    orderNote: 'Your request was sent to admin. Track it in Order history.',
    couponTitle: 'Your 5% promo code',
    couponNote: 'Enter this code at checkout. It can be used once.',
    copy: 'Copy code',
    copied: 'Copied',
    history: 'Order history',
  },
} as const;

const iconByReward = {
  'telegram-gift': Gift,
  'discount-5': BadgePercent,
  'telegram-premium-3m': Crown,
  'pubg-60-uc': Gamepad2,
  'pubg-120-uc': Gamepad2,
};

export function RewardShop({ lang, initData, balance, customMedia, onSuccess }: RewardShopProps) {
  const strings = copy[lang];
  const [selected, setSelected] = useState<Reward | null>(null);
  const [target, setTarget] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState<RedemptionResult | null>(null);
  const [copied, setCopied] = useState(false);

  function openRedemption(reward: Reward) {
    setSelected(reward);
    setTarget('');
    setError('');
    setSuccess(null);
  }

  async function submitRedemption(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected || submitting) return;
    if (!initData) {
      setError(strings.telegramRequired);
      return;
    }

    setSubmitting(true);
    setError('');
    try {
      const response = await fetch('/.netlify/functions/redeem-reward', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          initData,
          rewardId: selected.id,
          target: target.trim(),
          requestId: window.crypto.randomUUID(),
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data?.ok) {
        setError(
          data?.code === 'insufficient_coins'
            ? strings.insufficient
            : data?.code === 'invalid_target'
              ? strings.invalidTarget
              : data?.code === 'telegram_required'
                ? strings.telegramRequired
                : data?.error || strings.error
        );
        return;
      }

      const result: RedemptionResult = {
        balance: Number(data.balance),
        promoCode: data.promoCode,
        order: data.order,
      };
      setSuccess(result);
      setSelected(null);
      setTarget('');
      onSuccess(result);
    } catch {
      setError(strings.error);
    } finally {
      setSubmitting(false);
    }
  }

  async function copyPromoCode() {
    if (!success?.promoCode) return;
    try {
      await navigator.clipboard.writeText(success.promoCode);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setError(strings.error);
    }
  }

  return (
    <section className="ios-glass-card overflow-hidden rounded-[22px]" aria-labelledby="coin-rewards-title">
      <div className="border-b border-[var(--line)] bg-gradient-to-r from-amber-500/10 via-transparent to-[#007AFF]/5 p-5 sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 id="coin-rewards-title" className="font-display text-lg font-bold text-[var(--ink)]">
              {strings.title}
            </h2>
            <p className="mt-1 text-sm text-[var(--ink-muted)]">{strings.subtitle}</p>
          </div>
          <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-amber-500/20 bg-amber-500/10 px-3 py-1.5 font-mono-num text-xs font-bold text-amber-700 dark:text-[#E5B94C]">
            <Coins size={14} aria-hidden="true" /> {balance} {strings.coins}
          </span>
        </div>
      </div>

      <div className="space-y-4 p-4 sm:p-5">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {COIN_REWARDS.map((reward) => {
            const Icon = iconByReward[reward.id as keyof typeof iconByReward];
            const [title, description] = strings.items[reward.id as keyof typeof strings.items];
            const canRedeem = Boolean(initData) && balance >= reward.coinCost;
            return (
              <article
                key={reward.id}
                className="flex min-h-[172px] flex-col justify-between rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-4 transition-colors hover:border-amber-500/35"
              >
                <div className="flex items-start gap-3">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-amber-500/10 text-amber-700 dark:text-[#E5B94C]">
                    {customMedia[`reward:${reward.id}`] ? (
                      <img src={customMedia[`reward:${reward.id}`]} alt={`${title} mukofoti`} className="h-full w-full object-cover" />
                    ) : (
                      <Icon size={20} aria-hidden="true" />
                    )}
                  </span>
                  <div className="min-w-0">
                    <h3 className="font-display text-sm font-bold text-[var(--ink)]">{title}</h3>
                    <p className="mt-1 text-xs leading-relaxed text-[var(--ink-muted)]">{description}</p>
                  </div>
                </div>
                <div className="mt-4 flex items-center justify-between gap-3">
                  <span className="inline-flex items-center gap-1.5 font-mono-num text-xs font-bold text-amber-700 dark:text-[#E5B94C]">
                    <Coins size={14} aria-hidden="true" /> {reward.coinCost} {strings.coins}
                  </span>
                  <button
                    type="button"
                    onClick={() => openRedemption(reward)}
                    disabled={!canRedeem || submitting}
                    className="min-h-10 rounded-xl bg-[#E5B94C] px-3.5 text-xs font-bold text-[#09090B] transition-colors hover:bg-[#d6a938] disabled:cursor-not-allowed disabled:opacity-45"
                    aria-label={`${strings.redeem}: ${title} (${reward.coinCost} ${strings.coins})`}
                  >
                    {canRedeem ? strings.redeem : !initData ? strings.telegramButton : strings.notEnough}
                  </button>
                </div>
              </article>
            );
          })}
        </div>

        {!initData && <p className="text-xs text-[var(--ink-muted)]" role="status">{strings.openTelegram}</p>}
        <p className="rounded-xl border border-[var(--line)] bg-[var(--surface-muted)] px-3.5 py-3 text-xs leading-relaxed text-[var(--ink-muted)]">
          {strings.fulfillment}
        </p>

        {success && (
          <div className="rounded-2xl border border-emerald-500/25 bg-emerald-500/8 p-4" role="status" aria-live="polite">
            <div className="flex items-center gap-2 text-sm font-bold text-emerald-700 dark:text-emerald-400">
              <Check size={17} aria-hidden="true" /> {strings.successTitle}
            </div>
            {success.promoCode ? (
              <div className="mt-3">
                <p className="text-xs text-[var(--ink-muted)]">{strings.couponTitle}</p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <code className="rounded-lg bg-[var(--surface)] px-3 py-2 font-mono-num text-sm font-bold text-[var(--ink)]">{success.promoCode}</code>
                  <button type="button" onClick={copyPromoCode} className="min-h-10 rounded-lg border border-[var(--line)] px-3 text-xs font-semibold text-[var(--ink)] hover:border-amber-500/40">
                    {copied ? strings.copied : strings.copy}
                  </button>
                </div>
                <p className="mt-2 text-xs text-[var(--ink-muted)]">{strings.couponNote}</p>
              </div>
            ) : (
              <p className="mt-1 text-xs text-[var(--ink-muted)]">{strings.orderNote}</p>
            )}
          </div>
        )}
      </div>

      {selected && (
        <div
          className="fixed inset-0 z-[120] flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !submitting) setSelected(null);
          }}
        >
          <section role="dialog" aria-modal="true" aria-labelledby="coin-reward-dialog-title" className="w-full max-w-md rounded-[24px] border border-[var(--line)] bg-[var(--surface)] p-5 shadow-2xl sm:p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 id="coin-reward-dialog-title" className="font-display text-lg font-bold text-[var(--ink)]">{strings.modalTitle}</h2>
                <p className="mt-1 text-sm text-[var(--ink-muted)]">{strings.items[selected.id as keyof typeof strings.items][0]}</p>
              </div>
              <button type="button" onClick={() => setSelected(null)} disabled={submitting} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-[var(--ink-muted)] hover:bg-[var(--surface-muted)] disabled:opacity-50" aria-label={strings.cancel}>
                <X size={18} aria-hidden="true" />
              </button>
            </div>
            <form onSubmit={submitRedemption} className="mt-5 space-y-4">
              {selected.targetType && (
                <label className="block space-y-2 text-sm font-semibold text-[var(--ink)]">
                  <span>{selected.targetType === 'pubg-id' ? strings.pubgLabel : strings.usernameLabel}</span>
                  <input
                    autoFocus
                    value={target}
                    onChange={(event) => setTarget(event.target.value)}
                    placeholder={selected.targetType === 'pubg-id' ? strings.pubgPlaceholder : strings.usernamePlaceholder}
                    maxLength={selected.targetType === 'pubg-id' ? 15 : 33}
                    autoCapitalize="none"
                    autoComplete="off"
                    spellCheck={false}
                    required
                    className="min-h-12 w-full rounded-xl border border-[var(--line)] bg-[var(--surface-muted)] px-3.5 text-sm font-normal text-[var(--ink)] placeholder:text-[var(--ink-muted)] focus:outline-none focus:ring-2 focus:ring-amber-500/35"
                  />
                </label>
              )}
              <div className="flex items-center justify-between rounded-xl bg-[var(--surface-muted)] px-4 py-3 text-sm">
                <span className="text-[var(--ink-muted)]">{strings.available}</span>
                <span className="font-mono-num font-bold text-[var(--ink)]">{balance} {strings.coins}</span>
              </div>
              {error && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{error}</p>}
              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <button type="button" onClick={() => setSelected(null)} disabled={submitting} className="min-h-11 rounded-xl border border-[var(--line)] px-4 text-sm font-semibold text-[var(--ink)] disabled:opacity-50">
                  {strings.cancel}
                </button>
                <button type="submit" disabled={submitting || (selected.targetType !== null && !target.trim())} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#E5B94C] px-5 text-sm font-bold text-[#09090B] hover:bg-[#d6a938] disabled:cursor-not-allowed disabled:opacity-60">
                  {submitting && <LoaderCircle size={16} className="animate-spin" aria-hidden="true" />}
                  {submitting ? strings.processing : `${strings.confirm} · ${selected.coinCost} ${strings.coins}`}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </section>
  );
}
