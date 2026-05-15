import { CoverColorPicker } from '@/components/cover-color-picker';
import {
  FormatChip,
  GameDetailsGrid,
  SectionLabel,
} from '@/components/game-view/game-view-fields-grid';
import { GameCover } from '@/components/game-cover';
import { RematchButton } from '@/components/rematch-button';
import { StatusBadge } from '@/components/status-badge';
import { UploadCoverButton } from '@/components/upload-cover-button';
import type { UseGameDraftResult } from '@/hooks/use-game-draft';
import { statusFor } from '@/lib/game-status';
import type { Game, Platform } from '@/types';
import { useEffect, useRef } from 'react';

export interface GameViewFieldsProps {
  game: Game;
  draft: UseGameDraftResult['draft'];
  set: UseGameDraftResult['set'];
  editMode: boolean;
  platforms: Platform[];
  platformsLoading: boolean;
  liveTitle: string;
  liveCoverColor: string;
  liveCoverImage: string | null;
  subtitle: string;
  onAddPlatform: () => void;
}

/**
 * Body of GameViewPage: left panel (cover, badges, format chip, RematchButton,
 * editable cover color/upload controls) + right panel (<dl> grid of fields
 * delegated to GameDetailsGrid + Notes textarea with autosize effect).
 *
 * Left panel is absorbed into fields per RESEARCH §Pattern 5 'Risk' decision —
 * cover IS a field; the `liveCoverColor` style coupling keeps left panel and
 * right grid in sync.
 */
export function GameViewFields({
  game,
  draft,
  set,
  editMode,
  platforms,
  platformsLoading,
  liveTitle,
  liveCoverColor,
  liveCoverImage,
  subtitle,
  onAddPlatform,
}: GameViewFieldsProps) {
  const notesRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (editMode && notesRef.current) {
      notesRef.current.style.height = 'auto';
      notesRef.current.style.height = `${notesRef.current.scrollHeight}px`;
    }
  }, [editMode]);

  return (
    <div className="flex flex-1 overflow-hidden">
      {/* Left panel — desktop only */}
      <div
        className="scroll-thin hidden w-[220px] shrink-0 flex-col overflow-y-auto border-r border-apex-line-5 md:flex"
        style={{ background: `color-mix(in oklch, ${liveCoverColor} 7%, white)` }}
      >
        <div className="px-5 pb-10 pt-6">
          <GameCover name={liveTitle} color={liveCoverColor} src={liveCoverImage} />

          {editMode ? (
            <div className="mt-5 space-y-4">
              <div>
                <div className="mb-[6px] text-[10px] font-semibold uppercase tracking-[0.07em] text-apex-muted">
                  Cover Color
                </div>
                <CoverColorPicker
                  value={draft.coverColor}
                  onChange={(c) => set('coverColor', c)}
                />
              </div>
              <UploadCoverButton
                value={draft.coverImage}
                onChange={(url) => set('coverImage', url)}
              />
            </div>
          ) : (
            <div className="mt-5 flex flex-col gap-[10px]">
              {game.kind === 'owned' && game.status && (
                <StatusBadge
                  variant={statusFor(game.status).variant}
                  label={statusFor(game.status).label}
                />
              )}
              <FormatChip format={game.format} />
              <div className="mt-2">
                <RematchButton game={game} />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Right panel */}
      <div className="scroll-thin flex-1 overflow-y-auto">
        <div className="px-6 pb-24 pt-7 lg:px-8">
          {/* Mobile: compact cover + title row */}
          <div className="mb-6 md:hidden">
            <div className="flex gap-4">
              <div className="w-[88px] shrink-0">
                <GameCover name={liveTitle} color={liveCoverColor} src={liveCoverImage} />
              </div>
              <div className="min-w-0 pt-1">
                <h1
                  className="text-[17px] font-bold leading-tight text-apex-ink"
                  style={{ textWrap: 'balance' } as React.CSSProperties}
                >
                  {liveTitle}
                </h1>
                {subtitle && <p className="mt-1 text-[12px] text-apex-muted">{subtitle}</p>}
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {game.kind === 'owned' && game.status && (
                    <StatusBadge
                      variant={statusFor(game.status).variant}
                      label={statusFor(game.status).label}
                    />
                  )}
                  <FormatChip format={game.format} />
                </div>
                {!editMode && (
                  <div className="mt-3">
                    <RematchButton game={game} />
                  </div>
                )}
              </div>
            </div>
            {editMode && (
              <div className="mt-4 space-y-4">
                <div>
                  <div className="mb-[6px] text-[10px] font-semibold uppercase tracking-[0.07em] text-apex-muted">
                    Cover Color
                  </div>
                  <CoverColorPicker
                    value={draft.coverColor}
                    onChange={(c) => set('coverColor', c)}
                  />
                </div>
                <UploadCoverButton
                  value={draft.coverImage}
                  onChange={(url) => set('coverImage', url)}
                />
              </div>
            )}
          </div>

          {/* Desktop title */}
          <div className="mb-8 hidden md:block">
            <h1
              className="text-[22px] font-bold leading-[1.2] text-apex-ink"
              style={{ textWrap: 'balance' } as React.CSSProperties}
            >
              {liveTitle}
            </h1>
            {subtitle && <p className="mt-[6px] text-[13px] text-apex-muted">{subtitle}</p>}
          </div>

          {/* Game Details section */}
          <SectionLabel>Game Details</SectionLabel>
          <GameDetailsGrid
            game={game}
            draft={draft}
            set={set}
            editMode={editMode}
            platforms={platforms}
            platformsLoading={platformsLoading}
            onAddPlatform={onAddPlatform}
          />

          {/* Notes section */}
          <div className="mt-10">
            <div className="mb-px h-px bg-apex-line-5" />
            <div className="mt-8">
              <SectionLabel>Notes</SectionLabel>
              {editMode ? (
                <textarea
                  ref={notesRef}
                  value={draft.notes}
                  onChange={(e) => {
                    set('notes', e.target.value);
                    e.target.style.height = 'auto';
                    e.target.style.height = `${e.target.scrollHeight}px`;
                  }}
                  placeholder="Add a note…"
                  rows={4}
                  className="w-full max-w-[65ch] resize-none rounded-[7px] border border-apex-line-3 bg-white px-3 py-[9px] text-[13.5px] leading-[1.7] text-apex-ink-2 outline-none placeholder:text-apex-hint focus:border-apex-ink-6"
                  style={{ overflow: 'hidden' }}
                />
              ) : game.notes ? (
                <p className="max-w-[65ch] whitespace-pre-wrap text-[13.5px] leading-[1.75] text-apex-ink-2">
                  {game.notes}
                </p>
              ) : (
                <p className="text-[13px] text-apex-hint">No notes yet.</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
