import { Icon } from '@/components/icons';
import { cn } from '@/lib/utils';
import type { ReactNode } from 'react';

export type PaginationProps = {
  page: number;
  totalPages: number;
  onPageChange: (p: number) => void;
  perPage?: number;
  onPerPageClick?: () => void;
  className?: string;
};

function pageNumbers(current: number, total: number): (number | '...')[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  if (current <= 4) return [1, 2, 3, 4, 5, '...', total];
  if (current >= total - 3) return [1, '...', total - 4, total - 3, total - 2, total - 1, total];
  return [1, '...', current - 1, current, current + 1, '...', total];
}

export function Pagination({
  page,
  totalPages,
  onPageChange,
  perPage,
  onPerPageClick,
  className,
}: PaginationProps) {
  const goto = (p: number) => onPageChange(Math.min(totalPages, Math.max(1, p)));
  const nums = pageNumbers(page, totalPages);

  return (
    <div
      className={cn(
        'relative flex h-11 min-h-[44px] items-center gap-1 border-t border-apex-line-4 bg-white px-5 text-[12px] text-apex-ink-6',
        className,
      )}
    >
      <span className="flex-1">
        Page {page} of {totalPages}
      </span>
      <div className="absolute left-1/2 flex -translate-x-1/2 items-center gap-[2px]">
        <PgBtn onClick={() => goto(1)} disabled={page === 1}>
          <Icon.pgfirst size={12} />
        </PgBtn>
        <PgBtn onClick={() => goto(page - 1)} disabled={page === 1}>
          <Icon.pgprev size={12} />
        </PgBtn>
        {nums.map((n, i) =>
          n === '...' ? (
            <span
              /* biome-ignore lint/suspicious/noArrayIndexKey: ellipsis is positional */
              key={`dots-${i}`}
              className="px-[3px] text-[12px] text-apex-faint"
            >
              ...
            </span>
          ) : (
            <PgBtn key={n} onClick={() => goto(n)} active={page === n}>
              {n}
            </PgBtn>
          ),
        )}
        <PgBtn onClick={() => goto(page + 1)} disabled={page === totalPages}>
          <Icon.pgnext size={12} />
        </PgBtn>
        <PgBtn onClick={() => goto(totalPages)} disabled={page === totalPages}>
          <Icon.pglast size={12} />
        </PgBtn>
      </div>
      {perPage !== undefined && (
        <button
          type="button"
          onClick={onPerPageClick}
          className="ml-[14px] flex items-center gap-1 rounded-[5px] border border-apex-line-2 bg-white px-2 py-[3px] text-[12px] text-apex-ink-4 transition-colors hover:bg-apex-surface-hover2"
        >
          {perPage} / page <Icon.chevdown size={10} />
        </button>
      )}
    </div>
  );
}

function PgBtn({
  children,
  onClick,
  disabled,
  active,
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'flex h-[27px] w-[27px] items-center justify-center rounded-[5px] bg-transparent text-[12px] text-apex-ink-3 transition-colors',
        !disabled && !active && 'hover:bg-apex-line-5',
        active && 'bg-apex-ink text-white',
        disabled && 'cursor-default text-apex-disabled',
      )}
    >
      {children}
    </button>
  );
}
