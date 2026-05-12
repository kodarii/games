import { Icon } from '@/components/icons';
import { AppHeader } from '@/components/layout/app-header';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { SettingsNav } from './settings-nav';

export function SettingsLayout() {
  const [navOpen, setNavOpen] = useState(false);
  return (
    <div className="flex h-full min-h-0 flex-1 flex-col">
      <AppHeader>
        <Sheet open={navOpen} onOpenChange={setNavOpen}>
          <SheetTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-apex-ink-3 hover:text-apex-ink md:hidden"
              aria-label="Otwórz menu ustawień"
            >
              <Icon.rows size={14} />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-[260px] bg-white p-0 pt-4">
            <SheetTitle className="sr-only">Menu ustawień</SheetTitle>
            <SheetDescription className="sr-only">Sekcje strony ustawień</SheetDescription>
            <SettingsNav onNavigate={() => setNavOpen(false)} />
          </SheetContent>
        </Sheet>
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
