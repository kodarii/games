import { AddPlatformDialog } from '@/components/add-platform-dialog';
import { Breadcrumb } from '@/components/breadcrumb';
import { CoverColorPicker } from '@/components/cover-color-picker';
import { FormField, FormFieldRow } from '@/components/form-field';
import { FormCancelButton, FormFooter, FormSubmitButton } from '@/components/form-footer';
import { GameCover } from '@/components/game-cover';
import { IconButton } from '@/components/icon-button';
import { Icon } from '@/components/icons';
import { AppHeader } from '@/components/layout/app-header';
import { PillSelect } from '@/components/pill-select';
import { SectionHeader } from '@/components/section-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { UploadCoverButton } from '@/components/upload-cover-button';
import type { CreateGameInput, UpdateGameInput } from '@/lib/api';
import { COVER_COLORS, coverColorFor } from '@/lib/avatar';
import { groszeToZl, zlToGrosze } from '@/lib/money';
import { useCreateGameMutation, usePlatformsQuery, useUpdateGameMutation } from '@/lib/queries';
import type { Game, GameFormat, GameStatus, Platform } from '@/types';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

type FormAction = 'create' | 'edit';
type GameMode = 'owned' | 'wishlist';

type FormState = {
  title: string;
  developer: string;
  genre: string;
  releaseYear: string;
  platform: string;
  edition: string;
  hoursPlayed: string;
  status: GameStatus;
  format: GameFormat;
  notes: string;
  coverColor: string;
  coverImage: string | null;
  priceZl: string;
  purchasedAt: string;
};

const EMPTY: FormState = {
  title: '',
  developer: '',
  genre: '',
  releaseYear: '',
  platform: '',
  edition: '',
  hoursPlayed: '',
  status: 'Backlog',
  format: 'digital',
  notes: '',
  coverColor: COVER_COLORS[0],
  coverImage: null,
  priceZl: '',
  purchasedAt: '',
};

function gameToFormState(g: Game): FormState {
  return {
    title: g.title,
    developer: g.developer ?? '',
    genre: g.genre,
    releaseYear: g.releaseYear != null ? String(g.releaseYear) : '',
    platform: g.platform,
    edition: g.edition ?? '',
    hoursPlayed: g.hoursPlayed != null ? String(g.hoursPlayed) : '',
    status: g.status ?? 'Backlog',
    format: g.format,
    notes: '',
    coverColor: coverColorFor(g),
    coverImage: g.coverImage ?? null,
    priceZl: g.price != null ? groszeToZl(g.price) : '',
    purchasedAt: g.purchasedAt ?? '',
  };
}

const STATUS_OPTS = [
  { value: 'Playing' as const, color: '#4F6EF7' },
  { value: 'Backlog' as const, color: '#f59e0b' },
  { value: 'Completed' as const, color: '#10b981' },
  { value: 'Dropped' as const, color: '#ef4444' },
];

const FORMAT_OPTS: { value: GameFormat; label: string }[] = [
  { value: 'physical', label: 'Physical' },
  { value: 'digital', label: 'Digital' },
];

export function GameForm({
  action,
  mode,
  initialGame,
}: {
  action: FormAction;
  mode: GameMode;
  initialGame?: Game;
}) {
  const navigate = useNavigate();
  const isEdit = action === 'edit';
  const isWishlist = mode === 'wishlist';
  const [form, setForm] = useState<FormState>(() =>
    initialGame ? gameToFormState(initialGame) : EMPTY,
  );
  const [addPlatformOpen, setAddPlatformOpen] = useState(false);
  const createMutation = useCreateGameMutation();
  const updateMutation = useUpdateGameMutation();
  const { data: platforms = [], isLoading: platformsLoading } = usePlatformsQuery();

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const canSubmit = Boolean(form.title.trim() && form.developer.trim() && form.platform);

  const onSubmit = () => {
    const payload: CreateGameInput = {
      kind: isWishlist ? 'wishlist' : 'owned',
      title: form.title.trim(),
      developer: form.developer.trim(),
      genre: form.genre.trim() || '',
      releaseYear: form.releaseYear ? Number(form.releaseYear) : undefined,
      platform: form.platform,
      edition: form.edition.trim() || undefined,
      hoursPlayed: isWishlist ? undefined : (Number(form.hoursPlayed) || 0),
      status: isWishlist ? undefined : form.status,
      format: form.format,
      coverColor: form.coverColor,
      coverImage: form.coverImage,
      price: form.priceZl.trim() ? (zlToGrosze(form.priceZl) ?? undefined) : undefined,
      purchasedAt: isWishlist ? undefined : (form.purchasedAt ? form.purchasedAt : undefined),
      notes: form.notes.trim() || null,
    };

    const successPath = isWishlist ? '/wishlist' : '/games';

    if (isEdit && initialGame) {
      updateMutation.mutate(
        { id: initialGame.id, input: payload satisfies UpdateGameInput },
        { onSuccess: (g) => navigate(`${successPath}/${g.id}`) },
      );
      return;
    }

    createMutation.mutate(payload satisfies CreateGameInput, {
      onSuccess: (g) => navigate(`${successPath}/${g.id}`),
    });
  };

  const headerIcon = isEdit ? <Icon.gamepad size={15} className="text-white" /> : <Icon.plus size={15} className="text-white" />;
  const headerTitle = isEdit ? 'Edit Game' : 'Add New Game';
  const headerDescription = isEdit
    ? 'Update details for this game.'
    : 'Fill in the details to add a game to your collection.';
  const breadcrumbLast = isEdit ? (initialGame?.title ?? 'Edit Game') : 'Add New Game';
  const submitLabel = isEdit ? 'Save Changes' : 'Add Game';
  const parentLabel = isWishlist ? 'Wishlist' : 'Games';
  const parentPath = isWishlist ? '/wishlist' : '/games';
  const errorMessage = createMutation.error?.message || updateMutation.error?.message || null;

  return (
    <>
      <AppHeader>
        <span className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-[8px] bg-apex-ink text-white">
          {headerIcon}
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[15px] font-bold text-apex-ink">{headerTitle}</div>
          <div className="text-[12px] text-apex-muted">{headerDescription}</div>
        </div>
        <div className="ml-auto flex items-center">
          <IconButton aria-label="Notifications">
            <Icon.bell size={18} />
          </IconButton>
        </div>
      </AppHeader>

      <Breadcrumb items={[{ label: parentLabel, to: parentPath }, { label: breadcrumbLast }]} />

      <div className="scroll-thin flex-1 overflow-y-auto bg-white px-5 pb-6 pt-3 lg:px-8">
        <div className="overflow-hidden rounded-[14px] border border-apex-line-1 bg-white">
          <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr]">
            <div className="flex items-center justify-center p-5 lg:border-r lg:border-apex-line-5 lg:p-6">
              <div className="w-full max-w-[260px] lg:max-w-none">
                <div className="flex flex-col items-stretch gap-4">
                  <GameCover name={form.title} color={form.coverColor} src={form.coverImage} />
                  <div>
                    <div className="mb-[6px] text-[10px] font-semibold uppercase tracking-[0.08em] text-apex-hint">
                      Cover Color
                    </div>
                    <CoverColorPicker
                      value={form.coverColor}
                      onChange={(c) => set('coverColor', c)}
                    />
                  </div>
                  <UploadCoverButton
                    value={form.coverImage}
                    onChange={(url) => set('coverImage', url)}
                  />
                </div>
              </div>
            </div>

            <div className="flex flex-col">
              <div className="border-t border-apex-line-5 p-5 lg:border-t-0 lg:p-6">
                <SectionHeader
                  title="Game Details"
                  description="Basic information about the game."
                />
                <FormFieldRow cols={2}>
                  <FormField label="Title" required>
                    <Input
                      placeholder="e.g. Elden Ring"
                      value={form.title}
                      onChange={(e) => set('title', e.target.value)}
                    />
                  </FormField>
                  <FormField label="Developer" required>
                    <Input
                      placeholder="e.g. FromSoftware"
                      value={form.developer}
                      onChange={(e) => set('developer', e.target.value)}
                    />
                  </FormField>
                </FormFieldRow>
                <FormFieldRow cols={2}>
                  <FormField label="Genre">
                    <Input
                      placeholder="e.g. Action RPG"
                      value={form.genre}
                      onChange={(e) => set('genre', e.target.value)}
                    />
                  </FormField>
                  <FormField label="Release Year">
                    <Input
                      type="number"
                      placeholder="e.g. 2022"
                      value={form.releaseYear}
                      onChange={(e) => set('releaseYear', e.target.value)}
                    />
                  </FormField>
                </FormFieldRow>
                <FormFieldRow cols={2}>
                  <FormField label="Price (PLN)">
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="e.g. 129.99"
                      value={form.priceZl}
                      onChange={(e) => set('priceZl', e.target.value)}
                    />
                  </FormField>
                  {!isWishlist && (
                    <FormField label="Purchase Date">
                      <Input
                        type="date"
                        value={form.purchasedAt}
                        onChange={(e) => set('purchasedAt', e.target.value)}
                      />
                    </FormField>
                  )}
                </FormFieldRow>
              </div>

              <div className="border-t border-apex-line-5 p-5 lg:p-6">
                <SectionHeader title="Platform" description="Where you play this game." />
                <FormFieldRow cols={3}>
                  <FormField label="Platform" required>
                    {platformsLoading ? (
                      <Select disabled value="">
                        <option value="">Loading…</option>
                      </Select>
                    ) : platforms.length === 0 ? (
                      <div className="flex flex-col gap-2 rounded-[7px] border border-apex-line-1 bg-white px-3 py-3">
                        <span className="text-[12px] text-apex-muted">No platforms — add one first</span>
                        <Button
                          type="button"
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
                          value={form.platform}
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
                  </FormField>
                  <FormField label="Edition">
                    <Input
                      placeholder="e.g. Deluxe"
                      value={form.edition}
                      onChange={(e) => set('edition', e.target.value)}
                    />
                  </FormField>
                  {!isWishlist && (
                    <FormField label="Hours Played">
                      <Input
                        type="number"
                        placeholder="e.g. 42"
                        value={form.hoursPlayed}
                        onChange={(e) => set('hoursPlayed', e.target.value)}
                      />
                    </FormField>
                  )}
                </FormFieldRow>
                <FormFieldRow cols={1}>
                  <FormField label="Format" required>
                    <PillSelect
                      value={form.format}
                      options={FORMAT_OPTS}
                      onChange={(v) => set('format', v)}
                    />
                  </FormField>
                </FormFieldRow>
              </div>

              {!isWishlist && (
                <div className="border-t border-apex-line-5 p-5 lg:p-6">
                  <SectionHeader title="Status" description="Set the current status for this game." />
                  <PillSelect
                    value={form.status}
                    options={STATUS_OPTS}
                    onChange={(v) => set('status', v)}
                  />
                </div>
              )}
            </div>
          </div>

          <div className="border-t border-apex-line-5 p-5 lg:p-6">
            <SectionHeader title="Notes" description="Any additional context or thoughts." />
            <FormField>
              <Textarea
                rows={3}
                placeholder="Optional notes about this game…"
                value={form.notes}
                onChange={(e) => set('notes', e.target.value)}
              />
            </FormField>
          </div>
        </div>
      </div>

      <FormFooter>
        <FormCancelButton onClick={() => navigate(parentPath)} />
        <FormSubmitButton
          disabled={!canSubmit || createMutation.isPending || updateMutation.isPending}
          onClick={onSubmit}
        >
          {!isEdit && <Icon.plus size={14} />}
          {submitLabel}
        </FormSubmitButton>
      </FormFooter>
      {errorMessage && <div className="px-6 pb-4 text-sm text-red-600">{errorMessage}</div>}

      <AddPlatformDialog
        open={addPlatformOpen}
        onOpenChange={setAddPlatformOpen}
        onCreated={(p: Platform) => set('platform', p.name)}
      />
    </>
  );
}

