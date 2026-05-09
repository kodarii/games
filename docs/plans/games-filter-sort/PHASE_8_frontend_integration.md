# Games Filter & Sort — Faza 8: Integracja w GamesPage / WishlistPage + Empty State

## Goal
Wstaw `GamesFilters` i `GamesSort` do nagłówków stron `/games` i `/wishlist`. Połącz z `useGamesListState` i przekaż filtry do `useInfiniteGamesQuery` / `useInfiniteWishlistQuery`. Dodaj empty state „No games match these filters" z CTA „Reset filters". Mountuj `<Toaster />` w app shell.

## Definition of Done
- [ ] `apps/client/src/pages/games.tsx` używa `<GamesFilters />` i `<GamesSort />`
- [ ] `apps/client/src/pages/wishlist.tsx` analogicznie
- [ ] Filtry dochodzą do API (sprawdź w DevTools Network: query params w fetchu, **repeated `?platforms=A&platforms=B`** a NIE CSV)
- [ ] Empty state po filtrowaniu pokazuje CTA „Reset filters"
- [ ] `<Toaster />` mountowany jeden raz w app rooto-wym komponencie
- [ ] `apps/client/src/lib/api.ts` parsuje **nowy** kształt RFC 7807 dla błędów walidacji (czyta `body.detail` / `body.title`, NIE tylko `body.error`)
- [ ] Aplikacja działa na desktop i mobile (manualne sprawdzenie w devtools, `< 768px`)
- [ ] `bun run --cwd apps/client typecheck` zielone
- [ ] `bun run lint` zielone

Agent kończy pracę WYŁĄCZNIE gdy powyższe są spełnione.

## Context
**Runtime:** Bun (`bun run dev:client`, NIE npm)
**Stack:** React + TanStack Query
**State source:** `useGamesListState` (Faza 6) — single source of truth dla filtrów

### Step 0: Pobierz dokumentację
Użyj Context7 (jeśli niejasne):
- TanStack Query v5: "isFetching vs isLoading state, empty list rendering"
- sonner: "Toaster placement in app root"

## Visual spec (empty state)
- Container: `flex flex-col items-center justify-center py-16 gap-3 text-center`
- Icon: filtr/lupa, `size={32}`, `text-apex-muted`
- Tytuł: `text-[15px] font-semibold text-apex-ink`No games match these filters`</span>
- Subtytuł: `text-[13px] text-apex-muted`Showing 0 of {totalCount} games`</span>
- CTA: primary button „Reset filters" — wywołuje `resetFilters()` z hooka

Pokaż TYLKO gdy: `items.length === 0 && !isLoading && activeFilterCount > 0`. Jeśli `activeFilterCount === 0` — pokaż istniejące „No games found" / „Nothing in your wishlist yet".

### Relevant files (edit only these)
- `apps/client/src/pages/games.tsx`
- `apps/client/src/pages/wishlist.tsx`
- `apps/client/src/components/infinite-scroll-footer.tsx` (jeśli empty state idzie tam) LUB nowy `apps/client/src/components/games-empty-state.tsx`
- `apps/client/src/main.tsx` lub `apps/client/src/App.tsx` — gdzie root komponentu app — dodaj `<Toaster />`
- `apps/client/src/lib/api.ts` — punktowo: każde `body?.error ?? ...` w bloku `if (!r.ok)` rozszerz o `body?.detail` jako pierwszą preferencję (patrz Step 0)

### Files to read but NOT edit
- `apps/client/src/components/games-filters.tsx` (Faza 7)
- `apps/client/src/components/games-sort.tsx` (Faza 7)
- `apps/client/src/lib/games-list-state.ts` (Faza 6)
- `apps/client/src/lib/queries.ts` (Faza 6)
- `apps/client/src/components/layout/app-header.tsx` — jak wstawiać dzieci w header

## Constraints
- NIE duplikuj logiki między games.tsx a wishlist.tsx — jeśli widzisz copy-paste, wydziel do `<GamesToolbar />` lub przekaż jako children. **Ale w MVP** akceptujemy lekki copy-paste żeby uniknąć refaktoru — zrób minimalną zmianę.
- Filtry NIE wysyłają wartości default (2000–2030) do API — to robi `setFilters` w hooku z Fazy 6 (zapisuje `null` w URL gdy default). Strona po prostu odczytuje `filters` z hooka.
- Mountuj `<Toaster />` jeden raz globalnie. Jeśli już jest — nie duplikuj.
- Mobile: filtry pokazują się w toolbar też na mobile (drawer-based), NIE `hidden md:flex`. Sprawdzaj `< 768px` w devtools.

## Steps

### Step 0: Adaptuj `apps/client/src/lib/api.ts` do RFC 7807
**Co robimy:**
1. W `apps/client/src/lib/api.ts` API zmieniło kształt błędu walidacji (PHASE_5, Option A). Stare:
   ```json
   { "error": "validation", "issues": [...] }
   ```
   Nowe (dla 400 walidacyjnych):
   ```json
   { "type": "/errors/validation", "title": "Invalid input",
     "status": 400, "detail": "...", "issues": [...] }
   ```
   Błędy NIE-walidacyjne (`name_taken`, `not_found`, `in_use`, 409, 500) zostały w starym kształcie `{ error: '...' }` — to osobny scope.
2. W każdej funkcji `api.ts` w bloku `if (!r.ok)` rozszerz parsowanie message:
   ```ts
   const body = await r.json().catch(() => ({}));
   const message =
     body?.detail ??       // RFC 7807 (nowe walidacje)
     body?.title ??        // RFC 7807 fallback
     body?.error ??        // stary kształt (nie-walidacja)
     `Failed to <verb>: ${r.status}`;
   throw new Error(message);
   ```
3. Tam gdzie kod doczepia `(e as any).body = body` (np. createPlatform) — zostaw, pełne body nadal się przyda dla wyświetlenia listy issues po polu.
4. Sprawdź `apps/client/src/hooks/use-import.ts:67,84` — czyta `result.error.issues[0]`. To jest read po Zod stronie KLIENTA (parse JSON body), NIE serwer. Bez zmian.
5. **NIE migruj** kodu który czyta `body.error === 'name_taken' / 'in_use' / 'not_found'` — te wartości pozostały. Tylko 400 walidacyjne się zmieniły.

**Rezultat:** UI pokazuje sensowny komunikat (`detail` z RFC 7807) gdy POST/PUT zwróci 400.

### Step 1: Mountuj Toaster w app shell
**Co robimy:**
1. Otwórz `apps/client/src/main.tsx`. Znajdź gdzie renderowany jest `<App />` lub `<RouterProvider>`.
2. Owiń lub dodaj obok:
   ```tsx
   import { Toaster } from 'sonner';
   // ...
   <>
     <RouterProvider router={router} />
     <Toaster richColors position="top-center" />
   </>
   ```
3. Sprawdź konsolę przeglądarki — brak błędów hydration / dup mount.

**Rezultat:** `toast.warning(...)` z YearRangeSlider będzie widoczny.

### Step 2: Integracja w games.tsx
**Co robimy:**
1. Edytuj `apps/client/src/pages/games.tsx`. Pobierz nowe pola z hooka:
   ```ts
   const {
     search, sort, dir, sorting, onSortingChange, searchInput, setSearchInput,
     filters, setFilters, resetFilters, activeFilterCount,
   } = useGamesListState();
   ```
2. Przekaż filtry do query:
   ```ts
   const { data, isLoading, hasNextPage, isFetchingNextPage, fetchNextPage } =
     useInfiniteGamesQuery({
       search,
       perPage: PER_PAGE,
       sort,
       dir: sort ? dir : undefined,
       platforms: filters.platforms.length ? filters.platforms : undefined,
       formats: filters.formats.length ? filters.formats : undefined,
       releaseYearFrom:
         filters.releaseYearFrom !== RELEASE_YEAR_DEFAULT_FROM ? filters.releaseYearFrom : undefined,
       releaseYearTo:
         filters.releaseYearTo !== RELEASE_YEAR_DEFAULT_TO ? filters.releaseYearTo : undefined,
     });
   ```
3. W `<AppHeader>` przed `<SearchInput>` wstaw:
   ```tsx
   <div className="flex items-center gap-2">
     <GamesFilters
       filters={filters}
       activeFilterCount={activeFilterCount}
       onChange={setFilters}
       onReset={resetFilters}
     />
     <GamesSort
       sort={sort}
       dir={dir}
       onChange={(s, d) => updateUrl({ sort: s ?? null, dir: s ? d : null })}
     />
   </div>
   ```
4. (`updateUrl` z `useUrlState` już jest w GamesPage. Jeśli nie — pobierz przez `const { update: updateUrl } = useUrlState();`)

**Rezultat:** GamesPage ma filtry + sort, klik na pill zmienia URL i refetchuje.

### Step 3: Empty state z CTA
**Co robimy:**
1. Utwórz `apps/client/src/components/games-empty-state.tsx`:
   ```tsx
   import { Icon } from './icons';
   import { Button } from './ui/button';

   interface Props {
     totalCount: number;
     onReset: () => void;
   }

   export function GamesEmptyState({ totalCount, onReset }: Props) {
     return (
       <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
         <Icon.search size={32} className="text-apex-muted" />
         <div className="text-[15px] font-semibold text-apex-ink">
           No games match these filters
         </div>
         <div className="text-[13px] text-apex-muted">
           Showing 0 of {totalCount} games
         </div>
         <Button variant="primary" size="sm" onClick={onReset} className="mt-2">
           Reset filters
         </Button>
       </div>
     );
   }
   ```
   Jeśli `Icon.search` nie istnieje — użyj innej dostępnej (sprawdź `icons.tsx`).
2. W `games.tsx` warunkowo:
   ```tsx
   {items.length === 0 && !isLoading && activeFilterCount > 0 ? (
     <GamesEmptyState totalCount={/* totalUnfiltered — jeśli nieznany, użyj 'all' lub pomiń number */} onReset={resetFilters} />
   ) : (
     /* istniejący InfiniteScrollFooter + tabela */
   )}
   ```
   - Jeśli nie znamy `totalUnfiltered`, zostaw subtytuł bardziej generyczny: `"Try adjusting your filters"` zamiast `"Showing 0 of N"`.
3. Logika: gdy `activeFilterCount === 0` → existing fallback w `InfiniteScrollFooter` (`emptyLabel="No games found."`).

**Rezultat:** empty state z CTA działa, przycisk czyści filtry.

### Step 4: Integracja w wishlist.tsx
**Co robimy:**
1. Powtórz Step 2 i Step 3 dla `apps/client/src/pages/wishlist.tsx`.
2. Użyj `useInfiniteWishlistQuery` zamiast `useInfiniteGamesQuery`.
3. `emptyLabel` w `InfiniteScrollFooter` zostaw "Nothing in your wishlist yet — add a game" gdy `activeFilterCount === 0`.

**Rezultat:** wishlist page ma identyczne filtry/sort/empty state.

### Step 5: Manual smoke test
**Co robimy:**
1. `bun run dev:client` (i `bun run dev:api` w drugim terminalu jeśli potrzeba)
2. Otwórz `/games`. Sprawdź:
   - Klik na "Filter" → otwiera popover (desktop) / drawer (mobile via devtools < 768px)
   - Wybór platform → URL zmienia się, lista filtruje
   - Slider lat → drag → na puszczeniu URL update + refetch (NIE w trakcie drag)
   - Inverted range w inputach → toast "Switched range"
   - "Reset all" → wszystkie filtry znikają
   - Filter trigger ma niebieski outline + badge gdy aktywne
3. Sprawdź `/wishlist` — to samo.
4. DevTools Network → request `/api/games?...` zawiera nowe params jako **repeated** (`?platforms=PC&platforms=PS5`), NIE CSV. Sprawdź w karcie "Payload" / "Query String Parameters" że są wymienione osobno.
5. Mobile (devtools width 375): toolbar widoczny, drawer otwiera się od dołu.

**Rezultat:** UI działa end-to-end, brak błędów w konsoli.

## If you get stuck
Jeśli po 2 próbach coś nie działa: ZATRZYMAJ się. Napisz:
`STUCK at Step <N>: <co, jaki błąd, jaka hipoteza>`
Zakończ pracę.
