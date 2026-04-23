import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export function FormField({
  label,
  required,
  hint,
  htmlFor,
  children,
  className,
}: {
  label?: string;
  required?: boolean;
  hint?: string;
  htmlFor?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col gap-[5px]', className)}>
      {label && (
        <label htmlFor={htmlFor} className="text-[12px] font-medium text-apex-ink-2">
          {label}
          {required && (
            <span className="ml-[2px] text-apex-status-inactive" aria-hidden>
              *
            </span>
          )}
        </label>
      )}
      {children}
      {hint && <div className="mt-[2px] text-[11px] text-apex-faint">{hint}</div>}
    </div>
  );
}

export function FormFieldRow({
  cols = 1,
  children,
  className,
}: {
  cols?: 1 | 2 | 3;
  children: ReactNode;
  className?: string;
}) {
  const grid =
    cols === 1 ? 'grid-cols-1' : cols === 2 ? 'grid-cols-2' : 'grid-cols-3';
  return (
    <div className={cn('mb-[14px] grid gap-[14px] last:mb-0', grid, className)}>{children}</div>
  );
}
