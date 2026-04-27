import { CoverColorPicker } from '@/components/cover-color-picker';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { COVER_COLORS } from '@/lib/avatar';
import { useCreateGameMutation } from '@/lib/queries';
import { useUrlState } from '@/lib/url-state';
import type { GamePlatform } from '@/types';
import * as AlertDialog from '@radix-ui/react-alert-dialog';
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

const PLATFORMS: GamePlatform[] = ['PS5', 'PS4', 'PS3', 'PC', 'Xbox', 'Switch'];

export function AddGameDialog() {
  const { get, update } = useUrlState();
  const navigate = useNavigate();
  const open = get('add') === '1';

  const [title, setTitle] = useState('');
  const [platform, setPlatform] = useState<GamePlatform>('PS4');
  const [color, setColor] = useState<string>(COVER_COLORS[0]);
  const inputRef = useRef<HTMLInputElement>(null);
  const createMutation = useCreateGameMutation();

  const close = () => {
    update({ add: null }, { replace: true });
  };

  useEffect(() => {
    if (!open) {
      setTitle('');
      setPlatform('PS4');
      setColor(COVER_COLORS[0]);
      createMutation.reset();
    }
  }, [open]);

  const canSubmit = title.trim().length > 0 && !createMutation.isPending;

  const onSubmit = () => {
    if (!canSubmit) return;
    createMutation.mutate(
      {
        title: title.trim(),
        developer: 'Unknown',
        genre: '',
        releaseYear: new Date().getFullYear(),
        platform,
        hoursPlayed: 0,
        status: 'Backlog',
        format: 'digital',
        coverColor: color,
      },
      {
        onSuccess: (g) => {
          update({ add: null }, { replace: true });
          navigate(`/games/${g.id}`);
        },
      },
    );
  };

  return (
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
            Add Game
          </AlertDialog.Title>
          <AlertDialog.Description className="sr-only">
            Add a new game to your collection.
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
            <Select
              value={platform}
              onChange={(e) => setPlatform(e.target.value as GamePlatform)}
            >
              {PLATFORMS.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </Select>
          </div>

          <div className="mt-4">
            <FieldLabel>Cover Color</FieldLabel>
            <CoverColorPicker
              value={color}
              onChange={setColor}
              className="pt-[2px]"
            />
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
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-[6px] text-[10.5px] font-semibold uppercase tracking-[0.08em] text-apex-hint">
      {children}
    </div>
  );
}
