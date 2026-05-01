import { DataTable } from '@/components/data-table';
import { Icon } from '@/components/icons';
import { AppHeader } from '@/components/layout/app-header';
import { InfiniteScrollFooter } from '@/components/infinite-scroll-footer';
import { SearchInput } from '@/components/search-input';
import { Button } from '@/components/ui/button';
import { useGamesListState } from '@/lib/games-list-state';
import { useInfiniteGamesQuery } from '@/lib/queries';
import { useUrlState } from '@/lib/url-state';
import type { Game } from '@/types';
import {
  type RowSelectionState,
  getCoreRowModel,
  useReactTable,
} from '@tanstack/react-table';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { gamesColumns } from './games-columns';
import { GamesGrid } from './games-grid';

const PER_PAGE = 7;

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
  } = useGamesListState();
  const { update: updateUrl } = useUrlState();
  const navigate = useNavigate();

  const { data, isLoading, hasNextPage, isFetchingNextPage, fetchNextPage } =
    useInfiniteGamesQuery({
      search,
      perPage: PER_PAGE,
      sort,
      dir: sort ? dir : undefined,
    });

  const items = useMemo(
    () => data?.pages.flatMap((p) => p.items) ?? [],
    [data],
  );
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
      {/* Top bar */}
      <AppHeader>
        <div className="flex shrink-0 items-center gap-[10px]">
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

        <SearchInput
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder="Search games..."
          containerClassName="w-[220px] lg:w-[300px]"
        />

        <div className="ml-auto flex items-center gap-2">
          <div className="flex overflow-hidden rounded-[7px] border border-[#eee]">
            <button
              type="button"
              onClick={() => setViewMode('list')}
              className="flex h-8 w-8 cursor-pointer items-center justify-center border-none transition-colors"
              style={{ background: viewMode === 'list' ? '#f0f0f0' : '#fff' }}
              aria-label="List view"
              title="List view"
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 14 14"
                fill="none"
                aria-hidden
              >
                <rect
                  x="1"
                  y="2"
                  width="12"
                  height="2.5"
                  rx="1"
                  fill={viewMode === 'list' ? '#333' : '#aaa'}
                />
                <rect
                  x="1"
                  y="5.75"
                  width="12"
                  height="2.5"
                  rx="1"
                  fill={viewMode === 'list' ? '#333' : '#aaa'}
                />
                <rect
                  x="1"
                  y="9.5"
                  width="12"
                  height="2.5"
                  rx="1"
                  fill={viewMode === 'list' ? '#333' : '#aaa'}
                />
              </svg>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('grid')}
              className="flex h-8 w-8 cursor-pointer items-center justify-center border-none transition-colors"
              style={{ background: viewMode === 'grid' ? '#f0f0f0' : '#fff' }}
              aria-label="Grid view"
              title="Grid view"
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 14 14"
                fill="none"
                aria-hidden
              >
                <rect
                  x="1"
                  y="1"
                  width="5"
                  height="5"
                  rx="1"
                  fill={viewMode === 'grid' ? '#333' : '#aaa'}
                />
                <rect
                  x="8"
                  y="1"
                  width="5"
                  height="5"
                  rx="1"
                  fill={viewMode === 'grid' ? '#333' : '#aaa'}
                />
                <rect
                  x="1"
                  y="8"
                  width="5"
                  height="5"
                  rx="1"
                  fill={viewMode === 'grid' ? '#333' : '#aaa'}
                />
                <rect
                  x="8"
                  y="8"
                  width="5"
                  height="5"
                  rx="1"
                  fill={viewMode === 'grid' ? '#333' : '#aaa'}
                />
              </svg>
            </button>
          </div>

          <Button
            variant="primary"
            size="sm"
            onClick={() => updateUrl({ add: '1' })}
          >
            <Icon.plus size={13} />
            Add game
          </Button>
        </div>
      </AppHeader>

      {/* Table */}
      <div className="scroll-thin flex-1 overflow-y-auto bg-[#fafafa] px-5 pb-4 pt-4">
        {viewMode === 'grid' ? (
          <GamesGrid items={items} />
        ) : (
          <DataTable
            table={table}
            variant="cards"
            onRowClick={(row) => navigate(`/games/${row.original.id}`)}
          />
        )}
        <InfiniteScrollFooter
          isLoading={isLoading}
          isFetchingNextPage={isFetchingNextPage}
          hasNextPage={hasNextPage}
          itemCount={items.length}
          emptyLabel="No games found."
          onLoadMore={() => fetchNextPage()}
        />
      </div>
    </>
  );
}
