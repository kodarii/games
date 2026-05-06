import { GameCover } from '@/components/game-cover';
import { StatusBadge } from '@/components/status-badge';
import { coverColorFor } from '@/lib/avatar';
import { statusFor } from '@/lib/game-status';
import { formatPriceZl } from '@/lib/money';
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
  const status = game.status != null ? statusFor(game.status) : null;

  return (
    <Link
      to={`/games/${game.id}`}
      className="flex h-[120px] w-[240px] shrink-0 overflow-hidden rounded-[10px] border border-apex-line-3 bg-white transition-colors hover:border-apex-line-2"
    >
      <div className="h-[120px] w-[105px] shrink-0">
        <GameCover
          name={game.title}
          color={coverColorFor(game)}
          src={game.coverImage}
          className="!aspect-auto h-full !rounded-none !shadow-none"
        />
      </div>
      <div className="flex min-w-0 flex-1 flex-col px-3 py-2.5">
        <div className="truncate text-[13px] font-bold leading-[1.3] text-apex-ink">
          {game.title}
        </div>
        <div className="mt-0.5 truncate text-[11px] leading-[1.35] text-apex-faint">
          {game.developer ?? ''}
        </div>
        <div className="truncate text-[11px] leading-[1.35] text-apex-faint">
          {game.platform}
        </div>
        <div className="truncate text-[11px] leading-[1.35] text-apex-faint tabular-nums">
          {game.price != null ? formatPriceZl(game.price) : '—'}
        </div>
        <div className="mt-auto flex items-center justify-between gap-2 pt-1.5">
          {status != null && <StatusBadge {...status} />}
          {game.hoursPlayed != null && (
            <span className="text-[11px] text-apex-faint">{game.hoursPlayed}h</span>
          )}
        </div>
      </div>
    </Link>
  );
}
