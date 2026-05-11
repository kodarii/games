import { MetadataMatchPicker } from '@/components/metadata-match-picker';
import { Button } from '@/components/ui/button';
import { useRematchGame } from '@/hooks/use-rematch-game';
import { coverColorFor } from '@/lib/avatar';
import { cn } from '@/lib/utils';
import type { Game } from '@/types';
import * as AlertDialog from '@radix-ui/react-alert-dialog';

interface RematchButtonProps {
  game: Game;
}

const PICKER_CONTENT_CLASSES = cn(
  'fixed inset-x-0 bottom-0 z-50 max-h-[90vh] overflow-y-auto rounded-t-2xl bg-white p-6 shadow-[0_20px_60px_-15px_rgba(0,0,0,0.25)] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
  'sm:inset-x-auto sm:bottom-auto sm:left-1/2 sm:top-1/2 sm:w-[520px] sm:max-w-[calc(100vw-32px)] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-[16px] sm:rounded-b-[16px] sm:p-7 sm:data-[state=closed]:zoom-out-95 sm:data-[state=open]:zoom-in-95',
);

const CONFIRM_CONTENT_CLASSES = cn(
  'fixed inset-x-0 bottom-0 z-50 overflow-y-auto rounded-t-2xl bg-white p-6 shadow-[0_20px_60px_-15px_rgba(0,0,0,0.25)] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
  'sm:inset-x-auto sm:bottom-auto sm:left-1/2 sm:top-1/2 sm:w-[400px] sm:max-w-[calc(100vw-32px)] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-[16px] sm:rounded-b-[16px] sm:p-7 sm:data-[state=closed]:zoom-out-95 sm:data-[state=open]:zoom-in-95',
);

const OVERLAY_CLASSES =
  'fixed inset-0 z-50 bg-black/40 backdrop-blur-[1px] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0';

export function RematchButton({ game }: RematchButtonProps) {
  const hasAnyEnrichment = Boolean(game.coverImage || game.releaseYear != null || game.developer);
  const label = hasAnyEnrichment ? 'Re-match on IGDB' : 'Find IGDB match';
  const variant: 'primary' | 'ghost' = hasAnyEnrichment ? 'ghost' : 'primary';
  const r = useRematchGame(game);
  const fallbackColor = coverColorFor(game);

  return (
    <>
      <Button
        type="button"
        variant={variant}
        size="sm"
        onClick={() => r.setOpen(true)}
        disabled={r.mutation.isPending}
      >
        {label}
      </Button>

      <AlertDialog.Root open={r.open} onOpenChange={(v) => !v && r.setOpen(false)}>
        <AlertDialog.Portal>
          <AlertDialog.Overlay className={OVERLAY_CLASSES} />
          <AlertDialog.Content className={PICKER_CONTENT_CLASSES}>
            <AlertDialog.Title className="text-[19px] font-bold leading-tight text-apex-ink">
              Choose a match
            </AlertDialog.Title>
            <AlertDialog.Description className="sr-only">
              Re-match this game with an IGDB entry.
            </AlertDialog.Description>

            <div className="mt-5">
              <MetadataMatchPicker
                candidatesQuery={r.candidatesQuery}
                selectedProviderId={r.selectedProviderId}
                selectedCandidate={r.selectedCandidate}
                onSelect={(id) => r.setSelectedProviderId(id)}
                onClearSelection={() => r.setSelectedProviderId(null)}
                onEditSearch={() => r.setOpen(false)}
                onContinueWithoutMatch={() => r.setOpen(false)}
                fallbackColor={fallbackColor}
                title={game.title}
              />
            </div>

            {r.mutation.error && (
              <div className="mt-3 text-[12px] text-red-600">{r.mutation.error.message}</div>
            )}

            <div className="mt-7 flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => r.setOpen(false)}
                disabled={r.mutation.isPending}
              >
                Cancel
              </Button>
              {r.selectedCandidate && (
                <Button
                  type="button"
                  variant="primary"
                  size="sm"
                  onClick={r.onConfirmClick}
                  disabled={r.mutation.isPending}
                >
                  {r.mutation.isPending ? 'Saving…' : 'Apply match'}
                </Button>
              )}
            </div>
          </AlertDialog.Content>
        </AlertDialog.Portal>
      </AlertDialog.Root>

      <AlertDialog.Root
        open={r.pendingReplace !== null}
        onOpenChange={(v) => {
          if (!v) r.setPendingReplace(null);
        }}
      >
        <AlertDialog.Portal>
          <AlertDialog.Overlay className={OVERLAY_CLASSES} />
          <AlertDialog.Content className={CONFIRM_CONTENT_CLASSES}>
            <AlertDialog.Title className="text-[17px] font-bold leading-tight text-apex-ink">
              Replace your uploaded cover?
            </AlertDialog.Title>
            <AlertDialog.Description className="mt-2 text-[13px] text-apex-muted">
              The IGDB cover will replace your uploaded image. This cannot be undone.
            </AlertDialog.Description>

            <div className="mt-6 flex flex-wrap justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  void r.confirm({ keepCover: true });
                }}
                disabled={r.mutation.isPending}
              >
                Keep my cover
              </Button>
              <Button
                type="button"
                variant="primary"
                size="sm"
                onClick={() => {
                  void r.confirm();
                }}
                disabled={r.mutation.isPending}
              >
                {r.mutation.isPending ? 'Saving…' : 'Replace'}
              </Button>
            </div>
          </AlertDialog.Content>
        </AlertDialog.Portal>
      </AlertDialog.Root>
    </>
  );
}
