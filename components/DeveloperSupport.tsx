import { useState, type FormEvent } from 'react';
import useSWR from 'swr';
import { Code2, Crown, Gift, LoaderCircle, Send, Star, Trophy } from 'lucide-react';
import type { Lang } from '../types';
import { getTg } from '../utils/telegram';

interface SupportData {
  ok: boolean;
  totalStars: number;
  totalGifts: number;
  totalSupporters: number;
  leaderboard: Array<{ name: string; stars: number; gifts: number }>;
  recent: Array<{ name: string; stars: number; message: string; createdAt: number }>;
}

const COPY = {
  uz: {
    title: 'Dasturchini qo‘llab-quvvatlang',
    description: 'Loyiha rivojiga Telegram Stars bilan hissa qo‘shing. Har bir sovg‘a va xabaringiz hammaga ko‘rinadi.',
    amount: 'Stars miqdori',
    message: 'Xabaringiz',
    placeholder: 'Dasturchiga iliq tilak qoldiring (ixtiyoriy)',
    send: 'Stars bilan qo‘llab-quvvatlash',
    telegramOnly: 'Sovg‘a yuborish uchun ilovani Telegram ichida oching.',
    leaderboard: 'Qo‘llab-quvvatlovchilar reytingi',
    recent: 'So‘nggi sovg‘alar',
    empty: 'Birinchi bo‘lib dasturchini qo‘llab-quvvatlang.',
    people: 'qo‘llab-quvvatlovchi',
    gifts: 'sovg‘a',
    total: 'Jami berildi',
    paid: 'To‘lov muvaffaqiyatli. Rahmat!',
    cancelled: 'To‘lov bekor qilindi.',
    failed: 'To‘lov yakunlanmadi. Qayta urinib ko‘ring.',
    error: 'Invoice yaratilmadi. Birozdan so‘ng qayta urinib ko‘ring.',
  },
  ru: {
    title: 'Поддержите разработчика',
    description: 'Помогите развитию проекта с помощью Telegram Stars. Каждый подарок и сообщение видны всем.',
    amount: 'Количество Stars',
    message: 'Ваше сообщение',
    placeholder: 'Оставьте пожелание разработчику (необязательно)',
    send: 'Поддержать Stars',
    telegramOnly: 'Откройте приложение в Telegram, чтобы отправить подарок.',
    leaderboard: 'Рейтинг поддержки',
    recent: 'Последние подарки',
    empty: 'Станьте первым, кто поддержит разработчика.',
    people: 'поддержали',
    gifts: 'подарок',
    total: 'Всего отправлено',
    paid: 'Оплата прошла. Спасибо!',
    cancelled: 'Оплата отменена.',
    failed: 'Оплата не завершена. Попробуйте снова.',
    error: 'Не удалось создать счёт. Попробуйте позже.',
  },
  en: {
    title: 'Support the developer',
    description: 'Help this project grow with Telegram Stars. Every gift and message is visible to everyone.',
    amount: 'Number of Stars',
    message: 'Your message',
    placeholder: 'Leave a kind note for the developer (optional)',
    send: 'Support with Stars',
    telegramOnly: 'Open the app in Telegram to send a gift.',
    leaderboard: 'Supporter leaderboard',
    recent: 'Recent gifts',
    empty: 'Be the first to support the developer.',
    people: 'supporters',
    gifts: 'gifts',
    total: 'Stars gifted',
    paid: 'Payment successful. Thank you!',
    cancelled: 'Payment cancelled.',
    failed: 'Payment did not complete. Please try again.',
    error: 'Could not create an invoice. Please try again later.',
  },
} as const;

const fetcher = async (url: string): Promise<SupportData> => {
  const response = await fetch(url, { cache: 'no-store' });
  const data = await response.json();
  if (!response.ok || !data?.ok) throw new Error(data?.error || 'Support information unavailable');
  return data as SupportData;
};

function formatDate(timestamp: number, lang: Lang) {
  return new Intl.DateTimeFormat(lang === 'uz' ? 'uz-UZ' : lang === 'ru' ? 'ru-RU' : 'en-US', {
    day: 'numeric',
    month: 'short',
  }).format(new Date(timestamp));
}

export function DeveloperSupport({ initData, lang }: { initData: string; lang: Lang }) {
  const t = COPY[lang];
  const [stars, setStars] = useState('1');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [notice, setNotice] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  const { data, mutate } = useSWR<SupportData>('/.netlify/functions/support', fetcher, {
    revalidateOnFocus: true,
    refreshInterval: 30_000,
    shouldRetryOnError: false,
  });

  async function supportWithStars(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    const amount = Number(stars);
    if (!Number.isSafeInteger(amount) || amount < 1 || amount > 10_000) {
      setNotice({ tone: 'error', text: 'Stars miqdori 1 dan 10 000 gacha bo‘lishi kerak.' });
      return;
    }
    if (!initData) {
      setNotice({ tone: 'error', text: t.telegramOnly });
      return;
    }

    setSubmitting(true);
    setNotice(null);
    try {
      const response = await fetch('/.netlify/functions/support', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ initData, stars: amount, message }),
      });
      const result = await response.json();
      if (!response.ok || !result?.ok || typeof result.invoiceUrl !== 'string') {
        throw new Error(result?.error || t.error);
      }
      const telegram = getTg();
      if (telegram?.openInvoice) {
        telegram.openInvoice(result.invoiceUrl, (status) => {
          if (status === 'paid') {
            setNotice({ tone: 'success', text: t.paid });
            setMessage('');
            void mutate();
            window.setTimeout(() => void mutate(), 2500);
          } else if (status === 'cancelled') {
            setNotice({ tone: 'error', text: t.cancelled });
          } else if (status === 'failed') {
            setNotice({ tone: 'error', text: t.failed });
          }
        });
      } else {
        window.open(result.invoiceUrl, '_blank', 'noopener,noreferrer');
      }
    } catch (error) {
      setNotice({ tone: 'error', text: error instanceof Error ? error.message : t.error });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section
      aria-labelledby="developer-support-title"
      className="overflow-hidden rounded-[26px] border border-[#D7E5F8] bg-gradient-to-br from-[#F3F8FF] via-white to-[#FFF9E9] shadow-[0_14px_38px_rgba(0,74,150,0.08)] dark:border-[var(--line)] dark:from-[#111723] dark:via-[#12151F] dark:to-[#1B1810]"
    >
      <div className="grid lg:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)]">
        <div className="p-5 sm:p-7">
          <div className="flex items-center gap-2 text-[#007AFF] dark:text-[#E5B94C]">
            <Code2 size={17} aria-hidden="true" />
            <span className="text-xs font-bold uppercase tracking-[0.12em]">Olmos Pay</span>
          </div>
          <h2 id="developer-support-title" className="mt-3 font-display text-xl font-bold text-[var(--ink)] sm:text-2xl">
            {t.title}
          </h2>
          <p className="mt-2 max-w-lg text-sm leading-6 text-[var(--ink-muted)]">{t.description}</p>

          <form onSubmit={supportWithStars} className="mt-5 flex flex-col gap-3.5">
            <div>
              <label htmlFor="support-stars" className="mb-1.5 block text-xs font-semibold text-[var(--ink)]">{t.amount}</label>
              <div className="relative">
                <input
                  id="support-stars"
                  type="number"
                  min={1}
                  max={10_000}
                  step={1}
                  inputMode="numeric"
                  required
                  value={stars}
                  onChange={(event) => setStars(event.target.value)}
                  className="min-h-12 w-full rounded-xl border border-[var(--line)] bg-white/80 px-4 pr-24 font-mono-num text-base font-bold text-[var(--ink)] outline-none transition focus:border-[#007AFF] focus:ring-2 focus:ring-[#007AFF]/20 dark:bg-black/20 dark:focus:border-[#E5B94C]"
                />
                <span className="pointer-events-none absolute inset-y-0 right-4 inline-flex items-center gap-1.5 text-sm font-semibold text-[#D99B00] dark:text-[#E5B94C]"><Star size={15} fill="currentColor" /> XTR</span>
              </div>
              <p className="mt-1 text-[11px] text-[var(--ink-muted)]">Min. 1 · Maks. 10 000 Stars</p>
            </div>
            <div>
              <label htmlFor="support-message" className="mb-1.5 block text-xs font-semibold text-[var(--ink)]">{t.message}</label>
              <textarea
                id="support-message"
                rows={2}
                maxLength={250}
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                placeholder={t.placeholder}
                className="min-h-20 w-full resize-y rounded-xl border border-[var(--line)] bg-white/80 px-4 py-3 text-sm text-[var(--ink)] outline-none transition placeholder:text-[var(--ink-muted)] focus:border-[#007AFF] focus:ring-2 focus:ring-[#007AFF]/20 dark:bg-black/20 dark:focus:border-[#E5B94C]"
              />
              <div className="mt-1 flex justify-between text-[11px] text-[var(--ink-muted)]"><span>{lang === 'uz' ? 'Xabar ommaga ko‘rinadi' : lang === 'ru' ? 'Сообщение будет публичным' : 'Your message will be public'}</span><span>{message.length}/250</span></div>
            </div>
            <button
              type="submit"
              disabled={submitting || !initData}
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[#1677E8] px-4 text-sm font-bold text-white shadow-[0_8px_18px_rgba(22,119,232,0.2)] transition hover:bg-[#0864CE] disabled:cursor-not-allowed disabled:opacity-55 dark:bg-[#E5B94C] dark:text-[#111318] dark:hover:bg-[#F0C969]"
            >
              {submitting ? <LoaderCircle size={17} className="animate-spin" aria-hidden="true" /> : <Send size={16} aria-hidden="true" />}
              {t.send}
            </button>
            {!initData && <p className="text-center text-xs text-[var(--ink-muted)]">{t.telegramOnly}</p>}
            {notice && <p role={notice.tone === 'error' ? 'alert' : 'status'} className={`text-center text-xs font-medium ${notice.tone === 'success' ? 'text-emerald-700 dark:text-emerald-300' : 'text-red-600 dark:text-red-300'}`}>{notice.text}</p>}
          </form>
        </div>

        <div className="border-t border-[#D7E5F8] bg-white/45 p-5 dark:border-[var(--line)] dark:bg-black/10 sm:p-7 lg:border-l lg:border-t-0">
          <div className="grid grid-cols-3 gap-2.5">
            <div className="rounded-2xl border border-[var(--line)] bg-white/65 p-3 dark:bg-white/[0.035]">
              <p className="text-[10px] font-semibold text-[var(--ink-muted)]">{t.total}</p>
              <p className="mt-1 flex items-center gap-1 text-lg font-bold text-[var(--ink)]"><Star size={14} className="text-amber-500" fill="currentColor" />{(data?.totalStars || 0).toLocaleString()}</p>
            </div>
            <div className="rounded-2xl border border-[var(--line)] bg-white/65 p-3 dark:bg-white/[0.035]">
              <p className="text-[10px] font-semibold text-[var(--ink-muted)]">{lang === 'uz' ? 'Sovg‘alar' : lang === 'ru' ? 'Подарки' : 'Gifts'}</p>
              <p className="mt-1 text-lg font-bold text-[var(--ink)]">{(data?.totalGifts || 0).toLocaleString()}</p>
            </div>
            <div className="rounded-2xl border border-[var(--line)] bg-white/65 p-3 dark:bg-white/[0.035]">
              <p className="text-[10px] font-semibold text-[var(--ink-muted)]">{t.people}</p>
              <p className="mt-1 text-lg font-bold text-[var(--ink)]">{(data?.totalSupporters || 0).toLocaleString()}</p>
            </div>
          </div>

          <div className="mt-5">
            <h3 className="flex items-center gap-2 text-sm font-bold text-[var(--ink)]"><Trophy size={16} className="text-amber-500" aria-hidden="true" />{t.leaderboard}</h3>
            {data?.leaderboard.length ? (
              <ol className="mt-2.5 flex flex-col gap-2">
                {data.leaderboard.slice(0, 5).map((supporter, index) => (
                  <li key={`${supporter.name}-${index}`} className="flex items-center gap-3 rounded-xl border border-[var(--line)] bg-white/55 px-3 py-2.5 dark:bg-white/[0.025]">
                    <span className={`flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${index === 0 ? 'bg-amber-400/20 text-amber-600 dark:text-amber-300' : 'bg-black/[0.04] text-[var(--ink-muted)] dark:bg-white/[0.06]'}`}>{index === 0 ? <Crown size={14} aria-label="1" /> : index + 1}</span>
                    <span className="min-w-0 flex-1 truncate text-sm font-semibold text-[var(--ink)]">{supporter.name}</span>
                    <span className="shrink-0 text-right"><span className="text-xs font-bold text-amber-700 dark:text-[#E5B94C]">{supporter.stars.toLocaleString()} <Star size={11} className="inline" fill="currentColor" /></span><span className="ml-1 text-[10px] text-[var(--ink-muted)]">· {supporter.gifts} {t.gifts}</span></span>
                  </li>
                ))}
              </ol>
            ) : <p className="mt-2 rounded-xl border border-dashed border-[var(--line)] px-3 py-4 text-center text-xs text-[var(--ink-muted)]">{t.empty}</p>}
          </div>

          <div className="mt-5">
            <h3 className="flex items-center gap-2 text-sm font-bold text-[var(--ink)]"><Gift size={16} className="text-[#1677E8] dark:text-[#E5B94C]" aria-hidden="true" />{t.recent}</h3>
            {data?.recent.length ? (
              <ul className="mt-2.5 flex max-h-52 flex-col gap-2 overflow-y-auto pr-1">
                {data.recent.map((gift, index) => (
                  <li key={`${gift.createdAt}-${index}`} className="rounded-xl bg-white/60 px-3 py-2.5 dark:bg-white/[0.025]">
                    <div className="flex items-center justify-between gap-3">
                      <span className="truncate text-xs font-bold text-[var(--ink)]">{gift.name}</span>
                      <span className="inline-flex shrink-0 items-center gap-1 text-xs font-bold text-amber-700 dark:text-[#E5B94C]">+{gift.stars} <Star size={11} fill="currentColor" /></span>
                    </div>
                    {gift.message && <p className="mt-1 break-words text-xs leading-5 text-[var(--ink-muted)]">{gift.message}</p>}
                    <p className="mt-1 text-[10px] text-[var(--ink-muted)]">{formatDate(gift.createdAt, lang)}</p>
                  </li>
                ))}
              </ul>
            ) : <p className="mt-2 text-xs text-[var(--ink-muted)]">{t.empty}</p>}
          </div>
        </div>
      </div>
    </section>
  );
}
