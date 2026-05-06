---
name: Wishlist Phase 4 Backend feature
description: list-games kind filter + use case move-to-collection + endpoint POST /games/:externalId/move-to-collection (TDD)
type: plan
---

# Wishlist — Faza 4: Backend feature wishlist

## Goal
Dodać do backendu dwie rzeczy potrzebne do user-facing wishlistu:
1. Filtr `?kind=owned|wishlist` w `GET /api/games` (use case `ListGames`, port `GameRepository`, repo adapter)
2. Use case + endpoint `POST /api/games/:externalId/move-to-collection`: dla pozycji wishlistowej ustawia `kind='owned', status='Backlog', hoursPlayed=0`, zachowuje pozostałe pola (w tym `price`, `coverImage`, `developer`)

## Definition of Done
- [ ] Test use case'a `MoveToCollection` przechodzi: `bun test apps/api/src/application/games/move-to-collection`
- [ ] Test `ListGames` z `kind: 'wishlist'` filtruje wynik (tylko wishlistowe)
- [ ] Cały suite: `bun test` w `apps/api` → GREEN
- [ ] `bun --cwd apps/api run typecheck` → 0 błędów
- [ ] Endpoint `POST /api/games/:externalId/move-to-collection` zwraca:
  - 200 z `{ game: ... }` (z `kind: 'owned'`, `status: 'Backlog'`, `hoursPlayed: 0`) gdy gra była `wishlist` i należy do usera
  - 404 `{ error: 'not_found' }` gdy nie istnieje LUB nie należy do usera (nie zdradzamy istnienia)
  - 409 `{ error: 'already_owned' }` gdy gra już ma `kind='owned'`
- [ ] Endpoint chroniony Better-Auth (auth middleware jak inne `/api/games/*` routes) — `userId` z sesji, NIE z body

Agent kończy pracę WYŁĄCZNIE gdy powyższe są spełnione.

## Context
**Runtime:** Bun
**Stack:** Hono routes, Drizzle SQLite, Zod
**Auth:** Better-Auth — middleware jest już zainstalowany na `/api/games/*` (sprawdź `src/routes/games.ts`)
**Result type:** `Result<T, E>` z `src/domain/shared/result.ts`

### Step 0: Pobierz dokumentację
Użyj Context7 (jeden query na bibliotekę):
- Hono: "How to define POST route with URL param and JSON response"
- Drizzle SQLite: "WHERE clause with optional filter (conditional and())"

## Design decisions
- **Filtr `kind` w `ListGames`**:
  - `ListGamesQuery` (port) dostaje pole `kind?: GameKind` (opcjonalne — brak = bez filtra)
  - Zod schema w `list-games.ts` dodaje `kind: z.enum(['owned', 'wishlist']).optional()`
  - Repo adapter: jeśli `query.kind` podane → dodaj warunek `eq(games.kind, query.kind)` do `WHERE`
- **Use case `MoveToCollection`** w nowym pliku `src/application/games/move-to-collection.ts`:
  - Input: `{ externalId: string }` (userId z sesji, nie z body)
  - Repo: `findByExternalId(userId, externalId)` (już istnieje w porcie)
  - Walidacje (kolejność):
    1. Gra nie istnieje → `err({ kind: 'not_found' })`
    2. `game.kind === 'owned'` → `err({ kind: 'already_owned' })`
  - Stwórz nowy `NewGame` z propsami starej gry **plus**: `kind: 'owned'`, `status: 'Backlog'`, `hoursPlayed: 0` (bez `purchasedAt` — wishlist miał `null`, owned może mieć `null`)
  - `repo.update(game.id, newGame)` — zwraca zaktualizowaną grę
  - Result: `Result<Game, MoveToCollectionError>` gdzie `MoveToCollectionError = { kind: 'not_found' } | { kind: 'already_owned' } | { kind: 'domain'; error: GameValidationError }`
- **Endpoint** `POST /api/games/:externalId/move-to-collection`:
  - Path param `externalId`
  - Brak body
  - Mapowanie błędów: `not_found` → 404, `already_owned` → 409, `domain` → 422 (z details)
  - Sukces → 200 `{ game: result.value.toJSON() }`
- NIE używaj transakcji — single-row update wystarczy. (Idempotency key też nie — to operacja klikana z UI, nie API publiczne.)
- NIE dotykaj `create-game` ani `update-game` (zrobione w fazie 2)

## Relevant files (edit only these)
- `src/domain/games/game-repository.ts` — dodaj `kind?: GameKind` do `ListGamesQuery`
- `src/infrastructure/games/drizzle-game-repository.ts` — uwzględnij `query.kind` w WHERE
- `src/application/games/list-games.ts` — Zod accepts `kind`, przekazuje do query
- `src/application/games/__tests__/list-games.test.ts` — test filtra kind
- `src/application/games/move-to-collection.ts` — NOWY plik, use case
- `src/application/games/__tests__/move-to-collection.test.ts` — NOWY plik, testy
- `src/routes/games.ts` — dodaj route POST `/games/:externalId/move-to-collection`

## Files to read but NOT edit
- `src/domain/games/game.ts` — `GameKind`, `GAME_KINDS`, `NewGame.create`
- `src/application/games/__tests__/list-games.test.ts` — wzorzec FakeRepository (jak zbudować in-memory repo do testów)
- `src/application/games/create-game.ts` — wzorzec użycia Zod safeParse + mapowania błędów
- istniejące endpointy w `src/routes/games.ts` — wzorzec auth middleware, mapowania błędów na HTTP status

## Constraints
- TDD: NAJPIERW test (RED), POTEM implementacja (GREEN)
- Route handler max ~20 linii — TYLKO: pobierz `userId` z context, wywołaj use case, zmapuj Result na HTTP response
- ZERO logiki biznesowej w handlerze ani repo adapterze
- NIE zwracaj surowych `Game` obiektów z route — używaj `game.toJSON()`
- Mapowanie `not_found`: nie zdradzaj różnicy między "nie istnieje" a "nie twoje" (oba zwracają 404 `not_found`)
- Walidacja kolejność w use case: `not_found` PRZED `already_owned` (jak nie znajdzie po userId — i tak nie wie czy istnieje gdzieś indziej)
- `MoveToCollection` nie dotyka pól typu `coverImage`, `coverColor`, `developer`, `genre`, `releaseYear`, `edition`, `format`, `platform`, `price` — przepisuje 1:1 ze starej gry

## Steps

### Step 1: Filtr `kind` w `ListGames` (test → impl)
**Co robimy:**
1. W `src/application/games/__tests__/list-games.test.ts`:
   - Dodaj test: insert do FakeRepository 2 gry owned + 2 wishlist; wywołaj `ListGames.execute({ kind: 'wishlist' }, userId)` → result zawiera tylko 2 wishlistowe
   - Dodaj test: bez `kind` → result zawiera wszystkie 4
   - Dodaj test: `kind: 'invalid'` → Zod parse fail (use case rzuca/zwraca odpowiednio — sprawdź wzorzec)
2. W `src/domain/games/game-repository.ts`:
   - Dodaj import `GameKind` (z `./game`)
   - Dodaj `kind?: GameKind;` do interfejsu `ListGamesQuery`
3. W `src/application/games/list-games.ts`:
   - W `ListGamesQuerySchema` dodaj `kind: z.enum(['owned', 'wishlist']).optional()`
   - W `execute()`: przekaż `kind: parsed.kind` do `query`
4. W `src/infrastructure/games/drizzle-game-repository.ts`:
   - W metodzie `list`: jeśli `query.kind` podane, dorzuć `eq(games.kind, query.kind)` do warunku `WHERE` (przez `and(...)`)
5. `bun test apps/api/src/application/games/list-games` → GREEN

**Rezultat:** `?kind=wishlist` filtruje listę.

### Step 2: Test use case'a `MoveToCollection` (RED)
**Co robimy:**
1. Utwórz `src/application/games/__tests__/move-to-collection.test.ts`:
   - Skopiuj wzorzec FakeRepository z `list-games.test.ts` (lub przygotuj minimalny — `findByExternalId`, `update`)
   - Test: gra wishlist należąca do usera → `ok`, `value.kind === 'owned'`, `value.status === 'Backlog'`, `value.hoursPlayed.value === 0`, pozostałe pola (developer, coverImage, price, releaseYear) bez zmian
   - Test: gra nie istnieje (zły externalId) → `err({ kind: 'not_found' })`
   - Test: gra istnieje ale `kind === 'owned'` → `err({ kind: 'already_owned' })`
   - Test: gra należy do innego usera (FakeRepository.findByExternalId po userId) → `err({ kind: 'not_found' })` (NIE `not_owner` — leakage)
   - Test: gra wishlist która ma `developer: null` po move → `value.developer === null` (developer pozostaje null)
2. `bun test apps/api/src/application/games/move-to-collection` → RED (use case nie istnieje)

**Rezultat:** testy istnieją i FAILUJĄ.

### Step 3: Use case `MoveToCollection` (GREEN)
**Co robimy:**
1. Utwórz `src/application/games/move-to-collection.ts`:
   ```ts
   import type { Game, GameValidationError } from '../../domain/games/game';
   import { NewGame } from '../../domain/games/game';
   import type { GameRepository } from '../../domain/games/game-repository';
   import { err, ok, type Result } from '../../domain/shared/result';

   export type MoveToCollectionError =
     | { kind: 'not_found' }
     | { kind: 'already_owned' }
     | { kind: 'domain'; error: GameValidationError };

   export class MoveToCollection {
     constructor(private readonly repo: GameRepository) {}

     async execute(externalId: string, userId: string): Promise<Result<Game, MoveToCollectionError>> {
       const existing = await this.repo.findByExternalId(userId, externalId);
       if (!existing) return err({ kind: 'not_found' });
       if (existing.kind === 'owned') return err({ kind: 'already_owned' });

       const newGameResult = NewGame.create({
         userId: existing.userId,
         kind: 'owned',
         title: existing.title,
         developer: existing.developer,        // może być null — to OK
         genre: existing.genre,
         releaseYear: existing.releaseYear?.value,
         platform: existing.platform,
         edition: existing.edition,
         hoursPlayed: 0,
         status: 'Backlog',
         format: existing.format,
         coverColor: existing.coverColor,
         coverImage: existing.coverImage,
         price: existing.price?.value,
         purchasedAt: undefined,
       });
       if (!newGameResult.ok) return err({ kind: 'domain', error: newGameResult.error });

       const updated = await this.repo.update(existing.id, newGameResult.value);
       if (!updated) return err({ kind: 'not_found' });
       return ok(updated);
     }
   }
   ```
2. `bun test apps/api/src/application/games/move-to-collection` → GREEN

**Rezultat:** use case działa, testy zielone.

### Step 4: Endpoint + cały suite
**Co robimy:**
1. W `src/routes/games.ts`:
   - Znajdź jak inne route'y construct'ują use case (zwykle przez DI z Hono context, np. `c.var.repo` lub fabryka — naśladuj wzorzec)
   - Dodaj:
     ```ts
     app.post('/:externalId/move-to-collection', async (c) => {
       const userId = c.var.user.id; // lub zgodnie ze wzorcem
       const externalId = c.req.param('externalId');
       const useCase = new MoveToCollection(c.var.gameRepo);
       const result = await useCase.execute(externalId, userId);
       if (!result.ok) {
         if (result.error.kind === 'not_found') return c.json({ error: 'not_found' }, 404);
         if (result.error.kind === 'already_owned') return c.json({ error: 'already_owned' }, 409);
         return c.json({ error: 'invalid', details: result.error.error }, 422);
       }
       return c.json({ game: result.value.toJSON() }, 200);
     });
     ```
   - **Sprawdź wzorzec** auth middleware/DI w istniejących route'ach (`POST /:externalId` update, `DELETE /:externalId`) i dopasuj
2. `bun test` w `apps/api` (cały suite) → ALL GREEN
3. `bun --cwd apps/api run typecheck` → 0 błędów
4. `bun run lint` → 0 błędów

**Rezultat:** endpoint dostępny, wszystkie testy zielone.

## If you get stuck
Jeśli po 2 próbach coś nie działa: ZATRZYMAJ. Napisz:
`STUCK at Step <N>: <co, jaki błąd, jaka hipoteza>`
Zakończ pracę.
