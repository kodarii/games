import * as SwitchPrimitives from '@radix-ui/react-switch';
import * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * shadcn/ui `Switch` primitive — Radix `Switch` styled with apex tokens.
 * Default state colors follow the project palette (`apex-accent` on, neutral
 * surface off). Keep the `data-[state=*]` selectors aligned with Radix's
 * actual data attributes — they're stable across versions.
 */
export const Switch = React.forwardRef<
  React.ElementRef<typeof SwitchPrimitives.Root>,
  React.ComponentPropsWithoutRef<typeof SwitchPrimitives.Root>
>(({ className, ...props }, ref) => (
  <SwitchPrimitives.Root
    ref={ref}
    className={cn(
      'peer inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border border-apex-line-1 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-apex-accent/40 focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-apex-accent data-[state=unchecked]:bg-apex-surface-hover',
      className,
    )}
    {...props}
  >
    <SwitchPrimitives.Thumb
      className={cn(
        'pointer-events-none block h-3.5 w-3.5 rounded-full bg-white shadow-sm ring-0 transition-transform data-[state=checked]:translate-x-[18px] data-[state=unchecked]:translate-x-[2px]',
      )}
    />
  </SwitchPrimitives.Root>
));
Switch.displayName = 'Switch';
