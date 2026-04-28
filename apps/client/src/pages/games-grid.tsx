import { StatusBadge } from '@/components/status-badge';
import { coverColorFor, initials } from '@/lib/avatar';
import { statusFor } from '@/lib/game-status';
import type { Game } from '@/types';
import { Link } from 'react-router-dom';

export function GamesGrid({ items }: { items: Game[] }) {
  return (
    <div className="flex flex-wrap gap-4">
      {items.map((g) => (
        <GameCard key={g.id} game={g} />
      ))}
    </div>
  );
}

function GameCard({ game }: { game: Game }) {
  const status = statusFor(game.status);
  const bg = coverColorFor(game);
  const glyph = initials(game.title.trim() || '?');

  return (
    <Link
      to={`/games/${game.id}`}
      className="flex h-[120px] w-[240px] shrink-0 overflow-hidden rounded-[10px] border border-apex-line-3 bg-white transition-colors hover:border-apex-line-2"
    >
      <div
        className="flex h-[120px] w-[105px] shrink-0 items-center justify-center"
        style={{ background: bg }}
      >
        <span className="text-[30px] font-bold leading-none text-white">
          {glyph}
        </span>
      </div>
      <div className="flex min-w-0 flex-1 flex-col px-3 py-2.5">
        <div className="truncate text-[13px] font-bold leading-[1.3] text-apex-ink">
          {game.title}
        </div>
        <div className="mt-0.5 truncate text-[11px] leading-[1.35] text-apex-faint">
          {game.developer}
        </div>
        <div className="truncate text-[11px] leading-[1.35] text-apex-faint">
          {game.platform}
        </div>
        <div className="mt-auto flex items-center justify-between gap-2 pt-1.5">
          <StatusBadge {...status} />
          <span className="text-[11px] text-apex-faint">
            {game.hoursPlayed}h
          </span>
        </div>
      </div>
    </Link>
  );
}
