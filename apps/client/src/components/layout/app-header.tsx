import { SidebarTrigger } from '@/components/ui/sidebar';
import { cn } from '@/lib/utils';
import type { ReactNode } from 'react';

export function AppHeader({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn('flex min-h-[63px] shrink-0 flex-wrap items-center gap-x-3 gap-y-2 border-b border-apex-line-3 bg-white px-4 py-3 lg:px-5', className)}>
      <SidebarTrigger className="shrink-0 text-apex-ink-3 hover:text-apex-ink" />
      {children}
    </div>
  );
}
