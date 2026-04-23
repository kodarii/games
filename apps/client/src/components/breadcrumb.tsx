import { Link } from 'react-router-dom';
import { Fragment } from 'react';
import { Icon } from './icons';
import { cn } from '@/lib/utils';

export type BreadcrumbItem = {
  label: string;
  to?: string;
};

export function Breadcrumb({ items, className }: { items: BreadcrumbItem[]; className?: string }) {
  return (
    <nav
      aria-label="Breadcrumb"
      className={cn('flex items-center gap-[6px] px-6 pb-3 text-[12px] text-apex-muted', className)}
    >
      {items.map((item, i) => {
        const isLast = i === items.length - 1;
        return (
          <Fragment key={`${item.label}-${i}`}>
            {item.to && !isLast ? (
              <Link to={item.to} className="text-apex-accent hover:underline">
                {item.label}
              </Link>
            ) : (
              <span aria-current={isLast ? 'page' : undefined}>{item.label}</span>
            )}
            {!isLast && (
              <span className="text-apex-idle" aria-hidden>
                <Icon.chevright size={10} />
              </span>
            )}
          </Fragment>
        );
      })}
    </nav>
  );
}
