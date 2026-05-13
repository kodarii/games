import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { changePassword } from '@/lib/auth-client';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

type AccountPasswordFormProps = {
  open: boolean;
  onCancel: () => void;
  onSuccess: () => void;
};

function mapChangePasswordError(code: string | undefined, status: number | undefined): string {
  if (code === 'INVALID_PASSWORD') {
    return 'Aktualne hasło jest nieprawidłowe.';
  }
  if (code === 'PASSWORD_TOO_SHORT') {
    return 'Hasło musi mieć co najmniej 8 znaków.';
  }
  if (status === 429) {
    return 'Zbyt wiele prób. Spróbuj ponownie za chwilę.';
  }
  return 'Coś poszło nie tak. Spróbuj ponownie.';
}

export function AccountPasswordForm({ open, onCancel, onSuccess }: AccountPasswordFormProps) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const firstInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) firstInputRef.current?.focus();
  }, [open]);

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const data = new FormData(form);
    const currentPassword = String(data.get('currentPassword') ?? '');
    const newPassword = String(data.get('newPassword') ?? '');
    const confirmPassword = String(data.get('confirmPassword') ?? '');
    const revokeOther = data.get('revokeOtherSessions') === 'on';

    setError(null);

    if (newPassword !== confirmPassword) {
      setError('Nowe hasło i potwierdzenie muszą być identyczne.');
      return;
    }

    setIsPending(true);
    const { error: changeError } = await changePassword({
      currentPassword,
      newPassword,
      revokeOtherSessions: revokeOther,
    });
    setIsPending(false);
    if (changeError) {
      setError(mapChangePasswordError(changeError.code, changeError.status));
      if (changeError.code === 'INVALID_PASSWORD') {
        firstInputRef.current?.focus();
      }
      return;
    }
    toast.success('Hasło zmienione');
    form.reset();
    onSuccess();
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLFormElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      formRef.current?.reset();
      setError(null);
      onCancel();
    }
  };

  return (
    <form
      ref={formRef}
      onSubmit={onSubmit}
      onKeyDown={onKeyDown}
      noValidate
      className="space-y-4 border-t border-apex-line-4 bg-apex-surface-head px-4 pb-4 pt-4"
    >
      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[12.5px] text-red-800">
          {error}
        </div>
      )}
      <div className="space-y-1.5">
        <Label htmlFor="currentPassword" className="text-[12.5px] text-apex-ink">
          Aktualne hasło
        </Label>
        <Input
          ref={firstInputRef}
          id="currentPassword"
          name="currentPassword"
          type="password"
          required
          autoComplete="current-password"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="newPassword" className="text-[12.5px] text-apex-ink">
          Nowe hasło
        </Label>
        <Input
          id="newPassword"
          name="newPassword"
          type="password"
          required
          autoComplete="new-password"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="confirmPassword" className="text-[12.5px] text-apex-ink">
          Potwierdź nowe hasło
        </Label>
        <Input
          id="confirmPassword"
          name="confirmPassword"
          type="password"
          required
          autoComplete="new-password"
        />
      </div>
      <label className="flex items-center gap-2 text-[12.5px] text-apex-ink">
        <input
          type="checkbox"
          name="revokeOtherSessions"
          defaultChecked
          className="h-4 w-4 rounded border-apex-line-4 text-apex-accent focus:ring-apex-accent"
        />
        <span>Wyloguj wszystkie inne sesje</span>
      </label>
      <div className="flex justify-end gap-2 pt-1">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onCancel}
          disabled={isPending}
          className="h-8 border-apex-line-1 bg-white px-4 text-[12.5px] text-apex-ink hover:bg-apex-line-4 hover:text-apex-ink"
        >
          Anuluj
        </Button>
        <Button
          type="submit"
          variant="primary"
          size="sm"
          disabled={isPending}
          className="h-8 px-4 text-[12.5px]"
        >
          {isPending ? 'Zapisywanie…' : 'Zapisz hasło'}
        </Button>
      </div>
    </form>
  );
}
