import { useEffect, useRef } from 'react';

type Props = {
  onIntersect: () => void;
  enabled: boolean;
  rootMargin?: string;
};

export function InfiniteScrollSentinel({ onIntersect, enabled, rootMargin = '0px' }: Props) {
  const ref = useRef<HTMLDivElement | null>(null);
  const onIntersectRef = useRef(onIntersect);

  useEffect(() => {
    onIntersectRef.current = onIntersect;
  }, [onIntersect]);

  useEffect(() => {
    const el = ref.current;
    if (!el || !enabled) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            onIntersectRef.current();
            break;
          }
        }
      },
      { rootMargin },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [enabled, rootMargin]);

  return <div ref={ref} aria-hidden="true" className="h-px w-full" />;
}
