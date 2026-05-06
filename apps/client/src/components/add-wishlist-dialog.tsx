import { AddPlatformDialog } from '@/components/add-platform-dialog';
import { Icon } from '@/components/icons';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { useCreateWishlistMutation, usePlatformsQuery } from '@/lib/queries';
import { useUrlState } from '@/lib/url-state';
import * as AlertDialog from '@radix-ui/react-alert-dialog';
import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

export function AddWishlistDialog() {
  const { get, update } = useUrlState();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const open = pathname.startsWith('/wishlist') && get('add') === '1';

  const [title, setTitle] = useState('');
  const [platform, setPlatform] = useState('');
  const [addPlatformOpen, setAddPlatformOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const createMutation = useCreateWishlistMutation();
  const { data: platforms = [], isLoading: platformsLoading } =
    usePlatformsQuery();

  const close = () => {
    update({ add: null }, { replace: true });
  };

  useEffect(() => {
    if (!open) {
      setTitle('');
      setPlatform(platforms[0]?.name ?? '');
      createMutation.reset();
    }
  }, [open]);

  useEffect(() => {
    if (platform === '' && platforms.length > 0) {
      setPlatform(platforms[0].name);
    }
  }, [platforms]);

  const canSubmit =
    title.trim().length > 0 && platform !== '' && !createMutation.isPending;

  const onSubmit = () => {
    if (!canSubmit) return;
    createMutation.mutate(
      {
        kind: 'wishlist',
        title: title.trim(),
        platform,
      },
      {
        onSuccess: (g) => {
          update({ add: null }, { replace: true });
          navigate(`/wishlist/${g.id}`);
        },
      },
    );
  };

  return (
    <>
      <AlertDialog.Root open={open} onOpenChange={(v) => !v && close()}>
        <AlertDialog.Portal>
          <AlertDialog.Overlay className="fixed inset-0 z-50 bg-black/40 backdrop-blur-[1px] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
          <AlertDialog.Content
            onOpenAutoFocus={(e) => {
              e.preventDefault();
              inputRef.current?.focus();
              inputRef.current?.select();
            }}
            className="fixed left-1/2 top-1/2 z-50 w-[440px] max-w-[calc(100vw-32px)] -translate-x-1/2 -translate-y-1/2 rounded-[16px] bg-white p-7 shadow-[0_20px_60px_-15px_rgba(0,0,0,0.25)] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95"
          >
            <AlertDialog.Title className="text-[19px] font-bold leading-tight text-apex-ink">
              Add to Wishlist
            </AlertDialog.Title>
            <AlertDialog.Description className="sr-only">
              Add a game to your wishlist.
            </AlertDialog.Description>

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
                  <Select
                    value={platform}
                    onChange={(e) => setPlatform(e.target.value)}
                  >
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

            {createMutation.error && (
              <div className="mt-3 text-[12px] text-red-600">
                {createMutation.error.message}
              </div>
            )}

            <div className="mt-7 flex justify-end gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={close}
                disabled={createMutation.isPending}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={onSubmit}
                disabled={!canSubmit}
              >
                Add
              </Button>
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
