import * as React from 'react';
import { cn } from '@/lib/utils';

export const inputClass =
  'w-full rounded-[7px] border border-apex-line-1 bg-white px-[11px] py-[8px] font-sans text-[13px] text-apex-ink outline-none transition-[border-color,box-shadow] placeholder:text-apex-hint focus:border-apex-accent focus:shadow-[0_0_0_3px_rgba(79,110,247,0.1)] disabled:cursor-not-allowed disabled:opacity-50';

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, type, ...props }, ref) => (
    <input ref={ref} type={type} className={cn(inputClass, className)} {...props} />
  ),
);
Input.displayName = 'Input';
