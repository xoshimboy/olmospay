import { Home, Gamepad2, Clock, User } from 'lucide-react';
import type { I18nDict } from '../data/i18n';
import type { PageId } from '../types';

interface BottomNavProps {
  activePage: PageId;
  t: I18nDict;
  onNavigate: (page: PageId) => void;
}

export function BottomNav({ activePage, t, onNavigate }: BottomNavProps) {
  const items: Array<{ id: PageId; label: string; icon: typeof Home }> = [
    { id: 'p-home', label: t.navHome, icon: Home },
    { id: 'p-games', label: t.navGames, icon: Gamepad2 },
    { id: 'p-history', label: t.navHistory, icon: Clock },
    { id: 'p-profile', label: t.navProfile, icon: User },
  ];

  return (
    <nav
      aria-label="Mobile navigation"
      className="md:hidden fixed bottom-0 left-0 right-0 z-40 border-t border-black/[0.08] dark:border-[var(--line)] bg-white/90 dark:bg-[var(--surface)]/95 backdrop-blur-xl pb-safe"
    >
      <div className="grid grid-cols-4 items-center h-16 px-2">
        {items.map((item) => {
          const Icon = item.icon;
          const active = activePage === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onNavigate(item.id)}
              aria-current={active ? 'page' : undefined}
              className={`min-h-[44px] flex flex-col items-center justify-center gap-1 rounded-xl transition-colors cursor-pointer ${
                active
                  ? 'text-[#007AFF] dark:text-[#E5B94C]'
                  : 'text-[var(--ink-muted)] hover:text-[var(--ink)]'
              }`}
            >
              <Icon size={20} strokeWidth={active ? 2.3 : 1.8} />
              <span className="text-[11px] font-medium leading-none whitespace-nowrap">{item.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
