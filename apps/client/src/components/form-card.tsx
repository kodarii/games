import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export function FormCard({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        'overflow-hidden rounded-[12px] border border-apex-line-1 bg-white',
        className,
      )}
    >
      {children}
    </div>
  );
}

export function FormSection({
  title,
  description,
  children,
  className,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn('border-b border-apex-line-5 px-6 py-5 last:border-b-0', className)}>
      <h3 className="mb-1 text-[13px] font-semibold text-apex-ink">{title}</h3>
      {description && <p className="mb-4 text-[11.5px] text-apex-muted">{description}</p>}
      {children}
    </section>
  );
}
