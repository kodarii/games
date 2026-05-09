import { cn } from '@/lib/utils';

export interface PillToggleProps {
  selected: boolean;
  onToggle: () => void;
  children: React.ReactNode;
  title?: string;
  disabled?: boolean;
}

export function PillToggle({ selected, onToggle, children, title, disabled }: PillToggleProps) {
  return (
    <button
      type="button"
      // biome-ignore lint/a11y/useSemanticElements: pill UI is a button-shaped checkbox by design
      role="checkbox"
      aria-checked={selected}
      disabled={disabled}
      onClick={onToggle}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onToggle();
        }
      }}
      title={title}
      className={cn(
        'inline-flex items-center px-[11px] py-[6px] rounded-[7px] text-[12.5px]',
        'transition-colors active:scale-[0.97] cursor-pointer max-w-[200px] truncate',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40',
        selected
          ? 'border border-blue-500 bg-blue-50 text-blue-600'
          : 'border border-apex-line-2 bg-white text-apex-ink-2 hover:bg-apex-surface-hover2',
        disabled && 'opacity-50 cursor-not-allowed',
      )}
    >
      {children}
    </button>
  );
}
