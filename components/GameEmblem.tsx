import { useEffect, useState } from 'react';
import {
  Camera,
  Crosshair,
  Crown,
  Flame,
  Gamepad2,
  Gift,
  Music2,
  PlaySquare,
  Radio,
  Send,
  Smartphone,
  Sparkles,
  Star,
  Swords,
  Trophy,
} from 'lucide-react';

interface GameEmblemProps {
  gameId: string;
  name?: string;
  coverUrl?: string;
  size?: 'sm' | 'md' | 'lg';
}

export function GameEmblem({ gameId, name = '', coverUrl, size = 'md' }: GameEmblemProps) {
  const [imgError, setImgError] = useState(false);

  useEffect(() => {
    setImgError(false);
  }, [coverUrl]);

  const boxSize =
    size === 'sm' ? 'h-10 w-10 rounded-xl' : size === 'lg' ? 'h-16 w-16 rounded-2xl' : 'h-12 w-12 rounded-xl';
  const iconSize = size === 'sm' ? 18 : size === 'lg' ? 28 : 22;

  if (coverUrl && !imgError) {
    return (
      <div
        className={`${boxSize} shrink-0 overflow-hidden bg-[#F2F2F7] border border-black/[0.06] dark:bg-[#18181D] dark:border-[#E5B94C]/30`}
      >
        <img
          src={coverUrl}
          alt={name || gameId}
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          onError={() => setImgError(true)}
          className="h-full w-full object-cover"
        />
      </div>
    );
  }

  const Icon =
    gameId === 'freefire'
      ? Flame
      : gameId === 'pubg'
        ? Crosshair
        : gameId === 'mlbb'
          ? Swords
          : gameId === 'bigo'
            ? Radio
            : gameId === 'steam'
              ? Gamepad2
              : gameId === 'tg-stars'
                  ? Star
                  : gameId === 'tg-premium'
                    ? Crown
                    : gameId === 'tg-gifts'
                      ? Gift
                      : gameId === 'tg-account'
                        ? Smartphone
                        : gameId === 'tg-giveaway'
                          ? Trophy
                          : gameId === 'smm-telegram'
                            ? Send
                            : gameId === 'smm-instagram'
                              ? Camera
                              : gameId === 'smm-youtube'
                                ? PlaySquare
                                : gameId === 'smm-tiktok'
                                  ? Music2
                                  : Sparkles;

  return (
    <div
      className={`${boxSize} shrink-0 flex items-center justify-center bg-[#F2F2F7] text-[#007AFF] border border-black/[0.06] dark:bg-[#1E1E24] dark:text-[#E5B94C] dark:border-[#E5B94C]/25`}
      aria-hidden="true"
    >
      <Icon size={iconSize} strokeWidth={1.8} />
    </div>
  );
}
