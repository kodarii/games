# DDD Fixes — Faza 2: Backend

## Goal
Naprawić race condition przez atomowe `WHERE externalId AND userId` w Drizzle,
uprościć MoveToCollection żeby używał `Game.toOwned()` + `GameUpdate.fromGame()`,
zaktualizować sygnatury wszystkich use-case'ów na `externalId`,
i przenieść całą kompozycję zależności do `wiring.ts`.

## Definition of Done
- [ ] `bun test apps/api/src` — WSZYSTKIE testy zielone (domain + application)
- [ ] `bun run check` — zero błędów TypeScript
- [ ] `DrizzleGameRepository.update()` i `delete()` mają `WHERE externalId AND userId`
- [ ] `MoveToCollection` NIE wywołuje `NewGame.create()`
- [ ] `UpdateGame/DeleteGame/GetGame` przyjmują `externalId: string` (nie wewnętrzne id)
- [ ] `wiring.ts` eksportuje wszystkie use-case'y

## Context
**Runtime:** Bun (NIE Node.js, NIE npm)
**ORM:** Drizzle — użyj `and()`, `eq()` z `drizzle-orm`
**Faza 1 musi być skończona** — zakładamy że `GameUpdate`, `GameUpdate.fromGame()`,
`Game.toOwned()` i zaktualizowany port `GameRepository` istnieją na dysku

## Design decisions

- `DrizzleGameRepository.update(userId, externalId, game)` — WHERE: `AND(eq(externalId), eq(userId))`;
  index `games_user_id_external_id_unq` już istnieje — query jest efektywne
- `DrizzleGameRepository.delete(userId, externalId)` — tak samo; RETURNING daje nam usuniętą grę
  z `coverImage` — brak potrzeby wcześniejszego `findById`
- `UpdateGame.execute(externalId, input, userId)` — `findByExternalId` służy dwóm celom:
  sprawdzenie istnienia ORAZ pobranie `existing.coverImage` do cleanup
- `DeleteGame.execute(externalId, userId)` — jeden call do `repo.delete`; coverImage z returned row
- `MoveToCollection.execute(externalId, userId)` — `findByExternalId` → `.toOwned()` →
  `GameUpdate.fromGame()` → `repo.update(userId, externalId, ...)`
- `GetGame.execute(externalId, userId)` — zmiana sygnatury; używa `findByExternalId`

### Files to read first (z Fazy 1)
- `apps/api/src/domain/games/game.ts` — `GameUpdate`, `GameUpdate.fromGame()`, `Game.toOwned()`
- `apps/api/src/domain/games/game-repository.ts` — zaktualizowane sygnatury

### Files to edit
- `apps/api/src/infrastructure/games/drizzle-game-repository.ts`
- `apps/api/src/application/games/get-game.ts`
- `apps/api/src/application/games/update-game.ts`
- `apps/api/src/application/games/update-game.test.ts`
- `apps/api/src/application/games/delete-game.ts`
- `apps/api/src/application/games/delete-game.test.ts` (jeśli istnieje)
- `apps/api/src/application/games/move-to-collection.ts`
- `apps/api/src/application/games/__tests__/move-to-collection.test.ts`
- `apps/api/src/application/games/create-game.test.ts`
- `apps/api/src/application/games/list-games.test.ts` (jeśli jest FakeGameRepository)
- `apps/api/src/wiring.ts`
- `apps/api/src/routes/games.ts`

### Files to read but NOT edit
- `apps/api/src/infrastructure/db/schema.ts` — kolumny `externalId`, `userId`
- `apps/api/src/infrastructure/db/client.ts` — import `db`

## Constraints
- TDD: NAJPIERW zaktualizuj fake repositories (RED → kompilacja), POTEM implementacje (GREEN)
- `UpdateGame` NIE sprawdza `existing.userId !== userId` ręcznie — repo to robi przez WHERE
- `DeleteGame` — usuń zbędny `findById`; jeden call do `repo.delete` wystarczy
- `MoveToCollection` NIE wywołuje `NewGame.create()`
- routes/games.ts — usuń `new DrizzlePlatformRepository()`, importuj use-case'y z wiring.ts
- Fake repozytoria w testach muszą implementować nowe sygnatury portu

## Steps

### Step 1: Zaktualizuj fake repositories w testach (RED → kompilacja)

**Co robimy:**

1. Otwórz `apps/api/src/application/games/update-game.test.ts`
   - Zmień `FakeGameRepository.update(id, game)` → `update(userId, externalId, game)`
     Implementacja fake: znajdź grę po `externalId` zamiast po `id`:
     ```typescript
     async update(userId: string, externalId: string, game: GameUpdate): Promise<Game | null> {
       const existing = [...this.games.values()]
         .find(g => g.externalId === externalId && g.userId === userId);
       if (!existing) return null;
       const updated = Game.fromPersistence({
         id: existing.id,
         externalId: existing.externalId,
         kind: game.kind,
         userId: game.userId,
         title: game.title,
         developer: game.developer,
         genre: game.genre,
         releaseYear: game.releaseYear?.value ?? null,
         platform: game.platform,
         edition: game.edition ?? null,
         hoursPlayed: game.hoursPlayed?.value ?? null,
         status: game.status,
         format: game.format,
         coverImage: game.coverImage ?? null,
         price: game.price?.value ?? null,
         purchasedAt: game.purchasedAt?.value ?? null,
         notes: game.notes ?? null,
       });
       this.games.set(existing.id, updated);
       return updated;
     }
     ```
   - Zmień `FakeGameRepository.delete(id)` → `delete(userId, externalId)`:
     ```typescript
     async delete(userId: string, externalId: string): Promise<Game | null> {
       const game = [...this.games.values()]
         .find(g => g.externalId === externalId && g.userId === userId);
       if (!game) return null;
       this.games.delete(game.id);
       return game;
     }
     ```
   - Zmień `FakeGameRepository.create(g: GameUpdate)` — `g.externalId` nie istnieje na nowym
     `GameUpdate`; zastąp: `externalId: crypto.randomUUID()`

2. Zrób to samo w każdym innym pliku z `FakeGameRepository`:
   - `apps/api/src/application/games/__tests__/move-to-collection.test.ts`
   - `apps/api/src/application/games/create-game.test.ts`
   - `apps/api/src/application/games/delete-game.test.ts` (jeśli istnieje)
   - Każdy inny plik z `implements GameRepository`

3. Zaktualizuj wywołania `useCase.execute()` w `update-game.test.ts`:
   - Zmień `useCase.execute(1, input, 'user-A')` → `useCase.execute('ext-game-1', input, 'user-A')`
   - `existingGame` ma `externalId: 'ext-game-1'` — użyj tej wartości w każdym teście

4. `bun run check` → błędy pozostają tylko w implementacjach (nie w testach)

**Rezultat:** pliki testowe się kompilują.

### Step 2: Zaktualizuj DrizzleGameRepository

**Co robimy:**

1. Otwórz `apps/api/src/infrastructure/games/drizzle-game-repository.ts`

2. Zmień sygnaturę i implementację `update`:
```typescript
async update(userId: string, externalId: string, game: GameUpdate): Promise<Game | null> {
  const [updated] = await db
    .update(gamesTable)
    .set({
      kind: game.kind,
      title: game.title,
      developer: game.developer ?? null,
      genre: game.genre,
      releaseYear: game.releaseYear?.value ?? null,
      platform: game.platform,
      edition: game.edition ?? null,
      hoursPlayed: game.hoursPlayed?.value ?? null,
      status: game.status ?? null,
      format: game.format,
      coverColor: game.coverColor ?? null,
      coverImage: game.coverImage ?? null,
      price: game.price?.value ?? null,
      purchasedAt: game.purchasedAt?.value ?? null,
      notes: game.notes ?? null,
    })
    .where(and(eq(gamesTable.externalId, externalId), eq(gamesTable.userId, userId)))
    .returning();
  if (!updated) return null;
  return this.mapRowToGame(updated);
}
```

3. Zmień sygnaturę i implementację `delete`:
```typescript
async delete(userId: string, externalId: string): Promise<Game | null> {
  const [deleted] = await db
    .delete(gamesTable)
    .where(and(eq(gamesTable.externalId, externalId), eq(gamesTable.userId, userId)))
    .returning();
  if (!deleted) return null;
  return this.mapRowToGame(deleted);
}
```

4. `bun run check` → błędy tylko w application layer

**Rezultat:** repo kompiluje się, WHERE jest atomowe.

### Step 3: Zaktualizuj use-case'y i wiring (GREEN)

**Co robimy:**

1. **GetGame** (`apps/api/src/application/games/get-game.ts`):
```typescript
async execute(externalId: string, userId: string): Promise<Result<Game, GetGameError>> {
  const game = await this.repo.findByExternalId(userId, externalId);
  if (!game) return err({ kind: 'not_found' });
  return ok(game);
}
```

2. **UpdateGame** (`apps/api/src/application/games/update-game.ts`):
   - Zmień sygnaturę: `execute(externalId: string, input: unknown, userId: string)`
   - Zamień `NewGame.create(props)` → `GameUpdate.create(props)`
   - Zmień import: `GameUpdate` zamiast `NewGame`
   - `findByExternalId` zamiast `findById` (służy cover cleanup + implicit auth)
   - `repo.update(userId, externalId, gameUpdateResult.value)` zamiast `repo.update(id, userId, ...)`
   - Uproszczona logika:
   ```typescript
   async execute(externalId: string, input: unknown, userId: string) {
     const parsed = UpdateGameInputSchema.safeParse(...);
     if (!parsed.success) return err({ kind: 'invalid_input', ... });

     const existing = await this.repo.findByExternalId(userId, externalId);
     if (!existing) return err({ kind: 'not_found' });

     const platform = await this.platformRepo.findByName(userId, parsed.data.platform);
     if (!platform) return err({ kind: 'domain', error: { kind: 'platform_invalid', ... } });

     const gameUpdateResult = GameUpdate.create(props);
     if (!gameUpdateResult.ok) return err({ kind: 'domain', error: gameUpdateResult.error });

     const updated = await this.repo.update(userId, externalId, gameUpdateResult.value);
     if (!updated) return err({ kind: 'not_found' });

     // cover cleanup
     const oldUrl = existing.coverImage;
     const newUrl = updated.coverImage;
     if (oldUrl && oldUrl !== newUrl) {
       void this.coverStorage.delete(oldUrl).catch(...);
     }
     return ok(updated);
   }
   ```

3. **DeleteGame** (`apps/api/src/application/games/delete-game.ts`):
   - Zmień sygnaturę: `execute(externalId: string, userId: string)`
   - Usuń `findById` — coverImage bierzemy ze zwróconego deleted row
   ```typescript
   async execute(externalId: string, userId: string) {
     const deleted = await this.repo.delete(userId, externalId);
     if (!deleted) return err({ kind: 'not_found' });
     if (deleted.coverImage) {
       void this.coverStorage.delete(deleted.coverImage).catch((deleteErr) => {
         console.warn('[delete-game] cover cleanup failed', { externalId, deleteErr });
       });
     }
     return ok(deleted);
   }
   ```

4. **MoveToCollection** (`apps/api/src/application/games/move-to-collection.ts`):
   - Usuń import `NewGame`
   - Dodaj import `GameUpdate`
   - Uprość typ błędu — `{ kind: 'domain' }` jest teraz niemożliwy do osiągnięcia:
     ```typescript
     // PRZED:
     export type MoveToCollectionError =
       | { kind: 'not_found' }
       | { kind: 'already_owned' }
       | { kind: 'domain'; error: GameValidationError };

     // PO:
     export type MoveToCollectionError =
       | { kind: 'not_found' }
       | { kind: 'already_owned' };
     ```
   - Nowa implementacja:
   ```typescript
   async execute(externalId: string, userId: string): Promise<Result<Game, MoveToCollectionError>> {
     const existing = await this.repo.findByExternalId(userId, externalId);
     if (!existing) return err({ kind: 'not_found' });
     if (existing.kind === 'owned') return err({ kind: 'already_owned' });

     const movedGame = existing.toOwned();
     const updateData = GameUpdate.fromGame(movedGame);
     const updated = await this.repo.update(userId, externalId, updateData);
     if (!updated) return err({ kind: 'not_found' });
     return ok(updated);
   }
   ```
   - W `routes/games.ts` usuń też martwy branch `422` dla `domain`:
     ```typescript
     // PRZED:
     if (result.error.kind === 'already_owned') return c.json({ error: 'already_owned' }, 409);
     return c.json({ error: 'invalid', details: result.error.error }, 422); // ← usuń tę linię
     // PO:
     if (result.error.kind === 'already_owned') return c.json({ error: 'already_owned' }, 409);
     ```

5. **wiring.ts** — dodaj eksporty:
```typescript
import { DrizzlePlatformRepository } from './infrastructure/platforms/drizzle-platform-repository';
import { CreateGame } from './application/games/create-game';
import { UpdateGame } from './application/games/update-game';
import { DeleteGame } from './application/games/delete-game';
import { ListGames } from './application/games/list-games';
import { GetGame } from './application/games/get-game';
import { MoveToCollection } from './application/games/move-to-collection';

export const platformRepository = new DrizzlePlatformRepository();
export const createGame = new CreateGame(gameRepository, platformRepository);
export const updateGame = new UpdateGame(gameRepository, platformRepository, coverStorage);
export const deleteGame = new DeleteGame(gameRepository, coverStorage);
export const listGames = new ListGames(gameRepository);
export const getGame = new GetGame(gameRepository);
export const moveToCollection = new MoveToCollection(gameRepository);
```

6. **routes/games.ts**:
   - Usuń `import { DrizzlePlatformRepository }` i `new DrizzlePlatformRepository()`
   - Usuń lokalne `const createGame = ...` itd.
   - Dodaj: `import { createGame, updateGame, deleteGame, listGames, getGame, moveToCollection } from '../wiring'`

7. `bun test apps/api/src` → ALL GREEN
8. `bun run check` → zero błędów

**Rezultat:** wszystkie testy zielone, atomowe repo, uproszczone use-case'y, spójny wiring.

## If you get stuck
Jeśli po 2 próbach coś nie działa: ZATRZYMAJ się. Napisz:
`STUCK at Step <N>: <co, jaki błąd, jaka hipoteza>`
Zakończ pracę.
