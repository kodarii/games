---
name: Phase 2 Infrastructure
description: Tabela platforms + UNIQUE(user_id,name) + migracja + DrizzlePlatformRepository
type: plan
---

# Platform Dictionary — Faza 2: Infrastructure (DB + Repo)

## Goal
Dodać tabelę `platforms` (id, user_id FK do `user.id` ON DELETE CASCADE, name,
created_at) z `UNIQUE(user_id, name)` i indeksem na `user_id`. Wygenerować +
zastosować migrację. Zaimplementować `DrizzlePlatformRepository` realizujący
port z fazy 1. Mapper `mapRowToPlatform` mapuje DB row → `Platform.fromPersistence`.

## Definition of Done
- [ ] `bun run check` z `apps/api` → 0 błędów
- [ ] `bun test apps/api` → wszystko zielone (testy z fazy 1 dalej działają, brak nowych testów infra — to integracyjne, sprawdzamy ręcznie)
- [ ] Tabela `platforms` istnieje z kolumnami: `id INTEGER PRIMARY KEY AUTOINCREMENT`, `user_id TEXT NOT NULL` (FK → `user(id)` ON DELETE CASCADE), `name TEXT NOT NULL`, `created_at INTEGER`
- [ ] Constraint `UNIQUE(user_id, name)` aktywny — `INSERT` zduplikowanego (userId, name) failuje
- [ ] Indeks `platforms_user_id_idx` istnieje na `user_id`
- [ ] `DrizzlePlatformRepository` implementuje wszystkie 5 metod portu
- [ ] `mapRowToPlatform` używa `Platform.fromPersistence({...})` — nie zwraca surowych rows

Agent kończy pracę WYŁĄCZNIE gdy powyższe są spełnione.

## Context
**Runtime:** Bun (`bun test`, `bun run check`, `bun run db:generate`, `bun run db:migrate`)
**Katalog roboczy:** `apps/api`
**DB:** SQLite (better-sqlite3) w `apps/api/data/apex.db`
**ORM:** Drizzle ORM + drizzle-kit (config: `apps/api/drizzle.config.ts`)
**Auth:** Better-Auth, schemat w `src/infrastructure/db/auth-schema.ts` — tabela `user` z `id TEXT PRIMARY KEY`
**Architektura:** infrastructure może importować z domain (po fazie 1 mamy `Platform`, `NewPlatform`, `PlatformRepository`)

## Design decisions
- `user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE` — kasacja konta usuwa też słownik usera (analogicznie jak `games`).
- `UNIQUE(user_id, name)` jako compound constraint — wymusza unikalność nazwy w obrębie usera na poziomie bazy. To **safety-net** względem walidacji w application warstwie (faza 3 sprawdza przez `findByName` zanim doda).
- Indeks `platforms_user_id_idx` na `user_id` — każda lista platform filtruje po userId, więc indeks jest must-have.
- `findById` BEZ filtru po userId (ownership w use case w fazie 3, jak w `Game`).
- `findByName` filtruje `WHERE user_id = ? AND name = ?`. Case-sensitive (SQLite domyślnie binary-collation dla TEXT).
- NIE robimy `update` w repo — agregat `Platform` nie ma metody zmiany nazwy (decyzja z fazy 1).
- `created_at: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date())` — analogicznie do `games`.

## Relevant files (edit only these)
- `src/infrastructure/db/schema.ts` — dodanie tabeli `platforms` (NIE ruszamy `games`)
- `src/infrastructure/platforms/drizzle-platform-repository.ts` — nowy plik, implementacja portu
- `apps/api/drizzle/<nowa_migracja>.sql` — wygenerowana przez drizzle-kit

## Files to read but NOT edit
- `src/infrastructure/db/auth-schema.ts` — definicja tabeli `user` (do FK)
- `src/infrastructure/db/schema.ts` — wzorzec dla `games` (już ma user_id FK + index — naśladuj styl)
- `src/infrastructure/db/client.ts` — Drizzle client (`db`)
- `src/infrastructure/games/drizzle-game-repository.ts` — wzorzec implementacji repo
- `src/domain/platforms/platform.ts`, `platform-repository.ts` — z fazy 1
- `apps/api/drizzle/0003_late_the_hand.sql` (i poprzednie) — referencja, jak wyglądają migracje

## Steps

### Step 0: Pobierz dokumentację Drizzle (Context7)
**Co robimy:** użyj Context7:
- `drizzle-orm`: "sqlite unique compound constraint with table builder"
- `drizzle-orm`: "sqlite table foreign key references on delete cascade"
- `drizzle-orm`: "insert returning"

Notatka: w drizzle-orm dla SQLite compound unique definiuje się w callbacku tabeli przez `uniqueIndex(...).on(table.userId, table.name)`. Drugi argument do `sqliteTable` to callback `(table) => [...]` zwracający array indeksów/constraintów. **Jeśli docs nie potwierdzają — sprawdź `drizzle/0001_friendly_bishop.sql` lub `0003_late_the_hand.sql` w repo, jak tam zrobione indeksy.**
**Rezultat:** wiesz jakie API Drizzle użyć.

### Step 1: Dodaj tabelę `platforms` w schemacie
**Co robimy:**
1. W `src/infrastructure/db/schema.ts` na końcu pliku (po `games` + jego type exports) dodaj:
   ```ts
   import { uniqueIndex } from 'drizzle-orm/sqlite-core';

   export const platforms = sqliteTable(
     'platforms',
     {
       id: integer('id').primaryKey({ autoIncrement: true }),
       userId: text('user_id')
         .notNull()
         .references(() => user.id, { onDelete: 'cascade' }),
       name: text('name').notNull(),
       createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
     },
     (table) => [
       index('platforms_user_id_idx').on(table.userId),
       uniqueIndex('platforms_user_id_name_unq').on(table.userId, table.name),
     ],
   );

   export type PlatformRow = typeof platforms.$inferSelect;
   export type NewPlatformRow = typeof platforms.$inferInsert;
   ```
   UWAGA: `index` już jest zaimportowany w pliku — dodaj tylko `uniqueIndex` do importu z `drizzle-orm/sqlite-core`.
2. `bun run check` z `apps/api` → 0 błędów (TypeScript).
**Rezultat:** schemat ma tabelę, kompiluje się.

### Step 2: Wygeneruj + zastosuj migrację
**Co robimy:**
1. Z `apps/api`: `bun run db:generate`
2. Otwórz nowy plik `apps/api/drizzle/00XX_*.sql`. Sprawdź:
   - `CREATE TABLE platforms (...)` z `user_id TEXT NOT NULL`, `FOREIGN KEY (user_id) REFERENCES user(id) ON UPDATE no action ON DELETE cascade`
   - `CREATE INDEX platforms_user_id_idx ON platforms (user_id)`
   - `CREATE UNIQUE INDEX platforms_user_id_name_unq ON platforms (user_id, name)`
   - **Migracja NIE rusza tabeli `games`.** Jeśli rusza — coś poszło nie tak (drift schema). Stop, diagnoza.
3. `bun run db:migrate` z `apps/api`.
4. Weryfikacja:
   ```bash
   sqlite3 ./data/apex.db ".schema platforms"
   sqlite3 ./data/apex.db ".indexes platforms"
   ```
   Oczekiwane: `platforms_user_id_idx` i `platforms_user_id_name_unq` w indeksach.
**Rezultat:** baza ma tabelę z constraintami.

### Step 3: Implementacja `DrizzlePlatformRepository`
**Co robimy:**
1. Utwórz `src/infrastructure/platforms/drizzle-platform-repository.ts`:
   ```ts
   import { and, eq } from 'drizzle-orm';
   import { Platform, type NewPlatform } from '../../domain/platforms/platform';
   import type { PlatformRepository } from '../../domain/platforms/platform-repository';
   import { db } from '../db/client';
   import type { PlatformRow } from '../db/schema';
   import { platforms as platformsTable } from '../db/schema';

   export class DrizzlePlatformRepository implements PlatformRepository {
     private mapRowToPlatform(row: PlatformRow): Platform {
       return Platform.fromPersistence({
         id: row.id,
         userId: row.userId,
         name: row.name,
       });
     }

     async list(userId: string): Promise<Platform[]> {
       const rows = await db
         .select()
         .from(platformsTable)
         .where(eq(platformsTable.userId, userId))
         .orderBy(platformsTable.name);
       return rows.map((r) => this.mapRowToPlatform(r));
     }

     async findById(id: number): Promise<Platform | null> {
       const [row] = await db
         .select()
         .from(platformsTable)
         .where(eq(platformsTable.id, id))
         .limit(1);
       return row ? this.mapRowToPlatform(row) : null;
     }

     async findByName(userId: string, name: string): Promise<Platform | null> {
       const [row] = await db
         .select()
         .from(platformsTable)
         .where(and(eq(platformsTable.userId, userId), eq(platformsTable.name, name)))
         .limit(1);
       return row ? this.mapRowToPlatform(row) : null;
     }

     async create(newPlatform: NewPlatform): Promise<Platform> {
       const [inserted] = await db
         .insert(platformsTable)
         .values({ userId: newPlatform.userId, name: newPlatform.name })
         .returning();
       return this.mapRowToPlatform(inserted);
     }

     async delete(id: number): Promise<Platform | null> {
       const [deleted] = await db
         .delete(platformsTable)
         .where(eq(platformsTable.id, id))
         .returning();
       return deleted ? this.mapRowToPlatform(deleted) : null;
     }
   }
   ```
2. `bun run check` z `apps/api` → 0 błędów.
3. `bun test apps/api` → wszystko zielone (testy domeny z fazy 1).
**Rezultat:** repo gotowe, kompiluje się, testy nieuszkodzone.

## If you get stuck
- Jeżeli `bun run db:generate` nie wykrywa zmian — sprawdź `drizzle.config.ts` czy `schema` wskazuje na `src/infrastructure/db/schema.ts`.
- Jeżeli migracja failuje na `FOREIGN KEY constraint failed` — w SQLite trzeba mieć `PRAGMA foreign_keys = ON;` ustawione na połączeniu. Powinno być w `client.ts`. Jeśli nie ma — to oddzielny temat, NIE naprawiaj tutaj, zatrzymaj.
- Jeżeli test `findByName` nie działa case-sensitive jak oczekiwane — SQLite domyślnie używa BINARY collation dla TEXT. To jest OK, MVP.
- Po 2 próbach: ZATRZYMAJ. Napisz:
  `STUCK at Step <N>: <co, jaki błąd, jaka hipoteza>`
