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

type Variant = 'default' | 'cards';

export function DataTable<T>({
  table,
  variant = 'default',
}: {
  table: Table<T>;
  variant?: Variant;
}) {
  if (variant === 'cards') {
    return <CardsTable table={table} />;
  }
  return <DefaultTable table={table} />;
}

function DefaultTable<T>({ table }: { table: Table<T> }) {
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
                    'sticky top-0 z-[1] whitespace-nowrap bg-apex-surface-head px-3 py-[10px] text-left text-[11px] font-semibold uppercase tracking-[0.06em] text-apex-muted',
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

function CardsTable<T>({ table }: { table: Table<T> }) {
  return (
    <table className="w-full border-separate border-spacing-x-0 border-spacing-y-2">
      <thead>
        {table.getHeaderGroups().map((hg) => (
          <tr key={hg.id}>
            {hg.headers.map((header) => {
              const meta = header.column.columnDef.meta;
              const canSort = header.column.getCanSort();
              const sorted = header.column.getIsSorted();
              return (
                <th
                  key={header.id}
                  style={meta?.minWidth ? { minWidth: meta.minWidth } : undefined}
                  className={cn(
                    'whitespace-nowrap border-b border-apex-line-3 bg-transparent px-4 pb-3 pt-1 text-left text-[11px] font-semibold uppercase tracking-[0.07em] text-apex-faint',
                    meta?.headerClassName,
                  )}
                >
                  {header.isPlaceholder ? null : canSort ? (
                    <button
                      type="button"
                      onClick={header.column.getToggleSortingHandler()}
                      className="inline-flex cursor-pointer items-center gap-[3px] bg-transparent text-inherit transition-colors hover:text-apex-muted"
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
          const cells = row.getVisibleCells();
          const lastIndex = cells.length - 1;
          return (
            <tr key={row.id} className="group">
              {cells.map((cell, i) => {
                const meta = cell.column.columnDef.meta;
                const isFirst = i === 0;
                const isLast = i === lastIndex;
                return (
                  <td
                    key={cell.id}
                    className={cn(
                      'border-y border-apex-line-3 bg-white px-4 py-[14px] align-middle transition-colors',
                      isFirst && 'rounded-l-[10px] border-l',
                      isLast && 'rounded-r-[10px] border-r',
                      isSelected
                        ? 'bg-apex-row'
                        : 'group-hover:bg-apex-surface-hover2',
                      meta?.cellClassName,
                    )}
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
