---
name: External IDs Phase 1 — Schema + Backfill + Domain
description: Dodanie kolumny external_id (UUID v4) do games i platforms, backfill istniejących wierszy, rozszerzenie domain i repo
type: plan
---

# External IDs — Faza 1: Schema + Backfill + Domain

## Goal
Wprowadzić stabilny identyfikator `externalId` (UUID v4) na poziomie wiersza
dla `games` i `platforms`, wraz z unique index `(user_id, external_id)`.
Rozszerzyć warstwę domain (`Game`, `Platform`, `NewGame`, `NewPlatform`) tak
żeby każdy nowy rekord powstawał z `externalId` (generator wstrzykiwany —
domyślnie `crypto.randomUUID`, w testach mock). Repo dostaje
`findByExternalId(userId, externalId)`. Istniejące rekordy w produkcyjnej bazie
zostają wypełnione UUID-ami przez jednorazowy skrypt TS.

To jest **fundament** pod import — bez stabilnego ID per-row nie da się zrobić
upserta `{...old, ...new}`. Eksport (faza 2) zacznie te ID emitować.

## Definition of Done
- [ ] Migracja Drizzle 0005: `ALTER TABLE games ADD COLUMN external_id TEXT;` + analogicznie dla `platforms` (kolumna **nullable** na tym etapie)
- [ ] Skrypt `apps/api/scripts/backfill-external-ids.ts` wypełnia istniejące wiersze UUID-ami v4 i jest idempotentny (drugi run = no-op)
- [ ] Migracja Drizzle 0006: zamienia kolumnę na `NOT NULL` + dodaje unique index `(user_id, external_id)` na obu tabelach
- [ ] `Game.externalId: string` (getter) + `Game.fromPersistence` czyta `externalId`
- [ ] `Platform.externalId: string` (getter) + `Platform.fromPersistence` czyta `externalId`
- [ ] `NewGame.create(props, idGenerator?: () => string)` — drugi arg opcjonalny, domyślnie `crypto.randomUUID`. UUID nie wchodzi do walidacji (jest opaque) — generowany na koniec, dopisywany do encji
- [ ] `NewPlatform.create(props, idGenerator?: () => string)` — analogicznie
- [ ] `GameRepository.findByExternalId(userId, externalId): Promise<Game | null>` w porcie + impl w `DrizzleGameRepository`
- [ ] `PlatformRepository.findByExternalId(userId, externalId): Promise<Platform | null>` w porcie + impl w `DrizzlePlatformRepository`
- [ ] `DrizzleGameRepository.create` zapisuje `external_id`; `DrizzlePlatformRepository.create` analogicznie
- [ ] `bun test` (cały api) → wszystko zielone
- [ ] `bun run typecheck` z `apps/api` → 0 błędów
- [ ] Smoke: w lokalnej bazie po pełnej sekwencji (`db:migrate` → backfill → `db:migrate`) każdy wiersz w `games` i `platforms` ma `external_id NOT NULL` (sprawdź `SELECT COUNT(*) WHERE external_id IS NULL` = 0 dla obu)

Agent kończy pracę WYŁĄCZNIE gdy powyższe są spełnione.

## Context
**Runtime:** Bun (NIE Node.js, NIE npm — `bun test`, `bun run typecheck`, `bun run scripts/...`)
**Katalog roboczy:** `apps/api`
**ORM:** Drizzle (SQLite). Generowanie migracji: `bun run db:generate`. Aplikowanie: aplikacja sama woła `migrate()` przy starcie, ale dla skryptu backfill mamy jasne kroki ręczne.
**SQLite caveat:** zmiana kolumny z nullable na NOT NULL wymaga rebuild tabeli. Drizzle-kit potrafi to wygenerować (`__old` table → copy → drop → rename). Jeśli wygenerowana migracja wygląda groźnie — zatrzymaj się i pokaż diff.

## Design decisions
- **Trzy kroki, nie jeden:** osobna migracja dodaje kolumnę nullable, skrypt TS backfilluje, druga migracja zamyka NOT NULL + unique. Powód: SQLite nie wspiera `ALTER COLUMN ... NOT NULL` bez defaultu na istniejących wierszach. Backfill **MUSI** się odbyć między migracjami.
- **UUID v4 z `crypto.randomUUID()`** — Bun ma natywnie. Brak biblioteki, brak zależności.
- **Generator wstrzykiwany do `NewGame.create` / `NewPlatform.create`** — drugi arg opcjonalny. Domyślnie `() => crypto.randomUUID()`. Testy domain wstrzykują predykatywny generator (np. licznik) dla deterministycznych asercji.
- **`externalId` jest w domain encji** (getter `externalId` na `Game`, `Platform`), ale NIE wchodzi w walidację (`NewGame.create` nie sprawdza formatu UUID — to opaque). Walidacja stringa "is UUID" byłaby zbędną defensywą; trust w generatorze.
- **`external_id` jest unique tylko per-user** (`UNIQUE(user_id, external_id)`). Globalnie nie — dwa różne konta mogą teoretycznie mieć ten sam UUID (kolizja UUID v4 jest astronomicznie nieprawdopodobna ale chcemy poprawnej semantyki: scope = user).
- **Obecne use case (`CreateGame`, `CreatePlatform`) nie muszą znać o generatorze** — używają domyślnego. Tylko testy które chcą deterministycznego ID przekazują własny.
- **`Game.toJSON()` / `Platform.toJSON()` MUSZĄ zacząć zawierać `externalId`** — to kontrakt dla eksportu (faza 2) i dla API JSON. Sprawdź czy gdzieś konsument `toJSON` rozpada się na nowym kluczu (raczej nie — to additive).

## Step 0: Pobierz dokumentację (Context7)
**Co robimy:** użyj Context7 MCP:
- `drizzle-orm`: "sqlite alter table add column" oraz "sqlite-core unique index on multiple columns"
- `drizzle-kit`: "generate migration sqlite alter column not null"

**Rezultat:** masz świeże API Drizzle (zwłaszcza co Drizzle wygeneruje dla NOT NULL na SQLite — bo to nietrywialne).

## Relevant files (edit only these)
- `apps/api/src/infrastructure/db/schema.ts` — dodaj `externalId` + unique index w obu tabelach (w finalnym stanie)
- `apps/api/drizzle/0005_*.sql` — wygenerowana migracja: dodaje kolumnę nullable
- `apps/api/drizzle/0006_*.sql` — wygenerowana migracja: NOT NULL + unique index
- `apps/api/scripts/backfill-external-ids.ts` — NOWY skrypt jednorazowy
- `apps/api/src/domain/games/game.ts` — `externalId` w `Game`, `NewGame`, `fromPersistence`, `toJSON`
- `apps/api/src/domain/platforms/platform.ts` — analogicznie
- `apps/api/src/domain/games/game-repository.ts` — `findByExternalId` w interfejsie
- `apps/api/src/domain/platforms/platform-repository.ts` — analogicznie
- `apps/api/src/infrastructure/games/drizzle-game-repository.ts` — impl `findByExternalId` + `create` zapisuje `externalId`
- `apps/api/src/infrastructure/platforms/drizzle-platform-repository.ts` — analogicznie
- `apps/api/src/domain/games/__tests__/*.test.ts` — aktualizacja testów (signature `NewGame.create`)
- `apps/api/src/domain/platforms/__tests__/*.test.ts` — analogicznie
- `apps/api/src/application/games/create-game.test.ts` + reszta testów application — zaktualizuj asercje jeśli konsumują `Game.toJSON`/`externalId`

## Files to read but NOT edit
- `apps/api/drizzle.config.ts` — sprawdź gdzie idzie output migracji
- `apps/api/src/domain/games/game.ts` — wzorzec konstrukcji encji
- `apps/api/src/infrastructure/db/client.ts` — sposób inicjalizacji `db` (skrypt backfill go reuse'uje)

## Constraints
- **NIE** wstawiaj `external_id` jako PRIMARY KEY ani nie zastępuj nim `id` (autoincrement). Mamy dwa identyfikatory: wewnętrzny `id` (klucz fizyczny, FK, joins) i `external_id` (klucz domenowy, stabilny, ekspozycja na zewnątrz).
- **NIE** waliduj formatu UUID w domain. Trust generatorowi.
- **NIE** modyfikuj istniejących migracji 0000–0004. Każda zmiana = nowa migracja.
- Skrypt backfill MUSI być idempotentny — używaj `WHERE external_id IS NULL` w UPDATE.
- Skrypt backfill MUSI być uruchamialny **lokalnie** komendą `bun run apps/api/scripts/backfill-external-ids.ts` z roota projektu (lub z `apps/api` bez prefixu). Wybierz jedną konwencję i ją udokumentuj na górze skryptu w komentarzu.
- W `Game.toJSON()` / `Platform.toJSON()` `externalId` MUSI być obecny (string) — nie opcjonalny. Jeśli rekord w bazie ma `external_id NULL` (co nie powinno się zdarzyć po backfill), `fromPersistence` rzuca, NIE wstawia placeholdera.
- Generator UUID w `crypto.randomUUID` — zwraca `string`. NIE używaj `node:crypto` (Bun ma globalnie).

## Steps

### Step 1: Migracja 0005 — dodanie nullable kolumny
**Co robimy:**
1. Zmień `apps/api/src/infrastructure/db/schema.ts`:
   - W `games`: dodaj `externalId: text('external_id')`. **Bez** `.notNull()` na razie.
   - W `platforms`: analogicznie.
   - **NIE** dodawaj jeszcze unique index. Zostaw na 0006.
2. Wygeneruj migrację: z `apps/api` uruchom `bun run db:generate`.
3. Zweryfikuj wygenerowany plik `drizzle/0005_*.sql`. Powinien zawierać:
   ```sql
   ALTER TABLE `games` ADD `external_id` text;
   ALTER TABLE `platforms` ADD `external_id` text;
   ```
   (nazwa pliku z hashem — Drizzle losowy suffix). Jeśli wygenerował coś więcej (np. drop+recreate) — STOP, pokaż diff i zapytaj.
4. NIE odpalaj jeszcze aplikacji. Migracja zaaplikuje się przy następnym `bun run dev` lub wprost: `bun run db:migrate` (sprawdź skrypt w `package.json` — jeśli jest, użyj; jeśli nie, ignoruj — `migrate()` w client.ts zadziała przy starcie).
5. `bun run typecheck` z `apps/api` → typecheck OK na samym schema.ts (Drizzle wywiedzie typ `external_id: string | null` dla `GameRow`/`PlatformRow`).
**Rezultat:** schema ma kolumnę nullable, migracja wygenerowana ale jeszcze nie wprowadziliśmy użycia w domain.

### Step 2: Skrypt backfill
**Co robimy:**
1. Utwórz `apps/api/scripts/backfill-external-ids.ts`:
   ```ts
   // Run from apps/api: bun run scripts/backfill-external-ids.ts
   import { eq, isNull } from 'drizzle-orm';
   import { db } from '../src/infrastructure/db/client';
   import { games, platforms } from '../src/infrastructure/db/schema';

   async function backfill(table: typeof games | typeof platforms, label: string) {
     const rows = await db.select({ id: table.id }).from(table).where(isNull(table.externalId));
     console.log(`[${label}] rows missing external_id: ${rows.length}`);
     for (const row of rows) {
       await db.update(table).set({ externalId: crypto.randomUUID() }).where(eq(table.id, row.id));
     }
     console.log(`[${label}] backfilled ${rows.length} rows`);
   }

   await backfill(games, 'games');
   await backfill(platforms, 'platforms');
   process.exit(0);
   ```
2. Pierwsze uruchomienie: `bun run db:migrate` (aplikuje 0005), potem `bun run scripts/backfill-external-ids.ts`. Loguje liczbę zaktualizowanych wierszy.
3. Drugie uruchomienie skryptu → "rows missing external_id: 0" dla obu (idempotentny).
4. Sanity check w sqlite (lokalnie): `sqlite3 apps/api/data/apex.db "SELECT COUNT(*) FROM games WHERE external_id IS NULL;"` → 0. To samo dla `platforms`.
**Rezultat:** istniejące wiersze mają UUID-y. Aplikacja jeszcze nie wymaga `externalId` po stronie kodu (kolumna nullable, domain bez zmian).

### Step 3: Migracja 0006 — NOT NULL + unique index
**Co robimy:**
1. W `apps/api/src/infrastructure/db/schema.ts`:
   - `externalId: text('external_id').notNull()` w obu tabelach.
   - Dodaj unique index w `(table) => [...]`:
     - games: `uniqueIndex('games_user_id_external_id_unq').on(table.userId, table.externalId)`
     - platforms: `uniqueIndex('platforms_user_id_external_id_unq').on(table.userId, table.externalId)`
2. `bun run db:generate` → wygeneruje 0006_*.sql. Na SQLite Drizzle prawdopodobnie zrobi rebuild tabeli (`__old_push_*` pattern). Zweryfikuj że żadne dane nie giną — migracja ma `INSERT INTO new_games SELECT ... FROM games`.
3. Aplikuj migrację (start app lub explicit `db:migrate`). Sprawdź że nie ma errorów.
4. `bun run typecheck` z `apps/api` → tu zacznie krzyczeć w `mapRowToGame`, bo `row.externalId: string` (już nie nullable). Naprawimy w Step 5.
**Rezultat:** schema zamknięta. Każdy wiersz ma `external_id NOT NULL UNIQUE per-user`. Type-level: `GameRow.externalId: string`.

### Step 4: Domain — `Game`, `NewGame`
**Co robimy:**
1. W `apps/api/src/domain/games/game.ts`:
   - `GameProps` BEZ zmian (props biznesowe — externalId NIE jest props biznesowy, generuje się obok).
   - `NewGame` private constructor dostaje `_externalId: string` jako pierwsze pole po validacji.
   - `static create(props: GameProps, idGenerator: () => string = () => crypto.randomUUID()): Result<NewGame, GameValidationError>` — w returnie ostatnim, przed `new NewGame(...)`, generujemy `const externalId = idGenerator()` i przekazujemy do konstruktora.
   - `get externalId(): string` na `NewGame`.
   - `Game.fromPersistence` row dostaje `externalId: string` (NIE nullable). Konstruktor `Game` magazynuje `_externalId`. Getter `externalId`.
   - `Game.toJSON()` dorzuca `externalId: this._externalId`.
2. Aktualizuj testy w `src/domain/games/__tests__/`:
   - Tam gdzie `Game.fromPersistence({ id, userId, ... })` — dodaj `externalId: 'test-uuid-1'` (lub podobny placeholder).
   - Tam gdzie `NewGame.create(props)` — bez zmian (opcjonalny drugi arg). Asercje na `externalId` jeśli chcesz: wstrzyknij `() => 'fixed-uuid'` żeby było deterministyczne.
3. `bun test apps/api/src/domain/games` → ZIELONE.
**Rezultat:** Domain `Game` rozumie `externalId`.

### Step 5: Domain — `Platform`, `NewPlatform`
**Co robimy:**
1. W `apps/api/src/domain/platforms/platform.ts` — analogicznie do Step 4: `NewPlatform.create(props, idGenerator?)`, `Platform.fromPersistence` z `externalId`, `toJSON` dorzuca `externalId`.
2. Aktualizuj testy w `src/domain/platforms/__tests__/`.
3. `bun test apps/api/src/domain/platforms` → ZIELONE.
**Rezultat:** Domain `Platform` rozumie `externalId`.

### Step 6: Repo — `findByExternalId` + `create` zapisuje `externalId`
**Co robimy:**
1. `apps/api/src/domain/games/game-repository.ts` — dodaj do interfejsu:
   ```ts
   findByExternalId(userId: string, externalId: string): Promise<Game | null>;
   ```
2. `apps/api/src/domain/platforms/platform-repository.ts` — analogicznie.
3. `DrizzleGameRepository`:
   - `mapRowToGame` przepisuje `row.externalId`.
   - `create(newGame)` w `.values({ ..., externalId: newGame.externalId })`.
   - `update(id, game)` w `.set({...})` — **NIE** ustawia `externalId` (immutable po insert). Pomiń pole.
   - Nowa metoda `findByExternalId`:
     ```ts
     async findByExternalId(userId: string, externalId: string): Promise<Game | null> {
       const [row] = await db
         .select()
         .from(gamesTable)
         .where(and(eq(gamesTable.userId, userId), eq(gamesTable.externalId, externalId)))
         .limit(1);
       return row ? this.mapRowToGame(row) : null;
     }
     ```
4. `DrizzlePlatformRepository` — analogicznie (`mapRowToPlatform`, `create`, `findByExternalId`).
5. Inne testy aplikacji (`create-game.test.ts`, `create-platform.test.ts`, etc.) — jeśli używają fake repo z mock'iem `Game.fromPersistence({...})` bez externalId, dodaj. Jeśli `toJSON()` snapshot — zaktualizuj asercję.
**Rezultat:** Pełny pipeline persistence. `bun test` zielone.

### Step 7: Walidacja końcowa
**Co robimy:**
1. `bun run typecheck` z `apps/api` → 0 błędów.
2. `bun test` w `apps/api` → wszystkie pakiety zielone.
3. Smoke test ręczny:
   - Uruchom `bun run dev`.
   - Stwórz nowy wiersz przez UI lub curl (POST /api/games albo /api/platforms).
   - Sprawdź w DB: `sqlite3 apps/api/data/apex.db "SELECT id, external_id FROM games ORDER BY id DESC LIMIT 1;"` → dostajesz wiersz z `external_id` jako 36-znakowy UUID.
4. `SELECT COUNT(*) FROM games WHERE external_id IS NULL;` = 0. To samo dla `platforms`. (Jeśli nie 0 — backfill nie poszedł albo migracja 0006 została pominięta.)
**Rezultat:** Faza 1 zamknięta. Eksport (faza 2) ma czym karmić plik.

## If you get stuck
Jeśli po 2 próbach coś nie działa: ZATRZYMAJ. Napisz:
`STUCK at Step <N>: <co, jaki błąd, jaka hipoteza>`
Zakończ pracę.

Najczęstsze pułapki:
- Drizzle generuje 0006 jako "drop+recreate table" dla SQLite — to NORMALNE. Sprawdź że `INSERT INTO new_<table> SELECT ... FROM <table>` jest w środku. Jeśli go nie ma → STOP, dane przepadną.
- Skrypt backfill rzuca "table has no column external_id" — migracja 0005 nie została zaaplikowana. Uruchom `bun run dev` raz (żeby `migrate()` przeleciał), potem ubij i odpal skrypt.
- `crypto.randomUUID is not a function` — Bun ma to globalnie od dawna. Jeśli jednak — `import { randomUUID } from 'node:crypto'`. Ale **najpierw** sprawdź `bun --version`; jeśli >= 1.0 to powinno działać.
- Test mówi "expected externalId to be a string" — fake repo używa `Game.fromPersistence({...})` bez externalId. Dodaj.
- `Type 'string | null' is not assignable to type 'string'` po migracji 0006 — typ `GameRow.externalId` zaktualizował się ale gdzieś w `mapRowToGame` był stary cast. Usuń `as string | null`.
