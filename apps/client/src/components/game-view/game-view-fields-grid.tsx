import { Icon } from '@/components/icons';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import type { UseGameDraftResult } from '@/hooks/use-game-draft';
import { formatPriceZl, formatPurchasedAt } from '@/lib/money';
import { cn } from '@/lib/utils';
import type { Game, GameFormat, GameStatus, Platform } from '@/types';
import type { ReactNode } from 'react';

const STATUS_OPTS: GameStatus[] = ['Playing', 'Completed', 'Backlog', 'Dropped'];
const FORMAT_OPTS: { value: GameFormat; label: string }[] = [
  { value: 'physical', label: 'Physical' },
  { value: 'digital', label: 'Digital' },
];

export function FormatChip({ format }: { format: GameFormat }) {
  return (
    <span className="inline-flex items-center gap-[5px] rounded-[4px] bg-apex-surface-chip px-[7px] py-[3px] text-[11px] font-medium text-apex-ink-5">
      {format === 'physical' ? <Icon.disc size={10} /> : <Icon.download size={10} />}
      {format === 'physical' ? 'Physical' : 'Digital'}
    </span>
  );
}

export function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <div className="mb-4 text-[10px] font-semibold uppercase tracking-[0.07em] text-apex-muted">
      {children}
    </div>
  );
}

function FieldItem({
  label,
  value,
  editMode,
  numeric,
  children,
}: {
  label: string;
  value?: string | null;
  editMode?: boolean;
  numeric?: boolean;
  children?: ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-[5px]">
      <dt className="text-[10px] font-semibold uppercase tracking-[0.07em] text-apex-muted">
        {label}
      </dt>
      {editMode ? (
        children
      ) : (
        <dd
          className={cn(
            'text-[13.5px] font-medium leading-snug',
            numeric && 'tabular-nums',
            value && value !== '—' ? 'text-apex-ink' : 'text-apex-hint',
          )}
        >
          {value || '—'}
        </dd>
      )}
    </div>
  );
}

export interface GameDetailsGridProps {
  game: Game;
  draft: UseGameDraftResult['draft'];
  set: UseGameDraftResult['set'];
  editMode: boolean;
  platforms: Platform[];
  platformsLoading: boolean;
  onAddPlatform: () => void;
}

/**
 * The <dl> grid of editable fields shown under "Game Details" — title,
 * developer, genre, release year, platform, format, edition, status,
 * hours played, price, purchased.
 *
 * Stateless leaf used by GameViewFields.
 */
export function GameDetailsGrid({
  game,
  draft,
  set,
  editMode,
  platforms,
  platformsLoading,
  onAddPlatform,
}: GameDetailsGridProps) {
  return (
    <dl className="grid grid-cols-1 gap-x-10 gap-y-5 sm:grid-cols-2">
      <FieldItem label="Title" value={game.title} editMode={editMode}>
        <Input value={draft.title} onChange={(e) => set('title', e.target.value)} />
      </FieldItem>

      <FieldItem label="Developer" value={game.developer ?? null} editMode={editMode}>
        <Input value={draft.developer} onChange={(e) => set('developer', e.target.value)} />
      </FieldItem>

      <FieldItem label="Genre" value={game.genre || null} editMode={editMode}>
        <Input
          placeholder="e.g. Action RPG"
          value={draft.genre}
          onChange={(e) => set('genre', e.target.value)}
        />
      </FieldItem>

      <FieldItem
        label="Release Year"
        value={game.releaseYear != null ? String(game.releaseYear) : null}
        editMode={editMode}
        numeric
      >
        <Input
          type="number"
          value={draft.releaseYear}
          onChange={(e) => set('releaseYear', e.target.value)}
        />
      </FieldItem>

      <FieldItem label="Platform" value={game.platform} editMode={editMode}>
        {platformsLoading ? (
          <Select disabled value="">
            <option value="">Loading…</option>
          </Select>
        ) : platforms.length === 0 ? (
          <div className="flex flex-col gap-2 rounded-[7px] border border-apex-line-3 bg-white px-3 py-3">
            <span className="text-[12px] text-apex-muted">No platforms — add one first</span>
            <Button variant="outline" size="sm" onClick={onAddPlatform}>
              <Icon.plus size={12} />
              Add platform
            </Button>
          </div>
        ) : (
          <>
            <Select value={draft.platform} onChange={(e) => set('platform', e.target.value)}>
              <option value="">Select platform</option>
              {platforms.map((p) => (
                <option key={p.id} value={p.name}>
                  {p.name}
                </option>
              ))}
            </Select>
            <button
              type="button"
              onClick={onAddPlatform}
              className="mt-1 text-[11px] text-apex-accent hover:underline"
            >
              + Add platform
            </button>
          </>
        )}
      </FieldItem>

      <FieldItem
        label="Format"
        value={game.format === 'physical' ? 'Physical' : 'Digital'}
        editMode={editMode}
      >
        <Select
          value={draft.format}
          onChange={(e) => set('format', e.target.value as GameFormat)}
        >
          {FORMAT_OPTS.map(({ value, label }) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </Select>
      </FieldItem>

      <FieldItem label="Edition" value={game.edition || null} editMode={editMode}>
        <Input
          placeholder="e.g. Deluxe"
          value={draft.edition}
          onChange={(e) => set('edition', e.target.value)}
        />
      </FieldItem>

      {game.kind === 'owned' && (
        <FieldItem label="Status" value={game.status ?? null} editMode={editMode}>
          <Select
            value={draft.status ?? 'Backlog'}
            onChange={(e) => set('status', e.target.value as GameStatus)}
          >
            {STATUS_OPTS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </Select>
        </FieldItem>
      )}

      {game.kind === 'owned' && (
        <FieldItem
          label="Hours Played"
          value={game.hoursPlayed != null ? `${game.hoursPlayed} h` : null}
          editMode={editMode}
          numeric
        >
          <Input
            type="number"
            value={draft.hoursPlayed}
            onChange={(e) => set('hoursPlayed', e.target.value)}
          />
        </FieldItem>
      )}

      <FieldItem label="Price" value={formatPriceZl(game.price)} editMode={editMode} numeric>
        <Input
          type="number"
          step="0.01"
          min="0"
          placeholder="e.g. 129.99"
          value={draft.priceZl}
          onChange={(e) => set('priceZl', e.target.value)}
        />
      </FieldItem>

      {game.kind === 'owned' && (
        <FieldItem
          label="Purchased"
          value={formatPurchasedAt(game.purchasedAt)}
          editMode={editMode}
        >
          <Input
            type="date"
            value={draft.purchasedAt}
            onChange={(e) => set('purchasedAt', e.target.value)}
          />
        </FieldItem>
      )}
    </dl>
  );
}
