# Games Filter & Sort — Faza 6: Frontend State (URL state + queries)

## Goal
Rozszerz `useGamesListState` o filtry (`platforms`, `formats`, `releaseYearRange`) trzymane w URL. Rozszerz `useInfiniteGamesQuery` / `useInfiniteWishlistQuery` o nowe parametry. Dodaj `AbortController.signal` do `queryFn` (anulowanie in-flight requestów). Dodaj selektor `activeFilterCount` do badge'a.

## Definition of Done
- [ ] `apps/client/src/lib/games-list-state.ts` zwraca `filters`, `setFilters`, `resetFilters`, `activeFilterCount`
- [ ] URL params: **repeated params** dla `platforms` i `formats` (`?platforms=PC&platforms=PS5`, NIE CSV); `releaseYearFrom`, `releaseYearTo` jako pojedyncze
- [ ] `useUrlState` musi obsługiwać array values (jeśli obecne API tego nie wspiera — rozszerz, patrz Step 1.5)
- [ ] `apps/client/src/lib/queries.ts` — `InfiniteGamesParams` ma nowe pola; `queryFn` używa `signal`
- [ ] `apps/client/src/types.ts` — eksport typów dla filterów (`GameFilters`)
- [ ] `bun run --cwd apps/client typecheck` zielone
- [ ] `bun run lint` zielone

Agent kończy pracę WYŁĄCZNIE gdy powyższe są spełnione.

## Context
**Runtime:** Bun (`bun run`, NIE npm)
**Stack:** React 18 + react-router-dom v6 + TanStack Query v5
**URL state:** `useUrlState` z `apps/client/src/lib/url-state.ts` — funkcje `get(key)` i `update(updates)`

### Step 0: Pobierz dokumentację
Użyj Context7:
- TanStack Query v5: "infinite query queryFn signal AbortController"
- TanStack Query v5: "queryKey invalidation, structural sharing"
- react-router-dom v6: "useSearchParams stable callbacks"

## Design decisions
- Filtry serializowane do URL jako **repeated params** (`?platforms=PC&platforms=PS5`), zgodnie z API kontraktem z Fazy 5. Powód: nazwy platform mogą zawierać przecinek (user-defined), więc CSV byłby footgunem. `formats` jest enumem bez przecinków, ale dla spójności też repeated.
- Defaultowy zakres lat na UI: 2000–2030. Jeśli user nie zmienił — NIE zapisuj `releaseYearFrom`/`releaseYearTo` do URL (czysty URL, brak filtra na backendzie).
- `activeFilterCount` = liczba selected platforms + liczba selected formats + (1 jeśli zakres lat odbiega od defaultu). Używane do badge'a na trigerze.
- Filtry **wspólne** dla `/games` i `/wishlist` (ten sam hook). Każda strona ma swój URL → state per-route automatycznie.
- React Query queryKey zawiera filtry → automatyczna invalidacja przy zmianie. Dodatkowo `signal` w queryFn anuluje stale request.
- `setFilters` przyjmuje partial update: `setFilters({ platforms: [...] })` aktualizuje tylko platforms, reszta zachowana.

### Relevant files (edit only these)
- `apps/client/src/lib/url-state.ts` — rozszerzenie o `getAll(key)` + array-aware `update` (patrz Step 1.5)
- `apps/client/src/lib/games-list-state.ts`
- `apps/client/src/lib/queries.ts`
- `apps/client/src/lib/api.ts` — funkcja `fetchGames` musi przyjąć `signal`
- `apps/client/src/types.ts` — eksport typu `GameFilters`

### Files to read but NOT edit
- `apps/client/src/lib/debounce.ts` — istniejący `useDebouncedValue`

## Constraints
- NIE rób fetch w hooku `useGamesListState` — hook tylko URL state. Fetch w `useInfiniteGamesQuery`.
- NIE serializuj `releaseYearRange` jako JSON do URL. Płaskie `from`, `to` jako liczby.
- Default range (2000–2030) — gdy user kliknie reset, czyść z URL (NIE ustawiaj na default values w URL — zostaw `null`).
- `setFilters` musi być stabilną funkcją (`useCallback`) — żeby React Query nie re-fetchował niepotrzebnie.
- Filtruj nieznane wartości przy parsowaniu URL: jeśli URL ma `formats=xyz`, a `xyz` nie jest w `GAME_FORMATS` — pomiń. Defensive parsing.
- **NIE używaj CSV (`split(',')`)** ani na write (`join(',')`) ani na read. URL kontrakt = repeated params, więc `searchParams.getAll('platforms')` na read i `appendAll`-style na write.

## Steps

### Step 1: Rozszerz types.ts
**Co robimy:**
1. Edytuj `apps/client/src/types.ts`. Dodaj:
   ```ts
   export const RELEASE_YEAR_DEFAULT_FROM = 2000;
   export const RELEASE_YEAR_DEFAULT_TO = 2030;

   export interface GameFilters {
     platforms: string[];
     formats: GameFormat[];
     releaseYearFrom: number;
     releaseYearTo: number;
   }
   ```

**Rezultat:** typy gotowe.

### Step 1.5: Rozszerz `useUrlState` o array-aware API
**Co robimy:**
1. Edytuj `apps/client/src/lib/url-state.ts`:
   ```ts
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
             next.delete(key);                              // always wipe before set/append
             if (value == null) continue;
             if (Array.isArray(value)) {
               for (const v of value) next.append(key, v);  // repeated params
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
   ```
2. **Konsumenci pojedyncze-string** (search, sort, dir itd.) działają bez zmian — sygnatura `string | null` nadal akceptowana. Sprawdź `grep -rn "useUrlState\|update({" apps/client/src/` że nikt nie polega na nieusuwaniu klucza przed setem (komentarz: teraz zawsze `delete` przed `set`/`append`).

**Rezultat:** `useUrlState` natywnie wspiera arrays; istniejący kod kompiluje się bez zmian.

### Step 2: Rozszerz useGamesListState
**Co robimy:**
1. Edytuj `apps/client/src/lib/games-list-state.ts`. Po istniejącym `sort/dir/searchInput` dodaj parsowanie filtrów. **Używaj `getAll`, NIE CSV:**
   ```ts
   import {
     GAME_FORMATS,
     type GameFilters,
     type GameFormat,
     RELEASE_YEAR_DEFAULT_FROM,
     RELEASE_YEAR_DEFAULT_TO,
   } from '@/types';

   function parseFormats(values: string[]): GameFormat[] {
     return values.filter((x): x is GameFormat =>
       (GAME_FORMATS as readonly string[]).includes(x),
     );
   }
   function parseYear(v: string | null, fallback: number): number {
     const n = v ? Number(v) : NaN;
     return Number.isInteger(n) && n >= 1958 && n <= 2100 ? n : fallback;
   }
   ```
2. W hooku oblicz `filters` (zauważ `getAll` z rozszerzonego `useUrlState`):
   ```ts
   const { get, getAll, update } = useUrlState();

   const filters = useMemo<GameFilters>(
     () => ({
       platforms: getAll('platforms'),                    // string[] z repeated params
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
     ) n += 1;
     return n;
   }, [filters]);

   const setFilters = useCallback(
     (patch: Partial<GameFilters>) => {
       const next = { ...filters, ...patch };
       update({
         platforms: next.platforms.length ? next.platforms : null,           // string[] | null
         formats: next.formats.length ? next.formats : null,                 // string[] | null
         releaseYearFrom:
           next.releaseYearFrom === RELEASE_YEAR_DEFAULT_FROM
             ? null
             : String(next.releaseYearFrom),
         releaseYearTo:
           next.releaseYearTo === RELEASE_YEAR_DEFAULT_TO ? null : String(next.releaseYearTo),
       });
     },
     [filters, update],
   );

   const resetFilters = useCallback(() => {
     update({ platforms: null, formats: null, releaseYearFrom: null, releaseYearTo: null });
   }, [update]);
   ```
3. Zwróć z hooka: `filters, setFilters, resetFilters, activeFilterCount` obok istniejących pól.

**Rezultat:** hook zwraca filtry + akcje, URL state spójne, repeated params natywne.

### Step 3: Rozszerz queries.ts + api.ts
**Co robimy:**
1. Edytuj `apps/client/src/lib/api.ts`. Funkcja `fetchGames(sp: URLSearchParams, signal?: AbortSignal)` — dorzuć `signal` do `fetch(...)`.
2. Edytuj `apps/client/src/lib/queries.ts`:
   ```ts
   export type InfiniteGamesParams = {
     search: string;
     perPage: number;
     sort?: GameSortField;
     dir?: SortDir;
     platforms?: string[];
     formats?: GameFormat[];
     releaseYearFrom?: number;
     releaseYearTo?: number;
   };
   ```
   W `useInfiniteGamesQuery` i `useInfiniteWishlistQuery` — **repeated params, NIE CSV**:
   ```ts
   queryFn: ({ pageParam, signal }): Promise<GamesResponse> => {
     const sp = new URLSearchParams({
       page: String(pageParam),
       perPage: String(params.perPage),
       search: params.search,
       kind: 'owned', // or 'wishlist'
     });
     if (params.sort) { sp.set('sort', params.sort); sp.set('dir', params.dir ?? 'asc'); }
     if (params.platforms?.length) {
       for (const p of params.platforms) sp.append('platforms', p);
     }
     if (params.formats?.length) {
       for (const f of params.formats) sp.append('formats', f);
     }
     if (params.releaseYearFrom != null) sp.set('releaseYearFrom', String(params.releaseYearFrom));
     if (params.releaseYearTo != null) sp.set('releaseYearTo', String(params.releaseYearTo));
     return fetchGames(sp, signal);
   },
   ```
3. Pamiętaj — domyślne wartości `releaseYearFrom/To` (2000/2030) NIE powinny lecieć do URL/API gdy są równe defaultowi. Caller (GamesPage) przekazuje albo wartość różną od default, albo `undefined`. Logika "skip if default" jest w GamesPage (Faza 8) — tutaj queries.ts po prostu serializuje to co dostanie.

**Rezultat:** queries akceptują filtry, AbortController signal działa.

### Step 4: Sanity check
**Co robimy:**
1. `bun run --cwd apps/client typecheck` — zielone
2. `bun run lint` — zielone
3. Aplikacja startuje (`bun run dev:client` przez chwilę, sprawdź console — brak runtime errors)

**Rezultat:** zero regresji.

## If you get stuck
Jeśli po 2 próbach coś nie działa: ZATRZYMAJ się. Napisz:
`STUCK at Step <N>: <co, jaki błąd, jaka hipoteza>`
Zakończ pracę.
