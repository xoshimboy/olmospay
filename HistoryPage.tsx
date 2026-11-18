import { useEffect } from 'react';
import { RefreshCw, ShoppingBag, ArrowRight, CheckCircle2, Clock3, XCircle, Loader2 } from 'lucide-react';
import type { I18nDict } from '../data/i18n';
import type { Lang, OrderHistoryItem, OrderStatus } from '../types';
import { formatOrderDate, formatUzs } from '../utils/format';

interface HistoryPageProps {
  t: I18nDict;
  lang: Lang;
  orders: OrderHistoryItem[];
  refreshing: boolean;
  onRefresh: () => void;
  onBrowseGames: () => void;
}

function StatusLabel({ status, label }: { status: OrderStatus; label: string }) {
  const Icon =
    status === 'completed'
      ? CheckCircle2
      : status === 'canceled'
        ? XCircle
        : status === 'processing'
          ? Loader2
          : Clock3;

  const colorCls =
    status === 'completed'
      ? 'text-emerald-700 dark:text-emerald-400'
      : status === 'canceled'
        ? 'text-red-700 dark:text-red-400'
        : 'text-[var(--gold-2)] dark:text-[#E5B94C]';

  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-semibold ${colorCls}`}>
      <Icon size={14} className={status === 'processing' ? 'animate-spin' : ''} />
      <span>{label}</span>
    </span>
  );
}

export function HistoryPage({ t, lang, orders, refreshing, onRefresh, onBrowseGames }: HistoryPageProps) {
  const hasActiveOrder = orders.some((o) => o.status === 'pending' || o.status === 'processing');

  useEffect(() => {
    if (!hasActiveOrder) return;
    const timer = window.setInterval(() => {
      if (!refreshing) {
        onRefresh();
      }
    }, 4_000);
    return () => window.clearInterval(timer);
  }, [hasActiveOrder, refreshing, onRefresh]);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-4">
        <h1 className="font-display text-2xl font-bold text-[var(--ink)]">{t.historyTitle}</h1>
        <button
          type="button"
          onClick={onRefresh}
          disabled={refreshing}
          className="min-h-[44px] px-4 rounded-xl border border-[var(--line)] bg-[var(--surface)] hover:border-[#E5B94C]/50 text-xs font-semibold text-[var(--ink)] inline-flex items-center gap-2 whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-60"
        >
          <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
          <span>{t.historyRefresh}</span>
        </button>
      </div>

      {orders.length === 0 ? (
        <div className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-8 sm:p-12 text-center max-w-lg mx-auto">
          <div className="mx-auto h-14 w-14 rounded-2xl bg-[var(--surface-muted)] border border-[var(--line)] flex items-center justify-center text-[var(--gold-2)] dark:text-[#E5B94C]">
            <ShoppingBag size={26} />
          </div>
          <h3 className="mt-4 font-display text-lg font-bold text-[var(--ink)]">{t.historyEmptyTitle}</h3>
          <p className="mt-1.5 text-sm text-[var(--ink-muted)]">{t.historyEmptyDesc}</p>
          <button
            type="button"
            onClick={onBrowseGames}
            className="mt-5 min-h-[44px] px-5 py-2.5 rounded-xl bg-[#E5B94C] hover:bg-[#d6a938] text-[#09090B] font-semibold text-sm inline-flex items-center gap-2 cursor-pointer"
          >
            <span>{t.historyEmptyCta}</span>
            <ArrowRight size={16} />
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {orders.map((order) => (
            <article
              key={order.ref}
              className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-5 space-y-3 shadow-sm"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="font-display text-base font-bold text-[var(--ink)]">{order.gameName}</h3>
                  <p className="text-sm text-[var(--ink-muted)]">{order.packLabel}</p>
                </div>
                <StatusLabel status={order.status} label={t.statusMap[order.status] || order.status} />
              </div>

              <div className="pt-3 border-t border-[var(--line)] flex flex-wrap items-center justify-between gap-2 text-xs text-[var(--ink-muted)]">
                <div className="flex items-center gap-2">
                  <span className="font-mono-num text-[var(--ink)]">{order.ref}</span>
                  <span aria-hidden="true">·</span>
                  <span className="font-mono-num">
                    {order.playerDisplay}
                    {order.server ? ` (${order.server})` : ''}
                  </span>
                </div>
                <span className="font-mono-num text-sm font-bold text-[var(--gold-2)] dark:text-[#E5B94C]">
                  {formatUzs(order.priceUzs, t.uzs)}
                </span>
              </div>

              <div className="flex items-center justify-between gap-2 text-xs text-[var(--ink-muted)]">
                <span>{formatOrderDate(order.createdAt, lang)}</span>
                {typeof order.coinsReward === 'number' && order.coinsReward > 0 && (
                  <span className="font-mono-num font-semibold text-amber-600 dark:text-[#E5B94C]">
                    🪙 +{order.coinsReward} {t.coinsUnit}
                  </span>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
