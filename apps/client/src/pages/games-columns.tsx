import { Avatar } from '@/components/avatar';
import { IconButton } from '@/components/icon-button';
import { Icon } from '@/components/icons';
import { StatusBadge } from '@/components/status-badge';
import { Checkbox } from '@/components/ui/checkbox';
import { statusFor } from '@/lib/game-status';
import type { Game } from '@/types';
import { createColumnHelper } from '@tanstack/react-table';
import { Link } from 'react-router-dom';

const columnHelper = createColumnHelper<Game>();

export const gamesColumns = [
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
        <Avatar shape="rect" size={40} name={row.original.title} />
        <div>
          <Link
            to={`/games/${row.original.id}`}
            className="text-[13.5px] font-semibold leading-[1.35] text-apex-ink transition-colors hover:text-apex-accent"
          >
            {row.original.title}
          </Link>
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
