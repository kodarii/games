# Games sort hang — Faza 1: Fix

## Goal
Naprawa zawieszania aplikacji po kliknięciu w nagłówek tabeli Games (zmiana sortowania). Pętla nieskończona w `InfiniteScrollSentinel` powoduje, że przeglądarka pokazuje komunikat "strona nie odpowiada".

## Definition of Done
- [ ] Kliknięcie w nagłówek kolumny (Title / Genre / Platform / Status) zmienia sortowanie i NIE zawiesza aplikacji
- [ ] Wielokrotne klikanie (asc → desc → off) działa bez zawieszania
- [ ] Infinite scroll nadal działa — przewinięcie do dołu dociąga kolejne strony
- [ ] `bun run check` czyste (TypeScript)
- [ ] `bun run lint` czyste
- [ ] Zero warningów React w konsoli przeglądarki po zmianie sortowania

Agent kończy pracę WYŁĄCZNIE gdy WSZYSTKIE powyższe są spełnione.

## Context
**Runtime:** Bun (NIE Node.js, NIE npm — `bun run check`, `bun run lint`, `bun test`)
**Stack FE:** React + TanStack Query (`useInfiniteQuery`) + TanStack Table (`useReactTable`)
**Środowisko:** monorepo, frontend w `apps/client/`

## Diagnoza buga (KONIECZNIE przeczytaj przed edycją)

### Przyczyna 1 — niestabilny callback w Sentinel (GŁÓWNA)
W `apps/client/src/pages/games.tsx` linia ~212:
```tsx
<InfiniteScrollSentinel
  enabled={hasNextPage === true && !isFetchingNextPage}
  onIntersect={() => fetchNextPage()}   // ← NOWA FUNKCJA przy KAŻDYM renderze
  rootMargin="200px"
/>
```

W `apps/client/src/components/infinite-scroll-sentinel.tsx`:
```tsx
useEffect(() => {
  ...
  const observer = new IntersectionObserver(...);
  observer.observe(el);
  return () => observer.disconnect();
}, [enabled, onIntersect, rootMargin]);   // ← onIntersect w deps
```

Mechanizm pętli:
1. Render komponentu rodzica → `onIntersect` dostaje nową referencję
2. `useEffect` w Sentinel cleanup (`disconnect`) → tworzy nowy `IntersectionObserver` i robi `observe(el)`
3. `IntersectionObserver` natychmiast wywołuje callback dla widocznego elementu (tak zachowuje się API przeglądarki)
4. Callback woła `fetchNextPage()` → React Query zmienia stan → re-render
5. Wracamy do kroku 1 → **hang**

Przy pierwszym ładowaniu efekt jest słabszy, bo `useEffect` do `initialFetched` (linia ~138 w `games.tsx`) wstępnie dociąga 2 strony — sentinel może być poza viewport. Po zmianie sortowania `initialFetched` zostaje `true`, więc mamy tylko 1 stronę → sentinel zazwyczaj w viewport → pętla się eskaluje.

### Przyczyna 2 — `initialFetched` nie resetuje się
`initialFetched` (linia ~125 w `games.tsx`) nigdy nie wraca do `false`, więc po zmianie `sort`/`search` pre-fetch drugiej strony nie działa. To nie jest bezpośrednia przyczyna hangu, ale amplifikuje Przyczynę 1 i jest samodzielnym bugiem UX. W ramach tej naprawy likwidujemy go całkowicie przez usunięcie ręcznego pre-fetchu — infinite scroll sam dociągnie więcej stron gdy sentinel wjedzie w viewport po stabilizacji callbacku.

## Design decisions
- Stabilizujemy callback w Sentinel używając `useRef` — trzymamy bieżący `onIntersect` w ref i wołamy go z observera. `useEffect` zależy TYLKO od `enabled` i `rootMargin` (nie od callbacku).
- Usuwamy ręczny pre-fetch drugiej strony (`initialFetched` + powiązany `useEffect`) z `games.tsx`. Jeśli 7 rekordów nie wypełnia viewportu → sentinel jest widoczny → `onIntersect` pobiera kolejną stronę. Po stabilizacji callbacku to NIE jest pętla — observer palnie raz, `fetchNextPage` oznacza `isFetchingNextPage=true` → `enabled` staje się `false` → observer się rozłącza.
- NIE zmieniamy API `InfiniteScrollSentinel` — prop `onIntersect` wciąż przyjmuje zwykłą funkcję. Stabilizacja jest wewnątrz komponentu (wzorzec "event callback via ref").

### Relevant files (edit only these)
- `apps/client/src/components/infinite-scroll-sentinel.tsx` — stabilizacja callbacku przez ref
- `apps/client/src/pages/games.tsx` — usunięcie `initialFetched` i jego `useEffect`

### Files to read but NOT edit
- `apps/client/src/lib/queries.ts` — `useInfiniteGamesQuery` (żeby zrozumieć `hasNextPage`, `isFetchingNextPage`, `fetchNextPage`)
- `apps/client/src/components/data-table.tsx` — `DataTable` i button sortujący nagłówka (kontekst jak wywoływane jest `setSorting`)

## Constraints
- NIE zmieniaj `apps/api/**` ani nic w backendzie — bug jest wyłącznie frontendowy
- NIE dodawaj `useCallback` w `games.tsx` dla `onIntersect` — fix MUSI być w Sentinelu (inny użytkownik komponentu mógłby zrobić ten sam błąd)
- NIE zmieniaj sygnatury propsów `InfiniteScrollSentinel`
- NIE używaj `any`, zachowaj pełne typowanie
- NIE dodawaj nowych zależności (npm/bun) — problem rozwiązujemy samym Reactem

## Steps

### Step 1: Stabilizacja callbacku w Sentinel
**Plik:** `apps/client/src/components/infinite-scroll-sentinel.tsx`

**Co robimy:**
1. Zaimportuj `useRef` obok istniejących importów (`useEffect`, `useRef`)
2. Zapisz najnowszy `onIntersect` w ref:
   ```tsx
   const onIntersectRef = useRef(onIntersect);
   useEffect(() => {
     onIntersectRef.current = onIntersect;
   }, [onIntersect]);
   ```
3. W istniejącym `useEffect` z observerem:
   - Wołaj `onIntersectRef.current()` zamiast `onIntersect()`
   - Usuń `onIntersect` z tablicy zależności → zostaje `[enabled, rootMargin]`

**Rezultat:** Observer jest tworzony i rozłączany tylko gdy zmienia się `enabled` lub `rootMargin`. Renderowanie rodzica z nowym `onIntersect` nie rekreuje observera.

### Step 2: Usunięcie ręcznego pre-fetchu w Games page
**Plik:** `apps/client/src/pages/games.tsx`

**Co robimy:**
1. Usuń stan `const [initialFetched, setInitialFetched] = useState(false);` (linia ~125)
2. Usuń cały `useEffect` który woła `fetchNextPage()` kiedy `data?.pages.length === 1` (linie ~138-143)
3. Jeśli po usunięciu `useEffect` import `useEffect` nie jest już używany — usuń go z importu `react`
4. Reszta komponentu bez zmian

**Rezultat:** Strona ładuje 1 stronę (7 wierszy). Jeśli sentinel jest w viewport → dociąga kolejną automatycznie, już bez pętli (callback jest stabilny po Step 1).

### Step 3: Weryfikacja
**Co robimy:**
1. `bun run check` — typecheck musi być zielony
2. `bun run lint` — lint musi być zielony
3. Uruchom dev server aplikacji (zwykle `bun run dev` w `apps/client` lub w root — sprawdź `package.json`)
4. W przeglądarce otwórz stronę Games i ręcznie zweryfikuj:
   - [ ] Kliknij nagłówek "Title" → sortowanie się zmienia, strona NIE zawiesza się
   - [ ] Kliknij ten sam nagłówek drugi raz → kierunek się odwraca (desc), NIE zawiesza
   - [ ] Kliknij trzeci raz → sortowanie wyłączone, NIE zawiesza
   - [ ] Kliknij inny nagłówek (np. "Genre") — NIE zawiesza
   - [ ] Wpisz coś w pole wyszukiwania — NIE zawiesza
   - [ ] Przewiń tabelę w dół — dociąga kolejne strony, licznik nie rośnie w kółko
5. W DevTools sprawdź zakładkę Network: po jednym kliknięciu w nagłówek liczba requestów do `/api/games` powinna być skończona (zwykle 1-2, a nie lawina)

**Rezultat:** Wszystkie checkboxy DoD zaznaczone.

## If you get stuck
Jeśli po 2 próbach coś nie działa: ZATRZYMAJ się. Napisz:
`STUCK at Step <N>: <co, jaki błąd, jaka hipoteza>`
Zakończ pracę.

Typowe pułapki:
- Jeśli po Step 1 infinite scroll PRZESTAJE działać (nie dociąga) — prawdopodobnie usunąłeś `observer.observe(el)` albo `return () => observer.disconnect()`. Przywróć te linie, zmieniasz tylko DEPENDENCY ARRAY i wywołanie callbacku w środku.
- Jeśli `bun run check` zgłasza unused imports po Step 2 — usuń nieużywane importy z `games.tsx`.
- Jeśli nadal zawiesza po obu krokach — sprawdź w DevTools czy observer jest rekreowany (log w `useEffect`). Jeśli tak, dep array wciąż ma `onIntersect`.
