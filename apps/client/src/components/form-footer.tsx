import { cn } from '@/lib/utils';
import type { ReactNode } from 'react';

export function FormFooter({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        'flex items-center justify-end gap-2 border-t border-apex-line-4 bg-white px-6 py-[14px]',
        className,
      )}
    >
      {children}
    </div>
  );
}

export function FormCancelButton({
  children = 'Cancel',
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      {...props}
      className="rounded-[8px] border border-apex-line-1 bg-white px-[18px] py-[8px] text-[13px] font-medium text-apex-ink-4 transition-colors hover:bg-apex-surface-hover disabled:cursor-not-allowed disabled:opacity-50"
    >
      {children}
    </button>
  );
}

export function FormSubmitButton({
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type={props.type ?? 'submit'}
      {...props}
      className="flex items-center gap-[6px] rounded-[8px] bg-apex-accent px-[20px] py-[8px] text-[13px] font-semibold text-white transition-colors hover:bg-apex-accent/90 disabled:cursor-not-allowed disabled:bg-[#a0b0f0]"
    >
      {children}
    </button>
  );
}
