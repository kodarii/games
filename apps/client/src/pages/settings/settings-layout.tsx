import { Icon } from '@/components/icons';
import { AppHeader } from '@/components/layout/app-header';
import { Outlet } from 'react-router-dom';
import { SettingsNav } from './settings-nav';

export function SettingsLayout() {
  return (
    <div className="flex h-full min-h-0 flex-1 flex-col">
      <AppHeader>
        <span className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-[8px] bg-apex-ink text-white">
          <Icon.settings size={15} className="text-white" />
        </span>
        <span className="text-[15px] font-bold text-apex-ink">Ustawienia</span>
      </AppHeader>
      <div className="flex min-h-0 flex-1">
        <aside className="hidden w-[220px] shrink-0 border-r border-apex-line-4 py-4 md:block">
          <SettingsNav />
        </aside>
        <div className="min-w-0 flex-1 overflow-y-auto">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
