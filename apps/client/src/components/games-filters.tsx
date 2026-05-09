import { FilterButton } from '@/components/filter-button';
import { PillToggle } from '@/components/pill-toggle';
import { Button } from '@/components/ui/button';
import { YearRangeSlider } from '@/components/year-range-slider';
import { useIsMobile } from '@/hooks/use-mobile';
import { usePlatformsQuery } from '@/lib/queries';
import { cn } from '@/lib/utils';
import {
  GAME_FORMATS,
  type GameFilters,
  type GameFormat,
  RELEASE_YEAR_DEFAULT_FROM,
  RELEASE_YEAR_DEFAULT_TO,
} from '@/types';
import * as Popover from '@radix-ui/react-popover';
import { ListFilter, RotateCcw } from 'lucide-react';
import { forwardRef, useState } from 'react';
import { Drawer } from 'vaul';

interface Props {
  filters: GameFilters;
  activeFilterCount: number;
  onChange: (patch: Partial<GameFilters>) => void;
  onReset: () => void;
}

const YEAR_MIN = RELEASE_YEAR_DEFAULT_FROM;
const YEAR_MAX = RELEASE_YEAR_DEFAULT_TO;

function FiltersBody({ filters, activeFilterCount, onChange, onReset }: Props) {
  const platformsQuery = usePlatformsQuery();

  const togglePlatform = (name: string) => {
    const exists = filters.platforms.includes(name);
    const next = exists
      ? filters.platforms.filter((p) => p !== name)
      : [...filters.platforms, name];
    onChange({ platforms: next });
  };

  const toggleFormat = (f: GameFormat) => {
    const exists = filters.formats.includes(f);
    const next = exists ? filters.formats.filter((x) => x !== f) : [...filters.formats, f];
    onChange({ formats: next });
  };

  return (
    <div className="flex min-w-0 flex-col gap-5">
      <div className="flex min-w-0 items-center justify-between gap-2">
        <span className="text-[15px] font-semibold text-apex-ink">Filters</span>
        {activeFilterCount > 0 && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onReset}
            className="-mr-2 h-7 gap-1.5 px-2 text-[12px] text-apex-ink-2 hover:text-apex-ink"
          >
            <RotateCcw className="!size-3.5" />
            Reset all
          </Button>
        )}
      </div>

      <section>
        <div className="text-[10.5px] font-semibold uppercase tracking-wider text-apex-muted mb-2">
          Platform
        </div>
        <div className="flex flex-wrap gap-2">
          {platformsQuery.isLoading
            ? [0, 1, 2].map((i) => (
                <span
                  key={i}
                  className="h-[28px] w-[80px] rounded-[7px] bg-apex-surface-head animate-pulse"
                />
              ))
            : (platformsQuery.data ?? []).map((p) => (
                <PillToggle
                  key={p.id}
                  selected={filters.platforms.includes(p.name)}
                  onToggle={() => togglePlatform(p.name)}
                  title={p.name}
                >
                  {p.name}
                </PillToggle>
              ))}
        </div>
      </section>

      <section>
        <div className="text-[10.5px] font-semibold uppercase tracking-wider text-apex-muted mb-2">
          Format
        </div>
        <div className="flex flex-wrap gap-2">
          {GAME_FORMATS.map((f) => (
            <PillToggle
              key={f}
              selected={filters.formats.includes(f)}
              onToggle={() => toggleFormat(f)}
            >
              {f === 'digital' ? 'Digital' : 'Physical'}
            </PillToggle>
          ))}
        </div>
      </section>

      <section>
        <div className="text-[10.5px] font-semibold uppercase tracking-wider text-apex-muted mb-2">
          Release year
        </div>
        <YearRangeSlider
          min={YEAR_MIN}
          max={YEAR_MAX}
          value={[filters.releaseYearFrom, filters.releaseYearTo]}
          onCommit={([from, to]) => onChange({ releaseYearFrom: from, releaseYearTo: to })}
        />
      </section>
    </div>
  );
}

const FiltersTrigger = forwardRef<
  HTMLButtonElement,
  { activeFilterCount: number } & React.ButtonHTMLAttributes<HTMLButtonElement>
>(function FiltersTrigger({ activeFilterCount, ...rest }, ref) {
  return (
    <FilterButton
      ref={ref}
      {...rest}
      chevron={false}
      aria-label={
        activeFilterCount > 0 ? `Filter (${activeFilterCount} active)` : 'Filter'
      }
      className={cn(
        'relative h-9 w-9 justify-center px-0 md:h-auto md:w-auto md:px-[11px]',
        activeFilterCount > 0 && 'border-blue-500 text-blue-600 hover:bg-blue-50/50',
      )}
    >
      <ListFilter size={14} className="shrink-0" />
      <span className="hidden md:inline">Filter</span>
      {activeFilterCount > 0 && (
        <span
          className={cn(
            'inline-flex items-center justify-center rounded-full bg-blue-500 font-semibold text-white animate-in zoom-in-50 duration-200',
            'absolute -top-1.5 -right-1.5 h-[16px] min-w-[16px] px-1 text-[10px] leading-none ring-2 ring-white',
            'md:static md:ml-1 md:h-[18px] md:min-w-[18px] md:px-[5px] md:text-[11px] md:ring-0',
          )}
        >
          {activeFilterCount}
        </span>
      )}
    </FilterButton>
  );
});

export function GamesFilters(props: Props) {
  const isMobile = useIsMobile();
  const [open, setOpen] = useState(false);

  if (isMobile) {
    return (
      <Drawer.Root open={open} onOpenChange={setOpen}>
        <Drawer.Trigger asChild>
          <FiltersTrigger activeFilterCount={props.activeFilterCount} />
        </Drawer.Trigger>
        <Drawer.Portal>
          <Drawer.Overlay className="fixed inset-0 bg-black/40 z-40" />
          <Drawer.Content className="fixed inset-x-0 bottom-0 z-50 mt-24 flex max-h-[85vh] w-full max-w-full flex-col overflow-hidden rounded-t-[12px] border-t border-apex-line-2 bg-white p-5 outline-none box-border">
            <Drawer.Title className="sr-only">Filters</Drawer.Title>
            <div className="mx-auto mb-4 h-1.5 w-12 flex-shrink-0 rounded-full bg-apex-line-2" />
            <div className="min-w-0 overflow-y-auto overflow-x-hidden">
              <FiltersBody {...props} />
            </div>
          </Drawer.Content>
        </Drawer.Portal>
      </Drawer.Root>
    );
  }

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <FiltersTrigger activeFilterCount={props.activeFilterCount} />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="start"
          sideOffset={8}
          className="w-[420px] max-h-[80vh] overflow-y-auto p-5 bg-white rounded-[10px] shadow-md border border-apex-line-2 z-50"
        >
          <FiltersBody {...props} />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
