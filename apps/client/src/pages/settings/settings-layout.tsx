import { Outlet } from 'react-router-dom';
import { SettingsNav } from './settings-nav';

export function SettingsLayout() {
  return (
    <div className="flex h-full min-h-0 flex-1">
      <aside className="w-[220px] shrink-0 border-r border-apex-line-4 py-4">
        <SettingsNav />
      </aside>
      <div className="min-w-0 flex-1 overflow-y-auto">
        <Outlet />
      </div>
    </div>
  );
}
