# Phase 03 — Transakcje + optimistic locking

## Goal
Każdy read-modify-write use-case działa w obrębie `db.transaction()` z optimistic locking na `games.updatedAt`. Dziś tylko `import-data` używa transakcji — reszta cierpi na lost-update przy double-click i orphan dictionary records przy concurrent delete.

## Definition of Done
- [ ] Migracja Drizzle dodaje kolumnę `games.updated_at` (`integer mode: 'timestamp'`, default `NOW()`).
- [ ] `GameRepository.update()` przyjmuje `expectedUpdatedAt: Date` i rzuca `OptimisticLockError` jeśli WHERE-affected = 0.
- [ ] Use-case'y `UpdateGame`, `DeleteGame`, `EnrichGameMetadata`, `MoveToCollection` opakowane w `db.transaction(async tx => ...)` z repo wstrzykiwanym przez `tx`.
- [ ] `DeletePlatform`, `DeleteGenre`, `DeleteDeveloper` — read-count-delete w jednej transakcji.
- [ ] Nowe testy: lost-update scenario dla `UpdateGame` (dwa concurrent update → drugi dostaje `OptimisticLockError`).
- [ ] `bun test` zielone, `bun run check` + `bun run lint` czyste.

## Context
**ORM:** Drizzle z `bun-sqlite`. SQLite `db.transaction(callback)` używa `BEGIN IMMEDIATE` — serializuje writes.
**Pattern:** wszystkie operacje wewnątrz transakcji muszą używać `tx` zamiast `db`. To znaczy: repo musi mieć `withTx(tx).update(...)` lub repo factory `makeGameRepo(tx)`.

### Step 0: Context7
- Drizzle: "transactions", "transaction rollback", "withTransaction helper pattern".
- Drizzle: "update where affected rows count" (sprawdź jak czytać ilość zmodyfikowanych wierszy w sqlite).
- Bun-SQLite: "WAL mode" (czy włączone? jeśli nie — rozważ włączenie dla concurrent readers).

### Relevant files (edit)
- `apps/api/src/infrastructure/db/schema.ts` — dodać `updatedAt: integer('updated_at', { mode: 'timestamp' }).$defaultFn(() => new Date()).$onUpdate(() => new Date())` w tabeli `games`.
- `apps/api/drizzle/migrations/XXXX_add_updated_at.sql` — wygenerowane przez `bunx drizzle-kit generate`.
- `apps/api/src/domain/games/game.ts` — `Game` przyjmuje `updatedAt: Date`, eksponuje `get updatedAt()`. `fromPersistence` mapuje pole.
- `apps/api/src/domain/games/game-repository.ts` — dopisać `OptimisticLockError` typ. `update()` rzuca przy konflikcie.
- `apps/api/src/infrastructure/games/drizzle-game-repository.ts` — `update()`: WHERE `userId AND externalId AND updated_at = expectedUpdatedAt`. Jeśli `result.changes === 0` → throw `OptimisticLockError`.
- `apps/api/src/application/games/update-game.ts`, `delete-game.ts`, `enrich-game-metadata.ts`, `move-to-collection.ts` — wrap w `db.transaction`.
- `apps/api/src/application/genres/delete-genre.ts`, `developers/delete-developer.ts`, `platforms/delete-platform.ts` — wrap w `db.transaction`.
- `apps/api/src/routes/games.ts` — handlery `PUT /:externalId`, `DELETE /:externalId`, `PATCH /:id/metadata`, `POST /:id/move-to-collection` muszą obsłużyć nowy error kind (`optimistic_lock` → 409 Conflict z problem+json).
- Testy: `application/games/__tests__/update-game.optimistic.test.ts` — NOWY.

### Files to read but NOT edit
- `apps/api/src/infrastructure/db/client.ts` — eksport `db`.
- `apps/api/src/application/import/import-data.ts` — wzorzec użycia `db.transaction` (już istniejący).

## Design decisions
- **`expectedUpdatedAt`** przyjmowane z klienta w body jako ISO string (PUT) lub odczytywane z `findById` na początku transakcji (PATCH/DELETE). Wybór: dla PUT — klient wysyła snapshot (`If-Match` lub body field `updatedAt`); dla pozostałych — read na początku tx, write z `WHERE updated_at = <ten odczyt>`.
- **Konflikt = 409 Conflict, problem+json z `type: 'optimistic-lock'`** — klient renderuje "ktoś inny zmienił ten rekord, odśwież".
- **Repo per transaction**: dodać funkcję `withTx(tx: DrizzleTransaction): GameRepository` zwracającą nową instancję z `tx` zamiast `db`. Alternatywa: `db` jako parametr do każdej metody — gorsze ergonomicznie.
- **Dictionary deletes**: read game-count i delete genre w jednej transakcji. Race: ktoś dodaje grę między count a delete → game wciąż używa genre, ale genre usunięty. Mitygacja: w jednej transakcji + `SELECT COUNT(*) ... FOR UPDATE` (SQLite nie wspiera FOR UPDATE, ale `BEGIN IMMEDIATE` w transakcji blokuje inne writes — wystarczy).

## Constraints
- NIE wprowadzaj `serializable` isolation level manualnie — `db.transaction` w sqlite już daje `BEGIN IMMEDIATE`.
- NIE używaj `await` poza zakresem callbacka transakcji dla operacji, które MAJĄ być w transakcji.
- NIE traktuj `OptimisticLockError` jako 500 — to 409 Conflict.

## Steps

### Step 1: Migracja + schema + Game aggregate
1. Dodaj `updatedAt` do `apps/api/src/infrastructure/db/schema.ts` (games).
2. `bunx drizzle-kit generate` → wygeneruje migrację. Sprawdź czy SQL ma `DEFAULT CURRENT_TIMESTAMP` lub backfill.
3. `bunx drizzle-kit migrate`.
4. Rozszerz `Game.fromPersistence` o `updatedAt`. `Game` getter `get updatedAt()`.
5. `bun run check` musi przejść.

**Rezultat:** kolumna istnieje, agregat zna pole.

### Step 2: Repo `withTx` + optimistic update + test (RED→GREEN)
1. Test (RED): `update-game.optimistic.test.ts` — utwórz grę, odczytaj `updatedAt`, zmodyfikuj wiersz BEZPOŚREDNIO w DB (zmieniając `updatedAt`), wywołaj `UpdateGame` ze starym `updatedAt` → oczekuj `OptimisticLockError`.
2. Dodaj `OptimisticLockError` jako class (lub Result variant) w `game-repository.ts`.
3. Zaimplementuj `DrizzleGameRepository.update(..., expectedUpdatedAt)` z WHERE-clause i sprawdzeniem `result.changes`.
4. Dodaj `withTx(tx)` w `DrizzleGameRepository`.
5. `bun test` → GREEN dla nowego testu, stare testy zielone.

**Rezultat:** repo wspiera optimistic locking.

### Step 3: Wrap use-case'ów w `db.transaction`
Dla każdego use-case'a:
1. Constructor przyjmuje `db: BunSQLiteDatabase` (lub `DrizzleClient`).
2. `execute()` opakowuje całą logikę w `db.transaction(async tx => { const repo = this.gameRepo.withTx(tx); ... })`.
3. `UpdateGame.execute` — `findByExternalId` (tx) → walidacja → `update` z `existing.updatedAt`. Jeśli `OptimisticLockError` → return `err({ kind: 'conflict' })`.
4. `DeleteGame.execute` — w transakcji `findByExternalId` + `delete`.
5. `EnrichGameMetadata.execute` — `findByExternalId` (tx) + `saveMetadata` (tx) z `expectedUpdatedAt`.
6. `MoveToCollection.execute` — w transakcji.
7. Dictionary deletes — `findById` + `countByX` + `delete` w transakcji.

### Step 4: Route handlers — mapowanie konfliktu na 409
W `routes/games.ts`: po `match(result)` dodaj `case 'conflict'` → `problemJson(c, 409, { type: 'optimistic-lock', title: 'Conflict', detail: 'Resource was modified by another request' })`.

**Rezultat:** wszystkie use-case'y atomowe, `bun test` zielone.

## If you get stuck
Jeśli po 2 próbach coś nie działa: ZATRZYMAJ się. Napisz:
`STUCK at Step <N>: <co próbowałem, jaki błąd, jaka hipoteza>`
Zakończ pracę bez commitowania.
