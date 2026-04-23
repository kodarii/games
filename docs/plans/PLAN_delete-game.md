# Delete Game Feature

## Goal
Umożliwienie użytkownikowi usunięcia gry z kolekcji. Use case: "Użytkownik może usunąć grę z listy gier".

## Definition of Done
- [ ] DELETE `/api/games/:id` zwraca 200 po usunięciu, 404 gdy gra nie istnieje
- [ ] Frontend: przycisk "Delete" na stronie gry lub na liście gier
- [ ] Logika biznesowa w warstwie domeny (NIE w route handlerze)
- [ ] Testy domeny przechodzą: `bun test`
- [ ] Testy use case przechodzą: `bun test`
- [ ] Lint clean: `bun run lint`
- [ ] Typecheck clean: `bun run check`

## Context
**Stack:** Bun, Hono, Drizzle ORM (SQLite), Better-Auth (NOT implemented), React, TanStack Query, Radix UI, Tailwind CSS
**Runtime:** Bun. Komendy:
  - instalacja: `bun add <pkg>` (NIE npm install)
  - uruchomienie: `bun run <script>` (NIE npm run)
  - testy: `bun test` (NIE jest / vitest)
**Architektura:** DDD, Ports & Adapters. Warstwy:
  - `src/domain/` — agregaty, value objects, domain services, porty
  - `src/application/` — use cases
  - `src/infrastructure/` — adaptery (repozytoria)
  - `src/api/` — route handlery Hono
  - `src/client/` — React frontend
**Konwencje:**
  - Logika biznesowa WYŁĄCZNIE w `src/domain/`
  - Repozytoria: interfejs (port) w domain, implementacja (adapter) w infrastructure
  - React: logika w custom hookach, komponenty TYLKO prezentacyjne
  - Error handling: Result<T, E> pattern
  - Nazewnictwo: angielskie

### Relevant files (edit only these)
- `src/domain/games/game-repository.ts` — port (interfejs repozytorium)
- `src/domain/games/game.ts` — domain service lub aggregate methods
- `src/infrastructure/games/drizzle-game-repository.ts` — adapter repozytorium
- `src/infrastructure/db/schema.ts` — DB schema (jeśli potrzebne zmiany)
- `src/api/routes/games.ts` — DELETE route handler
- `src/client/pages/games.tsx` lub `src/client/pages/game-view.tsx` — frontend

### Files to read but NOT edit
- `src/domain/shared/result.ts` — Result type
- `src/infrastructure/db/client.ts` — Drizzle DB client
- `tailwind.config.ts` — Tailwind config

## Constraints (hard rules)
- TDD: NIE pisz kodu produkcyjnego bez UPRZEDNIEGO testu
- NIE pomijaj kroków z testami
- NIE wrzucaj logiki biznesowej do route handlera — handler TYLKO: parsuj input → wywołaj use case → zwróć response
- NIE wrzucaj logiki do komponentu React — logika w custom hooku
- NIE importuj infrastructure w domain
- NIE dodawaj zależności bez jawnej zgody
- Route handler: max ~20 linii

## Implementation plan

### Step 0: Pobierz dokumentację
**Co robimy:** Użyj Context7 aby pobrać docs:
- Drizzle ORM: delete with returning clause
- TanStack Query: mutation do usuwania danych React Query
**Rezultat:** Masz docs w kontekście.

### Step 1: Domain types (rozszerzenie istniejącego portu)
**Co robimy:** W `src/domain/games/game-repository.ts` dodaj do portu:
- `delete(id: GameId): Promise<Result<Game, DomainError>>`
**Rezultat:** port rozszerzony o metodę delete.

### Step 2: TEST domeny (RED)
**Co robimy:** W `src/domain/games/__tests__/` utwórz test:
- Test: usunięcie istniejącej gry → zwraca ok z usuniętą grą
- Test: usunięcie nieistniejącej gry → zwraca err `{ kind: 'game_not_found' }`
Uruchom: `bun test` → testy MUSZĄ FAILOWAĆ (RED).
**Rezultat kroku:** testy istnieją i failują.

### Step 3: Domain impl (GREEN)
**Co robimy:** W `src/domain/games/game.ts` dodaj:
- `deleteGame(id): Result<Game, DomainError>` — domain function (jeśli potrzebna)
- Funkcja sprawdza czy gra istnieje, zwraca odpowiedni błąd
Uruchom: `bun test` → testy MUSZĄ PRZECHODZIĆ (GREEN).
**Rezultat kroku:** `bun test` — zielone.

### Step 4: Repository adapter (rozszerzenie)
**Co robimy:** W `src/infrastructure/games/drizzle-game-repository.ts` dodaj:
- `delete(id)` — implementacja z `db.delete().where().returning()`
**Rezultat kroku:** adapter implementuje metodę delete z portu.

### Step 5: TEST use case (RED)
**Co robimy:** W `src/application/games/__tests__/` napisz testy:
- Utwórz `FakeGameRepository` (in-memory)
- Test: poprawny input → `ok` + gra usunięta z repo
- Test: nieprawidłowy (nieistniejąca gra) → `err` z `{ kind: 'game_not_found' }`
Uruchom: `bun test` → nowe testy FAILUJĄ (RED).
**Rezultat kroku:** nowe testy istnieją i failują.

### Step 6: Application service (GREEN)
**Co robimy:** W `src/application/games/` utwórz use case:
- `DeleteGameUseCase` — orkiestruje: wywołaj domain function → zapisz przez port → zwróć Result
Uruchom: `bun test` → WSZYSTKIE testy GREEN.
**Rezultat kroku:** `bun test` — zielone.

### Step 7: Route handler (Hono)
**Co robimy:** W `src/api/routes/games.ts` dodaj handler:
- `DELETE /:id` — CIENKI handler:
  1. Parsuj id z parametrów (Zod)
  2. Wywołaj use case
  3. Zmapuj Result na HTTP response
**Request/Response:**
```
DELETE /api/games/:id
→ 200: { id: ..., title: ..., ... }
→ 404: { error: "game_not_found" }
→ 400: { error: "validation: ..." }
```
**Rezultat kroku:** endpoint odpowiada na request.

### Step 8: Frontend — custom hook + komponent prezentacyjny
**Co robimy:**
1. Hook `useDeleteGame()` w `src/client/hooks/use-delete-game.ts`:
   - mutacja przez TanStack Query
   - invalidate queries po usunięciu
   - Zwraca: `{ mutate, isLoading, error }`
2. Komponent przycisku "Delete" na stronie gry (`GameViewPage`):
   - Wywołuje hook
   - UI: przycisk z Radix UI AlertDialog (potwierdzenie usunięcia)
**Rezultat kroku:** przycisk działa, strona przekierowuje po usunięciu.

### Step 9: Final check — lint, typecheck, ALL tests
**Co robimy:** `bun run lint` + `bun run check` + `bun test`
**Rezultat:** ZERO errors, WSZYSTKIE testy zielone.

## Out of scope (NIE rób tego)
- NIE refaktoruj istniejącego kodu który działa
- NIE dodawaj soft delete (usunięcie z flagą archived)
- NIE implementuj auth (jest podstawowy)
- NIE dodawaj paginacji/sortowania

## If you get stuck
Jeśli po 2 próbach coś nie działa: ZATRZYMAJ się. Napisz:
```
STUCK at Step <N>: <co próbowałeś, jaki błąd, jaka hipoteza>
```
Zakończ pracę.