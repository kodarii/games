import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useCredentialsForm } from '@/hooks/use-credentials-form';
import { signIn, useSession } from '@/lib/auth-client';
import { Link, useLocation, useNavigate } from 'react-router-dom';

export function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { refetch: refetchSession } = useSession();

  const { handleSubmit, isPending, error, fieldErrors } = useCredentialsForm<{
    email: string;
    password: string;
  }>({
    fields: [{ name: 'email' }, { name: 'password' }],
    onSubmit: async ({ email, password }) => {
      const { error: signInError } = await signIn.email({ email, password });
      if (signInError) {
        return {
          error:
            signInError.code === 'INVALID_EMAIL_OR_PASSWORD'
              ? 'Invalid email or password.'
              : 'Something went wrong. Try again.',
        };
      }
      await refetchSession();
      const from = (location.state as { from?: string } | null)?.from ?? '/games';
      navigate(from, { replace: true });
    },
  });

  return (
    <div>
      <h1 className="text-2xl font-semibold text-apex-ink">Welcome back</h1>
      <p className="mt-2 text-sm text-apex-muted">Sign in to your Apex account.</p>

      {error && (
        <div className="mt-6 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="mt-8 space-y-4">
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
          {fieldErrors.email && <p className="mt-1 text-xs text-red-600">{fieldErrors.email}</p>}
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
          {fieldErrors.password && (
            <p className="mt-1 text-xs text-red-600">{fieldErrors.password}</p>
          )}
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
