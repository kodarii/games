import { DataTable } from '@/components/data-table';
import { FilterButton } from '@/components/filter-button';
import { IconButton } from '@/components/icon-button';
import { Icon } from '@/components/icons';
import { InfiniteScrollFooter } from '@/components/infinite-scroll-footer';
import { PageHeader } from '@/components/page-header';
import { SearchInput } from '@/components/search-input';
import { Toolbar, ToolbarSpacer } from '@/components/toolbar';
import { Button } from '@/components/ui/button';
import { useGamesListState } from '@/lib/games-list-state';
import { useInfiniteGamesQuery } from '@/lib/queries';
import type { Game } from '@/types';
import { type RowSelectionState, getCoreRowModel, useReactTable } from '@tanstack/react-table';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { gamesColumns } from './games-columns';

const PER_PAGE = 7;

export function GamesPage() {
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const { search, sort, dir, sorting, onSortingChange, searchInput, setSearchInput } =
    useGamesListState();

  const { data, isLoading, hasNextPage, isFetchingNextPage, fetchNextPage } = useInfiniteGamesQuery(
    {
      search,
      perPage: PER_PAGE,
      sort,
      dir: sort ? dir : undefined,
    },
  );

  const items = useMemo(() => data?.pages.flatMap((p) => p.items) ?? [], [data]);

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
      <PageHeader
        icon={<Icon.gamepad size={22} />}
        title="Games"
        description="Track your games library across every platform."
        actions={
          <IconButton aria-label="Notifications">
            <Icon.bell size={18} />
          </IconButton>
        }
      />

      <Toolbar>
        <FilterButton>All Platforms</FilterButton>
        <FilterButton>All Statuses</FilterButton>
        <ToolbarSpacer />
        <SearchInput
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          shortcut="⌘1"
          containerClassName="w-[220px]"
        />
        <IconButton variant="elevated" aria-label="Settings">
          <Icon.gear size={14} />
        </IconButton>
        <Button variant="primary" size="sm" className="ml-3" asChild>
          <Link to="/games/new">
            <Icon.plus size={14} />
            Add game
          </Link>
        </Button>
      </Toolbar>

      <div className="scroll-thin flex-1 overflow-y-auto bg-white px-5 pb-4 pt-1">
        <div className="overflow-hidden rounded-[12px] border border-apex-line-1 bg-white">
          <div className="overflow-hidden px-3 pt-3">
            <DataTable table={table} />
          </div>
          <InfiniteScrollFooter
            isLoading={isLoading}
            isFetchingNextPage={isFetchingNextPage}
            hasNextPage={hasNextPage}
            itemCount={items.length}
            emptyLabel="No games found."
            onLoadMore={() => fetchNextPage()}
          />
        </div>
      </div>
    </>
  );
}
