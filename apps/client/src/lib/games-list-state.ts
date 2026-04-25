import { GAME_SORT_FIELDS, type GameSortField, type SortDir } from '@/types';
import type { OnChangeFn, SortingState } from '@tanstack/react-table';
import { useEffect, useMemo, useState } from 'react';
import { useDebouncedValue } from './debounce';
import { useUrlState } from './url-state';

const SEARCH_DEBOUNCE_MS = 300;

function isSortField(v: string | null): v is GameSortField {
  return v != null && (GAME_SORT_FIELDS as readonly string[]).includes(v);
}

export function useGamesListState() {
  const { get, update } = useUrlState();

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

  return {
    search,
    sort,
    dir,
    sorting,
    onSortingChange,
    searchInput,
    setSearchInput,
  };
}
