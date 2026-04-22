import { Outlet } from 'react-router-dom';
import { Sidebar } from './sidebar';

export function AppLayout() {
  return (
    <div className="flex h-screen w-screen overflow-hidden bg-white">
      <Sidebar />
      <main className="flex min-w-0 flex-1 flex-col overflow-hidden bg-white">
        <Outlet />
      </main>
    </div>
  );
}
