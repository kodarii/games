# Games Filter & Sort — Faza 2: DB Migration & Indexes

## Goal
Dodać composite indexes do tabeli `games` żeby filtrowanie i sortowanie po `kind`, `platform`, `format`, `release_year`, `title` pozostały szybkie pod wzrostem ilości danych. Wygenerować i zaaplikować migrację Drizzle.

## Definition of Done
- [ ] `apps/api/src/infrastructure/db/schema.ts` ma 5 nowych composite indexów na tabeli `games`
- [ ] `bunx drizzle-kit generate` wygenerował nową migrację SQL w `apps/api/drizzle/`
- [ ] `bunx drizzle-kit migrate` zakończył się sukcesem (lokalnie)
- [ ] `EXPLAIN QUERY PLAN` dla przykładowego SELECT pokazuje wykorzystanie indeksu (manual check w step 3)
- [ ] `bun test` na całym `apps/api` zielone
- [ ] `bun run lint` zielone

Agent kończy pracę WYŁĄCZNIE gdy powyższe są spełnione.

## Context
**Runtime:** Bun (`bunx drizzle-kit ...`, NIE `npx`)
**ORM:** Drizzle, dialect: `sqlite-core` (better-sqlite3). Migracje generowane przez `drizzle-kit`.
**Skala:** docelowo do ~10k gier per user. Indexy są "future-proof" + wczesne.
**Strategia indeksowania:** composite z `user_id` na pierwszej pozycji (każde query ma `WHERE user_id = ?`), potem `kind`, potem kolumna filtrowania/sortowania.

## Design decisions
- 5 indeksów composite — każdy z prefixem `(user_id, kind)`:
  - `games_user_kind_idx` — fallback dla list bez sort/filter
  - `games_user_kind_platform_idx` — filter po platform + sort
  - `games_user_kind_format_idx` — filter po format
  - `games_user_kind_releaseyear_idx` — filter po year range + sort po releaseYear
  - `games_user_kind_title_idx` — sort po title
- Nie tworzymy indeksu per single column — leftmost-prefix matching wymaga prefixu z `user_id`.
- Indeksy NIE pokrywają wszystkich kombinacji filtrów (combinatorial explosion). Dla query z 2+ filtrami SQLite użyje jednego indeksu + filter w pamięci — to akceptowalne na tej skali.
- NIE używamy partial index z `WHERE kind = 'owned'` — w SQLite jest wspierane, ale `kind` jest niskocardinality (2 wartości) i nie warto.

### Relevant files (edit only these)
- `apps/api/src/infrastructure/db/schema.ts`
- `apps/api/drizzle/<nowy-folder-migracji>/` — wygenerowane przez drizzle-kit, NIE edytuj ręcznie

### Files to read but NOT edit
- `apps/api/drizzle.config.ts` — gdzie są migracje, jaki dialect
- `apps/api/drizzle/` — istniejące migracje (zerknij na format)

### Step 0: Pobierz dokumentację
Użyj Context7:
- Drizzle ORM SQLite: "composite index on sqliteTable, multiple columns"
- drizzle-kit: "generate migration, sqlite dialect"

## Constraints
- NIE edytuj wygenerowanych plików migracji ręcznie (poza wyjątkami)
- NIE rób `DROP INDEX` żadnego istniejącego (`games_user_id_idx`, `games_user_id_external_id_unq`)
- Migracje DODATKOWE — nigdy nie modyfikuj poprzednich migracji w drizzle/
- NIE uruchamiaj migracji na produkcji w tej fazie — tylko lokalnie

## Steps

### Step 1: Edytuj schema.ts
**Co robimy:**
1. Otwórz `apps/api/src/infrastructure/db/schema.ts`
2. W definicji tabeli `games`, w callbacku zwracającym tablicę indeksów, dodaj 5 nowych:
   ```ts
   (table) => [
     index('games_user_id_idx').on(table.userId),
     uniqueIndex('games_user_id_external_id_unq').on(table.userId, table.externalId),
     // NEW composite indexes for filter/sort
     index('games_user_kind_idx').on(table.userId, table.kind),
     index('games_user_kind_platform_idx').on(table.userId, table.kind, table.platform),
     index('games_user_kind_format_idx').on(table.userId, table.kind, table.format),
     index('games_user_kind_releaseyear_idx').on(table.userId, table.kind, table.releaseYear),
     index('games_user_kind_title_idx').on(table.userId, table.kind, table.title),
   ],
   ```
3. Zapisz plik.

**Rezultat:** schema.ts zawiera 5 nowych indeksów.

### Step 2: Wygeneruj i zaaplikuj migrację
**Co robimy:**
1. `bunx --cwd apps/api drizzle-kit generate`
2. Sprawdź `apps/api/drizzle/` — powinien być nowy folder/plik z `CREATE INDEX games_user_kind_idx ...` itd.
3. Otwórz wygenerowany SQL i zweryfikuj że zawiera 5 `CREATE INDEX` (NIE `DROP`)
4. `bunx --cwd apps/api drizzle-kit migrate` — zaaplikuj lokalnie

**Rezultat:** migracja zaaplikowana, baza ma nowe indeksy.

### Step 3: Verify via EXPLAIN QUERY PLAN
**Co robimy:**
1. Stwórz tymczasowy plik `apps/api/scripts/__verify-indexes.ts`:
   ```ts
   import { db } from '../src/infrastructure/db/client';
   import { sql } from 'drizzle-orm';

   const queries = [
     "SELECT * FROM games WHERE user_id = 'x' AND kind = 'owned' ORDER BY title",
     "SELECT * FROM games WHERE user_id = 'x' AND kind = 'owned' AND platform IN ('PC')",
     "SELECT * FROM games WHERE user_id = 'x' AND kind = 'owned' AND release_year BETWEEN 2000 AND 2020",
   ];
   for (const q of queries) {
     const plan = await db.all(sql.raw(`EXPLAIN QUERY PLAN ${q}`));
     console.log(q);
     console.log(plan);
     console.log('---');
   }
   ```
2. Uruchom: `bun run --cwd apps/api scripts/__verify-indexes.ts`
3. Każdy plan musi zawierać `USING INDEX games_user_kind_*` (NIE `SCAN games`).
4. Jeśli widzisz `SCAN games` — coś jest źle, zatrzymaj się i raportuj STUCK.
5. Usuń `__verify-indexes.ts`.

**Rezultat:** plany zapytań używają indexów; plik weryfikacyjny usunięty.

### Step 4: Sanity check całej API
**Co robimy:**
1. `bun test apps/api/` — wszystkie istniejące testy muszą przechodzić
2. `bun run --cwd apps/api typecheck` — zielone
3. `bun run lint` — zielone

**Rezultat:** zero regresji.

## If you get stuck
Jeśli po 2 próbach coś nie działa: ZATRZYMAJ się. Napisz:
`STUCK at Step <N>: <co, jaki błąd, jaka hipoteza>`
Zakończ pracę.
