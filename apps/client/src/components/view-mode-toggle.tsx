import { cn } from '@/lib/utils';
import { LayoutGrid, List } from 'lucide-react';

export type ViewMode = 'grid' | 'list';

interface Props {
  value: ViewMode;
  onChange: (mode: ViewMode) => void;
  className?: string;
}

export function ViewModeToggle({ value, onChange, className }: Props) {
  return (
    <div
      className={cn(
        'flex shrink-0 overflow-hidden rounded-[7px] border border-apex-line-2 bg-white',
        className,
      )}
      role="radiogroup"
      aria-label="View mode"
    >
      <ViewModeButton
        active={value === 'list'}
        onClick={() => onChange('list')}
        label="List view"
      >
        <List size={14} />
      </ViewModeButton>
      <ViewModeButton
        active={value === 'grid'}
        onClick={() => onChange('grid')}
        label="Grid view"
      >
        <LayoutGrid size={14} />
      </ViewModeButton>
    </div>
  );
}

function ViewModeButton({
  active,
  onClick,
  label,
  children,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      aria-label={label}
      title={label}
      onClick={onClick}
      className={cn(
        'flex h-9 w-9 items-center justify-center transition-colors',
        active
          ? 'bg-apex-surface-head text-apex-ink'
          : 'bg-white text-apex-hint hover:bg-apex-surface-hover2 hover:text-apex-ink-2',
      )}
    >
      {children}
    </button>
  );
}
