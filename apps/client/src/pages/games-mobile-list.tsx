import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Avatar } from '@/components/avatar';
import { Icon } from '@/components/icons';
import type { Game } from '@/types';

export function GamesMobileList({ items }: { items: Game[] }) {
  const navigate = useNavigate();
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  const toggle = (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpanded(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  return (
    <div>
      {items.map(game => {
        const isExpanded = expanded.has(game.id);
        return (
          <div
            key={game.id}
            className="mb-1 overflow-hidden rounded-[10px] border border-apex-line-3 bg-white cursor-pointer transition-colors hover:bg-apex-surface-hover2"
            onClick={() => navigate(`/games/${game.id}`)}
          >
            <div className="flex items-center gap-[11px] px-4 py-[9px]">
              <Avatar
                shape="rect"
                size={40}
                name={game.title}
                color={game.coverColor}
                src={game.coverImage}
              />
              <div className="flex-1 min-w-0">
                <div className="text-[13.5px] font-semibold leading-[1.35] text-apex-ink truncate">
                  {game.title}
                </div>
                <div className="text-[11.5px] leading-[1.35] text-apex-faint truncate">
                  {game.platform}{game.releaseYear != null ? ` | ${game.releaseYear}` : ''}
                </div>
              </div>
              <button
                type="button"
                onClick={(e) => toggle(game.id, e)}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md transition-colors hover:bg-apex-surface-head"
                aria-label={isExpanded ? 'Collapse' : 'Expand'}
              >
                {isExpanded
                  ? <Icon.chevup size={14} className="text-apex-faint" />
                  : <Icon.chevdown size={14} className="text-apex-faint" />
                }
              </button>
            </div>

            {isExpanded && (
              <div className="border-t border-apex-line-3 px-4 py-[9px] space-y-[6px]">
                <DetailRow label="Platform" value={game.platform} />
                <DetailRow
                  label="Format"
                  value={game.format === 'physical' ? 'Physical' : 'Digital'}
                />
                <DetailRow label="Release Year" value={game.releaseYear} />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string | number | null }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[11px] font-semibold uppercase tracking-[0.07em] text-apex-faint">
        {label}
      </span>
      {value != null
        ? <span className="text-[13px] text-apex-ink">{value}</span>
        : <span className="text-[13px] text-apex-hint">—</span>
      }
    </div>
  );
}
