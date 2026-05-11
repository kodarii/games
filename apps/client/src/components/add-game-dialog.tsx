import { AddPlatformDialog } from '@/components/add-platform-dialog';
import { CoverColorPicker } from '@/components/cover-color-picker';
import { Icon } from '@/components/icons';
import { MetadataMatchPicker } from '@/components/metadata-match-picker';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { useAddGameWithMetadata } from '@/hooks/use-add-game-with-metadata';
import { usePlatformsQuery } from '@/lib/queries';
import { useUrlState } from '@/lib/url-state';
import { cn } from '@/lib/utils';
import * as AlertDialog from '@radix-ui/react-alert-dialog';
import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

export function AddGameDialog() {
  const { get, update } = useUrlState();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const open = pathname.startsWith('/games') && get('add') === '1';

  const { data: platforms = [], isLoading: platformsLoading } = usePlatformsQuery();
  const [addPlatformOpen, setAddPlatformOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const flow = useAddGameWithMetadata(platforms[0]?.name ?? '');
  const {
    step,
    title,
    setTitle,
    platform,
    setPlatform,
    color,
    setColor,
    selectedProviderId,
    setSelectedProviderId,
    selectedCandidate,
    candidatesQuery,
    createMutation,
    goStep2,
    goStep1,
    submit,
    reset,
  } = flow;

  const close = () => {
    update({ add: null }, { replace: true });
  };

  useEffect(() => {
    if (!open) {
      reset();
    }
  }, [open, reset]);

  const firstPlatformName = platforms[0]?.name ?? '';
  useEffect(() => {
    if (platform === '' && firstPlatformName !== '') {
      setPlatform(firstPlatformName);
    }
  }, [platform, firstPlatformName, setPlatform]);

  const canFindMatch = title.trim().length > 0 && platform !== '' && !createMutation.isPending;

  const onFindMatch = () => {
    if (!canFindMatch) return;
    goStep2();
  };

  const onSuccess = (game: { id: string }) => {
    close();
    reset();
    navigate(`/games/${game.id}`);
  };

  const onAddToCollection = () => {
    if (!selectedCandidate || createMutation.isPending) return;
    submit({ withMatch: true, onSuccess });
  };

  const onContinueWithoutMatch = () => {
    if (createMutation.isPending) return;
    submit({ withMatch: false, onSuccess });
  };

  const contentClassName = cn(
    'fixed inset-x-0 bottom-0 z-50 max-h-[90vh] overflow-y-auto rounded-t-2xl bg-white p-6 shadow-[0_20px_60px_-15px_rgba(0,0,0,0.25)] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
    'sm:inset-x-auto sm:bottom-auto sm:left-1/2 sm:top-1/2 sm:max-w-[calc(100vw-32px)] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-[16px] sm:rounded-b-[16px] sm:p-7 sm:data-[state=closed]:zoom-out-95 sm:data-[state=open]:zoom-in-95',
    step === 1 ? 'sm:w-[440px]' : 'sm:w-[520px]',
  );

  return (
    <>
      <AlertDialog.Root open={open} onOpenChange={(v) => !v && close()}>
        <AlertDialog.Portal>
          <AlertDialog.Overlay className="fixed inset-0 z-50 bg-black/40 backdrop-blur-[1px] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
          <AlertDialog.Content
            onOpenAutoFocus={(e) => {
              e.preventDefault();
              if (step === 1) {
                inputRef.current?.focus();
                inputRef.current?.select();
              }
            }}
            className={contentClassName}
          >
            <AlertDialog.Title className="text-[19px] font-bold leading-tight text-apex-ink">
              {step === 1 ? 'Add Game' : 'Choose a match'}
            </AlertDialog.Title>
            <AlertDialog.Description className="sr-only">
              {step === 1
                ? 'Add a new game to your collection.'
                : 'Pick an IGDB match for the game you are adding.'}
            </AlertDialog.Description>

            {step === 1 ? (
              <Step1Body
                title={title}
                setTitle={setTitle}
                platform={platform}
                setPlatform={setPlatform}
                color={color}
                setColor={setColor}
                platforms={platforms}
                platformsLoading={platformsLoading}
                onOpenAddPlatform={() => setAddPlatformOpen(true)}
                inputRef={inputRef}
                canSubmit={canFindMatch}
                onSubmit={onFindMatch}
              />
            ) : (
              <div className="mt-5">
                <MetadataMatchPicker
                  candidatesQuery={candidatesQuery}
                  selectedProviderId={selectedProviderId}
                  selectedCandidate={selectedCandidate}
                  onSelect={(id) => setSelectedProviderId(id)}
                  onClearSelection={() => setSelectedProviderId(null)}
                  onEditSearch={goStep1}
                  onContinueWithoutMatch={onContinueWithoutMatch}
                  fallbackColor={color}
                  title={title.trim()}
                />
              </div>
            )}

            {createMutation.error && (
              <div className="mt-3 text-[12px] text-red-600">{createMutation.error.message}</div>
            )}

            {step === 1 ? (
              <div className="mt-7 flex justify-end gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={close}
                  disabled={createMutation.isPending}
                >
                  Cancel
                </Button>
                <Button variant="primary" size="sm" onClick={onFindMatch} disabled={!canFindMatch}>
                  Find match
                </Button>
              </div>
            ) : (
              <Step2Footer
                onSkip={onContinueWithoutMatch}
                onCancel={close}
                onConfirm={onAddToCollection}
                canConfirm={selectedCandidate !== null && !createMutation.isPending}
                isPending={createMutation.isPending}
              />
            )}
          </AlertDialog.Content>
        </AlertDialog.Portal>
      </AlertDialog.Root>
      <AddPlatformDialog
        open={addPlatformOpen}
        onOpenChange={setAddPlatformOpen}
        onCreated={(p) => setPlatform(p.name)}
      />
    </>
  );
}

interface Step1BodyProps {
  title: string;
  setTitle: (v: string) => void;
  platform: string;
  setPlatform: (v: string) => void;
  color: string;
  setColor: (v: string) => void;
  platforms: { id: number; name: string }[];
  platformsLoading: boolean;
  onOpenAddPlatform: () => void;
  inputRef: React.RefObject<HTMLInputElement>;
  canSubmit: boolean;
  onSubmit: () => void;
}

function Step1Body({
  title,
  setTitle,
  platform,
  setPlatform,
  color,
  setColor,
  platforms,
  platformsLoading,
  onOpenAddPlatform,
  inputRef,
  canSubmit,
  onSubmit,
}: Step1BodyProps) {
  return (
    <>
      <div className="mt-5">
        <FieldLabel>Title</FieldLabel>
        <Input
          ref={inputRef}
          placeholder="Game title..."
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && canSubmit) {
              e.preventDefault();
              onSubmit();
            }
          }}
        />
      </div>

      <div className="mt-4">
        <FieldLabel>Platform</FieldLabel>
        {platformsLoading ? (
          <Select disabled value="">
            <option value="">Loading…</option>
          </Select>
        ) : platforms.length === 0 ? (
          <div className="flex flex-col gap-2 rounded-[7px] border border-apex-line-1 bg-white px-3 py-3">
            <span className="text-[12px] text-apex-muted">No platforms — add one first</span>
            <Button type="button" variant="outline" size="sm" onClick={onOpenAddPlatform}>
              <Icon.plus size={12} />
              Add platform
            </Button>
          </div>
        ) : (
          <>
            <Select value={platform} onChange={(e) => setPlatform(e.target.value)}>
              {platforms.map((p) => (
                <option key={p.id} value={p.name}>
                  {p.name}
                </option>
              ))}
            </Select>
            <button
              type="button"
              onClick={onOpenAddPlatform}
              className="mt-1 text-[11px] text-apex-accent hover:underline"
            >
              + Add platform
            </button>
          </>
        )}
      </div>

      <div className="mt-4">
        <FieldLabel>Cover Color</FieldLabel>
        <CoverColorPicker value={color} onChange={setColor} className="pt-[2px]" />
      </div>
    </>
  );
}

interface Step2FooterProps {
  onSkip: () => void;
  onCancel: () => void;
  onConfirm: () => void;
  canConfirm: boolean;
  isPending: boolean;
}

function Step2Footer({ onSkip, onCancel, onConfirm, canConfirm, isPending }: Step2FooterProps) {
  return (
    <div className="mt-7 flex flex-wrap items-center justify-between gap-3">
      <button
        type="button"
        onClick={onSkip}
        disabled={isPending}
        className="text-[12px] text-apex-muted hover:text-apex-accent disabled:opacity-50"
      >
        Skip — enter manually
      </button>
      <div className="flex gap-2">
        <Button variant="outline" size="sm" onClick={onCancel} disabled={isPending}>
          Cancel
        </Button>
        {canConfirm && (
          <Button variant="primary" size="sm" onClick={onConfirm} disabled={!canConfirm}>
            Add to collection
          </Button>
        )}
      </div>
    </div>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-[6px] text-[10.5px] font-semibold uppercase tracking-[0.08em] text-apex-hint">
      {children}
    </div>
  );
}
