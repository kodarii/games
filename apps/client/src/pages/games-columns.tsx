import { Avatar } from '@/components/avatar';
import { formatPriceZl } from '@/lib/money';
import type { Game } from '@/types';
import { createColumnHelper } from '@tanstack/react-table';

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
          src={row.original.coverImage}
        />
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
  columnHelper.accessor('price', {
    header: 'Price',
    cell: ({ row }) => (
      <span className="text-[13px] text-apex-ink tabular-nums">
        {row.original.price != null
          ? formatPriceZl(row.original.price)
          : <span className="text-apex-hint">—</span>}
      </span>
    ),
    meta: { minWidth: 110 },
  }),
  columnHelper.accessor('releaseYear', {
    header: 'Release Year',
    cell: ({ row }) => (
      <span className="text-[13px] text-apex-ink">
        {row.original.releaseYear ?? <span className="text-apex-hint">—</span>}
      </span>
    ),
    meta: { minWidth: 110 },
  }),
  // columnHelper.accessor('status', {
  //   header: 'Status',
  //   cell: ({ row }) => <StatusBadge {...statusFor(row.original.status)} />,
  //   meta: { minWidth: 140 },
  // }),
];
