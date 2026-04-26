import { Breadcrumb } from '@/components/breadcrumb';
import { FormField, FormFieldRow } from '@/components/form-field';
import { FormCancelButton, FormFooter, FormSubmitButton } from '@/components/form-footer';
import { GameCover } from '@/components/game-cover';
import { IconButton } from '@/components/icon-button';
import { Icon } from '@/components/icons';
import { PageHeader } from '@/components/page-header';
import { PillSelect } from '@/components/pill-select';
import { SectionHeader } from '@/components/section-header';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import type { CreateGameInput, UpdateGameInput } from '@/lib/api';
import { useCreateGameMutation, useUpdateGameMutation } from '@/lib/queries';
import type { Game, GameFormat, GamePlatform, GameStatus } from '@/types';
import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

type Mode = 'create' | 'edit';

type FormState = {
  title: string;
  developer: string;
  genre: string;
  releaseYear: string;
  platform: GamePlatform | '';
  edition: string;
  hoursPlayed: string;
  status: GameStatus;
  format: GameFormat;
  notes: string;
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
};

function gameToFormState(g: Game): FormState {
  return {
    title: g.title,
    developer: g.developer,
    genre: g.genre,
    releaseYear: String(g.releaseYear),
    platform: g.platform,
    edition: g.edition ?? '',
    hoursPlayed: String(g.hoursPlayed),
    status: g.status,
    format: g.format,
    notes: '',
  };
}

const PLATFORMS: GamePlatform[] = ['PS5', 'PS4', 'PS3', 'PC', 'Xbox', 'Switch'];

const STATUS_OPTS = [
  { value: 'Playing' as const, color: '#4F6EF7' },
  { value: 'Wishlist' as const, color: '#4F6EF7' },
  { value: 'Backlog' as const, color: '#f59e0b' },
  { value: 'Completed' as const, color: '#10b981' },
  { value: 'Dropped' as const, color: '#ef4444' },
];

const FORMAT_OPTS: { value: GameFormat; label: string }[] = [
  { value: 'physical', label: 'Physical' },
  { value: 'digital', label: 'Digital' },
];

export function GameForm({
  mode,
  initialGame,
}: {
  mode: Mode;
  initialGame?: Game;
}) {
  const navigate = useNavigate();
  const isEdit = mode === 'edit';
  const [form, setForm] = useState<FormState>(() =>
    initialGame ? gameToFormState(initialGame) : EMPTY,
  );
  const [coverUrl, setCoverUrl] = useState<string | null>(null);
  const createMutation = useCreateGameMutation();
  const updateMutation = useUpdateGameMutation();

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const canSubmit = Boolean(form.title.trim() && form.developer.trim() && form.platform);

  const onSubmit = () => {
    const payload = {
      title: form.title.trim(),
      developer: form.developer.trim(),
      genre: form.genre.trim() || '',
      releaseYear: Number(form.releaseYear) || new Date().getFullYear(),
      platform: form.platform as GamePlatform,
      edition: form.edition.trim() || undefined,
      hoursPlayed: Number(form.hoursPlayed) || 0,
      status: form.status,
      format: form.format,
    };

    if (isEdit && initialGame) {
      updateMutation.mutate(
        { id: initialGame.id, input: payload satisfies UpdateGameInput },
        { onSuccess: (g) => navigate(`/games/${g.id}`) },
      );
      return;
    }

    createMutation.mutate(payload satisfies CreateGameInput, {
      onSuccess: (g) => navigate(`/games/${g.id}`),
    });
  };

  const headerIcon = isEdit ? <Icon.gamepad size={22} /> : <Icon.plus size={22} />;
  const headerTitle = isEdit ? 'Edit Game' : 'Add New Game';
  const headerDescription = isEdit
    ? 'Update details for this game.'
    : 'Fill in the details to add a game to your collection.';
  const breadcrumbLast = isEdit ? (initialGame?.title ?? 'Edit Game') : 'Add New Game';
  const submitLabel = isEdit ? 'Save Changes' : 'Add Game';
  const errorMessage = createMutation.error?.message || updateMutation.error?.message || null;

  return (
    <>
      <PageHeader
        icon={headerIcon}
        title={headerTitle}
        description={headerDescription}
        actions={
          <IconButton aria-label="Notifications">
            <Icon.bell size={18} />
          </IconButton>
        }
      />

      <Breadcrumb items={[{ label: 'Games', to: '/games' }, { label: breadcrumbLast }]} />

      <div className="scroll-thin flex-1 overflow-y-auto bg-white px-5 pb-6 pt-3 lg:px-8">
        <div className="overflow-hidden rounded-[14px] border border-apex-line-1 bg-white">
          <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr]">
            <div className="flex items-center justify-center p-5 lg:border-r lg:border-apex-line-5 lg:p-6">
              <div className="w-full max-w-[260px] lg:max-w-none">
                <CoverUpload
                  name={form.title}
                  src={coverUrl}
                  onFileSelect={(f) => setCoverUrl(URL.createObjectURL(f))}
                />
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
              </div>

              <div className="border-t border-apex-line-5 p-5 lg:p-6">
                <SectionHeader title="Platform" description="Where you play this game." />
                <FormFieldRow cols={3}>
                  <FormField label="Platform" required>
                    <Select
                      value={form.platform}
                      onChange={(e) => set('platform', e.target.value as GamePlatform | '')}
                    >
                      <option value="">Select platform</option>
                      {PLATFORMS.map((p) => (
                        <option key={p} value={p}>
                          {p}
                        </option>
                      ))}
                    </Select>
                  </FormField>
                  <FormField label="Edition">
                    <Input
                      placeholder="e.g. Deluxe"
                      value={form.edition}
                      onChange={(e) => set('edition', e.target.value)}
                    />
                  </FormField>
                  <FormField label="Hours Played">
                    <Input
                      type="number"
                      placeholder="e.g. 42"
                      value={form.hoursPlayed}
                      onChange={(e) => set('hoursPlayed', e.target.value)}
                    />
                  </FormField>
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

              <div className="border-t border-apex-line-5 p-5 lg:p-6">
                <SectionHeader title="Status" description="Set the current status for this game." />
                <PillSelect
                  value={form.status}
                  options={STATUS_OPTS}
                  onChange={(v) => set('status', v)}
                />
              </div>
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
        <FormCancelButton onClick={() => navigate('/games')} />
        <FormSubmitButton
          disabled={!canSubmit || createMutation.isPending || updateMutation.isPending}
          onClick={onSubmit}
        >
          {!isEdit && <Icon.plus size={14} />}
          {submitLabel}
        </FormSubmitButton>
      </FormFooter>
      {errorMessage && <div className="px-6 pb-4 text-sm text-red-600">{errorMessage}</div>}
    </>
  );
}

function CoverUpload({
  name,
  src,
  onFileSelect,
}: {
  name: string;
  src: string | null;
  onFileSelect: (file: File) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  return (
    <div className="flex flex-col items-stretch gap-3">
      <GameCover name={name} src={src} />
      <button
        type="button"
        onClick={() => fileRef.current?.click()}
        className="w-full rounded-md bg-[#EEF2FF] px-3 py-2 text-[12px] font-medium text-apex-accent transition-colors hover:bg-[#dde5ff]"
      >
        {src ? 'Change cover' : 'Upload cover'}
      </button>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onFileSelect(f);
        }}
      />
      <p className="text-center text-[11px] text-apex-faint">JPG, PNG up to 2MB</p>
    </div>
  );
}
