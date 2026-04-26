# Games — Format (physical/digital) — Faza 1: Backend

## Goal
Rozszerz model Game o pole `format: 'physical' | 'digital'`. Pole jest wymagane na poziomie domeny i persystencji; w warstwie aplikacji (Zod) ma default `'digital'`, dzięki czemu istniejący frontend bez zmian dalej działa, a backfill istniejących rekordów odbywa się w migracji DB (`NOT NULL DEFAULT 'digital'`).

## Definition of Done
- [ ] Wszystkie testy przechodzą: `bun test`
- [ ] `bun run --filter '*' typecheck` czyste
- [ ] `bun run lint` czyste
- [ ] Nowy plik migracji w `apps/api/drizzle/` dodaje kolumnę `format TEXT NOT NULL DEFAULT 'digital'`
- [ ] `GET /api/games/:id` zwraca pole `format` w response
- [ ] `POST /api/games` z `format: 'physical'` tworzy grę z tym formatem; bez `format` tworzy z `'digital'`
- [ ] `POST /api/games` z `format: 'cartridge'` zwraca 400 (validation)

Agent kończy pracę WYŁĄCZNIE gdy powyższe są spełnione.

## Context
**Runtime:** Bun (NIE Node.js, NIE npm — `bun test`, `bun run --filter '*' typecheck`, `bun run lint`)
**Architektura:** DDD + Ports & Adapters. Domain nie importuje infrastructure / application.
**ORM:** Drizzle (better-sqlite3). Migracje w `apps/api/drizzle/`, generowane przez `bunx drizzle-kit generate` (skrypt `db:generate`), applyowane przez `db:migrate`.
**Walidacja inputu:** Zod w use case'ach (`CreateGame`, `UpdateGame`), `safeParse` → `err({ kind: 'invalid_input', issues: [...] })`.
**Error model:** `Result<T, E>` (`ok(value)` / `err(error)`) — bez throw.

## Design decisions
- `format` to plain string-literal enum, analogiczny do `platform` i `status`. NIE Value Object (brak invariantów poza allowlist).
- Eksportuj z `apps/api/src/domain/games/game.ts`: `GAME_FORMATS = ['physical', 'digital'] as const` + `GameFormat = (typeof GAME_FORMATS)[number]`. Single source of truth dla typu i runtime walidacji (analogicznie do `GAME_PLATFORMS`/`GAME_STATUSES`).
- Domena WYMAGA pola — walidacja `format_invalid` w `NewGame.create` (jak istniejące `platform_invalid`, `status_invalid`).
- Default `'digital'` ustawiany TYLKO w Zod input schemas (`CreateGame`/`UpdateGame`) — frontend bez `format` dalej działa.
- Persystencja: `text('format').notNull().default('digital')`. Drizzle wygeneruje `ALTER TABLE games ADD COLUMN format TEXT NOT NULL DEFAULT 'digital'` — backfilluje istniejące wiersze automatycznie.
- `Game.fromPersistence` przyjmuje `format` jako wymagany parametr — wszystkie istniejące calls (mapRow + fake repos w testach) muszą zostać uzupełnione (TypeScript wskaże miejsca).

### Relevant files (edit only these)
- `apps/api/src/domain/games/game.ts` — `GAME_FORMATS` / `GameFormat`, `GameProps.format`, `GameValidationError` `'format_invalid'`, walidacja w `NewGame.create`, prywatne pole + getter w `NewGame` i `Game`, parametr w `Game.fromPersistence`, dodaj do `toJSON`
- `apps/api/src/domain/games/game.test.ts` — **NEW** — testy `NewGame.create` dla `format`
- `apps/api/src/infrastructure/db/schema.ts` — kolumna `format`
- `apps/api/drizzle/<auto>.sql` — wygenerowana migracja (NIE pisać ręcznie)
- `apps/api/src/infrastructure/games/drizzle-game-repository.ts` — `mapRowToGame`, `create.values`, `update.set`
- `apps/api/src/application/games/create-game.ts` — Zod schema, props
- `apps/api/src/application/games/update-game.ts` — Zod schema, props
- `apps/api/src/application/games/update-game.test.ts` — uzupełnij `format: 'digital'` w `existingGame` i tam gdzie fake repo używa `Game.fromPersistence`; dodaj 1-2 testy weryfikujące `format`
- `apps/api/src/application/games/delete-game.test.ts` — uzupełnij `format: 'digital'` w fake repo gdzie używa `Game.fromPersistence`
- `apps/api/src/application/games/list-games.test.ts` — uzupełnij `format: 'digital'` w `makeGames`

### Files to read but NOT edit
- `apps/api/src/domain/shared/result.ts` — typ `Result`, `ok`/`err`
- `apps/api/src/routes/games.ts` — sprawdź że jest passthrough (`c.json(result)` / `c.json(result.value)`) i NIE modyfikuj
- `apps/api/drizzle.config.ts` — config drizzle-kit (nie zmieniać)
- `apps/api/package.json` — dostępne skrypty `db:generate`, `db:migrate`, `typecheck`

## Constraints
- TDD: NAJPIERW testy domeny (RED), POTEM impl (GREEN)
- NIE rób `format` jako optional w `GameProps` ani w `Game.fromPersistence` — explicit i wymagane. Default jest na poziomie Zod, nie domeny.
- NIE pisz migracji SQL ręcznie — generuj przez `bun run --cwd apps/api db:generate`. Plik trafia do `apps/api/drizzle/`.
- Route handler `apps/api/src/routes/games.ts` MUSI zostać nietknięty
- NIE rób z `format` Value Object — to enum string, taki sam wzorzec jak `platform`/`status`
- Każdy error kind UNIKALNY — użyj dokładnie `format_invalid` z polem `value: string`

## Steps

### Step 1: Domain test (RED)
**Plik:** `apps/api/src/domain/games/game.test.ts` (NEW)

**Co robimy:**
1. Skopiuj wzorzec z `apps/api/src/application/games/update-game.test.ts` (Bun test runtime, importy `describe/it/expect` z `bun:test`).
2. Napisz testy `NewGame.create`:
   - `validInput` z `format: 'physical'` → `result.ok === true`, `result.value.format === 'physical'`
   - `validInput` z `format: 'digital'` → `result.ok === true`
   - `validInput` z `format: 'cartridge'` (jako `any`/cast) → `result.ok === false`, `error.kind === 'format_invalid'`, `error.value === 'cartridge'`
   - opcjonalnie: brak pola `format` → `result.ok === false`, `error.kind === 'format_invalid'` (TypeScript prawdopodobnie nie pozwoli — w takim razie pomiń)
3. `bun test apps/api/src/domain/games/game.test.ts` → RED (kompilacja failuje, bo `GameProps.format` jeszcze nie istnieje).

**Rezultat:** plik testu istnieje, testy failują w przewidywalny sposób.

### Step 2: Domain impl + propagacja typu do testów (GREEN)
**Plik:** `apps/api/src/domain/games/game.ts` + uzupełnienia w istniejących testach

**Co robimy:**
1. W `game.ts`:
   - `export const GAME_FORMATS = ['physical', 'digital'] as const;`
   - `export type GameFormat = (typeof GAME_FORMATS)[number];`
   - Dodaj `format: GameFormat` do `GameProps`
   - Dodaj kind do `GameValidationError`: `| { kind: 'format_invalid'; value: string }`
   - W `NewGame.create`, po walidacji `status` a przed `releaseYearResult`, dodaj:
     ```ts
     if (!GAME_FORMATS.includes(props.format)) {
       return err({ kind: 'format_invalid', value: String(props.format) });
     }
     ```
   - W konstruktorze `NewGame` dodaj `private readonly _format: GameFormat`, przekaż w `new NewGame(...)` i dodaj getter `get format(): GameFormat { return this._format; }`
   - W konstruktorze `Game` dodaj analogicznie pole + getter
   - W `Game.fromPersistence` dodaj do typu `row` parametr `format: GameFormat` i przekaż go do `new Game(...)`
   - W `toJSON` dodaj `format: this._format`
2. Uzupełnij wywołania `Game.fromPersistence` (typecheck wskaże miejsca):
   - `apps/api/src/application/games/update-game.test.ts` — `existingGame` i fake repo `update`/`create` → dodaj `format: 'digital'`
   - `apps/api/src/application/games/delete-game.test.ts` — fake repo (jeśli używa `fromPersistence`) → `format: 'digital'`
   - `apps/api/src/application/games/list-games.test.ts` — `makeGames(...)` → `format: 'digital'`
3. `bun test apps/api/src/domain/games/game.test.ts` → GREEN
4. `bun test` (cały projekt) → wszystkie zielone

**Rezultat:** domena zwalidowana, wszystkie istniejące testy dalej zielone, nowe testy domeny zielone.

### Step 3: DB schema + migracja
**Pliki:** `apps/api/src/infrastructure/db/schema.ts`, `apps/api/drizzle/<auto>.sql`

**Co robimy:**
1. W `schema.ts` dodaj kolumnę między `status` a `createdAt`:
   ```ts
   format: text('format').notNull().default('digital'),
   ```
2. Wygeneruj migrację:
   ```
   bun run --cwd apps/api db:generate
   ```
   Drizzle stworzy nowy plik w `apps/api/drizzle/0001_*.sql` z `ALTER TABLE games ADD format TEXT DEFAULT 'digital' NOT NULL;`.
3. Zaaplikuj migrację do lokalnej bazy:
   ```
   bun run --cwd apps/api db:migrate
   ```
4. `bun run --filter '*' typecheck` → czyste (typ `GameRow` ma teraz `format: string`).

**Rezultat:** schema i baza zsynchronizowane. Nowy plik migracji w `apps/api/drizzle/`.

### Step 4: Repository + use cases (Zod) + integration testy (GREEN)
**Pliki:** `apps/api/src/infrastructure/games/drizzle-game-repository.ts`, `apps/api/src/application/games/create-game.ts`, `apps/api/src/application/games/update-game.ts`, `apps/api/src/application/games/update-game.test.ts`

**Co robimy:**
1. W `DrizzleGameRepository`:
   - Zaimportuj `GameFormat` z `'../../domain/games/game'`
   - `mapRowToGame`: dodaj `format: row.format as GameFormat`
   - `create.values`: dodaj `format: newGame.format`
   - `update.set`: dodaj `format: game.format`
2. W `CreateGame` (`create-game.ts`):
   - Zod schema: dodaj `format: z.enum(['physical', 'digital']).default('digital'),`
   - W obiekcie `props`: dodaj `format: data.format`
3. W `UpdateGame` (`update-game.ts`): analogicznie jak w `CreateGame`.
4. W `update-game.test.ts` dodaj 2 testy:
   - `validInput` z `format: 'physical'` → `result.ok === true`, `result.value.format === 'physical'`
   - `validInput` z `format: 'cartridge'` → `result.ok === false`, `error.kind === 'invalid_input'`
5. `bun test` → ALL GREEN
6. `bun run --filter '*' typecheck` → czyste
7. `bun run lint` → czyste

**API spec po fazie 1:**
```
POST /api/games
body: { ...wszystkie pola..., format?: 'physical' | 'digital' }   # default 'digital'
→ 201: { ...game..., format: 'physical' | 'digital' }
→ 400: { error: 'validation', issues: [...] }                      # gdy format spoza enum

GET  /api/games          → 200: { items: Game[], ... }             # każdy item ma .format
GET  /api/games/:id      → 200: { ..., format: ... }
PUT  /api/games/:id      → 200: { ..., format: ... }
```

**Rezultat:** pełen pionowy slice backendu. `bun test`, `typecheck`, `lint` zielone. Endpoint POST/PUT akceptuje `format` (z defaultem).

## If you get stuck
Jeśli po 2 próbach coś nie działa: ZATRZYMAJ się. Napisz:
`STUCK at Step <N>: <co, jaki błąd, jaka hipoteza>`
Zakończ pracę.

Typowe pułapki:
- Po Step 2 TypeScript świeci czerwonym w wielu plikach — to oczekiwane. Idź po liście **Relevant files** i uzupełnij `format: 'digital'` w każdym wywołaniu `Game.fromPersistence`.
- `db:generate` nic nie generuje — sprawdź `apps/api/drizzle.config.ts` (ścieżka do schema), upewnij się że `apps/api/src/infrastructure/db/schema.ts` rzeczywiście ma nową kolumnę.
- `db:migrate` zwraca "table already has column" — usuń ostatnio wygenerowaną migrację z `apps/api/drizzle/`, popraw schema, wygeneruj ponownie.
- Test "invalid format" failuje bo TypeScript nie pozwala na string spoza enum — w teście użyj cast `as any` na poziomie value `format`, np. `{ ...validInput, format: 'cartridge' as any }`.
