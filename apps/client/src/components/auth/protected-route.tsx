import { useSession } from '@/lib/auth-client';
import { Navigate, Outlet, useLocation } from 'react-router-dom';

export function ProtectedRoute() {
  const { data: session, isPending } = useSession();
  const location = useLocation();

  if (isPending) {
    return (
      <div className="flex h-screen w-screen items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-apex-line-3 border-t-apex-ink" />
      </div>
    );
  }

  if (!session?.user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  return <Outlet />;
}
