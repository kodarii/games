# Games — Infinite scroll — Faza 2: Frontend

## Goal
Zastąp komponent `Pagination` pod tabelą gier infinite-scrollem. Scroll w dół ma automatycznie doładowywać kolejne strony aż do `hasMore === false`. Zmiana `search` lub `sort` resetuje listę do pierwszej strony. TanStack Table dalej obsługuje sortowanie po stronie serwera i selekcję wierszy — tylko paginację zastępujemy.

## Definition of Done
- [ ] Strona `/games` renderuje się bez błędów w konsoli
- [ ] Scroll w dół tabeli doładowuje kolejne strony (widać nowe wiersze pojawiające się bez klikania)
- [ ] Gdy `hasMore === false` — nie ma kolejnego fetcha, widać subtelny marker końca listy (np. „End of list”) lub po prostu brak spinnera
- [ ] Zmiana zapytania w SearchInput lub kliknięcie nagłówka (sort) zaczyna od początku i czyści listę
- [ ] Komponent `Pagination` NIE jest już używany na stronie gier (import usunięty)
- [ ] Plik `apps/client/src/components/pagination.tsx` usunięty (był używany tylko w `games.tsx`)
- [ ] `bun run check` + `bun run lint` czyste
- [ ] Manualny test w przeglądarce: golden path (scroll przewija i doładowuje) i edge case (po filtracji, która daje <1 strony, nie próbuje fetchować dalej)

Agent kończy pracę WYŁĄCZNIE gdy powyższe są spełnione.

## Context
**Runtime:** Bun (NIE Node.js, NIE npm)
**UI:** Radix UI + Tailwind CSS — NIE pisz klas Tailwind z pamięci, kopiuj wzorce z sąsiednich komponentów w tej samej stronie (np. `data-table.tsx`, `pagination.tsx` przed usunięciem) albo sięgnij do docs
**Data fetching:** React Query (`@tanstack/react-query`) — w projekcie używamy `useQuery`/`useMutation`; tu potrzebujemy `useInfiniteQuery`
**Tabela:** TanStack Table (`@tanstack/react-table`) przez wspólny `@/components/data-table.tsx` — zachowujemy server-side sorting, wyłączamy manual pagination
**Backend:** po fazie 1 API zwraca `{ items, page, perPage, total, hasMore }` — używaj `hasMore` do sterowania `getNextPageParam`

### Step 0: Pobierz dokumentację
Użyj Context7:
- TanStack Query v5: "useInfiniteQuery getNextPageParam initialPageParam"
- TanStack Table v8: "manualSorting without pagination server-side sorting"
- MDN: "IntersectionObserver options rootMargin threshold"

Jeśli Context7 niedostępny — w tym repo `useInfiniteQuery` jeszcze nie jest używany; trzymaj się oficjalnych przykładów z react-query v5. Typ: `UseInfiniteQueryOptions` z `initialPageParam: 1` + `getNextPageParam: (last, _all, lastParam) => last.hasMore ? lastParam + 1 : undefined`.

### Relevant files (edit only these)
- `apps/client/src/types.ts` — zaktualizuj `GamesResponse`: zamień `totalPages` na `hasMore`
- `apps/client/src/lib/queries.ts` — dodaj `useInfiniteGamesQuery`, usuń lub zostaw stary `useGamesQuery` tylko jeśli ktoś go jeszcze używa (zweryfikuj grep'em — jeśli nikt, usuń)
- `apps/client/src/pages/games.tsx` — przepisz na infinite scroll, usuń `Pagination`, usuń `PaginationState`, usuń `manualPagination`
- `apps/client/src/components/pagination.tsx` — USUŃ plik (po upewnieniu się grep'em że jest to jedyne użycie)
- `apps/client/src/components/infinite-scroll-sentinel.tsx` — NOWY plik, prosty sub-komponent hermetyzujący IntersectionObserver

### Files to read but NOT edit
- `apps/api/src/routes/games.ts` — potwierdź kształt response po fazie 1
- `apps/client/src/components/data-table.tsx` — wspólny komponent tabeli; nie modyfikujemy
- `apps/client/src/lib/api.ts` — `fetchGames(params)` zwraca `GamesResponse` — używamy go w nowym hooku
- `apps/client/src/components/toolbar.tsx` — zobacz jak działa toolbar (żeby nie zepsuć layoutu)

## Visual spec
**Layout:** Bez zmian z wyjątkiem dolnego paska — tabela zajmuje cały kontener przewijany.

**Sentinel (trigger doładowania):** Pusty `<div ref={sentinelRef} />` umieszczony TUŻ POD `<table>` w obrębie scrollowalnego kontenera (`<div class="scroll-thin flex-1 overflow-y-auto ...">` w `games.tsx`). Wysokość ~1px — niewidoczny dla użytkownika.

**Loading row:** Podczas doładowywania kolejnej strony pokaż pod tabelą cienki pasek wysokości ~44px (dopasowany do wysokości starej paginacji) z wyśrodkowanym napisem „Loading…”. Styl: `text-[12px] text-apex-faint`, tło białe, bez obramowania górnego (jednolita karta). Gdy `hasMore === false` i mamy >0 itemów — pokaż analogiczny pasek z „End of list”. Gdy 0 itemów — pokaż „No games found.” (empty state zamiast End of list).

**Zachowanie przy zmianie query:** Natychmiastowy remount listy (czyszczenie dotychczasowych wierszy) — osiągamy to przez zmianę `queryKey` w `useInfiniteQuery`. Scroll nie musi być programatycznie resetowany, bo kontener się opróżnia i naturalnie wraca na górę.

**Design tokens:** Użyj ISTNIEJĄCYCH klas z sąsiednich komponentów (np. `border-apex-line-4`, `text-apex-faint`, `bg-white`). NIE wymyślaj nowych kolorów.

**Responsywność:** Bez zmian — tabela już się scrolluje w kontenerze o wysokości `flex-1`.

## Design decisions
- `useInfiniteQuery` zamiast własnej konkatenacji stron — standard react-query, dba o cache i deduplikację
- `queryKey` zawiera `search`, `sort`, `dir`, `perPage` (ale NIE `page`) — zmiana któregokolwiek startuje nowy infinite scroll; `page` to `pageParam` zarządzany przez react-query
- `getNextPageParam: (last, _all, lastParam) => last.hasMore ? (lastParam as number) + 1 : undefined` — zwrócenie `undefined` mówi react-query że nie ma co fetchować
- Sentinel z IntersectionObserver jest prostszy i tańszy niż nasłuchiwanie `scroll` — odpala `fetchNextPage()` gdy `entry.isIntersecting === true && hasNextPage && !isFetchingNextPage`
- `rootMargin: '200px'` na observerze — zaczyna ładować zanim user dotrze do samego dołu (płynny feel)
- Zostawiamy `perPage: 7` tymczasowo — zmiana wartości to osobna decyzja produktowa; pole „X / page” znika razem z `Pagination`
- TanStack Table: `manualPagination: false`, usuwamy `rowCount` i `pagination` state, zachowujemy `manualSorting: true` (sort dalej idzie do serwera)
- Po `invalidateQueries({ queryKey: ['games'] })` (w create/delete/update mutations) react-query automatycznie refetchuje wszystkie strony inifinite — to ok; jeśli zauważysz że invalidation powoduje przeskoki, NIE zmieniaj tego w tej fazie, zgłoś użytkownikowi

## Constraints
- NIE pisz Tailwind/Radix z pamięci — kopiuj klasy z sąsiednich komponentów albo sięgnij do docs z Step 0
- NIE koduj własnej logiki stronicowania — użyj `useInfiniteQuery`
- NIE nasłuchuj `scroll` na kontenerze — użyj IntersectionObserver
- NIE wrzucaj logiki fetchowania do komponentu — całość idzie do `useInfiniteGamesQuery` (queries.ts) + `InfiniteScrollSentinel` (prezentacyjny z useEffect na observer)
- NIE pisz custom CSS — Tailwind utility classes only
- Komponent `GamesPage` po zmianach ma pozostać czytelny — jeśli przekracza ~220 linii, wydziel sub-komponent (np. `GamesToolbar`) — ale tylko wtedy
- Sentinel MUSI obsłużyć unmount (cleanup observer w useEffect return) — bez tego pojawią się warningi z React strict mode

## Steps

### Step 1: Typ API + hook infinite query
**Co robimy:**
1. `apps/client/src/types.ts` — w `GamesResponse` zamień `totalPages: number` na `hasMore: boolean`
2. `apps/client/src/lib/queries.ts` — dodaj:
   ```ts
   export function useInfiniteGamesQuery(params: {
     search: string;
     perPage: number;
     sort?: string;
     dir?: 'asc' | 'desc';
   }) { ... }
   ```
   Wewnątrz:
   - `queryKey: ['games', 'infinite', params]`
   - `queryFn: ({ pageParam }) => fetchGames(buildParams(params, pageParam))`
     gdzie `buildParams` produkuje `URLSearchParams` z `page = pageParam`
   - `initialPageParam: 1`
   - `getNextPageParam: (last, _all, lastParam) => last.hasMore ? (lastParam as number) + 1 : undefined`
3. Sprawdź grep'em czy stary `useGamesQuery` jest jeszcze gdzieś używany (`grep -rn "useGamesQuery" apps/client`). Jeśli nie — usuń go.
4. `bun run check` → czyste

**Rezultat:** hook eksportuje czyste API, typy się spinają, typecheck zielony.

### Step 2: Komponent sentinela
**Co robimy:**
1. Utwórz `apps/client/src/components/infinite-scroll-sentinel.tsx`:
   ```tsx
   type Props = {
     onIntersect: () => void;
     enabled: boolean;
     rootMargin?: string;
   };
   ```
2. Wewnątrz `useEffect` — tworzy `IntersectionObserver`, obserwuje ref'owany div, w callbacku jeśli `entry.isIntersecting && enabled` → `onIntersect()`. Cleanup: `observer.disconnect()`.
3. Zwraca `<div ref={ref} aria-hidden="true" className="h-px w-full" />`
4. `bun run check` → czyste

**Rezultat:** komponent izolowany, łatwy do reuse'u, bez logiki biznesowej.

### Step 3: Przepisz `GamesPage` na infinite scroll
**Co robimy:**
1. W `apps/client/src/pages/games.tsx`:
   - Usuń importy: `Pagination`, `PaginationState`
   - Usuń stan `pagination` i wszystkie `setPagination` (w tym reset przy `onChange` search — tam po prostu nic nie rób, bo zmiana `search` i tak zmieni queryKey)
   - Zamień `useGamesQuery` na `useInfiniteGamesQuery({ search, perPage: 7, sort: sort?.id, dir: sort?.desc ? 'desc' : 'asc' })`
   - Z danych wyciągnij flat list: `const items = data?.pages.flatMap((p) => p.items) ?? []`
   - `useReactTable`: usuń `manualPagination`, `rowCount`, `pagination` ze `state`, `onPaginationChange`. Zostaw `manualSorting: true`, `sorting`, `onSortingChange`, selekcję.
   - Po `<DataTable table={table} />` dodaj:
     - Jeśli `isFetchingNextPage` — wyrenderuj „Loading…” pasek
     - Jeśli `!hasNextPage && items.length > 0` — wyrenderuj „End of list”
     - Jeśli `items.length === 0 && !isLoading` — wyrenderuj „No games found.”
     - Bezwarunkowo (gdy `hasNextPage && !isFetchingNextPage`) wyrenderuj `<InfiniteScrollSentinel enabled={hasNextPage && !isFetchingNextPage} onIntersect={() => fetchNextPage()} rootMargin="200px" />`
   - Usuń cały blok `<Pagination ... />`
2. Usuń plik `apps/client/src/components/pagination.tsx` (potwierdź grep'em że nikt nie importuje)
3. `bun run check` + `bun run lint` → czyste

**Rezultat:** strona działa end-to-end z infinite scrollem.

### Step 4: Manualny test w przeglądarce
**Co robimy:**
1. Odpal dev: `bun run dev` (lub odpowiednik w package.json — sprawdź)
2. Wejdź na `/games`
3. Golden path: przewiń do końca tabeli — kolejne wiersze mają się pojawiać automatycznie; spinner „Loading…” znika po dociągnięciu; gdy dotrzesz do końca — pokazuje się „End of list”
4. Edge cases:
   - Wpisz w search coś co daje <7 wyników → lista się skraca, brak infinite fetch (hasMore od razu false), widać „End of list” lub nic (sprawdź wg visual spec)
   - Wpisz w search coś bez wyników → „No games found.”
   - Zmień sort (klik w nagłówek) → lista się resetuje do pierwszej strony
   - Dodaj grę (`/games/new`) → po powrocie lista jest odświeżona
5. Otwórz konsolę — brak errorów, brak warningów z React strict mode

**Rezultat:** feature działa w przeglądarce, brak regresji.

## If you get stuck
Jeśli po 2 próbach coś nie działa: ZATRZYMAJ się. Napisz:
STUCK at Step <N>: <co, jaki błąd, jaka hipoteza>
Zakończ pracę.
