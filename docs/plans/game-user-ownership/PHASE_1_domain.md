# Game User Ownership — Faza 1: Domain

## Goal
Dodać `userId` do agregatu `Game` i `NewGame` jako pole właściciela oraz
zaktualizować interfejs `GameRepository` tak, żeby list i create były świadome
userId. Żadnej logiki infrastruktury — tylko domain + port.

## Definition of Done
- [ ] Testy domeny przechodzą: `bun test apps/api/src/domain`
- [ ] Typecheck: `bun run check` (z katalogu `apps/api`)
- [ ] `Game` i `NewGame` mają pole `userId: string`
- [ ] `GameRepository.list()` przyjmuje `userId` w query
- [ ] `GameRepository.create()` przyjmuje `userId` w ramach `NewGame`

Agent kończy pracę WYŁĄCZNIE gdy powyższe są spełnione.

## Context
**Runtime:** Bun (NIE Node.js, NIE npm — `bun test`, `bun run check`)
**Katalog roboczy:** `apps/api`
**Architektura:** domain layer NIE importuje nic z infrastructure ani application
**Error handling:** Result<T, E> pattern — `ok(value)` / `err(error)`

## Design decisions
- `Game` to aggregate root z właścicielem. `userId` to pole agregatu, nie osobna encja.
- `userId` jest prostym `string` — pochodzi z Better-Auth i jest referencją do systemu auth.
  NIE tworzymy VO dla userId (brak invariantów domenowych — walidacja należy do auth).
- `NewGame.create()` przyjmuje `userId: string` jako required prop — bez userId nie możemy stworzyć gry.
- `GameRepository.list()` query dostaje `userId: string` — repozytorium filtruje po nim.
- `GameRepository.create()` już przyjmuje `NewGame` — wystarczy dodać `userId` do `NewGame`.
- Nie dodajemy metody "sprawdź właściciela" w domain — to odpowiedzialność use case w fazie 2.

## Relevant files (edit only these)
- `src/domain/games/game.ts` — agregaty + VO + typy
- `src/domain/games/__tests__/game.test.ts` — testy domeny
- `src/domain/games/game-repository.ts` — interfejs repozytorium

## Files to read but NOT edit
- `src/domain/shared/result.ts` — typ Result, funkcje ok/err

## Steps

### Step 1: Przeczytaj istniejący kod domeny
**Co robimy:**
1. Przeczytaj `src/domain/games/game.ts` — zrozum aktualną strukturę `Game`, `NewGame`, `GameProps`
2. Przeczytaj `src/domain/games/__tests__/game.test.ts` — zrozum istniejące testy
3. Przeczytaj `src/domain/games/game-repository.ts` — zrozum `ListGamesQuery`
**Rezultat:** rozumiesz co i gdzie zmieniasz.

### Step 2: Zaktualizuj testy (RED)
**Co robimy:**
1. W `src/domain/games/__tests__/game.test.ts` dodaj do każdego testu tworzącego grę pole `userId`:
   - Każdy `NewGame.create({ ..., userId: 'user-123' })` — z userId
   - Dodaj test: `NewGame.create` bez userId → `err({ kind: 'missing_user_id' })`
   - Dodaj test: `Game.fromPersistence` z `userId` → game ma `game.userId === 'user-123'`
2. `bun test apps/api/src/domain` → RED (testy failują — to prawidłowe)
**Rezultat:** testy istnieją i FAILUJĄ.

### Step 3: Zaktualizuj domain (GREEN)
**Co robimy:**
1. W `src/domain/games/game.ts`:
   - Dodaj `userId: string` do `GameProps` (required)
   - Dodaj `userId: string` do prywatnych pól `NewGame`
   - W `NewGame.create()` waliduj `userId`:
     - jeśli brak lub pusty string → `err({ kind: 'missing_user_id' })`
   - Dodaj getter `get userId()` w `NewGame`
   - Dodaj `userId: string` do `Game` (w konstruktorze i `fromPersistence`)
   - Dodaj getter `get userId()` w `Game`
   - W `Game.toJSON()` dodaj `userId` do zwracanego obiektu
2. `bun test apps/api/src/domain` → GREEN
3. `bun run check` → czyste

### Step 4: Zaktualizuj port repozytorium
**Co robimy:**
1. W `src/domain/games/game-repository.ts`:
   - Dodaj `userId: string` do `ListGamesQuery` (required)
   - `GameRepository.create(game: NewGame)` już przyjmuje `NewGame` — userId jest w agregacie ✓
   - Sprawdź czy `findById`, `update`, `delete` wymagają zmian (zwykle nie — ownership check w use case)
2. `bun run check` → czyste (interfejs się kompiluje, implementacja w fazie 2)
**Rezultat:** port zaktualizowany, kompiluje się. Implementacja Drizzle będzie w fazie 2.

## If you get stuck
Jeśli po 2 próbach coś nie działa: ZATRZYMAJ się. Napisz:
`STUCK at Step <N>: <co, jaki błąd, jaka hipoteza>`
Zakończ pracę.
