import type { ReactNode } from 'react';
import { InfiniteScrollSentinel } from './infinite-scroll-sentinel';

type Props = {
  isLoading: boolean;
  isFetchingNextPage: boolean;
  hasNextPage: boolean;
  itemCount: number;
  emptyLabel: string;
  loadingLabel?: string;
  endLabel?: string;
  onLoadMore: () => void;
};

export function InfiniteScrollFooter({
  isLoading,
  isFetchingNextPage,
  hasNextPage,
  itemCount,
  emptyLabel,
  loadingLabel = 'Loading…',
  endLabel = 'End of list',
  onLoadMore,
}: Props) {
  if (isLoading) return <FooterBar>{loadingLabel}</FooterBar>;
  if (itemCount === 0) return <FooterBar>{emptyLabel}</FooterBar>;
  return (
    <>
      <InfiniteScrollSentinel
        enabled={hasNextPage && !isFetchingNextPage}
        onIntersect={onLoadMore}
        rootMargin="200px"
      />
      {isFetchingNextPage && <FooterBar>{loadingLabel}</FooterBar>}
      {!isFetchingNextPage && !hasNextPage && <FooterBar>{endLabel}</FooterBar>}
    </>
  );
}

function FooterBar({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-11 min-h-[44px] items-center justify-center bg-white text-[12px] text-apex-faint">
      {children}
    </div>
  );
}
