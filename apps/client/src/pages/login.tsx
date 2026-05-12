import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { signIn, useSession } from '@/lib/auth-client';
import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';

export function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { refetch: refetchSession } = useSession();
  const [error, setError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const data = new FormData(form);
    const email = String(data.get('email') ?? '').trim();
    const password = String(data.get('password') ?? '');
    setError(null);
    setIsPending(true);
    const { error: signInError } = await signIn.email({ email, password });
    if (signInError) {
      setIsPending(false);
      setError(
        signInError.code === 'INVALID_EMAIL_OR_PASSWORD'
          ? 'Invalid email or password.'
          : 'Something went wrong. Try again.',
      );
      return;
    }
    await refetchSession();
    setIsPending(false);
    const from = (location.state as { from?: string } | null)?.from ?? '/games';
    navigate(from, { replace: true });
  };

  return (
    <div>
      <h1 className="text-2xl font-semibold text-apex-ink">Welcome back</h1>
      <p className="mt-2 text-sm text-apex-muted">Sign in to your Apex account.</p>

      {error && (
        <div className="mt-6 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </div>
      )}

      <form onSubmit={onSubmit} className="mt-8 space-y-4">
        <div>
          <label htmlFor="email" className="text-sm font-medium text-apex-ink">
            Email
          </label>
          <Input
            id="email"
            name="email"
            type="email"
            required
            autoComplete="email"
            className="mt-1"
          />
        </div>
        <div>
          <label htmlFor="password" className="text-sm font-medium text-apex-ink">
            Password
          </label>
          <Input
            id="password"
            name="password"
            type="password"
            required
            autoComplete="current-password"
            className="mt-1"
          />
        </div>
        <Button type="submit" className="mt-6 w-full" disabled={isPending}>
          {isPending ? 'Signing in…' : 'Sign in'}
        </Button>
      </form>

      <p className="mt-4 text-center text-sm text-apex-muted">
        Don&apos;t have an account?{' '}
        <Link to="/register" className="font-medium text-apex-accent hover:underline">
          Create one
        </Link>
      </p>
    </div>
  );
}
