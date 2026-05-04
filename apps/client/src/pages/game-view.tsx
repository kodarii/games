import { AddPlatformDialog } from '@/components/add-platform-dialog';
import { CoverColorPicker } from '@/components/cover-color-picker';
import { UploadCoverButton } from '@/components/upload-cover-button';
import { DeleteConfirmDialog } from '@/components/delete-confirm-dialog';
import { GameCover } from '@/components/game-cover';
import { Icon } from '@/components/icons';
import { SectionHeader } from '@/components/section-header';
import { Button } from '@/components/ui/button';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { coverColorFor } from '@/lib/avatar';
import {
  formatPriceZl,
  formatPurchasedAt,
  groszeToZl,
  zlToGrosze,
} from '@/lib/money';
import {
  useDeleteGameMutation,
  useGameQuery,
  usePlatformsQuery,
  useUpdateGameMutation,
} from '@/lib/queries';
import { cn } from '@/lib/utils';
import type { Game, GameFormat, GamePlatform, GameStatus } from '@/types';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
const STATUS_OPTS: GameStatus[] = [
  'Playing',
  'Completed',
  'Backlog',
  'Dropped',
  'Wishlist',
];
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
  status: GameStatus;
  format: GameFormat;
  coverColor: string;
  coverImage: string | null;
  priceZl: string;
  purchasedAt: string;
};

function gameToDraft(g: Game): DraftState {
  return {
    title: g.title,
    developer: g.developer,
    genre: g.genre,
    releaseYear: g.releaseYear != null ? String(g.releaseYear) : '',
    platform: g.platform,
    edition: g.edition ?? '',
    hoursPlayed: String(g.hoursPlayed),
    status: g.status,
    format: g.format,
    coverColor: coverColorFor(g),
    coverImage: g.coverImage ?? null,
    priceZl: g.price != null ? groszeToZl(g.price) : '',
    purchasedAt: g.purchasedAt ?? '',
  };
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
      if (ref.current && !ref.current.contains(e.target as Node))
        setOpen(false);
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
          'flex h-[34px] w-[34px] items-center justify-center rounded-lg border border-apex-line-1 transition-colors',
          open ? 'bg-[#f5f5f5]' : 'bg-white hover:bg-[#f5f5f5]',
        )}
        aria-label="Actions"
      >
        <Icon.more size={16} className="text-[#888]" />
      </button>
      {open && (
        <div className="absolute right-0 top-[42px] z-50 min-w-[160px] overflow-hidden rounded-[9px] border border-apex-line-1 bg-white shadow-[0_8px_32px_rgba(0,0,0,.12)]">
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              onEdit();
            }}
            className="flex w-full cursor-pointer items-center gap-2.5 border-none bg-transparent px-4 py-3 text-left text-[13px] text-[#222] hover:bg-[#f5f5f5]"
          >
            <svg
              width="13"
              height="13"
              viewBox="0 0 24 24"
              fill="none"
              aria-hidden
            >
              <path
                d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"
                stroke="#555"
                strokeWidth="1.8"
                strokeLinecap="round"
              />
              <path
                d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"
                stroke="#555"
                strokeWidth="1.8"
                strokeLinecap="round"
              />
            </svg>
            Edit game
          </button>
          <div className="mx-2.5 h-px bg-[#f0f0f0]" />
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              onDelete();
            }}
            className="flex w-full cursor-pointer items-center gap-2.5 border-none bg-transparent px-4 py-3 text-left text-[13px] text-[#e63946] hover:bg-[#fff5f5]"
          >
            <svg
              width="13"
              height="13"
              viewBox="0 0 24 24"
              fill="none"
              aria-hidden
            >
              <polyline
                points="3 6 5 6 21 6"
                stroke="#e63946"
                strokeWidth="1.8"
                strokeLinecap="round"
              />
              <path
                d="M19 6l-1 14H6L5 6"
                stroke="#e63946"
                strokeWidth="1.8"
                strokeLinecap="round"
              />
              <path
                d="M10 11v6M14 11v6"
                stroke="#e63946"
                strokeWidth="1.8"
                strokeLinecap="round"
              />
              <path
                d="M9 6V4h6v2"
                stroke="#e63946"
                strokeWidth="1.8"
                strokeLinecap="round"
              />
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
  children,
}: {
  label: string;
  value?: string;
  editMode?: boolean;
  children?: ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <dt className="text-[9.5px] font-semibold uppercase tracking-[0.08em] text-apex-muted">
        {label}
      </dt>
      {editMode ? (
        children
      ) : (
        <dd
          className="text-[14px] font-medium leading-snug"
          style={{ color: value && value !== '—' ? '#111' : '#bbb' }}
        >
          {value || '—'}
        </dd>
      )}
    </div>
  );
}

export function GameViewPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: game, error } = useGameQuery(id);
  const updateMutation = useUpdateGameMutation();
  const deleteMutation = useDeleteGameMutation();

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [draft, setDraft] = useState<DraftState | null>(null);
  const [addPlatformOpen, setAddPlatformOpen] = useState(false);
  const { data: platforms = [], isLoading: platformsLoading } =
    usePlatformsQuery();

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
    updateMutation.mutate(
      {
        id: game.id,
        input: {
          title: draft.title.trim(),
          developer: draft.developer.trim(),
          genre: draft.genre.trim(),
          releaseYear: draft.releaseYear ? Number(draft.releaseYear) : undefined,
          platform: draft.platform as GamePlatform,
          edition: draft.edition.trim() || undefined,
          hoursPlayed: Number(draft.hoursPlayed) || 0,
          status: draft.status,
          format: draft.format,
          coverColor: draft.coverColor,
          coverImage: draft.coverImage,
          price: draft.priceZl.trim() ? (zlToGrosze(draft.priceZl) ?? null) : null,
          purchasedAt: draft.purchasedAt ? draft.purchasedAt : null,
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
      navigate('/games');
    } catch (e) {
      alert(`Failed to delete: ${e}`);
    }
  };

  if (error) {
    return (
      <div className="flex flex-1 items-center justify-center text-apex-muted">
        Failed to load game: {String(error)}
      </div>
    );
  }
  if (!game) return null;

  const liveTitle = editMode && draft ? draft.title || game.title : game.title;
  const liveDeveloper =
    editMode && draft ? draft.developer || game.developer : game.developer;
  const livePlatform =
    editMode && draft ? draft.platform || game.platform : game.platform;
  const liveCoverColor =
    editMode && draft ? draft.coverColor : coverColorFor(game);

  return (
    <>
      {/* Header */}
      <div className="flex h-[63px] flex-shrink-0 items-center justify-between border-b border-[#eee] bg-white px-4 lg:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <SidebarTrigger className="shrink-0 text-apex-ink-3 hover:text-apex-ink" />
          <div
            className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg text-white"
            style={{ background: liveCoverColor }}
          >
            <Icon.gamepad size={15} className="text-white/90" />
          </div>
          <div className="min-w-0">
            <div className="truncate text-[14px] font-semibold">
              {liveTitle}
            </div>
            <div className="truncate text-[11px] text-[#aaa]">
              {liveDeveloper} · {livePlatform}
            </div>
          </div>
        </div>

        {editMode ? (
          <div className="flex flex-shrink-0 gap-2 pl-4">
            <button
              type="button"
              onClick={cancelEdit}
              className="cursor-pointer rounded-[7px] border border-[#ddd] bg-white px-4 py-[7px] text-[13px] text-[#555] hover:bg-[#f5f5f5]"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={saveEdit}
              disabled={updateMutation.isPending}
              className="cursor-pointer rounded-[7px] bg-[#4361ee] px-[18px] py-[7px] text-[13px] font-semibold text-white hover:opacity-90 disabled:opacity-50"
            >
              {updateMutation.isPending ? 'Saving…' : 'Save'}
            </button>
          </div>
        ) : (
          <div className="flex-shrink-0 pl-4">
            <ActionsDropdown
              onEdit={startEdit}
              onDelete={() => setDeleteDialogOpen(true)}
            />
          </div>
        )}
      </div>

      {/* Breadcrumb */}
      <div className="flex h-[36px] flex-shrink-0 items-center gap-1.5 border-b border-[#f0f0f0] bg-white px-4 lg:px-6">
        <button
          type="button"
          onClick={() => navigate('/games')}
          className="cursor-pointer border-none bg-transparent text-[12px] font-medium text-[#4361ee] hover:underline"
        >
          Games
        </button>
        <span className="text-[12px] text-[#ccc]">›</span>
        <span className="truncate text-[12px] text-[#888]">{game.title}</span>
      </div>

      {/* Scrollable content */}
      <div className="scroll-thin flex-1 overflow-y-auto bg-[#fafafa]">
        <div className="mx-auto max-w-[820px] px-4 pb-[120px] pt-7 lg:px-6">
          {/* Game Details */}
          <section className="mb-7">
            <SectionHeader
              title="Game Details"
              description="Basic information about the game."
            />
            <div className="flex flex-col gap-4 lg:flex-row lg:gap-8">
              {/* Cover */}
              <div className="flex-shrink-0">
                <div className="w-[120px] lg:w-[180px]">
                  <GameCover
                    name={liveTitle}
                    color={liveCoverColor}
                    src={editMode && draft ? draft.coverImage : (game.coverImage ?? null)}
                  />
                </div>
                {editMode && draft && (
                  <div className="mt-4">
                    <div className="mb-[6px] text-[9.5px] font-semibold uppercase tracking-[0.08em] text-apex-muted">
                      Cover Color
                    </div>
                    <CoverColorPicker
                      value={draft.coverColor}
                      onChange={(c) => set('coverColor', c)}
                    />
                    <div className="mt-3">
                      <UploadCoverButton
                        value={draft.coverImage}
                        onChange={(url) => set('coverImage', url)}
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Fields */}
              <div className="flex-1">
                <dl className="grid grid-cols-1 gap-x-10 gap-y-5 sm:grid-cols-2">
                  <FieldItem
                    label="Title"
                    value={game.title}
                    editMode={editMode}
                  >
                    <Input
                      value={draft?.title ?? ''}
                      onChange={(e) => set('title', e.target.value)}
                    />
                  </FieldItem>
                  <FieldItem
                    label="Developer"
                    value={game.developer}
                    editMode={editMode}
                  >
                    <Input
                      value={draft?.developer ?? ''}
                      onChange={(e) => set('developer', e.target.value)}
                    />
                  </FieldItem>
                  <FieldItem
                    label="Genre"
                    value={game.genre || '—'}
                    editMode={editMode}
                  >
                    <Input
                      placeholder="e.g. Action RPG"
                      value={draft?.genre ?? ''}
                      onChange={(e) => set('genre', e.target.value)}
                    />
                  </FieldItem>
                  <FieldItem
                    label="Release Year"
                    value={game.releaseYear != null ? String(game.releaseYear) : '—'}
                    editMode={editMode}
                  >
                    <Input
                      type="number"
                      value={draft?.releaseYear ?? ''}
                      onChange={(e) => set('releaseYear', e.target.value)}
                    />
                  </FieldItem>
                  <FieldItem
                    label="Platform"
                    value={game.platform}
                    editMode={editMode}
                  >
                    {platformsLoading ? (
                      <Select disabled value="">
                        <option value="">Loading…</option>
                      </Select>
                    ) : platforms.length === 0 ? (
                      <div className="flex flex-col gap-2 rounded-[7px] border border-apex-line-1 bg-white px-3 py-3">
                        <span className="text-[12px] text-apex-muted">
                          No platforms — add one first
                        </span>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setAddPlatformOpen(true)}
                        >
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
                            <option key={p.id} value={p.name}>
                              {p.name}
                            </option>
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
                      onChange={(e) =>
                        set('format', e.target.value as GameFormat)
                      }
                    >
                      {FORMAT_OPTS.map(({ value, label }) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </Select>
                  </FieldItem>
                  <FieldItem
                    label="Edition"
                    value={game.edition || '—'}
                    editMode={editMode}
                  >
                    <Input
                      placeholder="e.g. Deluxe"
                      value={draft?.edition ?? ''}
                      onChange={(e) => set('edition', e.target.value)}
                    />
                  </FieldItem>
                  <FieldItem
                    label="Status"
                    value={game.status}
                    editMode={editMode}
                  >
                    <Select
                      value={draft?.status ?? 'Backlog'}
                      onChange={(e) =>
                        set('status', e.target.value as GameStatus)
                      }
                    >
                      {STATUS_OPTS.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </Select>
                  </FieldItem>
                  <FieldItem
                    label="Hours Played"
                    value={`${game.hoursPlayed} h`}
                    editMode={editMode}
                  >
                    <Input
                      type="number"
                      value={draft?.hoursPlayed ?? ''}
                      onChange={(e) => set('hoursPlayed', e.target.value)}
                    />
                  </FieldItem>
                  <FieldItem
                    label="Price"
                    value={formatPriceZl(game.price)}
                    editMode={editMode}
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
                </dl>
              </div>
            </div>
          </section>

          <div className="my-5 h-px bg-[#f0f0f0]" />

          {/* Notes */}
          <section>
            <SectionHeader
              title="Notes"
              description="Personal thoughts, tips or reminders about this game."
            />
            <p className="text-[13px] leading-[1.7] text-[#bbb]">
              No notes yet.
            </p>
          </section>
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
