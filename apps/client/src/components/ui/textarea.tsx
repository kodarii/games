import * as React from 'react';
import { cn } from '@/lib/utils';
import { inputClass } from './input';

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...props }, ref) => (
    <textarea
      ref={ref}
      className={cn(inputClass, 'resize-none leading-[1.5]', className)}
      {...props}
    />
  ),
);
Textarea.displayName = 'Textarea';
