import { AvatarUpload } from '@/components/avatar-upload';
import { Breadcrumb } from '@/components/breadcrumb';
import { FormCard, FormSection } from '@/components/form-card';
import { FormField, FormFieldRow } from '@/components/form-field';
import {
  FormCancelButton,
  FormFooter,
  FormSubmitButton,
} from '@/components/form-footer';
import { Icon } from '@/components/icons';
import { IconButton } from '@/components/icon-button';
import { PageHeader } from '@/components/page-header';
import { PillSelect } from '@/components/pill-select';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import type { Game, GamePlatform, GameStatus } from '@/types';
import { useState } from 'react';
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

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const canSubmit = Boolean(form.title.trim() && form.developer.trim() && form.platform);

  const onSubmit = () => {
    if (canSubmit) navigate('/games');
  };

  const headerIcon = isEdit ? <Icon.gamepad size={22} /> : <Icon.plus size={22} />;
  const headerTitle = isEdit ? 'Edit Game' : 'Add New Game';
  const headerDescription = isEdit
    ? 'Update details for this game.'
    : 'Fill in the details to add a game to your collection.';
  const breadcrumbLast = isEdit ? (initialGame?.title ?? 'Edit Game') : 'Add New Game';
  const submitLabel = isEdit ? 'Save Changes' : 'Add Game';

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

      <Breadcrumb
        items={[
          { label: 'Games', to: '/games' },
          { label: breadcrumbLast },
        ]}
      />

      <div className="scroll-thin flex-1 overflow-y-auto bg-white px-6 pb-6">
        <FormCard>
          <FormSection title="Game Details" description="Basic information about the game.">
            <AvatarUpload
              shape="rect"
              src={coverUrl}
              name={form.title}
              onFileSelect={(f) => setCoverUrl(URL.createObjectURL(f))}
              buttonLabel="Upload cover"
              className="mb-4"
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
          </FormSection>

          <FormSection title="Platform" description="Where you play this game.">
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
          </FormSection>

          <FormSection title="Status" description="Set the current status for this game.">
            <PillSelect
              value={form.status}
              options={STATUS_OPTS}
              onChange={(v) => set('status', v)}
            />
          </FormSection>

          <FormSection title="Notes" description="Any additional context or thoughts.">
            <FormField>
              <Textarea
                rows={3}
                placeholder="Optional notes about this game…"
                value={form.notes}
                onChange={(e) => set('notes', e.target.value)}
              />
            </FormField>
          </FormSection>
        </FormCard>
      </div>

      <FormFooter>
        <FormCancelButton onClick={() => navigate('/games')} />
        <FormSubmitButton disabled={!canSubmit} onClick={onSubmit}>
          {!isEdit && <Icon.plus size={14} />}
          {submitLabel}
        </FormSubmitButton>
      </FormFooter>
    </>
  );
}
