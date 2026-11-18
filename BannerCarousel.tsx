import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, ArrowRight, Gamepad2, Sparkles, TrendingUp } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import type { I18nDict } from '../data/i18n';

interface BannerCarouselProps {
  t: I18nDict;
  customMedia?: Record<string, string>;
  onSelectGame: (gameId: string) => void;
}

const SLIDE_THEMES = [
  {
    orbA: 'bg-[#60A5FA]/55',
    orbB: 'bg-[#38BDF8]/50',
    orbC: 'bg-[#818CF8]/45',
    icon: Gamepad2,
    chipLabel: 'PUBG · Free Fire · MLBB',
    chipGradient: 'from-[#007AFF] to-[#5856D6]',
  },
  {
    orbA: 'bg-[#38BDF8]/55',
    orbB: 'bg-[#67E8F9]/55',
    orbC: 'bg-[#60A5FA]/45',
    icon: Sparkles,
    chipLabel: 'Stars · Premium · Gifts',
    chipGradient: 'from-[#007AFF] to-[#00C7BE]',
  },
  {
    orbA: 'bg-[#818CF8]/50',
    orbB: 'bg-[#38BDF8]/55',
    orbC: 'bg-[#5EEAD4]/45',
    icon: TrendingUp,
    chipLabel: 'TG · Instagram · TikTok',
    chipGradient: 'from-[#5856D6] to-[#007AFF]',
  },
];

export function BannerCarousel({ t, customMedia = {}, onSelectGame }: BannerCarouselProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [failedImages, setFailedImages] = useState<Record<number, boolean>>({});
  const slides = t.banners;

  useEffect(() => {
    setFailedImages({});
  }, [customMedia]);

  useEffect(() => {
    const id = window.setInterval(() => {
      setActiveIndex((prev) => (prev + 1) % slides.length);
    }, 5500);
    return () => window.clearInterval(id);
  }, [slides.length]);

  const current = slides[activeIndex] || slides[0];
  const customKey = `banner-${activeIndex + 1}`;
  const customImgSrc = customMedia[customKey];
  const imgFailed = Boolean(failedImages[activeIndex]);
  const theme = SLIDE_THEMES[activeIndex % SLIDE_THEMES.length];
  const SlideIcon = theme.icon;

  return (
    <section
      aria-label="Featured promotions"
      className="relative overflow-hidden rounded-[28px] border border-white/95 dark:border-[var(--line)] bg-gradient-to-br from-[#EEF5FF] via-[#F8FBFF] to-[#E6F1FF] dark:from-[#12151F] dark:via-[#141822] dark:to-[#0D1017] text-[#1C1C1E] dark:text-[#F8FAFC] shadow-[0_14px_38px_rgba(0,122,255,0.10)] dark:shadow-[0_12px_36px_rgba(0,0,0,0.45)]"
    >
      {/* Animated Apple iOS Mesh Wallpaper Layer */}
      <div aria-hidden="true" className="absolute inset-0 overflow-hidden pointer-events-none">
        <div
          className={`animate-ios-orb-a absolute -top-24 -left-12 h-72 w-72 rounded-full ${theme.orbA} blur-3xl dark:opacity-35`}
        />
        <div
          className={`animate-ios-orb-b absolute -bottom-24 right-0 h-80 w-80 rounded-full ${theme.orbB} blur-3xl dark:opacity-30`}
        />
        <div
          className={`animate-ios-orb-c absolute top-1/4 left-1/2 -translate-x-1/2 h-64 w-64 rounded-full ${theme.orbC} blur-3xl dark:opacity-25`}
        />

        {/* Custom admin-uploaded banner artwork blended under frosted iOS glass */}
        {customImgSrc && !imgFailed && (
          <AnimatePresence mode="wait">
            <motion.img
              key={customImgSrc}
              src={customImgSrc}
              alt=""
              referrerPolicy="no-referrer"
              onError={() => setFailedImages((prev) => ({ ...prev, [activeIndex]: true }))}
              initial={{ opacity: 0, scale: 1.04 }}
              animate={{ opacity: 0.38, scale: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
              className="absolute inset-0 h-full w-full object-cover object-center"
            />
          </AnimatePresence>
        )}

        {/* Translucent Apple iOS Liquid Glass Foreground Diffusion */}
        <div className="absolute inset-0 bg-white/42 dark:bg-[#0D1017]/58 backdrop-blur-2xl" />
      </div>

      {/* Foreground iOS Content (compact & crisp) */}
      <div className="relative z-10 min-h-[148px] sm:min-h-[174px] lg:min-h-[190px] p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex-1 min-w-0 max-w-xl flex flex-col justify-between">
          <motion.div
            key={current.gameId + activeIndex}
            initial={{ opacity: 0.25, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
          >
            <p className="text-[11px] font-semibold tracking-wide text-[#007AFF] dark:text-[#E5B94C]">
              {current.kicker}
            </p>
            <h2 className="mt-1 font-display text-[16px] sm:text-[21px] font-bold tracking-tight text-[#1C1C1E] dark:text-white leading-snug [text-wrap:balance]">
              {current.title}
            </h2>
            <p className="mt-1 text-xs sm:text-[13px] text-[#48484A] dark:text-zinc-300 max-w-lg leading-snug line-clamp-2">
              {current.desc}
            </p>
          </motion.div>

          <div className="mt-3.5 flex items-center justify-between sm:justify-start gap-2.5">
            <button
              type="button"
              onClick={() => onSelectGame(current.gameId)}
              className="min-h-[38px] px-4 py-1.5 rounded-full bg-[#007AFF] hover:bg-[#0066D6] active:scale-[0.97] text-white dark:bg-[#E5B94C] dark:hover:bg-[#d6a938] dark:text-[#09090B] font-semibold text-xs inline-flex items-center gap-1.5 shadow-[0_4px_14px_rgba(0,122,255,0.24)] dark:shadow-none transition-all whitespace-nowrap shrink-0 cursor-pointer"
            >
              <span>{current.cta}</span>
              <ArrowRight size={14} />
            </button>

            <div className="flex items-center gap-1.5 sm:ml-2">
              <button
                type="button"
                aria-label="Previous banner"
                onClick={() => setActiveIndex((prev) => (prev - 1 + slides.length) % slides.length)}
                className="min-h-[38px] min-w-[38px] flex items-center justify-center rounded-full bg-white/88 hover:bg-white active:scale-95 dark:bg-white/10 dark:hover:bg-white/20 backdrop-blur-xl text-[#1C1C1E] dark:text-white shadow-[0_2px_8px_rgba(15,23,42,0.08)] transition-all cursor-pointer"
              >
                <ChevronLeft size={16} />
              </button>
              <button
                type="button"
                aria-label="Next banner"
                onClick={() => setActiveIndex((prev) => (prev + 1) % slides.length)}
                className="min-h-[38px] min-w-[38px] flex items-center justify-center rounded-full bg-white/88 hover:bg-white active:scale-95 dark:bg-white/10 dark:hover:bg-white/20 backdrop-blur-xl text-[#1C1C1E] dark:text-white shadow-[0_2px_8px_rgba(15,23,42,0.08)] transition-all cursor-pointer"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        </div>

        {/* Desktop Visual Artwork / Animated Apple iOS Squircle Preview */}
        {customImgSrc && !imgFailed ? (
          <div className="hidden sm:block shrink-0 w-36 md:w-44 lg:w-48 aspect-[4/3] rounded-[18px] overflow-hidden shadow-[0_8px_22px_rgba(15,23,42,0.12)] bg-white/75 dark:bg-black/30">
            <AnimatePresence mode="wait">
              <motion.img
                key={customImgSrc}
                src={customImgSrc}
                alt={current.title}
                referrerPolicy="no-referrer"
                onError={() => setFailedImages((prev) => ({ ...prev, [activeIndex]: true }))}
                initial={{ opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.98 }}
                transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
                className="h-full w-full object-cover object-center"
              />
            </AnimatePresence>
          </div>
        ) : (
          <div
            aria-hidden="true"
            className="hidden sm:flex shrink-0 w-36 md:w-44 aspect-[4/3] rounded-[20px] bg-white/75 dark:bg-white/10 backdrop-blur-2xl shadow-[0_10px_24px_rgba(0,122,255,0.10)] flex-col items-center justify-center gap-2 p-3"
          >
            <AnimatePresence mode="wait">
              <motion.div
                key={activeIndex}
                initial={{ opacity: 0, scale: 0.92, y: 4 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.96, y: -4 }}
                transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
                className="flex flex-col items-center gap-2 text-center"
              >
                <div
                  className={`h-11 w-11 rounded-[14px] bg-gradient-to-br ${theme.chipGradient} text-white flex items-center justify-center shadow-[0_6px_16px_rgba(0,122,255,0.24)]`}
                >
                  <SlideIcon size={22} />
                </div>
                <span className="text-[11px] font-semibold text-[#3C3C43] dark:text-zinc-200 tracking-tight">
                  {theme.chipLabel}
                </span>
              </motion.div>
            </AnimatePresence>
          </div>
        )}
      </div>

      {/* Apple iOS Smooth Slide Indicators */}
      <div className="relative z-10 flex items-center gap-1.5 px-4 pb-2.5 sm:px-5" role="tablist" aria-label="Banner slides">
        {slides.map((slide, idx) => {
          const isCurrent = idx === activeIndex;
          return (
            <button
              key={slide.gameId + idx}
              type="button"
              role="tab"
              aria-selected={isCurrent}
              aria-label={`Slide ${idx + 1}: ${slide.title}`}
              onClick={() => setActiveIndex(idx)}
              className="py-1.5 px-1 cursor-pointer group focus:outline-none"
            >
              <span
                className={`block h-1.5 rounded-full transition-all duration-300 ${
                  isCurrent
                    ? 'w-6 bg-[#007AFF] dark:bg-[#E5B94C]'
                    : 'w-1.5 bg-[#1C1C1E]/18 group-hover:bg-[#1C1C1E]/35 dark:bg-white/25 dark:group-hover:bg-white/45'
                }`}
              />
            </button>
          );
        })}
      </div>
    </section>
  );
}
