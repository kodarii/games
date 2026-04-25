# Games — Infinite scroll — Faza 1: Backend

## Goal
Dostosuj endpoint `GET /api/games` do konsumpcji przez infinite scroll. Zamiast zwracać `totalPages`, zwróć flagę `hasMore` informującą czy są kolejne strony. `page`/`perPage`/`sort`/`dir`/`search` pozostają bez zmian — paginacja offsetowa jest OK (frontend użyje `useInfiniteQuery` z numerem strony jako kursorem).

## Definition of Done
- [ ] `GET /api/games?page=1&perPage=7` zwraca `{ items, page, perPage, total, hasMore }` (bez `totalPages`)
- [ ] `hasMore` to `true` dokładnie gdy `page * perPage < total`
- [ ] Test `list-games.test.ts` przechodzi: `bun test apps/api/src/application/games/list-games.test.ts`
- [ ] Wszystkie testy zielone: `bun test`
- [ ] `bun run check` + `bun run lint` czyste

Agent kończy pracę WYŁĄCZNIE gdy powyższe są spełnione.

## Context
**Runtime:** Bun (NIE Node.js, NIE npm — `bun test`, `bun run check`, `bun run lint`)
**Architektura:** DDD + Ports & Adapters. Domain nie zmieniamy — to zmiana tylko w `application` layer + typy w API response.
**ORM:** Drizzle — repozytorium już zwraca `{ items, total }`, NIE dotykamy go
**Walidacja inputu:** Zod w `ListGames` use case — schemat inputu też zostaje bez zmian

## Design decisions
- Paginacja pozostaje offsetowa (`page`/`perPage`) — nie przepisujemy na cursor-based. Offset wystarcza dla naszego wolumenu, a frontend `useInfiniteQuery` traktuje `page` jako `pageParam`.
- `hasMore` liczymy w use case na podstawie `page`, `perPage` i `total`. Formuła: `page * perPage < total`.
- `totalPages` usuwamy — infinite scroll go nie używa, a zostawienie martwego pola myli konsumentów.
- Repozytorium (`DrizzleGameRepository.list`) NIE jest modyfikowane — to wciąż `{ items, total }`. Zmiana tylko w warstwie `application`.
- Route handler (`routes/games.ts`) NIE wymaga zmian — zwraca to, co dostanie z use case.
- Error handling: `ListGames.execute` używa `z.parse` (rzuca przy błędzie) — zgodne z obecnym stylem. Nie dodajemy Result<T,E> tylko dla tej zmiany.

### Relevant files (edit only these)
- `apps/api/src/application/games/list-games.ts` — zmiana kształtu zwracanego obiektu
- `apps/api/src/application/games/list-games.test.ts` — NOWY plik z testami

### Files to read but NOT edit
- `apps/api/src/domain/games/game-repository.ts` — typ `ListGamesQuery`, `ListGamesResult`
- `apps/api/src/domain/games/game.ts` — żeby użyć `Game.fromPersistence` w fake repo w testach
- `apps/api/src/application/games/update-game.test.ts` — wzorzec istniejących testów use case (fake repo, struktura)
- `apps/api/src/application/games/delete-game.test.ts` — jw.
- `apps/api/src/routes/games.ts` — potwierdź że handler po prostu `c.json(result)`, nic nie pakuje od siebie

### Step 0: Pobierz dokumentację
Użyj Context7 (jeśli dostępny):
- Zod: "z.object default and coerce number usage"
- Drizzle ORM: (niepotrzebne w tej fazie — nie dotykamy SQL)

Jeśli Context7 MCP nie jest dostępny — zerknij do istniejącego kodu: `ListGames` już używa Zod tak jak trzeba.

## Constraints
- TDD: NAJPIERW dopisz test (RED), POTEM zmień implementację (GREEN)
- NIE dotykaj `DrizzleGameRepository` ani schematu DB — zmiana jest czysto w warstwie aplikacji
- NIE zmieniaj input schema (`ListGamesQuerySchema`) — front wciąż wysyła `page`/`perPage`/`sort`/`dir`/`search`
- NIE dodawaj `hasMore` do `ListGamesResult` (interfejs domenowy) — to property warstwy `application`, liczone z `total` i `perPage`
- NIE zostawiaj `totalPages` „na razie” dla wstecznej kompatybilności — usuwamy; jest tylko jeden konsument (frontend) i ten też zmieniamy w fazie 2
- Route handler `routes/games.ts` MUSI zostać nietknięty — jeśli go ruszasz, robisz coś źle

## Steps

### Step 1: Test use case (RED)
**Co robimy:**
1. Utwórz `apps/api/src/application/games/list-games.test.ts` w stylu istniejących testów (`update-game.test.ts`, `delete-game.test.ts`)
2. Napisz `FakeGameRepository implements GameRepository`:
   - Trzyma `Game[]` w pamięci (użyj `Game.fromPersistence({...})` do stworzenia seed-danych — zerknij do `game.ts` po sygnaturę)
   - `list(query)` zwraca `{ items: slice, total: allItems.length }` z uwzględnieniem `page`/`perPage` (bez sortowania — nie testujemy SQL)
   - Pozostałe metody mogą rzucać „not implemented”
3. Napisz co najmniej 4 testy:
   - `total === items.length, page=1, perPage=10` → `hasMore === false`
   - `total > page * perPage` (np. 20 items, page=1, perPage=7) → `hasMore === true`
   - Ostatnia strona (np. 20 items, page=3, perPage=7, zwraca 6 items) → `hasMore === false`
   - Response NIE zawiera `totalPages` (np. `expect('totalPages' in response).toBe(false)`)
4. `bun test apps/api/src/application/games/list-games.test.ts` → RED (failuje, bo implementacja wciąż zwraca `totalPages`, a nowe pole `hasMore` nie istnieje)

**Rezultat:** Plik testu istnieje, testy failują w oczekiwany sposób (pole `hasMore` === undefined / pole `totalPages` istnieje).

### Step 2: Zmień implementację `ListGames.execute` (GREEN)
**Co robimy:**
1. Otwórz `apps/api/src/application/games/list-games.ts`
2. W returnie zamień `totalPages: Math.max(1, Math.ceil(result.total / query.perPage))` na `hasMore: query.page * query.perPage < result.total`
3. `bun test` → ALL GREEN (testy z Step 1 przechodzą; stare testy domain/use case dalej zielone)

**API spec (po zmianie):**
```
GET /api/games?page=1&perPage=7&search=&sort=title&dir=asc
→ 200: {
  items: Game[],
  page: number,
  perPage: number,
  total: number,
  hasMore: boolean
}
```

**Rezultat:** `bun test` zielone. `bun run check` i `bun run lint` czyste.

### Step 3: Quick sanity check
**Co robimy:**
1. Uruchom serwer jeśli masz taką możliwość lokalnie, lub po prostu odpal `bun run check`
2. Upewnij się że `routes/games.ts` NIE został zmodyfikowany (`git diff apps/api/src/routes/games.ts` → brak zmian)
3. Upewnij się że `DrizzleGameRepository` NIE został zmodyfikowany

**Rezultat:** Zmiany ograniczone do `list-games.ts` (edycja) + `list-games.test.ts` (nowy plik). Nic więcej.

## If you get stuck
Jeśli po 2 próbach coś nie działa: ZATRZYMAJ się. Napisz:
STUCK at Step <N>: <co, jaki błąd, jaka hipoteza>
Zakończ pracę.
