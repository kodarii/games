import { Icon } from '@/components/icons';
import { KbdChip } from '@/components/kbd-chip';
import { cn } from '@/lib/utils';
import { X } from 'lucide-react';
import { forwardRef } from 'react';

export type SearchInputProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size'> & {
  shortcut?: string;
  containerClassName?: string;
  onClear?: () => void;
};

export const SearchInput = forwardRef<HTMLInputElement, SearchInputProps>(function SearchInput(
  { shortcut, containerClassName, className, placeholder = 'Search...', value, onClear, ...props },
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
        value={value}
        placeholder={placeholder}
        className={cn(
          'flex-1 border-none bg-transparent text-[12.5px] text-apex-ink-2 outline-none placeholder:text-apex-hint',
          className,
        )}
        {...props}
      />
      {onClear && value ? (
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={onClear}
          className="flex shrink-0 items-center text-apex-hint hover:text-apex-ink-2"
          aria-label="Clear search"
        >
          <X size={13} />
        </button>
      ) : shortcut ? (
        <KbdChip>{shortcut}</KbdChip>
      ) : null}
    </div>
  );
});
