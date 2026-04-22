import { Icon } from '@/components/icons';
import { cn } from '@/lib/utils';
import { forwardRef } from 'react';

export type FilterButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  chevron?: boolean;
};

export const FilterButton = forwardRef<HTMLButtonElement, FilterButtonProps>(function FilterButton(
  { children, className, type = 'button', chevron = true, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cn(
        'inline-flex items-center gap-[5px] whitespace-nowrap rounded-[7px] border border-apex-line-2 bg-white px-[11px] py-[6px] text-[12.5px] text-apex-ink-2 transition-colors hover:bg-apex-surface-hover2',
        className,
      )}
      {...props}
    >
      {children}
      {chevron && <Icon.chevdown size={11} />}
    </button>
  );
});
