import { Icon } from '@/components/icons';
import { Outlet } from 'react-router-dom';

export function AuthLayout() {
  return (
    <div className="flex min-h-screen w-screen bg-white">
      <aside className="hidden md:flex md:w-1/2 flex-col justify-center bg-apex-ink p-12 text-white">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-white/10">
            <Icon.logoMark size={22} />
          </div>
          <span className="text-xl font-semibold">Apex</span>
        </div>
        <h1 className="mt-12 text-3xl font-semibold leading-tight">Track every game you play.</h1>
        <p className="mt-3 max-w-md text-base text-white/70">
          Your library, your stats — all in one place.
        </p>
      </aside>
      <main className="flex w-full flex-col items-center justify-center px-6 py-12 md:w-1/2">
        <div className="w-full max-w-[420px]">
          <div className="mb-8 flex items-center gap-3 md:hidden">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-apex-ink">
              <Icon.logoMark size={18} />
            </div>
            <span className="text-lg font-semibold text-apex-ink">Apex</span>
          </div>
          <Outlet />
        </div>
      </main>
    </div>
  );
}
