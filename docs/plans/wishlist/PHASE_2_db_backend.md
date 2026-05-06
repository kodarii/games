---
name: Wishlist Phase 2 DB + Backend
description: Migracja SQLite (kind + nullable status/hours/dev + CHECK), update warstwy application, seed
type: plan
---

# Wishlist — Faza 2: DB migration + Backend

## Goal
Dostosować bazę i warstwę application do nowego kontraktu domeny z fazy 1: dodać kolumnę `kind`, zrobić `status`/`hours_played`/`developer` nullable, dodać CHECK constraint na spójność per-kind, zaktualizować Drizzle schema, use case'y `create-game` i `update-game` (Zod `discriminatedUnion` po `kind`), repo adapter (mapowanie `kind`), seed. Endpoint dalej działa jak wcześniej (default `kind='owned'`).

## Definition of Done
- [ ] Migracja Drizzle wygenerowana w `apps/api/drizzle/` i zaaplikowana
- [ ] Wszystkie testy `apps/api`: `bun test` → zielone (domain z fazy 1, application zaktualizowane)
- [ ] `bun --cwd apps/api run typecheck` → 0 błędów (cały apps/api)
- [ ] SQL `INSERT INTO games (..., kind, status) VALUES (..., 'wishlist', 'Backlog')` → constraint violation
- [ ] SQL `INSERT INTO games (..., kind, status) VALUES (..., 'owned', NULL)` → constraint violation
- [ ] `seed.ts` używa `kind: 'wishlist'` zamiast `status: 'Wishlist'`; pozostałe pozycje mają jawnie `kind: 'owned'`
- [ ] `bun run --cwd apps/api db:migrate` zakończony bez błędów

Agent kończy pracę WYŁĄCZNIE gdy powyższe są spełnione.

## Context
**Runtime:** Bun
**ORM:** Drizzle ORM, dialect **SQLite** (`drizzle-orm/sqlite-core`, `better-sqlite3`)
**Migracje:** `bun run --cwd apps/api db:generate` + `bun run --cwd apps/api db:migrate`
**Walidacja:** Zod (parsowanie `unknown` → DTO w `application/`)

### Step 0: Pobierz dokumentację
Użyj Context7 (jeden query na bibliotekę):
- Drizzle ORM SQLite: "How to add CHECK constraint and add nullable column with custom SQL in drizzle-kit migration for SQLite"
- Zod: "discriminatedUnion with literal kind"

## Design decisions
- **SQLite ma ograniczenia ALTER TABLE** — nie można dodać CHECK przez `ALTER TABLE ADD CONSTRAINT`. Drizzle generuje plik `.sql` w `apps/api/drizzle/` — wygeneruj migrację, a następnie **ręcznie dopisz** w wygenerowanym pliku ostatnią sekcję: rebuild tabeli (`CREATE TABLE games_new ... CHECK (...)`, `INSERT INTO games_new SELECT ... FROM games`, `DROP TABLE games`, `ALTER TABLE games_new RENAME TO games`, recreate indexes). To standardowy wzorzec dla SQLite migrations.
- Dodanie kolumny `kind` z `DEFAULT 'owned'` — `NOT NULL` + default OK przy `ALTER TABLE ADD COLUMN`
- Backfill: `UPDATE games SET kind='wishlist', status=NULL, hours_played=NULL WHERE status='Wishlist'`; `UPDATE games SET developer=NULL WHERE developer='Unknown'`
- Kolejność operacji w migracji: ADD kind → backfill → drop NOT NULL na nullable → rebuild z CHECK
- Zod `discriminatedUnion('kind', [ownedSchema, wishlistSchema])`:
  - `ownedSchema`: `kind: literal('owned')`, `status` wymagany (4 wartości), `hoursPlayed` z defaultem `0`, `developer` opcjonalny/nullable
  - `wishlistSchema`: `kind: literal('wishlist')`, BRAK pól `status`/`hoursPlayed`/`purchasedAt`, `developer` opcjonalny/nullable
  - Default `kind: 'owned'` dla kompatybilności — opakuj input: jeśli brak `kind`, dodaj `'owned'` przed parse
- Route handler nie zmienia się — input dalej idzie jako `unknown` do use case
- Repo adapter `DrizzleGameRepository`:
  - `toDomain` (DB row → `Game.fromPersistence`): przekaż `kind` z rowa
  - `toRow` (`NewGame` → insert): zapisz `game.kind`; jeśli `status === null` → `null` w kolumnie; analogicznie hours/developer

## Relevant files (edit only these)
- `src/infrastructure/db/schema.ts` — kolumna `kind`, nullable `status`/`hoursPlayed`/`developer`
- `apps/api/drizzle/<NEW>.sql` — wygenerowana migracja (z ręcznym dopisaniem CHECK przez table rebuild)
- `src/infrastructure/games/drizzle-game-repository.ts` — mapowanie `kind` w obie strony
- `src/application/games/create-game.ts` — `discriminatedUnion`
- `src/application/games/update-game.ts` — `discriminatedUnion`
- `src/application/games/__tests__/create-game.test.ts` — nowe testy kindów
- `src/application/games/__tests__/update-game.test.ts` — nowe testy kindów
- `src/application/games/__tests__/list-games.test.ts` — naprawić rozpadnięte testy
- `src/application/export/export-snapshot.ts` — dodać `kind`, status nullable, usunąć `'Wishlist'` z unii
- `src/infrastructure/db/seed.ts` — `kind` jawnie

## Files to read but NOT edit
- `src/domain/games/game.ts` — zmieniony w fazie 1, czytaj typy `GameKind`, `GAME_KINDS`
- `src/domain/games/game-repository.ts` — port (bez zmian — kind filter doda faza 4)
- `apps/api/drizzle.config.ts` — config drizzle-kit
- istniejące pliki migracji w `apps/api/drizzle/` — wzorzec stylu

## Constraints
- TDD: test use case PRZED implementacją
- Route handler max ~20 linii — nie dotykaj logiki w `routes/games.ts`
- Repo adapter mapuje row ↔ domain (NIE zwraca surowych rows na zewnątrz)
- Parsowanie `unknown` → DTO przez Zod TYLKO w application layer
- Migracja: NIE `bun run --cwd apps/api db:migrate` zanim ręcznie nie sprawdzisz wygenerowanego SQL i nie dopiszesz CHECK przez table rebuild
- `discriminatedUnion` po `kind` — NIE buduj dwóch osobnych schemas i nie wybieraj ręcznie
- `seed.ts` — wszystkie pozycje muszą mieć jawne `kind` (nie polegaj na default)

## Steps

### Step 1: Schema Drizzle + wygenerowanie migracji
**Co robimy:**
1. W `src/infrastructure/db/schema.ts`, w tabeli `games`:
   - Dodaj `kind: text('kind').notNull().default('owned')` (po `userId`)
   - Zmień `developer: text('developer').notNull()` → `developer: text('developer')` (nullable)
   - Zmień `hoursPlayed: integer('hours_played').notNull().default(0)` → `hoursPlayed: integer('hours_played')`
   - Zmień `status: text('status').notNull().default('Backlog')` → `status: text('status')`
2. `bun run --cwd apps/api db:generate` — wygeneruje plik `0010_*.sql` w `apps/api/drizzle/`
3. Otwórz wygenerowany plik. Drizzle wygeneruje `ALTER TABLE` lub table rebuild — przeanalizuj.
4. **Dopisz ręcznie** na końcu pliku migracji (jeden statement na linię, każdy z `--> statement-breakpoint`):
   ```sql
   UPDATE `games` SET `kind` = 'wishlist', `status` = NULL, `hours_played` = NULL WHERE `status` = 'Wishlist';
   --> statement-breakpoint
   UPDATE `games` SET `developer` = NULL WHERE `developer` = 'Unknown';
   --> statement-breakpoint
   -- Table rebuild to add CHECK constraint (SQLite cannot ALTER TABLE ADD CONSTRAINT)
   CREATE TABLE `__new_games` (
     <skopiuj definicję tabeli z wygenerowanego pliku, ale na końcu dodaj:>
     CONSTRAINT `games_kind_consistency` CHECK (
       (`kind` = 'owned' AND `status` IS NOT NULL AND `hours_played` IS NOT NULL)
       OR
       (`kind` = 'wishlist' AND `status` IS NULL AND `hours_played` IS NULL AND `purchased_at` IS NULL)
     )
   );
   --> statement-breakpoint
   INSERT INTO `__new_games` SELECT * FROM `games`;
   --> statement-breakpoint
   DROP TABLE `games`;
   --> statement-breakpoint
   ALTER TABLE `__new_games` RENAME TO `games`;
   --> statement-breakpoint
   CREATE INDEX `games_user_id_idx` ON `games` (`user_id`);
   --> statement-breakpoint
   CREATE UNIQUE INDEX `games_user_id_external_id_unq` ON `games` (`user_id`, `external_id`);
   ```
5. `bun run --cwd apps/api db:migrate` → success
6. Manualny test (np. `sqlite3 apps/api/data/apex.db`):
   - `INSERT INTO games (user_id, title, developer, genre, platform, kind, status, format, external_id) VALUES ('x', 't', 'd', 'g', 'PC', 'wishlist', 'Backlog', 'digital', 'ext1');` → CHECK constraint failed
   - `INSERT ... VALUES ('x', 't', 'd', 'g', 'PC', 'owned', NULL, 'digital', 'ext2');` → CHECK constraint failed
   - oba błędy → migracja działa

**Rezultat:** migracja zaaplikowana, CHECK aktywny.

### Step 2: Zaktualizuj repo adapter + seed
**Co robimy:**
1. W `src/infrastructure/games/drizzle-game-repository.ts`:
   - W `toDomain` (lub jak nazywa się mapper): przekaż `kind: row.kind as GameKind` do `Game.fromPersistence`. Dodaj też `status`, `hoursPlayed`, `developer` jako nullable z rowa (one już są nullable w type — ale upewnij się, że nie ma `?? 0`/`?? ''` dla tych pól; muszą zachować `null`).
   - W `toRow`/insert: zapisz `kind: game.kind`, `status: game.status ?? null`, `hoursPlayed: game.hoursPlayed?.value ?? null`, `developer: game.developer ?? null`.
2. W `src/infrastructure/db/seed.ts`:
   - Każdą pozycję z `status: 'Wishlist'` przepisz na `kind: 'wishlist', status: null, hoursPlayed: null, purchasedAt: null` (jeśli było `purchasedAt` — usuń)
   - Dodaj `kind: 'owned'` JAWNIE do wszystkich pozostałych pozycji
3. `bun --cwd apps/api run typecheck` → 0 błędów po tym kroku

**Rezultat:** repo i seed kompilują się i są spójne z domeną.

### Step 3: Use case'y `create-game` + `update-game` (test → impl)
**Co robimy:**
1. W `src/application/games/__tests__/create-game.test.ts`:
   - Każdy istniejący test: dopisz `kind: 'owned'` w inputie (jeśli nie ma)
   - Dodaj testy:
     - input `{ kind: 'wishlist', title: 'X', platform: 'PC' }` (bez status/hours/purchasedAt) → `ok`, `value.kind === 'wishlist'`, `value.status === null`
     - input `{ kind: 'wishlist', title: 'X', platform: 'PC', status: 'Backlog' }` → `err({ kind: 'invalid_input', ... })` (Zod odrzuca — wishlist schema nie zna pola status; Zod `discriminatedUnion` jest strict)
     - input bez `kind` (legacy) → traktowany jako owned: jeśli `status` nie podany, default `'Backlog'`, `hoursPlayed` default `0`, ok
2. W `src/application/games/create-game.ts`:
   - Wydziel `OwnedSchema = z.object({ kind: z.literal('owned'), title: ..., developer: z.string().optional().nullable(), status: z.enum(['Playing','Completed','Backlog','Dropped']).default('Backlog'), hoursPlayed: z.coerce.number().min(0).default(0), platform: ..., format: ..., genre, releaseYear, edition, coverColor, coverImage, price, purchasedAt })`
   - `WishlistSchema = z.object({ kind: z.literal('wishlist'), title: z.string().min(1), platform: z.string().min(1), developer: z.string().optional().nullable(), genre: z.string().optional().default(''), releaseYear: ..., edition: ..., format: z.enum(['physical','digital']).default('digital'), coverColor: ..., coverImage: ..., price: z.number().int().min(0).optional() })` — BRAK status/hoursPlayed/purchasedAt
   - `CreateGameInputSchema = z.discriminatedUnion('kind', [OwnedSchema, WishlistSchema])`
   - W `execute()`: jeśli `input` nie ma `kind`, dorzuć `kind: 'owned'` (`const inputWithKind = typeof input === 'object' && input !== null && !('kind' in input) ? { ...input, kind: 'owned' } : input;`)
   - Po parse — buduj `GameProps` zgodnie z parsed.kind: owned przekazuje status/hours, wishlist przekazuje `status: null, hoursPlayed: null, purchasedAt: null`
   - Reszta pipeline'a (`NewGame.create` → `repo.create`) bez zmian
3. Analogicznie `src/application/games/update-game.ts` (i jego testy).
4. `bun test apps/api/src/application/games` → GREEN

**Rezultat:** create/update wspierają oba kindy, testy zielone.

### Step 4: Naprawić export-snapshot + uruchomić cały suite
**Co robimy:**
1. W `src/application/export/export-snapshot.ts`:
   - Dodaj `kind: 'owned' | 'wishlist'` do typu/schemy snapshotu pojedynczej gry
   - Zmień `status` w typie na nullable (`status: GameStatus | null`)
   - Usuń `'Wishlist'` z unii statusów
   - Mapowanie: `kind: g.kind`, `status: g.status`, `hoursPlayed: g.hoursPlayed?.value ?? null`, `developer: g.developer`
2. `bun test` w `apps/api` (cały suite) → ALL GREEN
3. `bun --cwd apps/api run typecheck` → 0 błędów
4. `bun --cwd .. run lint` (z roota) lub `bun run lint` → czyste

**Rezultat:** backend w pełni spójny z nowym kontraktem.

## If you get stuck
Jeśli po 2 próbach coś nie działa: ZATRZYMAJ. Napisz:
`STUCK at Step <N>: <co, jaki błąd, jaka hipoteza>`
Zakończ pracę.
