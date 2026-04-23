import * as React from 'react';
import { cn } from '@/lib/utils';
import { inputClass } from './input';

const CHEVRON_BG =
  "url(\"data:image/svg+xml,%3Csvg width='12' height='12' viewBox='0 0 12 12' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M2 4.5l4 4 4-4' stroke='%23999' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E\") no-repeat right 10px center";

export const Select = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(
  ({ className, style, children, ...props }, ref) => (
    <select
      ref={ref}
      className={cn(inputClass, 'cursor-pointer appearance-none pr-[30px]', className)}
      style={{ background: `${CHEVRON_BG}, #fff`, ...style }}
      {...props}
    >
      {children}
    </select>
  ),
);
Select.displayName = 'Select';
