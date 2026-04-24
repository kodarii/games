# Refactor domeny `Game`: anemic interface → agregat-klasa z VO + bugfixy

## Goal
Naprawić architekturę DDD w `apps/api/src/domain/games/` i `infrastructure/`:
zamienić anemic `interface Game` na klasę z prywatnymi polami i getterami (enkapsulacja),
wprowadzić Value Objects `ReleaseYear` i `HoursPlayed` (chronią invarianty po typie),
naprawić bug w mapowaniu błędów (`platform_invalid`/`status_invalid` zamiast fałszywego
`title_empty`), odchudzić domain factory (przyjmuje typed props, nie surowy `unknown`),
oraz naprawić bugi w `DrizzleGameRepository.list()` (count bez WHERE, sort po LIMIT).

**Kształt JSON odpowiedzi HTTP MUSI pozostać niezmieniony** — frontend nie jest tknięty.

## Definition of Done
- [ ] `Game` jest klasą z `private readonly` polami i publicznymi getterami (zero `public` mutowalnych)
- [ ] `NewGame` jest osobną klasą (Game bez id) — używana przez `repo.create(...)`
- [ ] `ReleaseYear` i `HoursPlayed` są klasami VO z `static create(raw): Result<...>`
- [ ] `GameValidationError` ma osobne kindy `platform_invalid` i `status_invalid` (już nie fałszywy `title_empty`)
- [ ] Factory domeny przyjmuje TYPOWANY `GameProps` (NIE `unknown`) — parsowanie zostało w Zod (use case)
- [ ] `DrizzleGameRepository.list()`: count uwzględnia search (WHERE), sortowanie wykonane przez SQL `orderBy` przed `limit/offset`
- [ ] `GET /api/games?search=...` zwraca poprawne `total` (= liczbie po filtrze, nie wszystkich)
- [ ] `GET /api/games?sort=title&dir=desc&page=2` zwraca globalnie posortowane wyniki strony 2 (nie tylko bieżącą stronę posortowaną)
- [ ] Kształt JSON dla `GET /api/games/:id` i `GET /api/games` IDENTYCZNY co przed refactorem
- [ ] Testy domeny przechodzą: `cd apps/api && bun test` (VO + Game.create + NewGame.create — happy path + edge cases dla każdego invariantu)
- [ ] Lint clean: `bun run lint` (z rootu)
- [ ] Typecheck clean: `cd apps/api && bun run typecheck`
- [ ] Smoke test ręczny: `GET /api/games`, `GET /api/games/1`, `POST /api/games` zwracają takie same payloady jak wcześniej

Agent kończy WYŁĄCZNIE gdy wszystkie checkboxy są spełnione.

## Context
**Stack (NIE zmieniaj):**
- Backend: Bun + Hono + Drizzle ORM + **SQLite** (better-sqlite3) + Zod
- Test runner: wbudowany `bun test` (`import { describe, it, expect } from 'bun:test'`)
- Brak Jest/Vitest. Brak nowych zależności (`bun add` zabronione).

**Istniejący stan (do refactoru):**
- `domain/games/game.ts` — `interface Game`, `type NewGame = Omit<Game, 'id'>`, factory `createNewGame(input: unknown)` z bugiem (linie 55, 60: zwraca `'title_empty'` dla błędnego platform/status)
- `domain/games/game-repository.ts` — port z `list/findById/create`
- `application/games/create-game.ts`, `get-game.ts`, `list-games.ts` — use cases używają `createNewGame` i typu `Game`
- `infrastructure/games/drizzle-game-repository.ts` — `mapRowToGame()` zwraca object literal; `list()` ma bugi (count bez WHERE, sort po LIMIT)
- `routes/games.ts` — Hono handlers, instancjonują use cases i repo

**Świadome decyzje (NIE ruszaj):**
- ID = integer auto-increment (SQLite generuje, NIE generujemy UUID w domenie). Akceptowane odstępstwo od czystego DDD.
- Feature-folder structure (`domain/games/`, nie `domain/aggregates/`) — konsystentne, zostaje.
- Brak domain events / domain services — YAGNI.
- Composition root w `routes/games.ts` — zostaje.

### Relevant files (edit only these)
- `apps/api/src/domain/games/game.ts` — refactor: VO + klasy `Game`, `NewGame`, factory na `GameProps`
- `apps/api/src/domain/games/game-repository.ts` — sygnatura repo dostosowana do nowych klas
- `apps/api/src/domain/games/__tests__/game.test.ts` — **NOWY** — testy VO + factory
- `apps/api/src/infrastructure/games/drizzle-game-repository.ts` — naprawa `list()`, mapping z/do klas
- `apps/api/src/application/games/create-game.ts` — adaptacja do nowego factory (Zod robi parsing, domain dostaje typed props)
- `apps/api/src/application/games/list-games.ts` — bez zmian logiki, ale typecheck musi przejść z nowym typem `Game`
- `apps/api/src/application/games/get-game.ts` — bez zmian logiki, typecheck z nowym typem
- `apps/api/src/routes/games.ts` — być może drobna zmiana serializacji (jeśli `Game` jest klasą — patrz Step 7)

### Files to read but NOT edit
- `apps/api/src/domain/shared/result.ts` — używaj `ok` / `err`
- `apps/api/src/infrastructure/db/schema.ts` — schemat bez zmian
- `apps/api/src/infrastructure/db/client.ts` — `db`
- `apps/client/**` — frontend NIE TYKAĆ (kompatybilność JSON musi być utrzymana)
- `docs/plans/PLAN_game-edit.md` — referencja: po tym refactorze `createGameUpdate` z tamtego planu zmieni się na `NewGame.create` (ale tamten plan jeszcze nie został zrealizowany — to nie blokuje tego refactoru)

## Constraints (hard rules)
- TDD: NIE pisz kodu produkcyjnego domeny bez UPRZEDNIEGO testu (Step 2 → Step 3)
- Backward-compat HTTP: kształt JSON `Game` w response MUSI być taki sam (`{ id, title, developer, genre, releaseYear, platform, edition, hoursPlayed, status }` — wszystkie pola jako prymitywy, NIE zagnieżdżone obiekty VO)
- NIE eksportuj klas VO przez API HTTP (VO żyją w domenie; route handler dostaje surowe pola przez gettery / `toJSON()`)
- NIE wrzucaj parsowania `unknown` do domain factory — TO JEST robota Zod w use case
- NIE importuj `infrastructure/` w `domain/` — dependency rule
- NIE dodawaj zależności (`bun add` zabronione)
- NIE zmieniaj schematu DB ani nie generuj migracji — kolumny zostają
- NIE modyfikuj plików spoza listy "Relevant files"
- NIE wprowadzaj `id: string` (UUID) — ID zostaje `number` z DB
- NIE twórz domain events, services, ani drugich agregatów (YAGNI)
- Klasy VO i `Game`/`NewGame` mają **prywatny konstruktor** + statyczną fabrykę — to wymusza że jedyną drogą stworzenia jest factory (z walidacją)

## Implementation plan

### Step 0: Pobierz dokumentację (tylko jeśli nie jesteś pewien)
**Co robimy:** Użyj Context7 wyłącznie dla niepewnych miejsc:
- Drizzle ORM (SQLite/better-sqlite3): "drizzle-orm count with where clause, asc/desc orderBy with column reference"
- Bun test runner: "bun test describe it expect basic api"
- TypeScript: "private constructor with static factory pattern, branded types"

Wzorzec już istniejącego kodu Drizzle: patrz `drizzle-game-repository.ts` (uses `.select().from().where().limit().offset()`, `eq` z `drizzle-orm`). Dla orderBy potrzebujesz `asc`, `desc` z `drizzle-orm`.

**Rezultat:** masz pewność co do API. Koduj na podstawie pobranych docs + istniejących wzorców w pliku.

### Step 1: Domain types — szkielet (klasy bez implementacji)
**Co robimy w `apps/api/src/domain/games/game.ts`:**

1. Zachowaj union types `GamePlatform`, `GameStatus` i tablice `GAME_PLATFORMS`, `GAME_STATUSES` (są używane przez use case i frontend types).

2. Rozszerz `GameValidationError` — dodaj brakujące kindy:
```ts
export type GameValidationError =
  | { kind: 'title_empty' }
  | { kind: 'developer_empty' }
  | { kind: 'release_year_out_of_range'; value: number }
  | { kind: 'hours_played_negative'; value: number }
  | { kind: 'platform_invalid'; value: string }   // NOWY
  | { kind: 'status_invalid'; value: string };    // NOWY
```

3. Dodaj typ `GameProps` (czysty, typed input dla factory — bez `unknown`):
```ts
export type GameProps = {
  title: string;
  developer: string;
  genre: string;
  releaseYear: number;
  platform: GamePlatform;
  edition?: string;
  hoursPlayed: number;
  status: GameStatus;
};
```

4. Zadeklaruj klasy VO (puste implementacje — `throw new Error('not implemented')`):
```ts
export class ReleaseYear {
  private constructor(public readonly value: number) {}
  static create(raw: number): Result<ReleaseYear, GameValidationError> {
    throw new Error('not implemented');
  }
}

export class HoursPlayed {
  private constructor(public readonly value: number) {}
  static create(raw: number): Result<HoursPlayed, GameValidationError> {
    throw new Error('not implemented');
  }
}
```
(Używamy `GameValidationError` jako error type żeby nie dublować typów. Każde VO produkuje TYLKO swój odpowiedni kind.)

5. Zadeklaruj klasę `NewGame` z prywatnym konstruktorem i `static create(props: GameProps)`:
```ts
export class NewGame {
  private constructor(
    private readonly _title: string,
    private readonly _developer: string,
    private readonly _genre: string,
    private readonly _releaseYear: ReleaseYear,
    private readonly _platform: GamePlatform,
    private readonly _edition: string | undefined,
    private readonly _hoursPlayed: HoursPlayed,
    private readonly _status: GameStatus,
  ) {}

  static create(props: GameProps): Result<NewGame, GameValidationError> {
    throw new Error('not implemented');
  }

  get title() { return this._title; }
  get developer() { return this._developer; }
  get genre() { return this._genre; }
  get releaseYear(): ReleaseYear { return this._releaseYear; }
  get platform(): GamePlatform { return this._platform; }
  get edition(): string | undefined { return this._edition; }
  get hoursPlayed(): HoursPlayed { return this._hoursPlayed; }
  get status(): GameStatus { return this._status; }
}
```

6. Zadeklaruj klasę `Game` (ma id, restaurowana z DB — bez ponownej walidacji):
```ts
export class Game {
  private constructor(
    private readonly _id: number,
    private readonly _title: string,
    private readonly _developer: string,
    private readonly _genre: string,
    private readonly _releaseYear: ReleaseYear,
    private readonly _platform: GamePlatform,
    private readonly _edition: string | undefined,
    private readonly _hoursPlayed: HoursPlayed,
    private readonly _status: GameStatus,
  ) {}

  // Restoring from DB (zaufana persystencja — bez walidacji).
  // Wywoływane TYLKO przez repository adapter.
  static fromPersistence(row: {
    id: number;
    title: string;
    developer: string;
    genre: string;
    releaseYear: number;
    platform: GamePlatform;
    edition: string | null;
    hoursPlayed: number;
    status: GameStatus;
  }): Game {
    throw new Error('not implemented');
  }

  get id() { return this._id; }
  get title() { return this._title; }
  get developer() { return this._developer; }
  get genre() { return this._genre; }
  get releaseYear(): ReleaseYear { return this._releaseYear; }
  get platform(): GamePlatform { return this._platform; }
  get edition(): string | undefined { return this._edition; }
  get hoursPlayed(): HoursPlayed { return this._hoursPlayed; }
  get status(): GameStatus { return this._status; }

  // Serializacja do JSON odpowiedzi HTTP — kształt MUSI być jak stary `interface Game`
  // (releaseYear i hoursPlayed jako liczby, nie obiekty VO).
  toJSON() {
    return {
      id: this._id,
      title: this._title,
      developer: this._developer,
      genre: this._genre,
      releaseYear: this._releaseYear.value,
      platform: this._platform,
      edition: this._edition,
      hoursPlayed: this._hoursPlayed.value,
      status: this._status,
    };
  }
}
```

7. **USUŃ** stary `interface Game`, stary `type NewGame = Omit<Game, 'id'>` i starą funkcję `createNewGame`.

**Rezultat:** plik kompiluje się typecheckiem ALE wszystkie callers (`create-game.ts`, `get-game.ts`, `list-games.ts`, `drizzle-game-repository.ts`) MOGĄ teraz nie kompilować się — to OK na tym kroku. Zaadaptujemy je w Step 4-6.

**WAŻNE:** zaktualizuj również `domain/games/game-repository.ts` żeby importował `NewGame` (klasa) zamiast starego typu — sygnatury portu zostają (`create(game: NewGame): Promise<Game>`).

### Step 2: TEST domeny (RED)
**Co robimy:** Utwórz `apps/api/src/domain/games/__tests__/game.test.ts`:
```ts
import { describe, it, expect } from 'bun:test';
import { ReleaseYear, HoursPlayed, NewGame, Game, type GameProps } from '../game';
```

**Testy VO `ReleaseYear`:**
- `ReleaseYear.create(2022)` → `ok: true`, `value.value === 2022`
- `ReleaseYear.create(1969)` → `ok: false`, `error.kind === 'release_year_out_of_range'`, `error.value === 1969`
- `ReleaseYear.create(2101)` → `ok: false`, `error.kind === 'release_year_out_of_range'`
- `ReleaseYear.create(1970)` → `ok: true` (boundary)
- `ReleaseYear.create(2100)` → `ok: true` (boundary)

**Testy VO `HoursPlayed`:**
- `HoursPlayed.create(0)` → `ok: true`
- `HoursPlayed.create(120)` → `ok: true`
- `HoursPlayed.create(-1)` → `ok: false`, `error.kind === 'hours_played_negative'`, `error.value === -1`

**Testy `NewGame.create(props)`:**
Zdefiniuj helper:
```ts
const validProps = (): GameProps => ({
  title: 'Elden Ring',
  developer: 'FromSoftware',
  genre: 'ARPG',
  releaseYear: 2022,
  platform: 'PS5',
  edition: 'Standard',
  hoursPlayed: 120,
  status: 'Completed',
});
```
Testy:
- happy path: `NewGame.create(validProps())` → `ok: true`, gettery zwracają poprawne wartości (`game.title === 'Elden Ring'`, `game.releaseYear.value === 2022`, `game.hoursPlayed.value === 120`)
- pusty title: `NewGame.create({ ...validProps(), title: '' })` → `ok: false`, `error.kind === 'title_empty'`
- whitespace title: `NewGame.create({ ...validProps(), title: '   ' })` → `ok: false`, `error.kind === 'title_empty'`
- pusty developer: `NewGame.create({ ...validProps(), developer: '' })` → `ok: false`, `error.kind === 'developer_empty'`
- niepoprawny platform: `NewGame.create({ ...validProps(), platform: 'Atari' as any })` → `ok: false`, `error.kind === 'platform_invalid'`, `error.value === 'Atari'` ⬅ **NAPRAWIA BUG**
- niepoprawny status: `NewGame.create({ ...validProps(), status: 'Pending' as any })` → `ok: false`, `error.kind === 'status_invalid'`, `error.value === 'Pending'` ⬅ **NAPRAWIA BUG**
- niepoprawny releaseYear: `NewGame.create({ ...validProps(), releaseYear: 1900 })` → `ok: false`, `error.kind === 'release_year_out_of_range'`
- ujemny hoursPlayed: `NewGame.create({ ...validProps(), hoursPlayed: -5 })` → `ok: false`, `error.kind === 'hours_played_negative'`
- pusty edition (`undefined`): `NewGame.create({ ...validProps(), edition: undefined })` → `ok: true`, `game.edition === undefined`

**Testy `Game.fromPersistence`:**
- z poprawnym row: zwraca instancję `Game`, `game.id === 1`, `game.toJSON()` ma poprawny kształt z `releaseYear: number` (nie obiekt) i `hoursPlayed: number`
- z `edition: null`: `game.edition === undefined` (mapowanie null → undefined)

**Test serializacji JSON:**
```ts
const game = Game.fromPersistence({ id: 1, ...validRow });
const json = game.toJSON();
expect(json).toEqual({
  id: 1,
  title: 'Elden Ring',
  developer: 'FromSoftware',
  genre: 'ARPG',
  releaseYear: 2022,    // number, NIE obiekt VO
  platform: 'PS5',
  edition: 'Standard',
  hoursPlayed: 120,     // number, NIE obiekt VO
  status: 'Completed',
});
// JSON.stringify(game) też daje ten sam kształt — Hono używa JSON.stringify
expect(JSON.parse(JSON.stringify(game))).toEqual(json);
```

Uruchom: `cd apps/api && bun test`
**Rezultat:** wszystkie testy FAILUJĄ (RED) — implementacja rzuca `not implemented`. To jest prawidłowy stan.

### Step 3: Domain impl (GREEN)
**Co robimy:** Zaimplementuj factories z Step 1.

**`ReleaseYear.create(raw)`:**
- Jeśli `raw < 1970 || raw > 2100` → `err({ kind: 'release_year_out_of_range', value: raw })`
- W przeciwnym razie → `ok(new ReleaseYear(raw))`

**`HoursPlayed.create(raw)`:**
- Jeśli `raw < 0` → `err({ kind: 'hours_played_negative', value: raw })`
- W przeciwnym razie → `ok(new HoursPlayed(raw))`

**`NewGame.create(props: GameProps)`:**
Walidacja w kolejności (zwróć pierwszy błąd):
1. `props.title.trim()` — jeśli puste → `err({ kind: 'title_empty' })`. Użyj trimowanego dalej.
2. `props.developer.trim()` — jeśli puste → `err({ kind: 'developer_empty' })`.
3. `GAME_PLATFORMS.includes(props.platform)` — jeśli nie → `err({ kind: 'platform_invalid', value: String(props.platform) })`. ⬅ NAPRAWIA BUG (przedtem zwracało `title_empty`).
4. `GAME_STATUSES.includes(props.status)` — jeśli nie → `err({ kind: 'status_invalid', value: String(props.status) })`. ⬅ NAPRAWIA BUG.
5. `ReleaseYear.create(props.releaseYear)` — jeśli `!ok` → propaguj `err`.
6. `HoursPlayed.create(props.hoursPlayed)` — jeśli `!ok` → propaguj `err`.
7. `genre`: `props.genre.trim()` — pusty dozwolony.
8. `edition`: `props.edition?.trim() || undefined`.
9. Zwróć `ok(new NewGame(trimmedTitle, trimmedDev, genre, releaseYear, platform, edition, hoursPlayed, status))`.

**`Game.fromPersistence(row)`:**
- Mapowanie `row.edition: string | null` → `edition: string | undefined` (`row.edition ?? undefined`)
- Tworzenie VO bez walidacji (dane z DB są zaufane — jeśli ktoś bawił się ręcznie w DB, to inny problem). Użyj prywatnego konstruktora:
```ts
return new Game(
  row.id,
  row.title,
  row.developer,
  row.genre,
  // Tworzenie VO przez factory z fallback na throw — dane z DB powinny być zawsze valid:
  ReleaseYear.create(row.releaseYear).ok ? (ReleaseYear.create(row.releaseYear) as { ok: true; value: ReleaseYear }).value : (() => { throw new Error('corrupt db: invalid releaseYear'); })(),
  // ...
);
```

⚠ Powyższe jest brzydkie. Zamiast tego — dodaj prywatne konstruktory bypass do VO (TYLKO dla restoring):
Lepsze rozwiązanie: konstruktor `ReleaseYear` jest prywatny, ale możesz wywołać `new (ReleaseYear as any)(row.releaseYear)` (hack). Czyściej: w VO dodaj `static fromTrusted(value: number): ReleaseYear { return new ReleaseYear(value); }` i komentarz "use only in repository for restoring from DB". Jedna linijka komentarza dla każdej takiej metody.

```ts
// W ReleaseYear:
static fromTrusted(value: number): ReleaseYear {
  return new ReleaseYear(value);
}
// W HoursPlayed analogicznie.

// W Game.fromPersistence:
return new Game(
  row.id,
  row.title,
  row.developer,
  row.genre,
  ReleaseYear.fromTrusted(row.releaseYear),
  row.platform,
  row.edition ?? undefined,
  HoursPlayed.fromTrusted(row.hoursPlayed),
  row.status,
);
```

Uruchom: `cd apps/api && bun test` → wszystkie testy GREEN.
**Rezultat:** zielone testy domeny, `bun run typecheck` w `domain/` czysty (callers w `application/` i `infrastructure/` mogą nadal failować).

### Step 4: Repository adapter — adaptacja do nowych klas + naprawa `list()`
**Co robimy w `apps/api/src/infrastructure/games/drizzle-game-repository.ts`:**

1. Usuń metodę `mapRowToGame` (zwracała object literal). Zastąp wywołaniami `Game.fromPersistence(row)`:
```ts
private mapRowToGame(row: GameRow): Game {
  return Game.fromPersistence({
    id: row.id,
    title: row.title,
    developer: row.developer,
    genre: row.genre,
    releaseYear: row.releaseYear,
    platform: row.platform as Game['platform'] extends GamePlatform ? GamePlatform : never, // patrz niżej
    edition: row.edition,
    hoursPlayed: row.hoursPlayed,
    status: row.status as GameStatus,
  });
}
```
Praktycznie: importuj `GamePlatform`, `GameStatus` z domain i rzutuj `row.platform as GamePlatform`, `row.status as GameStatus`. Surowe stringi z DB mogą nie pasować — to akceptowane bo seed/migracja zapewnia zgodność.

2. **`create(newGame: NewGame)`:**
```ts
async create(newGame: NewGame): Promise<Game> {
  const [inserted] = await db
    .insert(gamesTable)
    .values({
      title: newGame.title,
      developer: newGame.developer,
      genre: newGame.genre,
      releaseYear: newGame.releaseYear.value,    // VO → number
      platform: newGame.platform,
      edition: newGame.edition ?? null,
      hoursPlayed: newGame.hoursPlayed.value,    // VO → number
      status: newGame.status,
    })
    .returning();

  return this.mapRowToGame(inserted);
}
```

3. **`findById(id)`:** bez zmian logiki, używa `this.mapRowToGame(...)`.

4. **`list(query)` — NAPRAWA BUGÓW:**
```ts
import { and, asc, desc, eq, like, or, sql } from 'drizzle-orm';

async list(query: ListGamesQuery): Promise<ListGamesResult> {
  const { search, page, perPage, sort, dir } = query;

  // 1. WHERE clause — wspólne dla count i select.
  const whereClause = search
    ? or(
        like(gamesTable.title, `%${search}%`),
        like(gamesTable.developer, `%${search}%`),
        like(gamesTable.genre, `%${search}%`),
        like(gamesTable.platform, `%${search}%`),
      )
    : undefined;

  // 2. Count z TYM SAMYM WHERE — naprawia bug "total nie pasuje do search"
  const totalQuery = whereClause
    ? db.select({ count: sql<number>`count(*)` }).from(gamesTable).where(whereClause)
    : db.select({ count: sql<number>`count(*)` }).from(gamesTable);
  const totalResult = await totalQuery;
  const total = totalResult[0]?.count ?? 0;

  // 3. ORDER BY w SQL — naprawia bug "sort tylko bieżącej strony"
  const sortColumn = sort
    ? {
        title: gamesTable.title,
        genre: gamesTable.genre,
        platform: gamesTable.platform,
        status: gamesTable.status,
        releaseYear: gamesTable.releaseYear,
        hoursPlayed: gamesTable.hoursPlayed,
      }[sort]
    : undefined;

  const offset = (page - 1) * perPage;

  let baseQuery = db.select().from(gamesTable).$dynamic();
  if (whereClause) baseQuery = baseQuery.where(whereClause);
  if (sortColumn) baseQuery = baseQuery.orderBy(dir === 'desc' ? desc(sortColumn) : asc(sortColumn));
  const items = await baseQuery.limit(perPage).offset(offset);

  return { items: items.map((row) => this.mapRowToGame(row)), total };
}
```

⚠ Drizzle wymaga `.$dynamic()` żeby budować query warunkowo bez problemów typowych. Jeśli `$dynamic()` nie jest dostępne w tej wersji — zrób branching (cztery warianty: with/without where × with/without sort), albo użyj `.where(whereClause ?? undefined)`. Sprawdź Context7 jeśli nie masz pewności.

**Rezultat:** `cd apps/api && bun run typecheck` czysty dla infra, repo działa z nowym typem `NewGame`.

### Step 5: Use cases — adaptacja do nowego API domeny
**Co robimy:** zmiany minimalne — Zod nadal robi parsing inputu HTTP, po `parsed.data` mamy typed `GameProps`-kompatybilny obiekt, który podajemy do `NewGame.create(props)`.

**`apps/api/src/application/games/create-game.ts`:**

1. Zaimportuj `NewGame, type GameProps` z `domain/games/game`. Usuń import `createNewGame`.

2. W `execute()`:
```ts
const data = parsed.data;

const props: GameProps = {
  title: data.title,
  developer: data.developer,
  genre: data.genre,
  releaseYear: data.releaseYear,
  platform: data.platform,
  edition: data.edition || undefined,
  hoursPlayed: data.hoursPlayed,
  status: data.status,
};

const newGameResult = NewGame.create(props);

if (!newGameResult.ok) {
  return err({ kind: 'domain', error: newGameResult.error });
}

const game = await this.repo.create(newGameResult.value);
return ok(game);
```

(Logika domeny — trim, walidacja invariantów — zostaje w domenie. Zod sprawdza typy i ograniczenia inputu HTTP. Duplikacja jest świadomie zachowana: Zod = boundary input validation, domain = invariant enforcement. To jest poprawny DDD.)

**`apps/api/src/application/games/get-game.ts`:**
- Bez zmian logiki. Po prostu `Game` jest teraz klasą — typecheck musi przejść. Hono w route handlerze zrobi `c.json(result.value)` co wywoła `JSON.stringify(game)` → użyje `game.toJSON()`. Patrz Step 7.

**`apps/api/src/application/games/list-games.ts`:**
- Bez zmian logiki. `result.items` jest tablicą `Game` (klas). Hono serializuje przez `JSON.stringify` (każdy element użyje `.toJSON()`).

**Rezultat:** `cd apps/api && bun run typecheck` w `application/` czysty. Nie pisz nowych testów use case w tym refactorze (poza scope — testy CreateGame już istnieją by wymusić poprawne mapowanie, lub ich nie ma — w obu przypadkach refactor zachowuje semantykę publicznego API use case).

### Step 6: Routes — sprawdź serializację, ewentualna drobna zmiana
**Co robimy w `apps/api/src/routes/games.ts`:**

Hono używa `c.json(value)` co woła `JSON.stringify(value)`. `JSON.stringify` automatycznie wywołuje `.toJSON()` jeśli istnieje na obiekcie. Klasa `Game` ma `toJSON()` (zdefiniowany w Step 1) → kształt JSON odpowiedzi BĘDZIE TAKI SAM jak przed refactorem.

**Sprawdź:**
- `GET /:id` → `c.json(result.value)` — `result.value` to instancja `Game`, `JSON.stringify` użyje `toJSON()` → odpowiedź = stary kształt
- `GET /` → `c.json(result)` gdzie `result.items` to `Game[]` — każdy element zostanie zserializowany przez `toJSON()`. ⚠ **JEDNAK** TanStack/Hono mogą serializować przez own JSON serializer omijający `toJSON` w Bun? Sprawdź to. Jeśli nie omija (standardowe `JSON.stringify` ZAWSZE używa `toJSON`), zostaw bez zmian. Jeśli omija, zrób `c.json({ ...result, items: result.items.map((g) => g.toJSON()) })`.
- `POST /` → `c.json(game, 201)` — to samo, instancja `Game`, `toJSON` zadziała.

**Smoke test (krytyczny, bo to backward compat):**
```bash
cd apps/api && bun run dev  # w osobnym terminalu
curl http://localhost:3001/api/games | jq '.items[0]'
# musi zwrócić: { "id": 1, "title": "...", ..., "releaseYear": 2022, "hoursPlayed": 100, ... }
# WSZYSTKIE pola jako prymitywy. NIE ma { "value": 2022 } dla releaseYear.
```

Jeśli kształt JSON jest INNY niż przed refactorem — wracamy do plana B: explicit `toJSON()` mapping w routerze. Plan B (kod):
```ts
games.get('/:id', async (c) => {
  // ... (jak było)
  if (!result.ok) return c.json({ error: 'not found' }, 404);
  return c.json(result.value.toJSON());
});

games.get('/', async (c) => {
  const result = await listGames.execute({...});
  return c.json({ ...result, items: result.items.map((g) => g.toJSON()) });
});

games.post('/', async (c) => {
  // ... (jak było)
  return c.json(result.value.toJSON(), 201);
});
```

**Rezultat:** smoke test pokazuje IDENTYCZNY kształt JSON jak przed refactorem.

### Step 7: Final check
**Co robimy:**
```
cd apps/api && bun test
cd apps/api && bun run typecheck
cd apps/client && bun run typecheck
bun run lint   # z rootu (cały monorepo)
```
Wszystko musi być zielone.

**Ręczny smoke test backward compat:**
1. `bun run dev` z rootu (uruchamia api + client)
2. Otwórz `/games` w przeglądarce — lista powinna się załadować i wyświetlić jak wcześniej
3. Kliknij grę → `/games/:id` powinno wyświetlić szczegóły
4. Sprawdź sortowanie: `GET /api/games?sort=releaseYear&dir=desc&page=1&perPage=5` — pierwsze 5 najnowszych GLOBALNIE (nie tylko strony)
5. Sprawdź search z paginacją: `GET /api/games?search=elden&perPage=5` — `total` to liczba pasujących, NIE wszystkich w DB
6. Test bug fix: `POST /api/games` z `{ "platform": "Atari", ... }` → 400 z `domain.kind === 'platform_invalid'`, NIE `'title_empty'`
7. Test bug fix: `POST /api/games` z `{ "status": "Pending", ... }` → 400 z `domain.kind === 'status_invalid'`

**Rezultat:** DoD spełniony. Refactor zakończony. Frontend i `PLAN_game-edit.md` (gdy ktoś go zrealizuje) są kompatybilne — w plan_game-edit zamień `createGameUpdate` → `NewGame.create`, reszta zostaje.

## Out of scope (NIE rób tego)
- NIE zmieniaj ID na UUID — zostaje integer auto-increment
- NIE zmieniaj struktury folderów (`domain/games/` zostaje feature-folder)
- NIE dodawaj domain events / domain services — YAGNI
- NIE refaktoruj `GameRepository` portu poza dostosowaniem typu (dodanie `update` to scope `PLAN_game-edit.md`)
- NIE dodawaj nowych use cases ani endpointów
- NIE dotykaj frontendu (`apps/client/**`) — kompatybilność JSON jest twardym wymaganiem
- NIE zmieniaj schematu DB ani migracji
- NIE optymalizuj query (indexy — osobny task)
- NIE wprowadzaj kolumny `updatedAt` ani audit logu
- NIE dodawaj testów dla `Game.fromPersistence` z corruptem DB — zaufana persystencja, scope poza tym refactorem

## If you get stuck
Jeśli po 2 próbach coś nie działa: ZATRZYMAJ się. Napisz:
```
STUCK at Step <N>: <co próbowałeś, jaki błąd, jaka hipoteza>
```
Zakończ pracę. Człowiek zdecyduje.

Najbardziej ryzykowne miejsca, w których możesz utknąć:
- **Step 4 — Drizzle dynamic query**: jeśli `$dynamic()` API nie pasuje do wersji 0.45 — zrób cztery warianty if/else. Nie kombinuj z typami.
- **Step 6 — `JSON.stringify` z `toJSON()`**: jeśli smoke test pokazuje że kształt jest zły, użyj plana B (explicit `.toJSON()` w routerze). Nie kombinuj z reflection ani transform middleware.
- **Step 3 — `Game.fromPersistence` z prywatnym konstruktorem VO**: użyj `static fromTrusted` na VO zgodnie z planem. NIE używaj `(ReleaseYear as any)`.
