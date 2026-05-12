import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ApiError } from '@/lib/api';
import { useCreatePlatform } from '@/lib/queries';
import type { Platform } from '@/types';
import * as AlertDialog from '@radix-ui/react-alert-dialog';
import { useEffect, useRef, useState } from 'react';

interface AddPlatformDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: (platform: Platform) => void;
}

export function AddPlatformDialog({ open, onOpenChange, onCreated }: AddPlatformDialogProps) {
  const [name, setName] = useState('');
  const [fieldError, setFieldError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const createMutation = useCreatePlatform();

  useEffect(() => {
    if (!open) {
      setName('');
      setFieldError(null);
      createMutation.reset();
    }
  }, [open]);

  const validate = (value: string): string | null => {
    const trimmed = value.trim();
    if (!trimmed) return 'Name is required';
    if (trimmed.length > 40) return 'Name must be 40 characters or less';
    return null;
  };

  const onSubmit = async () => {
    const trimmed = name.trim();
    const error = validate(trimmed);
    if (error) {
      setFieldError(error);
      return;
    }
    setFieldError(null);
    try {
      const platform = await createMutation.mutateAsync({ name: trimmed });
      onCreated?.(platform);
      onOpenChange(false);
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setFieldError(`Platform '${trimmed}' already exists`);
      }
    }
  };

  const canSubmit = name.trim().length > 0 && !createMutation.isPending;

  return (
    <AlertDialog.Root open={open} onOpenChange={(v) => !v && onOpenChange(false)}>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="fixed inset-0 z-50 bg-black/40 backdrop-blur-[1px] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <AlertDialog.Content
          onOpenAutoFocus={(e) => {
            e.preventDefault();
            inputRef.current?.focus();
          }}
          className="fixed left-1/2 top-1/2 z-50 w-[400px] max-w-[calc(100vw-32px)] -translate-x-1/2 -translate-y-1/2 rounded-[16px] bg-white p-7 shadow-[0_20px_60px_-15px_rgba(0,0,0,0.25)] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 sm:max-w-md"
        >
          <AlertDialog.Title className="text-[19px] font-bold leading-tight text-apex-ink">
            Add Platform
          </AlertDialog.Title>
          <AlertDialog.Description className="sr-only">
            Add a new platform to your dictionary.
          </AlertDialog.Description>

          <div className="mt-5">
            <FieldLabel>Name</FieldLabel>
            <Input
              ref={inputRef}
              placeholder="e.g. PlayStation 5"
              value={name}
              maxLength={40}
              onChange={(e) => {
                setName(e.target.value);
                if (fieldError) setFieldError(null);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && canSubmit) {
                  e.preventDefault();
                  onSubmit();
                }
              }}
            />
            {fieldError && <div className="mt-[6px] text-[12px] text-red-600">{fieldError}</div>}
          </div>

          <div className="mt-7 flex justify-end gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => onOpenChange(false)}
              disabled={createMutation.isPending}
            >
              Cancel
            </Button>
            <Button variant="primary" size="sm" onClick={onSubmit} disabled={!canSubmit}>
              {createMutation.isPending ? 'Saving...' : 'Save'}
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
