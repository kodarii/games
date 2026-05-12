import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { changePassword } from '@/lib/auth-client';
import { useState } from 'react';
import { toast } from 'sonner';

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

export function AccountPasswordForm() {
  const [error, setError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const data = new FormData(form);
    const currentPassword = String(data.get('currentPassword') ?? '');
    const newPassword = String(data.get('newPassword') ?? '');
    const confirmPassword = String(data.get('confirmPassword') ?? '');
    const revokeOtherSessions = data.get('revokeOtherSessions') === 'on';

    setError(null);

    if (newPassword !== confirmPassword) {
      setError('Nowe hasło i potwierdzenie muszą być identyczne.');
      return;
    }

    setIsPending(true);
    const { error: changeError } = await changePassword({
      currentPassword,
      newPassword,
      revokeOtherSessions,
    });
    if (changeError) {
      setIsPending(false);
      setError(mapChangePasswordError(changeError.code, changeError.status));
      return;
    }
    setIsPending(false);
    toast.success('Hasło zmienione');
    form.reset();
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-semibold text-apex-ink">Zmień hasło</CardTitle>
      </CardHeader>
      <CardContent>
        {error && (
          <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            {error}
          </div>
        )}
        <form id="account-password-form" onSubmit={onSubmit} className="space-y-4" noValidate>
          <div>
            <Label htmlFor="currentPassword" className="text-sm text-apex-ink">
              Aktualne hasło
            </Label>
            <Input
              id="currentPassword"
              name="currentPassword"
              type="password"
              required
              autoComplete="current-password"
              className="mt-1"
            />
          </div>
          <div>
            <Label htmlFor="newPassword" className="text-sm text-apex-ink">
              Nowe hasło
            </Label>
            <Input
              id="newPassword"
              name="newPassword"
              type="password"
              required
              autoComplete="new-password"
              className="mt-1"
            />
          </div>
          <div>
            <Label htmlFor="confirmPassword" className="text-sm text-apex-ink">
              Potwierdź nowe hasło
            </Label>
            <Input
              id="confirmPassword"
              name="confirmPassword"
              type="password"
              required
              autoComplete="new-password"
              className="mt-1"
            />
          </div>
          <label className="flex items-center gap-2 text-sm text-apex-ink">
            <input
              type="checkbox"
              name="revokeOtherSessions"
              defaultChecked
              className="h-4 w-4 rounded border-apex-line-4 text-apex-accent focus:ring-apex-accent"
            />
            <span>Wyloguj wszystkie inne sesje</span>
          </label>
        </form>
      </CardContent>
      <CardFooter>
        <Button
          type="submit"
          form="account-password-form"
          variant="primary"
          className="w-full"
          disabled={isPending}
        >
          {isPending ? 'Zapisywanie…' : 'Zapisz hasło'}
        </Button>
      </CardFooter>
    </Card>
  );
}
