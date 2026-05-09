import { DataTable } from '@/components/data-table';
import { GamesEmptyState } from '@/components/games-empty-state';
import { GamesFilters } from '@/components/games-filters';
import { GamesSort } from '@/components/games-sort';
import { Icon } from '@/components/icons';
import { InfiniteScrollFooter } from '@/components/infinite-scroll-footer';
import { AppHeader } from '@/components/layout/app-header';
import { SearchInput } from '@/components/search-input';
import { Button } from '@/components/ui/button';
import { ViewModeToggle } from '@/components/view-mode-toggle';
import { useGamesListState } from '@/lib/games-list-state';
import { useInfiniteGamesQuery } from '@/lib/queries';
import { useUrlState } from '@/lib/url-state';
import { type Game, RELEASE_YEAR_DEFAULT_FROM, RELEASE_YEAR_DEFAULT_TO } from '@/types';
import { type RowSelectionState, getCoreRowModel, useReactTable } from '@tanstack/react-table';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { gamesColumns } from './games-columns';
import { GamesGrid } from './games-grid';
import { GamesMobileList } from './games-mobile-list';

const PER_PAGE = 10;

export function GamesPage() {
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('list');
  const {
    search,
    sort,
    dir,
    sorting,
    onSortingChange,
    searchInput,
    setSearchInput,
    filters,
    setFilters,
    resetFilters,
    activeFilterCount,
  } = useGamesListState();
  const { update: updateUrl } = useUrlState();
  const navigate = useNavigate();

  const { data, isLoading, hasNextPage, isFetchingNextPage, fetchNextPage } = useInfiniteGamesQuery(
    {
      search,
      perPage: PER_PAGE,
      sort,
      dir: sort ? dir : undefined,
      platforms: filters.platforms.length ? filters.platforms : undefined,
      formats: filters.formats.length ? filters.formats : undefined,
      releaseYearFrom:
        filters.releaseYearFrom !== RELEASE_YEAR_DEFAULT_FROM ? filters.releaseYearFrom : undefined,
      releaseYearTo:
        filters.releaseYearTo !== RELEASE_YEAR_DEFAULT_TO ? filters.releaseYearTo : undefined,
    },
  );

  const items = useMemo(() => data?.pages.flatMap((p) => p.items) ?? [], [data]);
  const totalCount = data?.pages[0]?.total ?? 0;

  const table = useReactTable<Game>({
    data: items,
    columns: gamesColumns,
    state: { sorting, rowSelection },
    onSortingChange,
    onRowSelectionChange: setRowSelection,
    manualSorting: true,
    getCoreRowModel: getCoreRowModel(),
    getRowId: (row) => String(row.id),
  });

  return (
    <>
      {/* Page header: title + primary action */}
      <AppHeader>
        <div className="flex flex-1 shrink-0 items-center gap-[10px]">
          <span className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-[8px] bg-apex-ink text-white">
            <Icon.gamepad size={15} className="text-white" />
          </span>
          <span className="text-[15px] font-bold text-apex-ink">Games</span>
          {data && (
            <span className="flex h-[20px] min-w-[20px] items-center justify-center rounded-full bg-apex-surface-head px-[6px] text-[11px] font-semibold text-apex-muted">
              {totalCount}
            </span>
          )}
        </div>

        <Button variant="primary" size="sm" onClick={() => updateUrl({ add: '1' })}>
          <Icon.plus size={13} />
          Add game
        </Button>
      </AppHeader>

      {/* Toolbar: filter / sort / search / view mode */}
      <div className="flex shrink-0 items-center gap-2 border-b border-apex-line-3 bg-white px-4 py-2.5 lg:px-5">
        <GamesFilters
          filters={filters}
          activeFilterCount={activeFilterCount}
          onChange={setFilters}
          onReset={resetFilters}
        />
        <GamesSort
          sort={sort}
          dir={dir}
          onChange={(s, d) => updateUrl({ sort: s ?? null, dir: s ? d : null })}
        />
        <SearchInput
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          onClear={() => setSearchInput('')}
          placeholder="Search games..."
          containerClassName="min-w-0 flex-1 md:max-w-[420px]"
        />
        <div className="ml-auto hidden md:flex">
          <ViewModeToggle value={viewMode} onChange={setViewMode} />
        </div>
      </div>

      {/* Table */}
      <div className="scroll-thin flex-1 overflow-y-auto bg-[#fafafa] px-5 pb-4 pt-4">
        {items.length === 0 && !isLoading && activeFilterCount > 0 ? (
          <GamesEmptyState onReset={resetFilters} />
        ) : (
          <>
            {/* Mobile: always expandable cards */}
            <div className="md:hidden">
              <GamesMobileList items={items} />
            </div>

            {/* Desktop: grid or list unchanged */}
            <div className="hidden md:block">
              {viewMode === 'grid' ? (
                <GamesGrid items={items} />
              ) : (
                <DataTable
                  table={table}
                  variant="cards"
                  onRowClick={(row) => navigate(`/games/${row.original.id}`)}
                />
              )}
            </div>
            <InfiniteScrollFooter
              isLoading={isLoading}
              isFetchingNextPage={isFetchingNextPage}
              hasNextPage={hasNextPage}
              itemCount={items.length}
              emptyLabel="No games found."
              onLoadMore={() => fetchNextPage()}
            />
          </>
        )}
      </div>
    </>
  );
}
