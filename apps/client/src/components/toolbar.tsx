import { cn } from '@/lib/utils';
import type { ReactNode } from 'react';

export function Toolbar({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn('flex items-center gap-2 bg-white px-6 py-3', className)}>{children}</div>
  );
}

export function ToolbarSpacer() {
  return <div className="flex-1" />;
}
