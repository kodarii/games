import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ApiError } from '@/lib/api';
import * as AlertDialog from '@radix-ui/react-alert-dialog';
import { useEffect, useRef, useState } from 'react';

interface AddDictionaryItemDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  placeholder: string;
  maxLength?: number;
  onCreate: (name: string) => Promise<void>;
  duplicateMessage: (name: string) => string;
}

export function AddDictionaryItemDialog({
  open,
  onOpenChange,
  title,
  placeholder,
  maxLength = 60,
  onCreate,
  duplicateMessage,
}: AddDictionaryItemDialogProps) {
  const [name, setName] = useState('');
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) {
      setName('');
      setFieldError(null);
      setIsPending(false);
    }
  }, [open]);

  const validate = (value: string): string | null => {
    const t = value.trim();
    if (!t) return 'Name is required';
    if (t.length > maxLength) return `Name must be ${maxLength} characters or less`;
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
    setIsPending(true);
    try {
      await onCreate(trimmed);
      onOpenChange(false);
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setFieldError(duplicateMessage(trimmed));
      }
    } finally {
      setIsPending(false);
    }
  };

  const canSubmit = name.trim().length > 0 && !isPending;

  return (
    <AlertDialog.Root open={open} onOpenChange={(v) => !v && onOpenChange(false)}>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="fixed inset-0 z-50 bg-black/40 backdrop-blur-[1px] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <AlertDialog.Content
          onOpenAutoFocus={(e) => {
            e.preventDefault();
            inputRef.current?.focus();
          }}
          className="fixed left-1/2 top-1/2 z-50 w-[400px] max-w-[calc(100vw-32px)] -translate-x-1/2 -translate-y-1/2 rounded-[16px] bg-white p-7 shadow-[0_20px_60px_-15px_rgba(0,0,0,0.25)] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95"
        >
          <AlertDialog.Title className="text-[19px] font-bold leading-tight text-apex-ink">
            {title}
          </AlertDialog.Title>
          <AlertDialog.Description className="sr-only">
            Add a new item to your dictionary.
          </AlertDialog.Description>

          <div className="mt-5">
            <div className="mb-[6px] text-[10.5px] font-semibold uppercase tracking-[0.08em] text-apex-hint">
              Name
            </div>
            <Input
              ref={inputRef}
              placeholder={placeholder}
              value={name}
              maxLength={maxLength}
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
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button variant="primary" size="sm" onClick={onSubmit} disabled={!canSubmit}>
              {isPending ? 'Saving...' : 'Save'}
            </Button>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
