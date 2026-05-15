import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useCredentialsForm } from '@/hooks/use-credentials-form';
import { signUp, useSession } from '@/lib/auth-client';
import { Link, useNavigate } from 'react-router-dom';

export function RegisterPage() {
  const navigate = useNavigate();
  const { refetch: refetchSession } = useSession();

  const { handleSubmit, isPending, error, fieldErrors } = useCredentialsForm<{
    name: string;
    email: string;
    password: string;
    confirmPassword: string;
  }>({
    fields: [
      {
        name: 'name',
        validate: (v) => (v.length === 0 ? 'Name is required.' : null),
      },
      { name: 'email' },
      {
        name: 'password',
        validate: (v) => (v.length < 8 ? 'Password must be at least 8 characters.' : null),
      },
      {
        name: 'confirmPassword',
        validate: (v, all) => (v !== all.password ? 'Passwords do not match.' : null),
      },
    ],
    onSubmit: async ({ name, email, password }) => {
      const { error: signUpError } = await signUp.email({ name, email, password });
      if (signUpError) {
        if (signUpError.code === 'USER_ALREADY_EXISTS') {
          return { fieldErrors: { email: 'This email is already registered.' } };
        }
        return { error: 'Something went wrong. Try again.' };
      }
      await refetchSession();
      navigate('/games', { replace: true });
    },
  });

  return (
    <div>
      <h1 className="text-2xl font-semibold text-apex-ink">Create an account</h1>
      <p className="mt-2 text-sm text-apex-muted">Start tracking your game library.</p>

      {error && (
        <div className="mt-6 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="mt-8 space-y-4">
        <div>
          <label htmlFor="name" className="text-sm font-medium text-apex-ink">
            Name
          </label>
          <Input id="name" name="name" type="text" required autoComplete="name" className="mt-1" />
          {fieldErrors.name && <p className="mt-1 text-xs text-red-600">{fieldErrors.name}</p>}
        </div>
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
            autoComplete="new-password"
            className="mt-1"
          />
          {fieldErrors.password && (
            <p className="mt-1 text-xs text-red-600">{fieldErrors.password}</p>
          )}
        </div>
        <div>
          <label htmlFor="confirmPassword" className="text-sm font-medium text-apex-ink">
            Confirm password
          </label>
          <Input
            id="confirmPassword"
            name="confirmPassword"
            type="password"
            required
            autoComplete="new-password"
            className="mt-1"
          />
          {fieldErrors.confirmPassword && (
            <p className="mt-1 text-xs text-red-600">{fieldErrors.confirmPassword}</p>
          )}
        </div>
        <Button type="submit" className="mt-6 w-full" disabled={isPending}>
          {isPending ? 'Creating account…' : 'Create account'}
        </Button>
      </form>

      <p className="mt-4 text-center text-sm text-apex-muted">
        Already have an account?{' '}
        <Link to="/login" className="font-medium text-apex-accent hover:underline">
          Sign in
        </Link>
      </p>
    </div>
  );
}
