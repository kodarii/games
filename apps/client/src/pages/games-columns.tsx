import { Avatar } from '@/components/avatar';
import { StatusBadge } from '@/components/status-badge';
import { statusFor } from '@/lib/game-status';
import type { Game } from '@/types';
import { createColumnHelper } from '@tanstack/react-table';
import { Link } from 'react-router-dom';

const columnHelper = createColumnHelper<Game>();

export const gamesColumns = [
  columnHelper.accessor('title', {
    header: 'Title',
    cell: ({ row }) => (
      <div className="flex items-center gap-[11px]">
        <Avatar
          shape="rect"
          size={40}
          name={row.original.title}
          color={row.original.coverColor}
        />
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
  columnHelper.accessor('platform', {
    header: 'Platform',
    cell: ({ row }) => (
      <span className="text-[13px] text-apex-ink">{row.original.platform}</span>
    ),
    meta: { minWidth: 120 },
  }),
  columnHelper.accessor('format', {
    header: 'Format',
    cell: ({ row }) => (
      <span className="text-[13px] text-apex-ink">
        {row.original.format === 'physical' ? 'Physical' : 'Digital'}
      </span>
    ),
    meta: { minWidth: 110 },
  }),
  columnHelper.display({
    id: 'price',
    header: 'Price',
    cell: () => <span className="text-[13px] text-apex-hint">—</span>,
    enableSorting: false,
    meta: { minWidth: 100 },
  }),
  // columnHelper.accessor('status', {
  //   header: 'Status',
  //   cell: ({ row }) => <StatusBadge {...statusFor(row.original.status)} />,
  //   meta: { minWidth: 140 },
  // }),
];
