import {
  GAME_FORMATS,
  GAME_SORT_FIELDS,
  type GameFilters,
  type GameFormat,
  type GameSortField,
  RELEASE_YEAR_DEFAULT_FROM,
  RELEASE_YEAR_DEFAULT_TO,
  type SortDir,
} from '@/types';
import type { OnChangeFn, SortingState } from '@tanstack/react-table';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useDebouncedValue } from './debounce';
import { useUrlState } from './url-state';

const SEARCH_DEBOUNCE_MS = 300;

function isSortField(v: string | null): v is GameSortField {
  return v != null && (GAME_SORT_FIELDS as readonly string[]).includes(v);
}

function parseFormats(values: string[]): GameFormat[] {
  return values.filter((x): x is GameFormat => (GAME_FORMATS as readonly string[]).includes(x));
}

function parseYear(v: string | null, fallback: number): number {
  const n = v ? Number(v) : Number.NaN;
  return Number.isInteger(n) && n >= 1958 && n <= 2100 ? n : fallback;
}

export function useGamesListState() {
  const { get, getAll, update } = useUrlState();

  const search = get('search') ?? '';
  const sortRaw = get('sort');
  const dirRaw = get('dir');
  const sort = isSortField(sortRaw) ? sortRaw : undefined;
  const dir: SortDir = dirRaw === 'desc' ? 'desc' : 'asc';

  const sorting = useMemo<SortingState>(
    () => (sort ? [{ id: sort, desc: dir === 'desc' }] : []),
    [sort, dir],
  );

  const onSortingChange: OnChangeFn<SortingState> = (updater) => {
    const next = typeof updater === 'function' ? updater(sorting) : updater;
    const first = next[0];
    if (first && isSortField(first.id)) {
      update({ sort: first.id, dir: first.desc ? 'desc' : 'asc' });
    } else {
      update({ sort: null, dir: null });
    }
  };

  const [searchInput, setSearchInput] = useState(search);
  const debouncedInput = useDebouncedValue(searchInput, SEARCH_DEBOUNCE_MS);

  useEffect(() => {
    setSearchInput(search);
  }, [search]);

  useEffect(() => {
    if (debouncedInput === search) return;
    update({ search: debouncedInput || null }, { replace: true });
  }, [debouncedInput, search, update]);

  const filters = useMemo<GameFilters>(
    () => ({
      platforms: getAll('platforms'),
      formats: parseFormats(getAll('formats')),
      releaseYearFrom: parseYear(get('releaseYearFrom'), RELEASE_YEAR_DEFAULT_FROM),
      releaseYearTo: parseYear(get('releaseYearTo'), RELEASE_YEAR_DEFAULT_TO),
    }),
    [get, getAll],
  );

  const activeFilterCount = useMemo(() => {
    let n = filters.platforms.length + filters.formats.length;
    if (
      filters.releaseYearFrom !== RELEASE_YEAR_DEFAULT_FROM ||
      filters.releaseYearTo !== RELEASE_YEAR_DEFAULT_TO
    ) {
      n += 1;
    }
    return n;
  }, [filters]);

  const setFilters = useCallback(
    (patch: Partial<GameFilters>) => {
      const next = { ...filters, ...patch };
      update({
        platforms: next.platforms.length ? next.platforms : null,
        formats: next.formats.length ? next.formats : null,
        releaseYearFrom:
          next.releaseYearFrom === RELEASE_YEAR_DEFAULT_FROM ? null : String(next.releaseYearFrom),
        releaseYearTo:
          next.releaseYearTo === RELEASE_YEAR_DEFAULT_TO ? null : String(next.releaseYearTo),
      });
    },
    [filters, update],
  );

  const resetFilters = useCallback(() => {
    update({ platforms: null, formats: null, releaseYearFrom: null, releaseYearTo: null });
  }, [update]);

  return {
    search,
    sort,
    dir,
    sorting,
    onSortingChange,
    searchInput,
    setSearchInput,
    filters,
    setFilters,
    resetFilters,
    activeFilterCount,
  };
}
