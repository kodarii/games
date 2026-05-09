# Games Filter & Sort — Faza 4: Infrastructure (DrizzleGameRepository.list)

## Goal
Rozszerz `DrizzleGameRepository.list` o predykaty Drizzle dla nowych filtrów: `inArray` dla `platforms`/`formats`, `gte/lte` dla `releaseYear`, `LIKE ... ESCAPE '\\'` dla escaped `search`. Dodaj `NULLS LAST` dla obu kierunków sortu po `releaseYear`.

## Definition of Done
- [ ] `apps/api/src/infrastructure/games/drizzle-game-repository.ts` ma rozszerzoną metodę `list`
- [ ] Predykaty: `inArray(platform, ...)`, `inArray(format, ...)`, `gte/lte(releaseYear, ...)`
- [ ] `LIKE ... ESCAPE '\\'` dla search (wymagane bo application escape'uje wildcards)
- [ ] `NULLS LAST` dla `ORDER BY release_year` w obu kierunkach
- [ ] Test repo: `apps/api/src/infrastructure/games/drizzle-game-repository.test.ts` (NOWY) z bun:sqlite in-memory
- [ ] `bun test apps/api/` zielone
- [ ] `bun run --cwd apps/api typecheck` zielone

Agent kończy pracę WYŁĄCZNIE gdy powyższe są spełnione.

## Context
**Runtime:** Bun (`bun test`, NIE npm)
**ORM:** Drizzle SQLite (`drizzle-orm`, `drizzle-orm/sqlite-core`)
**Helpers:** `and`, `or`, `eq`, `like`, `inArray`, `gte`, `lte`, `sql`, `asc`, `desc`

### Step 0: Pobierz dokumentację
Użyj Context7:
- Drizzle ORM SQLite: "inArray with array of strings", "like with escape clause", "order by null handling sqlite"
- bun:sqlite + drizzle: "in-memory database for tests"

## Design decisions
- Search trafia do repo już escaped (z application). W repo używamy `LIKE pattern ESCAPE '\\'`. Drizzle helper `like()` nie wspiera ESCAPE wprost — używamy raw `sql\`...\`` LUB `sql.raw` z parametrem. Bezpieczna droga: `sql\`${col} LIKE ${pattern} ESCAPE '\\\\'\`` (escape w stringu SQL).
- `NULLS LAST` w SQLite wymaga albo `ORDER BY col IS NULL, col [ASC|DESC]` albo `NULLS LAST` (SQLite >= 3.30). Bezpieczne uniwersalne: `sql\`${col} IS NULL, ${col} ${dir}\``.
- `inArray` z pustą tablicą: Drizzle generuje `IN ()` co w SQLite jest błędem. Zabezpieczamy: `if (platforms?.length) ...` przed dodaniem predykatu (już to robimy w starym kodzie dla search).
- Total count: zawsze obliczamy. Pole `withTotal` zostało **dropped z planu** (nie ma w schemacie z Fazy 3) — dorzucimy gdy będzie konkretny consumer z mierzonym kosztem `count(*)`. Dla SQLite z composite indexami `count(*)` na ≤10k wierszy jest sub-millisekundowy.

### Relevant files (edit only these)
- `apps/api/src/infrastructure/games/drizzle-game-repository.ts`
- `apps/api/src/infrastructure/games/drizzle-game-repository.test.ts` (NOWY)

### Files to read but NOT edit
- `apps/api/src/domain/games/game-repository.ts` — `ListGamesQuery` z nowymi polami
- `apps/api/src/domain/games/release-year-range.ts` — pola `from`, `to`
- `apps/api/src/infrastructure/db/schema.ts` — tabela `games`
- `apps/api/src/infrastructure/db/client.ts` — sposób inicjalizacji DB (do testów)

## Constraints
- TDD: NAJPIERW test (RED), POTEM impl (GREEN)
- NIE wprowadzaj logiki biznesowej do repo. Tylko mapowanie filter → SQL.
- NIE rób raw SQL przez konkatenację stringów. Zawsze parametryzuj przez Drizzle helpers lub `sql\`...\``.
- `inArray` TYLKO gdy tablica niepusta (sanity check przed predykatem)
- `LIKE` z ESCAPE — `escape '\\'` w SQL string (czyli `\\\\` w TS string, bo `\` to escape w obu warstwach)

## Steps

### Step 1: Test RED — drizzle-game-repository.test.ts
**Co robimy:**
1. Utwórz `apps/api/src/infrastructure/games/drizzle-game-repository.test.ts`. Wzorzec: stwórz in-memory bun:sqlite, uruchom migracje (lub `db.run(...)` z CREATE TABLE), wstaw seedowe dane, wywołaj `repo.list(...)`.
2. Sprawdź jak inne testy infrastructure przygotowują DB (`grep -r "bun:sqlite" apps/api/src/infrastructure/`). Jeśli istnieje helper — użyj go. Jeśli nie — stwórz lokalnego helpera w pliku testu.
3. Testy:
   ```ts
   import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
   import { ReleaseYearRange } from '../../domain/games/release-year-range';
   import { DrizzleGameRepository } from './drizzle-game-repository';
   // ... setup in-memory db with seed ...

   describe('DrizzleGameRepository.list filtering', () => {
     it('filters by platforms (inArray)', async () => {
       // seed: PC, PS5, Switch — query platforms=['PC','PS5'] → 2 items
     });
     it('filters by formats', async () => {
       // seed: digital, physical — query formats=['digital'] → 1 item
     });
     it('filters by release year range', async () => {
       // seed years: 2010, 2015, 2020 — query range 2012-2018 → 1 item (2015)
     });
     it('LIKE escapes wildcard in search', async () => {
       // seed titles: '50% off', 'fifty percent off', '50_off'
       // search '50\%' (already escaped) → matches only '50% off'
     });
     it('sorts by releaseYear NULLS LAST asc', async () => {
       // seed: 2020, null, 2010 — sort asc → [2010, 2020, null]
     });
     it('sorts by releaseYear NULLS LAST desc', async () => {
       // seed: 2020, null, 2010 — sort desc → [2020, 2010, null]
     });
     it('userId scope is enforced under filters', async () => {
       // seed user-A and user-B both with PC games
       // query userId=user-A, platforms=['PC'] → only user-A's games
     });
   });
   ```
4. `bun test` → RED dla nowych, stare GREEN.

**Rezultat:** plik testowy istnieje, nowe testy failują.

### Step 2: Rozszerz DrizzleGameRepository.list (GREEN)
**Co robimy:**
1. Otwórz `apps/api/src/infrastructure/games/drizzle-game-repository.ts`. Dodaj import `inArray, gte, lte` z `drizzle-orm`.
2. Rozszerz metodę `list`:
   ```ts
   async list(query: ListGamesQuery): Promise<ListGamesResult> {
     const {
       userId, search, kind, page, perPage, sort, dir,
       platforms, formats, releaseYearRange,
     } = query;

     const userFilter = eq(gamesTable.userId, userId);
     const kindFilter = kind ? eq(gamesTable.kind, kind) : undefined;

     const searchFilter = search
       ? sql`(
           ${gamesTable.title} LIKE ${`%${search}%`} ESCAPE '\\'
           OR ${gamesTable.developer} LIKE ${`%${search}%`} ESCAPE '\\'
           OR ${gamesTable.genre} LIKE ${`%${search}%`} ESCAPE '\\'
           OR ${gamesTable.platform} LIKE ${`%${search}%`} ESCAPE '\\'
         )`
       : undefined;

     const platformFilter =
       platforms && platforms.length > 0 ? inArray(gamesTable.platform, platforms) : undefined;
     const formatFilter =
       formats && formats.length > 0 ? inArray(gamesTable.format, formats) : undefined;
     const yearFromFilter = releaseYearRange
       ? gte(gamesTable.releaseYear, releaseYearRange.from)
       : undefined;
     const yearToFilter = releaseYearRange
       ? lte(gamesTable.releaseYear, releaseYearRange.to)
       : undefined;

     const whereClause = and(
       userFilter,
       kindFilter,
       searchFilter,
       platformFilter,
       formatFilter,
       yearFromFilter,
       yearToFilter,
     );

     const totalResult = await db
       .select({ count: sql<number>`count(*)` })
       .from(gamesTable)
       .where(whereClause);
     const total = totalResult[0]?.count ?? 0;

     const sortColumn = sort
       ? {
           title: gamesTable.title,
           genre: gamesTable.genre,
           platform: gamesTable.platform,
           format: gamesTable.format,
           status: gamesTable.status,
           releaseYear: gamesTable.releaseYear,
           hoursPlayed: gamesTable.hoursPlayed,
         }[sort]
       : undefined;

     const offset = (page - 1) * perPage;
     let baseQuery = db.select().from(gamesTable).where(whereClause).$dynamic();

     if (sortColumn) {
       const isReleaseYear = sort === 'releaseYear';
       const orderSql = isReleaseYear
         ? sql`${gamesTable.releaseYear} IS NULL, ${gamesTable.releaseYear} ${sql.raw(dir === 'desc' ? 'DESC' : 'ASC')}`
         : dir === 'desc'
           ? desc(sortColumn)
           : asc(sortColumn);
       baseQuery = baseQuery.orderBy(orderSql);
     }

     const items = await baseQuery.limit(perPage).offset(offset);
     return { items: items.map((row) => this.mapRowToGame(row)), total };
   }
   ```
3. Uwaga: `sql.raw(dir === 'desc' ? 'DESC' : 'ASC')` jest **bezpieczne**, bo `dir` jest enum walidowany przez Zod (nie user input wprost).
4. `bun test apps/api/` → wszystkie GREEN.

**Rezultat:** repo filtruje po nowych polach, sortuje z NULLS LAST.

### Step 3: Sanity check + EXPLAIN
**Co robimy:**
1. `bun run --cwd apps/api typecheck` — zielone
2. `bun run lint` — zielone
3. (opcjonalnie) odpal verify-indexes z Fazy 2 — sprawdź że nowe predykaty wciąż używają indeksów

**Rezultat:** zero regresji.

## If you get stuck
Jeśli po 2 próbach coś nie działa: ZATRZYMAJ się. Napisz:
`STUCK at Step <N>: <co, jaki błąd, jaka hipoteza>`
Zakończ pracę.
