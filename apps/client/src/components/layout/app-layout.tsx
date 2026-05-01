import { AddGameDialog } from '@/components/add-game-dialog';
import { SidebarProvider } from '@/components/ui/sidebar';
import { Outlet } from 'react-router-dom';
import { Sidebar } from './sidebar';

export function AppLayout() {
  return (
    <SidebarProvider
      defaultOpen={true}
      className="flex h-screen w-screen overflow-hidden bg-white"
    >
      <Sidebar />
      <main className="flex min-w-0 flex-1 flex-col overflow-hidden bg-white">
        <Outlet />
      </main>
      <AddGameDialog />
    </SidebarProvider>
  );
}
