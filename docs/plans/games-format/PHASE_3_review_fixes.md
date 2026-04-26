# Games — Format — Faza 3: Review fixes

## Goal
Poprawki na podstawie code review feature'u `format` (Faza 1 + 2). Zakres: porządki w testach domeny, asymetryczne pokrycie, dwa źródła prawdy dla schemy DB i etykiet, niezwiązany commit z `drizzle.config.ts`. Brak nowej funkcjonalności — tylko higiena.

## Definition of Done
- [ ] `bun test` zielone
- [ ] `bun run --filter '*' typecheck` czyste
- [ ] `bun run lint` czyste
- [ ] `apps/api/src/domain/games/game.test.ts` (NEW z fazy 1) usunięty; testy `format_invalid` przeniesione do `apps/api/src/domain/games/__tests__/game.test.ts` jako kolejny `it(...)` w bloku `describe('NewGame.create', …)`
- [ ] `create-game.test.ts` ma 2 testy analogiczne do tych z `update-game.test.ts` (`accepts format physical`, `returns invalid_input for invalid format`)
- [ ] Test "invalid format" w `update-game.test.ts` i `create-game.test.ts` weryfikuje, że `issues` zawierają path `['format']` — nie tylko `kind === 'invalid_input'`
- [ ] Manualny `CREATE TABLE` w `apps/api/src/infrastructure/db/client.ts` usunięty; bootstrap idzie przez `migrate()` z `drizzle-orm/bun-sqlite/migrator`
- [ ] FE: `formatLabel` i `FORMAT_OPTS` korzystają z **jednego** źródła etykiet (np. `FORMAT_LABELS: Record<GameFormat, string>` w `apps/client/src/types.ts` lub `lib/`)
- [ ] Zmiana `drizzle.config.ts` (path) wydzielona do osobnego commita PRZED commitem feature'u
- [ ] `docs/plans/games-format/` — decyzja: zostaje świadomie albo trafia do `.gitignore`. Udokumentowana w 1 zdaniu w README repo (lub usunięte po merge)

Agent kończy WYŁĄCZNIE gdy powyższe są spełnione.

## Context
**Stack:** Bun + Hono + Drizzle (better-sqlite3) + React + TanStack Query.
**Architektura:** DDD + Ports & Adapters. Domain bez importów infra/app.
**Testy:** `bun:test`, `it`/`describe`/`expect` z `bun:test`.
**Nie ruszamy:** route handler `apps/api/src/routes/games.ts`, `pages/games-columns.tsx`.

## Out of scope (świadomie pomijamy)
- Ujednolicenie konwencji nazewniczej `'physical'` (lowercase) vs `'Backlog'` (PascalCase). Decyzja: zostaje lowercase (matchuje hex-kebab dla feature flag-style enumów). Helper `formatLabel` jest akceptowalnym kosztem, jeśli scentralizujemy do jednego miejsca.
- CHECK constraint na kolumnie `format` w SQLite. To pre-existing pattern (status/platform też bez CHECK). Osobny ticket.
- Zod issue per-field rendering w `game-form.tsx`. Pre-existing — feature `format` nie wprowadza nowego wzorca.

## Steps

### Step 1: Konsolidacja testów domeny
**Pliki:** `apps/api/src/domain/games/__tests__/game.test.ts` (edit), `apps/api/src/domain/games/game.test.ts` (delete)

**Co robimy:**
1. Otwórz `apps/api/src/domain/games/__tests__/game.test.ts`. W bloku `describe('NewGame.create', …)`, po teście `'returns error for invalid status'`, dodaj 3 testy:
   - `it('accepts format physical', …)` — `NewGame.create({ ...validProps(), format: 'physical' })` → `result.ok === true`, `result.value.format === 'physical'`
   - `it('accepts format digital', …)` — analogicznie
   - `it('returns error for invalid format', …)` — `format: 'cartridge' as unknown as GameFormat` → `error.kind === 'format_invalid'`, `error.value === 'cartridge'`. Dodaj `import type { GameFormat }` do importów na górze.
2. Usuń plik `apps/api/src/domain/games/game.test.ts` (NEW z Fazy 1).
3. `bun test apps/api/src/domain/games/__tests__/game.test.ts` → 100% zielone, w tym 3 nowe.

**Rezultat:** jeden plik testów dla domeny `Game`, spójny z istniejącą konwencją `__tests__/`.

### Step 2: Symetryczne testy w application layer
**Plik:** `apps/api/src/application/games/create-game.test.ts`

**Co robimy:**
1. Otwórz `create-game.test.ts`, znajdź wzorzec testów (analogiczny do `update-game.test.ts:166-190`).
2. Dodaj testy:
   ```ts
   it('accepts format physical and returns ok', async () => {
     const result = await useCase.execute({ ...validInput, format: 'physical' });
     expect(result.ok).toBe(true);
     if (result.ok) expect(result.value.format).toBe('physical');
   });

   it('returns invalid_input for invalid format', async () => {
     const result = await useCase.execute({ ...validInput, format: 'cartridge' });
     expect(result.ok).toBe(false);
     if (!result.ok) {
       expect(result.error.kind).toBe('invalid_input');
       if (result.error.kind === 'invalid_input') {
         expect(result.error.issues.some((i) => i.path[0] === 'format')).toBe(true);
       }
     }
   });
   ```
3. W `update-game.test.ts:179-190` wzmocnij `'returns invalid_input for invalid format'` analogicznie — dodaj asercję na `issues[].path` zawierające `'format'`.
4. `bun test` → ALL GREEN.

**Rezultat:** symetryczne pokrycie format-walidacji w obu use case'ach + testy są specyficzne, nie tylko `kind === 'invalid_input'`.

### Step 3: Jedno źródło prawdy dla schemy bootstrap
**Pliki:** `apps/api/src/infrastructure/db/client.ts`, `apps/api/package.json` (jeśli trzeba dodać `db:migrate` do startu)

**Co robimy:**
1. W `client.ts` usuń całą funkcję `initDb` i blok `if (!existsSync(DB_PATH)) { initDb(DB_PATH) }`. Zastąp wywołaniem migratora drizzle-orm:
   ```ts
   import { migrate } from 'drizzle-orm/bun-sqlite/migrator';
   import { drizzle } from 'drizzle-orm/bun-sqlite';
   import Database from 'bun:sqlite';

   if (!existsSync(DB_DIR)) mkdirSync(DB_DIR, { recursive: true });

   const sqlite = new Database(DB_PATH);
   sqlite.exec('PRAGMA journal_mode = WAL;');

   export const db = drizzle({ client: sqlite });

   migrate(db, { migrationsFolder: resolve(__dirname, '../../../drizzle') });

   export { sqlite };
   ```
2. Zweryfikuj ścieżkę `migrationsFolder` — względem `apps/api/src/infrastructure/db/client.ts` to `../../../drizzle` = `apps/api/drizzle`.
3. Usuń lokalny plik bazy (`apps/api/data/apex.db`) i restart `bun run dev` — sprawdź że tabela `games` się tworzy z migracji `0000_*` + `0001_*`, dane można dodać przez `POST /api/games`.
4. `bun test` → zielone (testy nie używają tego pliku DB; mają in-memory fakes).

**Rezultat:** schema żyje TYLKO w `schema.ts` + migracjach. Zero ręcznego DDL w kodzie.

**Pułapka:** jeśli `migrate()` rzuci na produkcji "table games already exists" przy istniejącej bazie bez `__drizzle_migrations` — zaaplikuj migracje ręcznie raz (`bun run --cwd apps/api db:migrate`), które stworzy tabelę śledzenia. Dla świeżych instalacji to zadziała od razu.

### Step 4: Centralizacja etykiet `format` na FE
**Pliki:** `apps/client/src/types.ts`, `apps/client/src/components/game-form.tsx`, `apps/client/src/pages/game-view.tsx`

**Co robimy:**
1. W `types.ts` dodaj obok `GAME_FORMATS`:
   ```ts
   export const GAME_FORMAT_LABELS: Record<GameFormat, string> = {
     physical: 'Physical',
     digital: 'Digital',
   };
   ```
2. W `game-form.tsx`:
   - Importuj `GAME_FORMATS, GAME_FORMAT_LABELS` z `@/types`
   - Zastąp ręczny `FORMAT_OPTS`:
     ```ts
     const FORMAT_OPTS: { value: GameFormat; label: string }[] = GAME_FORMATS.map((v) => ({
       value: v,
       label: GAME_FORMAT_LABELS[v],
     }));
     ```
3. W `game-view.tsx`:
   - Usuń lokalną deklarację `formatLabel`
   - Importuj `GAME_FORMAT_LABELS` z `@/types`
   - Użycie: `<Field label="Format" value={GAME_FORMAT_LABELS[game.format]} />`
4. `bun run --filter '*' typecheck` + `bun run lint` → czyste.

**Rezultat:** zmiana etykiety wymaga 1 edycji w `types.ts`. PillSelect i widok detali współdzielą źródło.

### Step 5: Higiena commitów
**Co robimy (RĘCZNIE — git):**
1. Stash wszystkich zmian poza `drizzle.config.ts`:
   ```bash
   git add apps/api/drizzle.config.ts
   git commit -m "fix(api): correct drizzle dbCredentials path for --cwd apps/api"
   ```
2. Następnie commit feature'u format (Faza 1 + 2 + Faza 3 fix):
   ```bash
   git add -A
   git commit -m "feat(games): add format field (physical/digital) to game"
   ```
3. (Opcjonalnie) jeśli decyzja: usuń `docs/plans/games-format/` po merge i dodaj `docs/plans/` do `.gitignore`. Albo zostaw świadomie jako "decision log" i przenieś do `docs/decisions/games-format/`.

**Rezultat:** historia commitów segreguje bugfix od feature'u.

## If you get stuck
Jeśli po 2 próbach coś nie działa: STOP. Napisz `STUCK at Step <N>: <co, jaki błąd, jaka hipoteza>` i zakończ.

Typowe pułapki:
- Step 3: `migrate()` failuje na "no such table __drizzle_migrations" przy istniejącej bazie — usuń `apps/api/data/apex.db` (ENV dev) i pozwól migratorowi zbudować od zera. NIE rób tego na produkcji.
- Step 4: typecheck mówi że `Record<GameFormat, string>` nie kompiluje — sprawdź czy `GameFormat` jest derived type (`(typeof GAME_FORMATS)[number]`), nie ręcznie zapisany union. Powinien być derived po Fazie 2.
- Step 1: po usunięciu `game.test.ts` (NEW) bun test wciąż go widzi — sprawdź czy nie jest cachowane (`rm -rf .bun` lub po prostu nowy run).
