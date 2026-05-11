import { AddPlatformDialog } from '@/components/add-platform-dialog';
import { CoverColorPicker } from '@/components/cover-color-picker';
import { DeleteConfirmDialog } from '@/components/delete-confirm-dialog';
import { GameCover } from '@/components/game-cover';
import { Icon } from '@/components/icons';
import { RematchButton } from '@/components/rematch-button';
import { StatusBadge } from '@/components/status-badge';
import { UploadCoverButton } from '@/components/upload-cover-button';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { coverColorFor } from '@/lib/avatar';
import { statusFor } from '@/lib/game-status';
import {
  formatPriceZl,
  formatPurchasedAt,
  groszeToZl,
  zlToGrosze,
} from '@/lib/money';
import {
  useDeleteGameMutation,
  useGameQuery,
  useMoveToCollectionMutation,
  usePlatformsQuery,
  useUpdateGameMutation,
} from '@/lib/queries';
import { cn } from '@/lib/utils';
import type { Game, GameFormat, GamePlatform, GameStatus } from '@/types';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

const STATUS_OPTS: GameStatus[] = ['Playing', 'Completed', 'Backlog', 'Dropped'];
const FORMAT_OPTS: { value: GameFormat; label: string }[] = [
  { value: 'physical', label: 'Physical' },
  { value: 'digital', label: 'Digital' },
];

type DraftState = {
  title: string;
  developer: string;
  genre: string;
  releaseYear: string;
  platform: string;
  edition: string;
  hoursPlayed: string;
  status: GameStatus | null;
  format: GameFormat;
  coverColor: string;
  coverImage: string | null;
  priceZl: string;
  purchasedAt: string;
  notes: string;
};

function gameToDraft(g: Game): DraftState {
  return {
    title: g.title,
    developer: g.developer ?? '',
    genre: g.genre,
    releaseYear: g.releaseYear != null ? String(g.releaseYear) : '',
    platform: g.platform,
    edition: g.edition ?? '',
    hoursPlayed: g.hoursPlayed != null ? String(g.hoursPlayed) : '',
    status: g.status,
    format: g.format,
    coverColor: coverColorFor(g),
    coverImage: g.coverImage ?? null,
    priceZl: g.price != null ? groszeToZl(g.price) : '',
    purchasedAt: g.purchasedAt ?? '',
    notes: g.notes ?? '',
  };
}

function FormatChip({ format }: { format: GameFormat }) {
  return (
    <span className="inline-flex items-center gap-[5px] rounded-[4px] bg-apex-surface-chip px-[7px] py-[3px] text-[11px] font-medium text-apex-ink-5">
      {format === 'physical' ? (
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" aria-hidden>
          <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8" />
          <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.8" />
        </svg>
      ) : (
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" aria-hidden>
          <polyline points="8 17 12 21 16 17" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          <line x1="12" y1="12" x2="12" y2="21" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          <path d="M20.88 18.09A5 5 0 0018 9h-1.26A8 8 0 103 16.29" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
      {format === 'physical' ? 'Physical' : 'Digital'}
    </span>
  );
}

function ActionsDropdown({
  onEdit,
  onDelete,
}: {
  onEdit: () => void;
  onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={cn(
          'flex h-8 w-8 items-center justify-center rounded-[7px] border border-apex-line-4 transition-colors',
          open ? 'bg-apex-surface-hover' : 'bg-white hover:bg-apex-surface-hover',
        )}
        aria-label="Actions"
      >
        <Icon.more size={15} className="text-apex-ink-6" />
      </button>
      {open && (
        <div className="absolute right-0 top-[38px] z-50 min-w-[160px] overflow-hidden rounded-[9px] border border-apex-line-4 bg-white shadow-apex-2">
          <button
            type="button"
            onClick={() => { setOpen(false); onEdit(); }}
            className="flex w-full cursor-pointer items-center gap-2.5 border-none bg-transparent px-4 py-[10px] text-left text-[13px] text-apex-ink hover:bg-apex-surface-hover"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
            Edit game
          </button>
          <div className="mx-3 h-px bg-apex-line-5" />
          <button
            type="button"
            onClick={() => { setOpen(false); onDelete(); }}
            className="flex w-full cursor-pointer items-center gap-2.5 border-none bg-transparent px-4 py-[10px] text-left text-[13px] text-[#e63946] hover:bg-[#fff5f5]"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden>
              <polyline points="3 6 5 6 21 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              <path d="M19 6l-1 14H6L5 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              <path d="M10 11v6M14 11v6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              <path d="M9 6V4h6v2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
            Delete game
          </button>
        </div>
      )}
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

function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <div className="mb-4 text-[10px] font-semibold uppercase tracking-[0.07em] text-apex-muted">
      {children}
    </div>
  );
}

export function GameViewPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: game, error } = useGameQuery(id);
  const updateMutation = useUpdateGameMutation();
  const deleteMutation = useDeleteGameMutation();
  const moveMutation = useMoveToCollectionMutation();

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [draft, setDraft] = useState<DraftState | null>(null);
  const [addPlatformOpen, setAddPlatformOpen] = useState(false);
  const { data: platforms = [], isLoading: platformsLoading } = usePlatformsQuery();
  const notesRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (editMode && notesRef.current) {
      notesRef.current.style.height = 'auto';
      notesRef.current.style.height = `${notesRef.current.scrollHeight}px`;
    }
  }, [editMode]);

  const set = <K extends keyof DraftState>(k: K, v: DraftState[K]) =>
    setDraft((d) => (d ? { ...d, [k]: v } : d));

  const startEdit = () => {
    if (game) {
      setDraft(gameToDraft(game));
      setEditMode(true);
    }
  };

  const cancelEdit = () => {
    setEditMode(false);
    setDraft(null);
  };

  const saveEdit = () => {
    if (!draft || !game || !draft.platform) return;
    const isWishlist = game.kind === 'wishlist';
    updateMutation.mutate(
      {
        id: game.id,
        input: {
          kind: game.kind,
          title: draft.title.trim(),
          developer: draft.developer.trim() || undefined,
          genre: draft.genre.trim(),
          releaseYear: draft.releaseYear ? Number(draft.releaseYear) : undefined,
          platform: draft.platform as GamePlatform,
          edition: draft.edition.trim() || undefined,
          hoursPlayed: isWishlist ? undefined : (draft.status != null ? (Number(draft.hoursPlayed) || 0) : undefined),
          status: isWishlist ? undefined : (draft.status ?? undefined),
          format: draft.format,
          coverColor: draft.coverColor,
          coverImage: draft.coverImage,
          price: draft.priceZl.trim() ? (zlToGrosze(draft.priceZl) ?? null) : null,
          ...(isWishlist ? {} : { purchasedAt: draft.purchasedAt || null }),
          notes: draft.notes.trim() || null,
        },
      },
      {
        onSuccess: () => {
          setEditMode(false);
          setDraft(null);
        },
      },
    );
  };

  const handleDelete = async () => {
    if (!game) return;
    try {
      await deleteMutation.mutateAsync(game.id);
      navigate(game.kind === 'wishlist' ? '/wishlist' : '/games');
    } catch (e) {
      alert(`Failed to delete: ${e}`);
    }
  };

  const handleMove = () => {
    if (!game) return;
    moveMutation.mutate(game.id, {
      onSuccess: () => navigate(`/games/${game.id}`),
    });
  };

  if (error) {
    return (
      <div className="flex flex-1 items-center justify-center text-[13px] text-apex-muted">
        Failed to load game.
      </div>
    );
  }
  if (!game) return null;

  const liveTitle = editMode && draft ? draft.title || game.title : game.title;
  const liveCoverColor = editMode && draft ? draft.coverColor : coverColorFor(game);
  const liveCoverImage = editMode && draft ? draft.coverImage : (game.coverImage ?? null);
  const subtitle = [game.developer, game.platform].filter(Boolean).join(' · ');
  const backPath = game.kind === 'wishlist' ? '/wishlist' : '/games';
  const backLabel = game.kind === 'wishlist' ? 'Wishlist' : 'Games';

  return (
    <>
      {/* Single header bar */}
      <div className="flex h-[52px] shrink-0 items-center gap-3 border-b border-apex-line-3 bg-white px-4 lg:px-5">
        <SidebarTrigger className="shrink-0 text-apex-ink-3 hover:text-apex-ink" />

        <nav className="flex min-w-0 items-center gap-[6px] text-[13px]">
          <button
            type="button"
            onClick={() => navigate(backPath)}
            className="shrink-0 font-medium text-apex-accent hover:underline"
          >
            {backLabel}
          </button>
          <span className="shrink-0 text-apex-line-1 select-none">·</span>
          <span className="truncate text-apex-ink-3">{liveTitle}</span>
        </nav>

        <div className="ml-auto flex shrink-0 items-center gap-2">
          {editMode ? (
            <>
              <button
                type="button"
                onClick={cancelEdit}
                className="cursor-pointer rounded-[7px] border border-apex-line-3 bg-white px-4 py-[6px] text-[12.5px] font-medium text-apex-ink-3 hover:bg-apex-surface-hover"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={saveEdit}
                disabled={updateMutation.isPending}
                className="cursor-pointer rounded-[7px] bg-apex-accent px-4 py-[6px] text-[12.5px] font-semibold text-white hover:bg-[#4562e0] disabled:opacity-50"
              >
                {updateMutation.isPending ? 'Saving…' : 'Save'}
              </button>
            </>
          ) : (
            <>
              {game.kind === 'wishlist' && (
                <Button
                  variant="primary"
                  size="sm"
                  onClick={handleMove}
                  disabled={moveMutation.isPending}
                >
                  <Icon.arrowRight size={13} />
                  {moveMutation.isPending ? 'Moving…' : 'Move to collection'}
                </Button>
              )}
              <ActionsDropdown
                onEdit={startEdit}
                onDelete={() => setDeleteDialogOpen(true)}
              />
            </>
          )}
        </div>
      </div>

      {/* Two-column body */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left panel — desktop only */}
        <div
          className="scroll-thin hidden w-[220px] shrink-0 flex-col overflow-y-auto border-r border-apex-line-5 md:flex"
          style={{ background: `color-mix(in oklch, ${liveCoverColor} 7%, white)` }}
        >
          <div className="px-5 pb-10 pt-6">
            <GameCover
              name={liveTitle}
              color={liveCoverColor}
              src={liveCoverImage}
            />

            {editMode && draft ? (
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
                  <GameCover
                    name={liveTitle}
                    color={liveCoverColor}
                    src={liveCoverImage}
                  />
                </div>
                <div className="min-w-0 pt-1">
                  <h1 className="text-[17px] font-bold leading-tight text-apex-ink" style={{ textWrap: 'balance' } as React.CSSProperties}>
                    {liveTitle}
                  </h1>
                  {subtitle && (
                    <p className="mt-1 text-[12px] text-apex-muted">{subtitle}</p>
                  )}
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
              {editMode && draft && (
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
              {subtitle && (
                <p className="mt-[6px] text-[13px] text-apex-muted">{subtitle}</p>
              )}
            </div>

            {/* Game Details section */}
            <SectionLabel>Game Details</SectionLabel>
            <dl className="grid grid-cols-1 gap-x-10 gap-y-5 sm:grid-cols-2">
              <FieldItem label="Title" value={game.title} editMode={editMode}>
                <Input
                  value={draft?.title ?? ''}
                  onChange={(e) => set('title', e.target.value)}
                />
              </FieldItem>

              <FieldItem label="Developer" value={game.developer ?? null} editMode={editMode}>
                <Input
                  value={draft?.developer ?? ''}
                  onChange={(e) => set('developer', e.target.value)}
                />
              </FieldItem>

              <FieldItem label="Genre" value={game.genre || null} editMode={editMode}>
                <Input
                  placeholder="e.g. Action RPG"
                  value={draft?.genre ?? ''}
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
                  value={draft?.releaseYear ?? ''}
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
                    <Button variant="outline" size="sm" onClick={() => setAddPlatformOpen(true)}>
                      <Icon.plus size={12} />
                      Add platform
                    </Button>
                  </div>
                ) : (
                  <>
                    <Select
                      value={draft?.platform ?? ''}
                      onChange={(e) => set('platform', e.target.value)}
                    >
                      <option value="">Select platform</option>
                      {platforms.map((p) => (
                        <option key={p.id} value={p.name}>{p.name}</option>
                      ))}
                    </Select>
                    <button
                      type="button"
                      onClick={() => setAddPlatformOpen(true)}
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
                  value={draft?.format ?? 'physical'}
                  onChange={(e) => set('format', e.target.value as GameFormat)}
                >
                  {FORMAT_OPTS.map(({ value, label }) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </Select>
              </FieldItem>

              <FieldItem label="Edition" value={game.edition || null} editMode={editMode}>
                <Input
                  placeholder="e.g. Deluxe"
                  value={draft?.edition ?? ''}
                  onChange={(e) => set('edition', e.target.value)}
                />
              </FieldItem>

              {game.kind === 'owned' && (
                <FieldItem label="Status" value={game.status ?? null} editMode={editMode}>
                  <Select
                    value={draft?.status ?? 'Backlog'}
                    onChange={(e) => set('status', e.target.value as GameStatus)}
                  >
                    {STATUS_OPTS.map((s) => (
                      <option key={s} value={s}>{s}</option>
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
                    value={draft?.hoursPlayed ?? ''}
                    onChange={(e) => set('hoursPlayed', e.target.value)}
                  />
                </FieldItem>
              )}

              <FieldItem
                label="Price"
                value={formatPriceZl(game.price)}
                editMode={editMode}
                numeric
              >
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="e.g. 129.99"
                  value={draft?.priceZl ?? ''}
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
                    value={draft?.purchasedAt ?? ''}
                    onChange={(e) => set('purchasedAt', e.target.value)}
                  />
                </FieldItem>
              )}
            </dl>

            {/* Notes section */}
            <div className="mt-10">
              <div className="mb-px h-px bg-apex-line-5" />
              <div className="mt-8">
                <SectionLabel>Notes</SectionLabel>
                {editMode ? (
                  <textarea
                    ref={notesRef}
                    value={draft?.notes ?? ''}
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

      <DeleteConfirmDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        gameTitle={game.title}
        isDeleting={deleteMutation.isPending}
        onConfirm={handleDelete}
      />

      <AddPlatformDialog
        open={addPlatformOpen}
        onOpenChange={setAddPlatformOpen}
        onCreated={(p) => set('platform', p.name)}
      />
    </>
  );
}
