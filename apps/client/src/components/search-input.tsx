import { Icon } from '@/components/icons';
import { KbdChip } from '@/components/kbd-chip';
import { cn } from '@/lib/utils';
import { forwardRef } from 'react';

export type SearchInputProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size'> & {
  shortcut?: string;
  containerClassName?: string;
};

export const SearchInput = forwardRef<HTMLInputElement, SearchInputProps>(function SearchInput(
  { shortcut, containerClassName, className, placeholder = 'Search...', ...props },
  ref,
) {
  return (
    <div
      className={cn(
        'flex items-center gap-[6px] rounded-[7px] border border-apex-line-2 bg-white px-[10px] py-[6px] focus-within:border-apex-ink-6',
        containerClassName,
      )}
    >
      <Icon.search size={13} className="text-apex-hint" />
      <input
        ref={ref}
        placeholder={placeholder}
        className={cn(
          'flex-1 border-none bg-transparent text-[12.5px] text-apex-ink-2 outline-none placeholder:text-apex-hint',
          className,
        )}
        {...props}
      />
      {shortcut && <KbdChip>{shortcut}</KbdChip>}
    </div>
  );
});
