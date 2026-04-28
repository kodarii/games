---
name: Phase 2 Infrastructure
description: Schemat DB + migracja + repo Drizzle z filtrem po userId
type: plan
---

# Game User Ownership — Faza 2: Infrastructure (DB + Repo)

## Goal
Dodać kolumnę `user_id` do tabeli `games` z FK do `user.id` (ON DELETE CASCADE),
wygenerować + zastosować migrację Drizzle oraz zaktualizować
`DrizzleGameRepository`, żeby `list()` filtrował po `userId`, a `create()` zapisywał
`userId` z agregatu. Mapper `mapRowToGame` musi przekazywać `userId` do
`Game.fromPersistence`.

## Definition of Done
- [ ] `bun run check` (z `apps/api`) → czyste
- [ ] `bun test apps/api` → wszystko zielone (poza testami z fazy 3, których jeszcze nie ma)
- [ ] Tabela `games` ma kolumnę `user_id TEXT NOT NULL` z FK do `user(id)` ON DELETE CASCADE
- [ ] Istnieje indeks `games_user_id_idx` na `user_id`
- [ ] `DrizzleGameRepository.list()` filtruje rekordy `WHERE user_id = ?` z `query.userId`
- [ ] `DrizzleGameRepository.create()` zapisuje `userId` do tabeli
- [ ] `mapRowToGame` przekazuje `userId` (string) do `Game.fromPersistence`
- [ ] Seed gier nie odpala się automatycznie LUB jest wyłączony w `index.ts`

Agent kończy pracę WYŁĄCZNIE gdy powyższe są spełnione.

## Context
**Runtime:** Bun (NIE Node.js, NIE npm — `bun test`, `bun run check`, `bun run db:generate`, `bun run db:migrate`)
**Katalog roboczy:** `apps/api`
**DB:** SQLite (better-sqlite3) w `apps/api/data/apex.db`
**ORM:** Drizzle ORM + drizzle-kit (config: `apps/api/drizzle.config.ts`)
**Auth:** Better-Auth, schemat w `src/infrastructure/db/auth-schema.ts` — tabela `user` z `id TEXT PRIMARY KEY`
**Architektura:** infrastructure może importować z domain. Domain z fazy 1 ma już pole `userId` w `NewGame` i `Game`.

## Design decisions
- `user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE` — kasacja konta usuwa też gry usera.
- Indeks `games_user_id_idx` na kolumnie — w sumie każde zapytanie listy filtruje po userId, więc index jest must-have.
- Filtrowanie po `userId` dzieje się w repo (`list()`), nie wyżej. Dzięki temu use case nie musi się troszczyć o `WHERE`.
- `findById`, `update`, `delete` w repo NIE filtrują po userId. Sprawdzanie ownership robi use case w fazie 3 (czyste oddzielenie: repo = persystencja, use case = polityka). Konsekwencja: use case musi `findById` przed update/delete.
- `update()` nie ustawia `user_id` (właściciel jest niezmienny po utworzeniu). Tylko `create()` zapisuje `userId`.
- **Istniejące rekordy w `games` muszą zostać usunięte przed migracją** — nie da się dodać `NOT NULL FK` na rzeczywiste id usera dla starych wierszy. Seed był dev-only i nie ma sensu już go odpalać (gry są per-user). Wyłączamy `seedGamesIfEmpty()` w `index.ts`.
- **NIE kasujemy całego pliku `apex.db`** — usunęłoby konta userów z fazy auth, a użytkownik je ma. Czyścimy tylko tabelę `games` SQL-em.

## Relevant files (edit only these)
- `src/infrastructure/db/schema.ts` — dodanie kolumny `userId` + indeks
- `src/infrastructure/games/drizzle-game-repository.ts` — filtr po userId, mapper, create
- `src/index.ts` — wyłączenie wywołania `seedGamesIfEmpty()`
- `drizzle/<nowa_migracja>.sql` — wygenerowana migracja (drizzle-kit generuje, ewentualnie ręczne dopasowanie)

## Files to read but NOT edit
- `src/infrastructure/db/auth-schema.ts` — definicja tabeli `user` (do FK)
- `src/domain/games/game.ts` — po fazie 1 `Game` i `NewGame` mają `userId`
- `src/domain/games/game-repository.ts` — interfejs `ListGamesQuery` ma `userId`
- `apps/api/drizzle/0000_odd_deadpool.sql` i `0001_friendly_bishop.sql` — referencja, jak wyglądają poprzednie migracje
- `apps/api/drizzle.config.ts` — config drizzle-kit

## Steps

### Step 1: Wyłącz seed gier
**Co robimy:**
1. W `src/index.ts`:
   - Usuń lub zakomentuj linię `await seedGamesIfEmpty();`
   - Zostaw import (nieużywany) lub usuń import — według preferencji projektu (niech `bun run check` zostanie czysty, więc usuń import jeśli nieużywany)
**Rezultat:** API startuje bez seedowania gier.

### Step 2: Dodaj kolumnę `userId` w schemacie
**Co robimy:**
1. W `src/infrastructure/db/schema.ts`:
   - Dodaj import `index` z `drizzle-orm/sqlite-core`
   - Dodaj import tabeli `user` z `./auth-schema` (UWAGA: cyrkularność nie powinna być problemem — `auth-schema.ts` nie importuje z `schema.ts`)
   - Dodaj kolumnę: `userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' })`
   - Dodaj jako drugi argument do `sqliteTable` callback z indeksem: `(table) => [index('games_user_id_idx').on(table.userId)]`
2. `bun run check` z `apps/api` → czyste (TypeScript)
**Rezultat:** schemat ma `user_id` + indeks, kompiluje się.

### Step 3: Wyczyść tabelę `games` w bazie
**Co robimy:**
1. Z poziomu `apps/api` uruchom (bun ma wbudowane SQLite, ale można też przez sqlite3 CLI):
   ```bash
   bun -e "import('better-sqlite3').then(({default:Database})=>{const db=new Database('./data/apex.db');db.prepare('DELETE FROM games').run();console.log('games cleared');db.close();})"
   ```
   LUB jeśli `sqlite3` CLI jest dostępny:
   ```bash
   sqlite3 ./data/apex.db "DELETE FROM games;"
   ```
2. Zweryfikuj `sqlite3 ./data/apex.db "SELECT COUNT(*) FROM games;"` → `0`
**Rezultat:** tabela `games` pusta. Tabela `user` i sesje pozostają.

### Step 4: Wygeneruj migrację Drizzle
**Co robimy:**
1. `bun run db:generate` z `apps/api`
2. Zobacz nowy plik w `apps/api/drizzle/` (np. `0002_xxx.sql`)
3. Otwórz plik — drizzle-kit dla SQLite zwykle generuje **table recreation** (CREATE TABLE __new_games → INSERT SELECT → DROP → RENAME). Sprawdź:
   - Definicja `__new_games` ma `user_id TEXT NOT NULL` oraz `FOREIGN KEY (user_id) REFERENCES user(id) ON UPDATE no action ON DELETE cascade`
   - Powstaje `CREATE INDEX games_user_id_idx ON games (user_id)`
4. Jeżeli `INSERT INTO __new_games SELECT ... FROM games` zawiera kolumnę `user_id` której nie ma w starym schemacie — to zadziała tylko gdy stara tabela jest pusta (Step 3 to gwarantuje).
**Rezultat:** migracja wygenerowana, świadoma, że tabela jest pusta.

### Step 5: Zastosuj migrację
**Co robimy:**
1. `bun run db:migrate` z `apps/api`
2. Zweryfikuj:
   ```bash
   sqlite3 ./data/apex.db ".schema games"
   ```
   Powinieneś zobaczyć `user_id TEXT NOT NULL` i `FOREIGN KEY (user_id) REFERENCES user(id)`.
3. Sprawdź indeks: `sqlite3 ./data/apex.db ".indexes games"` → wśród indeksów jest `games_user_id_idx`.
**Rezultat:** baza ma nową strukturę.

### Step 6: Zaktualizuj `DrizzleGameRepository`
**Co robimy:**
1. W `src/infrastructure/games/drizzle-game-repository.ts`:
   - **`mapRowToGame`**: dodaj `userId: row.userId` do obiektu przekazywanego do `Game.fromPersistence`
   - **`list(query)`**:
     - Zmień `whereClause` na zawsze obecny: użyj `and(eq(gamesTable.userId, query.userId), <istniejące search>)`
     - Konkretnie: zacznij od bazowego `eq(gamesTable.userId, query.userId)`, a jeżeli `search` jest podany, owiń w `and(<userId>, or(...search clauses...))`
     - Usuń branchowanie `whereClause ? ... : ...` w `totalQuery` i `baseQuery` — zawsze jest `where`
   - **`create(newGame)`**: dodaj `userId: newGame.userId` do `.values({...})`
   - **`update(id, game)`**: NIE dodawaj `userId` do `.set({...})` (właściciel niezmienny)
   - **`findById`, `delete`**: BEZ ZMIAN (ownership w use case)
2. `bun run check` → czyste
**Rezultat:** repo filtruje po userId i zapisuje userId.

### Step 7: Weryfikacja typów + build
**Co robimy:**
1. `bun run check` z `apps/api` → 0 błędów
2. `bun test apps/api` → testy domeny i istniejących use case'ów dalej zielone (te wykorzystujące `FakeGameRepository` nie wymagają tu zmian — `userId` na agregacie jest, repo testowe nie filtruje po userId; faktyczne testy z userId dorobimy w fazie 3)
3. Spróbuj uruchomić: `bun run dev` z `apps/api` → API startuje bez błędów (bez `seedGamesIfEmpty`)
**Rezultat:** infrastruktura gotowa.

## If you get stuck
- Jeżeli `db:generate` produkuje migrację z `INSERT INTO __new_games(... user_id ...) SELECT ... user_id FROM games` (czyli próbuje wczytać `user_id` ze starej tabeli, której tam nie ma) — to **JEST OK pod warunkiem że tabela `games` jest pusta** (`SELECT 0 rows`). Step 3 to gwarantuje. Jeżeli mimo tego nie wykonuje się, ręcznie edytuj migrację: zastąp `INSERT INTO __new_games(...) SELECT ...` jednym `-- (table was empty)`.
- Jeżeli `db:migrate` zwraca `FOREIGN KEY constraint failed` — sprawdź, czy w `apex.db` nie ma duchów w `games` (`DELETE FROM games`).
- Jeżeli po 2 próbach nadal nie działa: ZATRZYMAJ. Napisz:
  `STUCK at Step <N>: <co, jaki błąd, jaka hipoteza>`
