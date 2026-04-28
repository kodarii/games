---
name: Phase 3 Application
description: Use cases gier z kontekstem userId — ownership w use case, IDOR-safe
type: plan
---

# Game User Ownership — Faza 3: Application (Use Cases)

## Goal
Każdy use case (`CreateGame`, `ListGames`, `GetGame`, `UpdateGame`, `DeleteGame`)
musi przyjmować `userId: string` jako kontekst auth z routes i:
- `CreateGame` — wstrzyknąć `userId` do `NewGame.create`.
- `ListGames` — wstrzyknąć `userId` do `ListGamesQuery`.
- `GetGame`, `UpdateGame`, `DeleteGame` — pobrać grę przez `findById`,
  sprawdzić ownership (`game.userId === userId`); dla cudzej gry zwrócić `not_found`
  (NIE `forbidden` — nie ujawniamy istnienia).

## Definition of Done
- [ ] `bun test apps/api/src/application` → wszystko zielone
- [ ] `bun run check` (z `apps/api`) → czyste
- [ ] Sygnatury wszystkich `.execute()` mają `userId: string` jako jeden z parametrów
- [ ] `GetGame`/`UpdateGame`/`DeleteGame` zwracają `{ kind: 'not_found' }` zarówno gdy
      gry nie ma, jak i gdy istnieje, ale `game.userId !== userId`
- [ ] `CreateGame` przekazuje `userId` do `NewGame.create({ ..., userId })`
- [ ] `ListGames` przekazuje `userId` w `ListGamesQuery`
- [ ] Testy IDOR: dla gry usera A próba GET/UPDATE/DELETE jako user B → `not_found`

Agent kończy pracę WYŁĄCZNIE gdy powyższe są spełnione.

## Context
**Runtime:** Bun (`bun test`, `bun run check`)
**Katalog roboczy:** `apps/api`
**Architektura:** application warstwa orkiestruje domain + repo. Tu trzymamy politykę ownership.
**Bezpieczeństwo:** zwracamy `not_found` zamiast `forbidden` dla cudzych zasobów (zapobieganie enumeration / leak istnienia rekordu).
**Domain z fazy 1:** `NewGame.create({ ..., userId })`, `Game.userId`, `ListGamesQuery.userId`.
**Repo z fazy 2:** `list()` filtruje po userId; `findById/delete` bez filtru — ownership tu.

## Design decisions
- `userId` to **drugi/dodatkowy parametr** `.execute()` — nie wpychamy go do `input` z body, bo body to dane z warstwy HTTP od klienta. `userId` pochodzi z auth context, nie od klienta.
- Sygnatury (kolejność dla spójności):
  - `CreateGame.execute(input: unknown, userId: string)`
  - `ListGames.execute(input: unknown, userId: string)`
  - `GetGame.execute(id: number, userId: string)`
  - `UpdateGame.execute(id: number, input: unknown, userId: string)`
  - `DeleteGame.execute(id: number, userId: string)`
- W `UpdateGame` i `DeleteGame` najpierw `findById`, potem ownership check, potem mutacja. To dwa zapytania, ale czystość > 1 query.
- `UpdateGame` przy `NewGame.create` musi przekazać `userId` (z istniejącej gry albo z parametru — to ten sam string). Najczystsze: `userId` z istniejącej gry (`existing.userId`) — gwarantuje, że nawet gdyby ktoś zmienił sygnaturę, nie zmienisz właściciela przy update.
- Errors typu `unauthorized` / `forbidden` NIE pojawiają się w application — to robi middleware HTTP przed dotarciem do use case. Use case zakłada, że `userId` jest poprawny string z sesji.

## Relevant files (edit only these)
- `src/application/games/create-game.ts`
- `src/application/games/list-games.ts`
- `src/application/games/get-game.ts`
- `src/application/games/update-game.ts`
- `src/application/games/delete-game.ts`
- `src/application/games/create-game.test.ts`
- `src/application/games/list-games.test.ts`
- `src/application/games/update-game.test.ts`
- `src/application/games/delete-game.test.ts`

## Files to read but NOT edit
- `src/domain/games/game.ts` — wykorzystaj `NewGame.create({...,userId})` i `Game.userId`
- `src/domain/games/game-repository.ts` — `ListGamesQuery.userId` istnieje
- `src/domain/shared/result.ts` — `Result<T,E>`, `ok`, `err`

## Steps

### Step 1: Zaktualizuj testy use case'ów (RED)
**Co robimy:**
1. **`create-game.test.ts`**:
   - W `FakeGameRepository.create` dorzuć `userId: g.userId` do `Game.fromPersistence`
   - Wywołania `useCase.execute(validInput)` zmień na `useCase.execute(validInput, 'user-A')`
   - Dodaj test: stworzenie z `userId='user-A'` → `result.value.userId === 'user-A'`
2. **`list-games.test.ts`**:
   - W `FakeGameRepository.list` dorzuć filtr po userId (jeśli to fake — przefiltruj `this.all` po `g.userId === query.userId`)
   - W `makeGames` dodaj parametr `userId` (lub default `'user-A'`) i przekazuj do `Game.fromPersistence`
   - Wszystkie `useCase.execute({...})` zmień na `useCase.execute({...}, 'user-A')`
   - Dodaj test: 5 gier user-A + 3 gry user-B → list jako user-A zwraca 5
3. **`update-game.test.ts`**:
   - W `FakeGameRepository.create/update` dorzuć `userId: g.userId`
   - `existingGame` → dodaj `userId: 'user-A'`
   - Wszystkie `useCase.execute(1, validInput)` zmień na `useCase.execute(1, validInput, 'user-A')`
   - Dodaj test IDOR: gra `userId: 'user-A'`, wywołanie z `userId: 'user-B'` → `result.error.kind === 'not_found'`
   - Dodaj test: update gry user-A jako user-A nie zmienia `result.value.userId`
4. **`delete-game.test.ts`**:
   - `existingGame` → `userId: 'user-A'`
   - Wszystkie `useCase.execute(1)` → `useCase.execute(1, 'user-A')`
   - W fake `delete`: dodaj parametr id i sprawdzaj — repo nie zna userId, ownership w use case
   - Dodaj test IDOR: usuwanie gry user-A jako user-B → `not_found`, gra DALEJ istnieje w mapie
5. `bun test apps/api/src/application` → RED.
**Rezultat:** Testy istnieją i FAILUJĄ.

### Step 2: `CreateGame` z userId (GREEN)
**Co robimy:**
1. W `src/application/games/create-game.ts`:
   - Zmień sygnaturę: `async execute(input: unknown, userId: string): Promise<Result<Game, CreateGameError>>`
   - W budowaniu `props: GameProps` dodaj `userId` do obiektu PRZED `NewGame.create`
2. `bun test apps/api/src/application/games/create-game.test.ts` → GREEN.
**Rezultat:** create-game działa z userId.

### Step 3: `ListGames` z userId
**Co robimy:**
1. W `src/application/games/list-games.ts`:
   - Sygnatura: `async execute(input: unknown, userId: string)`
   - W konstrukcji `query: ListGamesQuery` dodaj `userId`
2. `bun test apps/api/src/application/games/list-games.test.ts` → GREEN.
**Rezultat:** list-games filtruje per user.

### Step 4: `GetGame` z ownership check
**Co robimy:**
1. W `src/application/games/get-game.ts`:
   - Sygnatura: `async execute(id: number, userId: string)`
   - Po `findById`: jeśli `!game || game.userId !== userId` → `err({ kind: 'not_found' })`
2. (`get-game` nie ma testu — pomiń lub stwórz `get-game.test.ts` jeśli czujesz potrzebę; nie jest to wymagane DoD).
**Rezultat:** GetGame jest IDOR-safe.

### Step 5: `UpdateGame` z ownership check
**Co robimy:**
1. W `src/application/games/update-game.ts`:
   - Sygnatura: `async execute(id: number, input: unknown, userId: string)`
   - PRZED `NewGame.create`: `const existing = await this.repo.findById(id)`
   - Jeżeli `!existing || existing.userId !== userId` → `err({ kind: 'not_found' })`
   - Do `props` dodaj `userId: existing.userId` (NIE z parametru — z agregatu, żeby nie zmienić właściciela)
   - Po `NewGame.create` (która stworzy `GameUpdate` z tym userId), `repo.update(id, gameUpdate)`
2. `bun test apps/api/src/application/games/update-game.test.ts` → GREEN.
**Rezultat:** UpdateGame chroni przed IDOR.

### Step 6: `DeleteGame` z ownership check
**Co robimy:**
1. W `src/application/games/delete-game.ts`:
   - Sygnatura: `async execute(id: number, userId: string)`
   - PRZED `repo.delete`: `const existing = await this.repo.findById(id)`
   - Jeżeli `!existing || existing.userId !== userId` → `err({ kind: 'not_found' })`
   - Dopiero potem `await this.repo.delete(id)`
2. `bun test apps/api/src/application/games/delete-game.test.ts` → GREEN.
**Rezultat:** DeleteGame chroni przed IDOR. Cudza gra dalej istnieje.

### Step 7: Pełne sprawdzenie
**Co robimy:**
1. `bun test apps/api` → wszystkie testy zielone
2. `bun run check` z `apps/api` → 0 błędów TypeScript
**Rezultat:** application warstwa gotowa, ownership wymuszony.

## If you get stuck
- Jeżeli istniejące testy nie kompilują się przez `userId` w `Game.fromPersistence` — pamiętaj że PHASE_1 dodała pole `userId` jako required w sygnaturze `fromPersistence`. Testy muszą je dostarczyć.
- Jeżeli nie wiesz, jak zaimplementować filtr w `FakeGameRepository.list` — najprostsze: `this.all.filter(g => g.userId === query.userId)`, potem paginacja jak była.
- Jeżeli po 2 próbach coś nie działa: ZATRZYMAJ. Napisz:
  `STUCK at Step <N>: <co, jaki błąd, jaka hipoteza>`
