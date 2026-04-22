import { cn } from '@/lib/utils';
import type { ReactNode } from 'react';

export type PageHeaderProps = {
  icon: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
};

export function PageHeader({ icon, title, description, actions, className }: PageHeaderProps) {
  return (
    <header
      className={cn('flex min-h-[64px] items-center gap-3 bg-white px-6 pb-[10px] pt-4', className)}
    >
      <span className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-[10px] bg-white text-apex-ink-4 shadow-apex-1">
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-[15px] font-bold leading-[1.25] text-apex-ink">{title}</div>
        {description && (
          <div className="mt-[1px] text-[12px] leading-[1.4] text-apex-muted">{description}</div>
        )}
      </div>
      {actions && <div className="ml-auto flex items-center">{actions}</div>}
    </header>
  );
}
