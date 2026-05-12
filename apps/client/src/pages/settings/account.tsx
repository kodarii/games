import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useSession } from '@/lib/auth-client';
import { AccountPasswordForm } from './account-password-form';

export function AccountPage() {
  const { data: session } = useSession();
  const user = session?.user;
  if (!user) return null;

  return (
    <div className="mx-auto w-full max-w-[720px] space-y-6 px-8 py-8">
      <h2 className="text-2xl font-semibold text-apex-ink">Konto</h2>
      <ProfileCard email={user.email} name={user.name ?? null} />
      <AccountPasswordForm />
    </div>
  );
}

function ProfileCard({ email, name }: { email: string; name: string | null }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-semibold text-apex-ink">Profil</CardTitle>
      </CardHeader>
      <CardContent>
        <dl className="grid grid-cols-[120px_1fr] gap-y-2 text-sm">
          <dt className="text-apex-muted">Email</dt>
          <dd className="text-apex-ink">{email}</dd>
          {name && (
            <>
              <dt className="text-apex-muted">Nazwa</dt>
              <dd className="text-apex-ink">{name}</dd>
            </>
          )}
        </dl>
      </CardContent>
    </Card>
  );
}
