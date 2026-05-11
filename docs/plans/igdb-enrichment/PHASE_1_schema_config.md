# IGDB enrichment — Faza 1: Schema migration + typed config

## Goal
Dodaj migrację Drizzle (3 nowe kolumny na `games`, dwie nowe tabele) oraz typed config module z walidacją zod dla env vars. Żaden kod aplikacyjny jeszcze nie czyta nowych kolumn — to czysta praca infrastrukturalna, niezależnie revertowalna.

## Definition of Done
- [ ] Migracja `apps/api/drizzle/0014_add_metadata_tables.sql` istnieje i przechodzi przy starcie (`bun --filter @games/api dev` startuje bez błędu)
- [ ] Schema Drizzle zawiera nowe kolumny + tabele
- [ ] `apps/api/src/infrastructure/config/env.ts` istnieje, parsuje env zod-em, eksportuje typed singleton
- [ ] `wiring.ts` importuje config module JAKO PIERWSZY import (brakujące env → crash przy starcie, PRZED rejestracją routów)
- [ ] `bun run check` (z roota repo) czyste — typecheck przechodzi
- [ ] `bun test` — wszystkie istniejące testy nadal zielone (nic nie zepsuliśmy)

Agent kończy pracę WYŁĄCZNIE gdy powyższe są spełnione.

## Context
**Runtime:** Bun (NIE Node.js, NIE npm). Komendy: `bun test`, `bun run check`, `bunx drizzle-kit ...`
**Monorepo:** `apps/api/` (backend), `apps/client/` (frontend). Edytujesz TYLKO `apps/api/` w tej fazie.
**DB:** Bun-SQLite (NIE Postgres). Drizzle z `drizzle-orm/sqlite-core`. Migracje używają `integer`, `text`, `integer { mode: 'timestamp' }` — NIE używaj `serial`, `uuid`, `jsonb`.
**Migracje:** numerowane sekwencyjnie. Następny numer to **0014** (ostatnia shippowana: `0013_add_games_filter_indexes.sql`).
**Migrate-on-boot:** migracje uruchamiają się automatycznie przy starcie procesu (`apps/api/src/infrastructure/db/client.ts:25-28`). Nie ma manualnego kroku.
**Styl SQL:** istniejące migracje używają `ALTER TABLE` + `CREATE INDEX IF NOT EXISTS` + separator `--> statement-breakpoint`. Zobacz `apps/api/drizzle/0013_add_games_filter_indexes.sql` jako wzór stylistyczny.

## Design decisions
- **WSZYSTKIE nowe kolumny na `games` mają prefix `metadata_*`, NIE `igdb_*`.** Powód: nazwy są vendor-neutralne; domain layer czyta te kolumny i nie może wiedzieć o IGDB. Konkretnie: `metadata_provider`, `metadata_provider_id`, `metadata_matched_at`. Każda jest NULL-able (istniejące rekordy nie mają enrichment).
- **`metadata_provider_id` to `TEXT`, nie `INTEGER`.** Powód: dziś IGDB ma numeryczne id, ale gdy dojdzie RAWG/MobyGames używają slugów/stringów. Stringujemy na granicy adaptera.
- **Tabela `metadata_cache` jest vendor-neutralna.** Tabela `igdb_oauth_token` JEST vendor-specific BY DESIGN — każdy provider ma inny model auth (RAWG: API key header, MobyGames: inny OAuth), więc generalizacja jest premature abstraction.
- **Brak `UNIQUE(metadata_provider, metadata_provider_id)`.** Powód: multi-platform games legalnie współdzielą IGDB id (PS4 i PS5 wersja tego samego tytułu). Brak constraintu, brak indeksu — dodamy gdy będzie potrzebny.
- **Cache key liczony jest poza tabelą (w warstwie aplikacji).** Kolumna `cache_key` to `text notNull` z `unique index (provider, cache_key)`. Algorytm liczenia kluczy — Faza 4, nie teraz.
- **Config module migruje TYLKO `IGDB_*`, `UPLOADTHING_TOKEN`, `BETTER_AUTH_*`.** Nic innego. Powód: małe i contained; single-file revert jeśli pójdzie nie tak.
- **Config parsuje przy IMPORCIE module'u (top-level `envSchema.parse(...)`).** Brakujące env → crash PRZED startem Hono. To boot-order requirement: config musi być pierwszym importem w `wiring.ts`.
- Nazwy env: `IGDB_CLIENT_ID` (string, required), `IGDB_CLIENT_SECRET` (string, required), `IGDB_TIMEOUT_MS` (number, default 5000), `IGDB_CACHE_TTL_DAYS` (number, default 30).
- **Migration concurrency:** runner relies on Drizzle's `__drizzle_migrations` row + `globalThis.__apexDbMigrated` flag (per-process guard, NOT cross-process lock). SQLite WAL serializes writes so a brief HMR overlap is safe (second `migrate()` no-ops). Bun-SQLite single-writer property prevents corruption. This assumption breaks in a multi-process or Postgres deployment — wrap `migrate()` in an advisory lock when that happens.

### Relevant files (edit only these)
- `apps/api/src/infrastructure/config/env.ts` — NOWY plik
- `apps/api/src/infrastructure/db/schema.ts` — dodaj nowe kolumny + tabele
- `apps/api/drizzle/0014_add_metadata_tables.sql` — NOWA migracja
- `apps/api/drizzle/meta/_journal.json` — Drizzle aktualizuje sam, ale sprawdź że nowy wpis się dodał
- `apps/api/.env.example` — udokumentuj nowe vars
- `apps/api/src/wiring.ts` — DODAJ import configu na samej górze i podmień `process.env.UPLOADTHING_TOKEN` na czytanie z configu. NIE dotykaj pozostałych miejsc.

### Files to read but NOT edit
- `apps/api/src/infrastructure/db/schema.ts` (całość — żeby zobaczyć styl)
- `apps/api/drizzle/0013_add_games_filter_indexes.sql` (wzór migracji)
- `apps/api/drizzle/0011_add_notes.sql` (najprostszy wzór ALTER TABLE)
- `apps/api/src/wiring.ts` (żeby wiedzieć gdzie wstawić import)

## Constraints
- NIE zmieniaj nazwy ani znaczenia istniejącej kolumny `external_id` na `games` (ona jest publiczne UUID — patrz `game-repository.ts:37 findByExternalId`)
- NIE dodawaj `igdb_id` ani `igdb_matched_at` — vendor names leakują do persistence shape
- NIE używaj Postgres-only typów (serial, uuid, jsonb) — to SQLite
- NIE rób backfill — nowe kolumny są NULL na istniejących rekordach i to jest poprawne
- NIE migruj innych env vars niż wymienione w "Design decisions"
- Drizzle generator (`bunx drizzle-kit generate`) może wygenerować plik o innej nazwie — zrenamuj plik fizycznie na `0014_add_metadata_tables.sql` (i odpowiedni wpis w `meta/_journal.json` jeśli generator coś dorzuci automatycznie)

## Steps

### Step 1: Typed config module
**Co robimy:**
1. Utwórz `apps/api/src/infrastructure/config/env.ts` z zod schema:
   ```ts
   import { z } from 'zod';

   const envSchema = z.object({
     IGDB_CLIENT_ID: z.string().min(1),
     IGDB_CLIENT_SECRET: z.string().min(1),
     IGDB_TIMEOUT_MS: z.coerce.number().int().positive().default(5000),
     IGDB_CACHE_TTL_DAYS: z.coerce.number().int().positive().default(30),
     UPLOADTHING_TOKEN: z.string().min(1),
     BETTER_AUTH_SECRET: z.string().min(1),
     BETTER_AUTH_URL: z.string().url().optional(),
   });

   export const env = envSchema.parse(process.env);
   export type Env = typeof env;
   ```
2. W `apps/api/.env.example` dodaj:
   ```
   IGDB_CLIENT_ID=
   IGDB_CLIENT_SECRET=
   IGDB_TIMEOUT_MS=5000
   IGDB_CACHE_TTL_DAYS=30
   ```
3. W `apps/api/src/wiring.ts` — DODAJ na samej górze pliku (PRZED wszystkimi innymi importami):
   ```ts
   import { env } from './infrastructure/config/env';
   ```
   Następnie tylko jedna zmiana niżej w pliku: tam gdzie jest `process.env.UPLOADTHING_TOKEN ?? ''`, podmień na `env.UPLOADTHING_TOKEN`. Wszystko inne zostaw.

**Rezultat:** `bun run check` zielone; jeśli usuniesz `IGDB_CLIENT_ID` z `.env` lokalnie i odpalisz `bun --filter @games/api dev`, dostajesz `ZodError` zanim Hono startuje.

### Step 2: Drizzle schema — nowe kolumny + tabele
**Co robimy:**
1. W `apps/api/src/infrastructure/db/schema.ts` dodaj 3 kolumny do `games` (między `notes` a `externalId`):
   ```ts
   metadataProvider: text('metadata_provider'),
   metadataProviderId: text('metadata_provider_id'),
   metadataMatchedAt: text('metadata_matched_at'),
   ```
2. Na końcu pliku dodaj dwie nowe tabele:
   ```ts
   export const metadataCache = sqliteTable(
     'metadata_cache',
     {
       id: integer('id').primaryKey({ autoIncrement: true }),
       provider: text('provider').notNull(),
       cacheKey: text('cache_key').notNull(),
       candidatesJson: text('candidates_json').notNull(),
       fetchedAt: integer('fetched_at', { mode: 'timestamp' }).notNull(),
     },
     (table) => [
       uniqueIndex('metadata_cache_provider_cache_key_unq').on(table.provider, table.cacheKey),
     ],
   );

   export type MetadataCacheRow = typeof metadataCache.$inferSelect;
   export type NewMetadataCacheRow = typeof metadataCache.$inferInsert;

   export const igdbOauthToken = sqliteTable('igdb_oauth_token', {
     id: integer('id').primaryKey({ autoIncrement: true }),
     accessToken: text('access_token').notNull(),
     expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
     obtainedAt: integer('obtained_at', { mode: 'timestamp' }).notNull(),
   });

   export type IgdbOauthTokenRow = typeof igdbOauthToken.$inferSelect;
   export type NewIgdbOauthTokenRow = typeof igdbOauthToken.$inferInsert;
   ```
3. `bun run check` — typecheck musi przejść.

**Rezultat:** schema kompiluje się, ale jeszcze nie ma pliku SQL.

### Step 3: Wygeneruj + zrenamuj migrację, uruchom
**Co robimy:**
1. `bunx --cwd apps/api drizzle-kit generate` — Drizzle wygeneruje plik `apps/api/drizzle/NNNN_<random_name>.sql` z timestampem.
2. Zrenamuj plik fizycznie na `0014_add_metadata_tables.sql`. Zaktualizuj `apps/api/drizzle/meta/_journal.json` — zmień pole `tag` ostatniego entry na `0014_add_metadata_tables`. Jeśli drizzle-kit wygenerował snapshot pod `apps/api/drizzle/meta/0014_<random>.json`, ZRENAMUJ ten plik tak żeby nazwa odpowiadała tagowi (zwykle `0014_snapshot.json` lub `0014_add_metadata_tables.json` — sprawdź jak są nazwane wcześniejsze snapshoty w `meta/`). Sanity-check: `bun --filter @games/api dev` startuje bez errora `no such file` ani `migration hash mismatch`.
3. Zweryfikuj zawartość pliku SQL — powinien zawierać:
   - `ALTER TABLE games ADD ...` × 3 (dla każdej kolumny)
   - `CREATE TABLE metadata_cache ...`
   - `CREATE UNIQUE INDEX metadata_cache_provider_cache_key_unq ...`
   - `CREATE TABLE igdb_oauth_token ...`
   Jeśli generator umieścił to w jednym statement bez `statement-breakpoint`, dodaj separatory `--> statement-breakpoint` między każdym statementem (jak w 0013).
4. Uruchom backend: `bun --filter @games/api dev` (lub jak inaczej w projekcie). Migracje aplikują się automatycznie przy starcie. Sprawdź że proces nie crashuje.
5. `bun test` z roota repo — wszystkie istniejące testy zielone.

**Rezultat:** migracja zaaplikowana, schema TS zgodna z DB, wszystkie testy zielone, `bun run check` czyste.

## If you get stuck
Jeśli po 2 próbach coś nie działa: ZATRZYMAJ się. Napisz:
STUCK at Step <N>: <co dokładnie nie działa, jaki błąd dostałeś, jaka twoja hipoteza co jest przyczyną>
Zakończ pracę. Nie próbuj obejść problemu w inny sposób.
