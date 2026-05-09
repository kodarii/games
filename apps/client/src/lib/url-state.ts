import { useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';

type UrlUpdates = Record<string, string | string[] | null>;
type UpdateOptions = { replace?: boolean };

export function useUrlState() {
  const [searchParams, setSearchParams] = useSearchParams();

  const get = useCallback((key: string) => searchParams.get(key), [searchParams]);
  const getAll = useCallback((key: string) => searchParams.getAll(key), [searchParams]);

  const update = useCallback(
    (updates: UrlUpdates, options?: UpdateOptions) => {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        for (const [key, value] of Object.entries(updates)) {
          next.delete(key);
          if (value == null) continue;
          if (Array.isArray(value)) {
            for (const v of value) next.append(key, v);
          } else {
            next.set(key, value);
          }
        }
        return next;
      }, options);
    },
    [setSearchParams],
  );

  return { searchParams, get, getAll, update };
}
