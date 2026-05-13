import { AddPlatformDialog } from '@/components/add-platform-dialog';
import { Icon } from '@/components/icons';
import { TitleAutocomplete } from '@/components/title-autocomplete';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { useAddGameWithMetadata } from '@/hooks/use-add-game-with-metadata';
import { usePlatformsQuery } from '@/lib/queries';
import { useUrlState } from '@/lib/url-state';
import type { MetadataCandidate } from '@/types';
import * as AlertDialog from '@radix-ui/react-alert-dialog';
import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

type Mode = 'collection' | 'wishlist';

/**
 * Unified Add-Game modal. Mounted ONCE in `AppLayout`; opens for both
 * `/games?add=1` (collection) and `/wishlist?add=1` (wishlist), deriving mode
 * from the URL. Backend already accepts the full enriched payload for the
 * `kind: 'wishlist'` branch (see `apps/api/src/application/games/create-game.ts:53-72`)
 * so wishlist gains cover color + IGDB metadata without backend changes.
 *
 * Locked behaviour (per `260513-ds2-PLAN.md`):
 *  - Field order: Platform -> Title. Cover color is auto-assigned (random
 *    pick from `COVER_COLORS`) — no picker in the UI; the header badge still
 *    previews the chosen color so the user has a visual cue.
 *  - Header is a 34x34 rounded-8 icon-badge filled with the auto-assigned
 *    cover color, white gamepad icon centered.
 *  - Footer has a light-grey background with an info-circle hint and the
 *    primary CTA on the right.
 *  - Overlay click does NOT close the modal; Esc, X, and Cancel do.
 *  - On success, navigate to `/games/:id` or `/wishlist/:id` and close.
 */
export function AddGameModal() {
  const { get, update } = useUrlState();
  const navigate = useNavigate();
  const { pathname } = useLocation();

  const mode: Mode = pathname.startsWith('/wishlist') ? 'wishlist' : 'collection';
  const open =
    (mode === 'wishlist' ? pathname.startsWith('/wishlist') : pathname.startsWith('/games')) &&
    get('add') === '1';

  const { data: platforms = [], isLoading: platformsLoading } = usePlatformsQuery();
  const [addPlatformOpen, setAddPlatformOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const flow = useAddGameWithMetadata({
    mode,
    initialPlatform: platforms[0]?.name ?? '',
  });
  const {
    title,
    setTitle,
    platform,
    setPlatform,
    color,
    selectedCandidate,
    selectCandidate,
    candidatesQuery,
    createMutation,
    submit,
    reset,
  } = flow;

  useEffect(() => {
    if (!open) reset();
  }, [open, reset]);

  useEffect(() => {
    if (platform === '' && platforms[0]?.name) setPlatform(platforms[0].name);
  }, [platform, platforms, setPlatform]);

  const t =
    mode === 'wishlist'
      ? {
          title: 'Add to wishlist',
          sub: 'Add a game to your wishlist.',
          cta: 'Add to wishlist',
          redirectPrefix: '/wishlist',
        }
      : {
          title: 'Add game',
          sub: 'Add a new game to your library.',
          cta: 'Add game',
          redirectPrefix: '/games',
        };

  const close = () => update({ add: null }, { replace: true });

  const canSubmit = title.trim().length > 0 && platform !== '' && !createMutation.isPending;

  const onSubmit = () => {
    if (!canSubmit) return;
    submit({
      onSuccess: (g) => {
        close();
        reset();
        navigate(`${t.redirectPrefix}/${g.id}`);
      },
    });
  };

  const onCandidatePick = (c: MetadataCandidate) => {
    // The hook's `selectCandidate` sets title + providerId atomically; the
    // derived `selectedCandidate` keeps the MATCHED pill as long as the typed
    // title equals the picked candidate's title.
    selectCandidate(c);
  };

  return (
    <>
      <AlertDialog.Root open={open} onOpenChange={(v) => !v && close()}>
        <AlertDialog.Portal>
          <AlertDialog.Overlay className="fixed inset-0 z-50 bg-black/40 backdrop-blur-[1px] data-[state=closed]:animate-out data-[state=open]:animate-in data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
          <AlertDialog.Content
            onOpenAutoFocus={(e) => {
              e.preventDefault();
              inputRef.current?.focus();
              inputRef.current?.select();
            }}
            onPointerDownOutside={(e) => e.preventDefault()}
            onInteractOutside={(e) => e.preventDefault()}
            className="fixed inset-x-3 top-3 z-50 max-h-[90vh] overflow-y-auto rounded-2xl bg-white shadow-[0_24px_60px_rgba(0,0,0,0.22)] data-[state=closed]:animate-out data-[state=open]:animate-in data-[state=closed]:slide-out-to-top data-[state=open]:slide-in-from-top sm:inset-x-auto sm:top-1/2 sm:left-1/2 sm:w-[460px] sm:max-w-[calc(100vw-32px)] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-[14px] sm:data-[state=closed]:zoom-out-95 sm:data-[state=open]:zoom-in-95"
          >
            <AlertDialog.Description className="sr-only">{t.sub}</AlertDialog.Description>

            <div className="flex items-center gap-3 border-b border-apex-line-1 px-[22px] pb-[16px] pt-[18px]">
              <div
                className="flex h-[34px] w-[34px] items-center justify-center rounded-[8px] transition-colors"
                style={{ background: color }}
              >
                <Icon.gamepad size={16} className="text-white" />
              </div>
              <div className="min-w-0 flex-1">
                <AlertDialog.Title className="text-[15px] font-bold tracking-tight text-apex-ink">
                  {t.title}
                </AlertDialog.Title>
                <div className="mt-px text-[11.5px] text-apex-muted">{t.sub}</div>
              </div>
              <button
                type="button"
                onClick={close}
                aria-label="Close"
                className="flex h-[28px] w-[28px] items-center justify-center rounded-md text-apex-muted hover:bg-apex-line-1"
              >
                <CloseIcon />
              </button>
            </div>

            <div className="flex flex-col gap-4 px-[22px] pb-[22px] pt-[20px]">
              <div>
                <FieldLabel>Platform</FieldLabel>
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
                    <Select value={platform} onChange={(e) => setPlatform(e.target.value)}>
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
              </div>

              <div>
                <FieldLabel>Title</FieldLabel>
                <TitleAutocomplete
                  value={title}
                  onChange={setTitle}
                  candidatesQuery={candidatesQuery}
                  selectedCandidate={selectedCandidate}
                  onSelectCandidate={onCandidatePick}
                  fallbackColor={color}
                  onSubmitEnter={onSubmit}
                  inputRef={inputRef}
                />
              </div>

              {createMutation.error && (
                <div className="text-[12px] text-red-600">{createMutation.error.message}</div>
              )}
            </div>

            <div className="flex flex-col gap-3 border-t border-apex-line-1 bg-[#fafafa] px-[22px] py-[14px] sm:flex-row sm:items-center sm:justify-between sm:gap-2">
              <span className="flex items-center gap-1.5 text-[11px] text-apex-hint">
                <InfoCircleIcon />
                More details can be edited after adding.
              </span>
              <div className="flex justify-end gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={close}
                  disabled={createMutation.isPending}
                >
                  Cancel
                </Button>
                <Button variant="primary" size="sm" onClick={onSubmit} disabled={!canSubmit}>
                  {t.cta}
                </Button>
              </div>
            </div>
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

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-[6px] text-[10.5px] font-semibold uppercase tracking-[0.08em] text-apex-hint">
      {children}
    </div>
  );
}

function CloseIcon() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 12 12"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path d="M3 3l6 6M9 3l-6 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function InfoCircleIcon() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 12 12"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <circle cx="6" cy="6" r="5" stroke="currentColor" strokeWidth="1.2" />
      <path d="M6 5.5v2.5M6 4.2v.1" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}
