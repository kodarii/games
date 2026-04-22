import { cn } from '@/lib/utils';
import { type VariantProps, cva } from 'class-variance-authority';
import { forwardRef } from 'react';

const iconButton = cva(
  'inline-flex items-center justify-center transition-colors disabled:cursor-default [&_svg]:block',
  {
    variants: {
      variant: {
        ghost:
          'h-[30px] w-[30px] rounded-[6px] bg-transparent text-apex-ink-6 hover:bg-apex-surface-hover',
        'ghost-sm':
          'h-7 w-7 rounded-[5px] bg-transparent text-apex-idle hover:bg-apex-line-5 hover:text-apex-ink-5',
        elevated:
          'h-8 w-8 rounded-[8px] bg-white text-apex-ink-5 shadow-apex-1 transition-shadow hover:shadow-apex-2',
      },
    },
    defaultVariants: { variant: 'ghost' },
  },
);

export type IconButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof iconButton>;

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { className, variant, type = 'button', ...props },
  ref,
) {
  return (
    <button ref={ref} type={type} className={cn(iconButton({ variant }), className)} {...props} />
  );
});
