import { IconButton } from '@/components/icon-button';
import { Icon } from '@/components/icons';
import type { Developer } from '@/types';
import { type RowData, createColumnHelper } from '@tanstack/react-table';

declare module '@tanstack/react-table' {
  interface TableMeta<TData extends RowData> {
    onDeleteDeveloper?: (developer: Developer) => void;
  }
}

const col = createColumnHelper<Developer>();

export const developersColumns = [
  col.accessor('name', {
    header: 'Name',
    enableSorting: true,
    cell: ({ row }) => (
      <span className="text-[13px] font-medium text-apex-ink">{row.original.name}</span>
    ),
    meta: { minWidth: 260 },
  }),
  col.display({
    id: 'actions',
    header: '',
    enableSorting: false,
    cell: ({ table, row }) => (
      <div className="flex justify-end">
        <IconButton
          variant="ghost-sm"
          aria-label="Delete developer"
          onClick={(e) => {
            e.stopPropagation();
            table.options.meta?.onDeleteDeveloper?.(row.original);
          }}
        >
          <Icon.trash size={14} />
        </IconButton>
      </div>
    ),
    meta: { minWidth: 60 },
  }),
];
