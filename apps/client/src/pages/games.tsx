import { DataTable } from '@/components/data-table';
import { FilterButton } from '@/components/filter-button';
import { IconButton } from '@/components/icon-button';
import { Icon } from '@/components/icons';
import { PageHeader } from '@/components/page-header';
import { Pagination } from '@/components/pagination';
import { SearchInput } from '@/components/search-input';
import { StatusBadge, type StatusVariant } from '@/components/status-badge';
import { Toolbar, ToolbarSpacer } from '@/components/toolbar';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { avatarColor, initials } from '@/lib/avatar';
import type { Game, GameStatus, GamesResponse } from '@/types';
import {
  type PaginationState,
  type RowSelectionState,
  type SortingState,
  createColumnHelper,
  getCoreRowModel,
  useReactTable,
} from '@tanstack/react-table';
import { useEffect, useState } from 'react';

const columnHelper = createColumnHelper<Game>();

function statusFor(s: GameStatus): { variant: StatusVariant; label: string } {
  switch (s) {
    case 'Playing':
      return { variant: 'progress', label: 'Playing' };
    case 'Wishlist':
      return { variant: 'info', label: 'Wishlist' };
    case 'Backlog':
      return { variant: 'pending', label: 'Backlog' };
    case 'Completed':
      return { variant: 'done', label: 'Completed' };
    case 'Dropped':
      return { variant: 'inactive', label: 'Dropped' };
  }
}

const columns = [
  columnHelper.display({
    id: 'select',
    header: ({ table }) => {
      const all = table.getIsAllRowsSelected();
      const some = table.getIsSomeRowsSelected();
      return (
        <Checkbox
          checked={all ? true : some ? 'indeterminate' : false}
          onCheckedChange={(v) => table.toggleAllRowsSelected(v === true)}
          aria-label="Select all"
        />
      );
    },
    cell: ({ row }) => (
      <Checkbox
        checked={row.getIsSelected()}
        onCheckedChange={(v) => row.toggleSelected(v === true)}
        aria-label={`Select ${row.original.title}`}
      />
    ),
    enableSorting: false,
    meta: {
      cellClassName: 'w-10 pl-5 pr-3',
      headerClassName: 'px-[14px]',
    },
  }),
  columnHelper.accessor('title', {
    header: 'Title',
    cell: ({ row }) => (
      <div className="flex items-center gap-[11px]">
        <div
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[13px] font-semibold text-white"
          style={{ background: avatarColor(row.original.title) }}
        >
          {initials(row.original.title)}
        </div>
        <div>
          <div className="text-[13.5px] font-semibold leading-[1.35] text-apex-ink">
            {row.original.title}
          </div>
          <div className="text-[11.5px] leading-[1.35] text-apex-faint">
            {row.original.developer}
          </div>
        </div>
      </div>
    ),
    meta: { minWidth: 260 },
  }),
  columnHelper.accessor('genre', {
    header: 'Genre',
    cell: ({ row }) => (
      <>
        <div className="text-[13px] leading-[1.35] text-apex-ink">{row.original.genre}</div>
        <div className="text-[11.5px] leading-[1.35] text-apex-faint">
          Released {row.original.releaseYear}
        </div>
      </>
    ),
    meta: { minWidth: 160 },
  }),
  columnHelper.accessor('platform', {
    header: 'Platform',
    cell: ({ row }) => (
      <>
        <div className="text-[13px] font-semibold leading-[1.35] text-apex-ink">
          {row.original.platform}
        </div>
        {row.original.edition && (
          <div className="text-[11.5px] leading-[1.35] text-apex-faint">{row.original.edition}</div>
        )}
      </>
    ),
    meta: { minWidth: 140 },
  }),
  columnHelper.accessor('status', {
    header: 'Status',
    cell: ({ row }) => <StatusBadge {...statusFor(row.original.status)} />,
    meta: { minWidth: 140 },
  }),
  columnHelper.display({
    id: 'actions',
    header: '',
    cell: () => (
      <IconButton variant="ghost-sm" aria-label="Row actions">
        <Icon.more size={14} />
      </IconButton>
    ),
    enableSorting: false,
    meta: { cellClassName: 'px-2' },
  }),
];

const EMPTY: GamesResponse = { items: [], page: 1, perPage: 7, total: 0, totalPages: 1 };

export function GamesPage() {
  const [pagination, setPagination] = useState<PaginationState>({ pageIndex: 0, pageSize: 7 });
  const [sorting, setSorting] = useState<SortingState>([]);
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [search, setSearch] = useState('');
  const [data, setData] = useState<GamesResponse>(EMPTY);

  useEffect(() => {
    const params = new URLSearchParams({
      page: String(pagination.pageIndex + 1),
      perPage: String(pagination.pageSize),
      search,
    });
    const sort = sorting[0];
    if (sort) {
      params.set('sort', sort.id);
      params.set('dir', sort.desc ? 'desc' : 'asc');
    }
    let cancelled = false;
    fetch(`/api/games?${params}`)
      .then((r) => {
        if (!r.ok) throw new Error(`games request failed: ${r.status}`);
        return r.json() as Promise<GamesResponse>;
      })
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch((err) => console.error(err));
    return () => {
      cancelled = true;
    };
  }, [pagination, sorting, search]);

  const table = useReactTable<Game>({
    data: data.items,
    columns,
    state: { pagination, sorting, rowSelection },
    onPaginationChange: setPagination,
    onSortingChange: setSorting,
    onRowSelectionChange: setRowSelection,
    manualPagination: true,
    manualSorting: true,
    rowCount: data.total,
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
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPagination((p) => ({ ...p, pageIndex: 0 }));
          }}
          shortcut="⌘1"
          containerClassName="w-[220px]"
        />
        <IconButton variant="elevated" aria-label="Settings">
          <Icon.gear size={14} />
        </IconButton>
        <Button variant="primary" size="sm" className="ml-3">
          <Icon.plus size={14} />
          Add game
        </Button>
      </Toolbar>

      <div className="scroll-thin flex-1 overflow-y-auto bg-white px-5 pb-4 pt-1">
        <div className="overflow-hidden rounded-[12px] border border-apex-line-1 bg-white">
          <div className="overflow-hidden px-3 pt-3">
            <DataTable table={table} />
          </div>
          <Pagination
            page={pagination.pageIndex + 1}
            totalPages={data.totalPages}
            onPageChange={(p) => setPagination((prev) => ({ ...prev, pageIndex: p - 1 }))}
            perPage={pagination.pageSize}
          />
        </div>
      </div>
    </>
  );
}