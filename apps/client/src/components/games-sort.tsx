import { FilterButton } from '@/components/filter-button';
import { Icon } from '@/components/icons';
import { useIsMobile } from '@/hooks/use-mobile';
import { cn } from '@/lib/utils';
import type { GameSortField, SortDir } from '@/types';
import * as Popover from '@radix-ui/react-popover';
import { ArrowDownNarrowWide } from 'lucide-react';
import { forwardRef, useState } from 'react';
import { Drawer } from 'vaul';

interface Props {
  sort?: GameSortField;
  dir: SortDir;
  onChange: (sort: GameSortField | undefined, dir: SortDir) => void;
}

const FIELDS: Array<{ id: GameSortField; label: string }> = [
  { id: 'title', label: 'Title' },
  { id: 'releaseYear', label: 'Release year' },
  { id: 'platform', label: 'Platform' },
  { id: 'format', label: 'Format' },
  { id: 'status', label: 'Status' },
  { id: 'hoursPlayed', label: 'Hours played' },
  { id: 'genre', label: 'Genre' },
];

function SortBody({ sort, dir, onChange }: Props) {
  const onClick = (field: GameSortField) => {
    if (sort !== field) {
      onChange(field, 'asc');
      return;
    }
    if (dir === 'asc') {
      onChange(field, 'desc');
      return;
    }
    onChange(undefined, 'asc');
  };

  return (
    <div className="flex flex-col">
      {FIELDS.map((f) => {
        const active = sort === f.id;
        return (
          <button
            key={f.id}
            type="button"
            onClick={() => onClick(f.id)}
            className={cn(
              'w-full flex items-center justify-between px-3 py-2 text-[13px] rounded-[6px]',
              'hover:bg-apex-surface-hover2 transition-colors',
              active && 'text-blue-600',
            )}
          >
            <span>{f.label}</span>
            {active && (
              <Icon.chevup
                size={12}
                className={cn('transition-transform', dir === 'desc' && 'rotate-180')}
              />
            )}
          </button>
        );
      })}
    </div>
  );
}

const SortTrigger = forwardRef<
  HTMLButtonElement,
  { sort?: GameSortField } & React.ButtonHTMLAttributes<HTMLButtonElement>
>(function SortTrigger({ sort, ...rest }, ref) {
  return (
    <FilterButton
      ref={ref}
      {...rest}
      chevron={false}
      aria-label="Sort"
      className={cn(
        'h-9 w-9 justify-center px-0 md:h-auto md:w-auto md:px-[11px]',
        sort && 'border-blue-500 text-blue-600 hover:bg-blue-50/50',
      )}
    >
      <ArrowDownNarrowWide size={14} className="shrink-0" />
      <span className="hidden md:inline">Sort</span>
    </FilterButton>
  );
});

export function GamesSort(props: Props) {
  const isMobile = useIsMobile();
  const [open, setOpen] = useState(false);

  if (isMobile) {
    return (
      <Drawer.Root open={open} onOpenChange={setOpen}>
        <Drawer.Trigger asChild>
          <SortTrigger sort={props.sort} />
        </Drawer.Trigger>
        <Drawer.Portal>
          <Drawer.Overlay className="fixed inset-0 bg-black/40 z-40" />
          <Drawer.Content className="fixed inset-x-0 bottom-0 z-50 mt-24 flex max-h-[85vh] w-full max-w-full flex-col overflow-hidden rounded-t-[12px] border-t border-apex-line-2 bg-white p-3 outline-none box-border">
            <Drawer.Title className="sr-only">Sort</Drawer.Title>
            <div className="mx-auto mb-3 h-1.5 w-12 flex-shrink-0 rounded-full bg-apex-line-2" />
            <SortBody {...props} />
          </Drawer.Content>
        </Drawer.Portal>
      </Drawer.Root>
    );
  }

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <SortTrigger sort={props.sort} />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="start"
          sideOffset={8}
          className="w-[220px] p-2 bg-white rounded-[10px] shadow-md border border-apex-line-2 z-50"
        >
          <SortBody {...props} />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
