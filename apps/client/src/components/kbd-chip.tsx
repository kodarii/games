import { cn } from '@/lib/utils';
import type { ReactNode } from 'react';

export function KbdChip({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        'whitespace-nowrap rounded-[4px] border border-apex-line-3 bg-apex-surface-chip px-[5px] py-[1px] text-[10px] text-apex-kbd',
        className,
      )}
    >
      {children}
    </span>
  );
}
