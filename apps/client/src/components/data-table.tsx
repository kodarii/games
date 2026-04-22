import { Icon } from '@/components/icons';
import { cn } from '@/lib/utils';
import { type Table, flexRender } from '@tanstack/react-table';

declare module '@tanstack/react-table' {
  interface ColumnMeta<TData, TValue> {
    minWidth?: number;
    cellClassName?: string;
    headerClassName?: string;
  }
}

export function DataTable<T>({ table }: { table: Table<T> }) {
  return (
    <table className="w-full border-collapse">
      <thead>
        {table.getHeaderGroups().map((hg) => (
          <tr key={hg.id}>
            {hg.headers.map((header, i) => {
              const meta = header.column.columnDef.meta;
              const canSort = header.column.getCanSort();
              const sorted = header.column.getIsSorted();
              const isFirst = i === 0;
              const isLast = i === hg.headers.length - 1;
              return (
                <th
                  key={header.id}
                  style={meta?.minWidth ? { minWidth: meta.minWidth } : undefined}
                  className={cn(
                    'sticky top-0 z-[1] whitespace-nowrap bg-apex-surface-head px-3 py-[10px] text-left text-[12px] font-medium text-apex-muted',
                    isFirst && 'rounded-tl-[8px]',
                    isLast && 'rounded-tr-[8px]',
                    meta?.headerClassName,
                  )}
                >
                  {header.isPlaceholder ? null : canSort ? (
                    <button
                      type="button"
                      onClick={header.column.getToggleSortingHandler()}
                      className="inline-flex cursor-pointer items-center gap-[3px] bg-transparent text-inherit transition-colors hover:text-apex-ink-2"
                    >
                      {flexRender(header.column.columnDef.header, header.getContext())}
                      <SortIndicator state={sorted} />
                    </button>
                  ) : (
                    flexRender(header.column.columnDef.header, header.getContext())
                  )}
                </th>
              );
            })}
          </tr>
        ))}
      </thead>
      <tbody>
        {table.getRowModel().rows.map((row) => {
          const isSelected = row.getIsSelected();
          return (
            <tr
              key={row.id}
              className={cn(
                'border-b border-apex-line-5 transition-colors last:border-b-0',
                isSelected ? 'bg-apex-row' : 'hover:bg-apex-row-hover',
              )}
            >
              {row.getVisibleCells().map((cell) => {
                const meta = cell.column.columnDef.meta;
                return (
                  <td
                    key={cell.id}
                    className={cn('px-3 py-[14px] align-middle', meta?.cellClassName)}
                  >
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                );
              })}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function SortIndicator({ state }: { state: false | 'asc' | 'desc' }) {
  if (state === 'asc') return <Icon.chevup size={10} />;
  if (state === 'desc') return <Icon.chevdown size={10} />;
  return <Icon.sort size={10} />;
}
