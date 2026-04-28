---
name: Phase 3 Application
description: Use cases CreatePlatform / ListPlatforms / DeletePlatform + walidacja w Game use cases
type: plan
---

# Platform Dictionary — Faza 3: Application (Use Cases)

## Goal
Stworzyć trzy use case'y dla platform: `CreatePlatform`, `ListPlatforms`,
`DeletePlatform` (z ownership i blokadą usuwania platformy w użyciu).
Zintegrować słownik z istniejącymi `CreateGame` / `UpdateGame`: zamiast
hardcoded enum `GamePlatform`, walidacja sprawdza, że `data.platform` (string)
istnieje w słowniku platform aktualnego usera.

## Definition of Done
- [ ] `bun test apps/api` → wszystko zielone (domain + application)
- [ ] `bun run check` z `apps/api` → 0 błędów
- [ ] Sygnatury: `CreatePlatform.execute(input, userId)`, `ListPlatforms.execute(userId)`, `DeletePlatform.execute(id, userId)`
- [ ] `CreatePlatform`: przy duplikacie nazwy zwraca `err({ kind: 'name_taken' })` (sprawdza `findByName` PRZED insertem)
- [ ] `DeletePlatform`: cudza platforma → `not_found`; własna w użyciu (przynajmniej 1 gra usera używa tej nazwy) → `err({ kind: 'in_use' })`
- [ ] `CreateGame` / `UpdateGame`: walidacja `data.platform` ⇒ jeśli platforma o takiej nazwie nie istnieje w słowniku tego usera → `err({ kind: 'domain', error: { kind: 'platform_invalid', value } })`
- [ ] `GAME_PLATFORMS` enum w `src/domain/games/game.ts` USUNIĘTY (lub zamieniony na `GamePlatform = string`); Zod schema w CreateGame/UpdateGame nie używa `z.enum(...)` dla platform — użyj `z.string().min(1)`
- [ ] `FakePlatformRepository` w testach (in-memory) implementuje port

Agent kończy pracę WYŁĄCZNIE gdy powyższe są spełnione.

## Context
**Runtime:** Bun (`bun test`, `bun run check`)
**Katalog roboczy:** `apps/api`
**Architektura:** application orkiestruje domain + repo. Polityki (ownership, uniqueness, in-use check) są tu.
**Bezpieczeństwo:** dla cudzych zasobów zwracamy `not_found` (NIE `forbidden`) — jak w Game (faza 3 game-user-ownership). Brak ujawniania istnienia.
**Domain z fazy 1:** `NewPlatform.create({ userId, name })`, `Platform.userId`, `Platform.name`.
**Repo z fazy 2:** `findByName(userId, name)` dla unikalności; `findById` bez filtru — ownership tu.

## Design decisions
- **Sygnatury** (kolejność dla spójności z `CreateGame`/`ListGames`):
  - `CreatePlatform.execute(input: unknown, userId: string)` — input z body (Zod schema: `{ name: string }`)
  - `ListPlatforms.execute(userId: string)` — bez `input`, lista jest prosta
  - `DeletePlatform.execute(id: number, userId: string)` — najpierw `findById`, potem ownership, potem in-use check, potem `delete`
- **Uniqueness w `CreatePlatform`** sprawdzamy w warstwie aplikacji (`findByName`) PRZED `repo.create`. UNIQUE w DB to bezpiecznik — gdyby race wszedł, drizzle wyrzuci błąd; możesz go obsłużyć jako `name_taken` (catch + sprawdź message), ale dla MVP wystarczy primary path.
- **In-use check w `DeletePlatform`**: zapytanie do `gameRepo` "ile gier usera ma `platform = name`". To wymaga albo rozszerzenia `GameRepository` o metodę `countByPlatform(userId, name)`, albo użycia `list({ userId, search: name, ... })` z filtrem (mniej precyzyjne — `like` zwraca substring). **Rozwiązanie:** dodaj metodę `countByPlatform(userId: string, platformName: string): Promise<number>` do `GameRepository` i jej implementację Drizzle (`SELECT count(*) FROM games WHERE user_id = ? AND platform = ?`). Również w `FakeGameRepository`.
- **Walidacja w `CreateGame`/`UpdateGame`**: wstrzykujemy `PlatformRepository` jako drugi argument konstruktora. Po Zod parse, ale PRZED `NewGame.create`, sprawdzamy `await platformRepo.findByName(userId, data.platform)` — jeśli `null`, zwracamy `err({ kind: 'domain', error: { kind: 'platform_invalid', value: data.platform } })` (re-używamy istniejący kind z `GameValidationError`, żeby nie zmieniać typu erroru).
- **Hardcoded enum `GAME_PLATFORMS`** w `src/domain/games/game.ts` znika — `GamePlatform = string`. Walidacja "czy istnieje" przeniesiona do application (potrzebuje I/O — nie pasuje do domeny). Walidacja "niepusty trim" zostaje w `NewGame.create` (sprawdź czy istnieje — jeśli nie, dodaj `if (!props.platform.trim()) return err({ kind: 'platform_invalid', value: props.platform })`).
- `GamePlatform` jako gołe `string` — testy domeny gier z fazy 1 game-user-ownership mogą wymagać drobnej korekty (jeśli używają literali z enum, nadal się skompilują, bo string je akceptuje).
- `update()` w `UpdateGame` — przy `repo.update` `userId` jest niezmienny; weź `existing.userId` jak w fazie 3 game-user-ownership (już tak jest).

## Relevant files (edit only these)
- `src/application/platforms/create-platform.ts` — nowy use case
- `src/application/platforms/list-platforms.ts` — nowy use case
- `src/application/platforms/delete-platform.ts` — nowy use case
- `src/application/platforms/create-platform.test.ts`
- `src/application/platforms/list-platforms.test.ts`
- `src/application/platforms/delete-platform.test.ts`
- `src/application/games/create-game.ts` — wstrzyknięcie `platformRepo` + walidacja
- `src/application/games/update-game.ts` — wstrzyknięcie `platformRepo` + walidacja
- `src/application/games/create-game.test.ts` — fake platform repo, dorzucenie platformy do testów
- `src/application/games/update-game.test.ts` — j.w.
- `src/domain/games/game.ts` — usunięcie `GAME_PLATFORMS`, `GamePlatform = string`, walidacja niepustej platformy
- `src/domain/games/game-repository.ts` — dodanie `countByPlatform`
- `src/infrastructure/games/drizzle-game-repository.ts` — implementacja `countByPlatform`

## Files to read but NOT edit
- `src/domain/platforms/platform.ts`, `platform-repository.ts` — z fazy 1
- `src/infrastructure/platforms/drizzle-platform-repository.ts` — z fazy 2 (dla integracji w fazie 4)
- `src/application/games/list-games.ts`, `delete-game.ts`, `get-game.ts` — wzorzec sygnatur z fazy 3 game-user-ownership
- `src/domain/shared/result.ts` — `Result`, `ok`, `err`

## Steps

### Step 1: Testy nowych use case'ów (RED)
**Co robimy:**
1. Utwórz `FakePlatformRepository` w pliku testów lub jako helper:
   ```ts
   class FakePlatformRepository implements PlatformRepository {
     private store = new Map<number, Platform>();
     private nextId = 1;
     async list(userId: string) { return [...this.store.values()].filter(p => p.userId === userId); }
     async findById(id: number) { return this.store.get(id) ?? null; }
     async findByName(userId: string, name: string) {
       return [...this.store.values()].find(p => p.userId === userId && p.name === name) ?? null;
     }
     async create(np: NewPlatform) {
       const p = Platform.fromPersistence({ id: this.nextId++, userId: np.userId, name: np.name });
       this.store.set(p.id, p); return p;
     }
     async delete(id: number) {
       const p = this.store.get(id); if (!p) return null; this.store.delete(id); return p;
     }
   }
   ```
2. **`create-platform.test.ts`**:
   - happy: `execute({ name: 'Wii U' }, 'user-A')` → `ok`, w fake repo jest platforma o tej nazwie z userId='user-A'
   - duplikat: dodaj 'PS5' dla user-A, potem `execute({ name: 'PS5' }, 'user-A')` → `err({ kind: 'name_taken' })`
   - inny user może mieć tę samą nazwę: 'PS5' dla user-A, `execute({ name: 'PS5' }, 'user-B')` → `ok`
   - invalid input (puste name): `execute({ name: '' }, 'user-A')` → `err({ kind: 'invalid_input' })`
3. **`list-platforms.test.ts`**:
   - 3 platformy user-A + 2 platformy user-B → `execute('user-A')` zwraca tylko 3
4. **`delete-platform.test.ts`**:
   - cudza: platforma user-A id=1, `execute(1, 'user-B')` → `err({ kind: 'not_found' })`, platforma DALEJ istnieje
   - in-use: platforma 'PS5' user-A; w `FakeGameRepository` 1 gra user-A z `platform: 'PS5'`. `execute(1, 'user-A')` → `err({ kind: 'in_use' })`, platforma DALEJ istnieje
   - happy: platforma 'PS5' user-A bez gier → `execute(1, 'user-A')` → `ok`, platforma usunięta
5. `bun test apps/api/src/application/platforms` → RED.
**Rezultat:** testy use case'ów istnieją i FAILUJĄ.

### Step 2: Implementacja `CreatePlatform` + `ListPlatforms` (GREEN)
**Co robimy:**
1. `src/application/platforms/create-platform.ts`:
   ```ts
   const InputSchema = z.object({ name: z.string().min(1) });
   export type CreatePlatformError =
     | { kind: 'invalid_input'; issues: z.ZodIssue[] }
     | { kind: 'domain'; error: PlatformValidationError }
     | { kind: 'name_taken' };

   export class CreatePlatform {
     constructor(private readonly repo: PlatformRepository) {}
     async execute(input: unknown, userId: string): Promise<Result<Platform, CreatePlatformError>> {
       const parsed = InputSchema.safeParse(input);
       if (!parsed.success) return err({ kind: 'invalid_input', issues: parsed.error.issues });

       const newP = NewPlatform.create({ userId, name: parsed.data.name });
       if (!newP.ok) return err({ kind: 'domain', error: newP.error });

       const existing = await this.repo.findByName(userId, newP.value.name);
       if (existing) return err({ kind: 'name_taken' });

       const created = await this.repo.create(newP.value);
       return ok(created);
     }
   }
   ```
2. `src/application/platforms/list-platforms.ts`:
   ```ts
   export class ListPlatforms {
     constructor(private readonly repo: PlatformRepository) {}
     async execute(userId: string): Promise<Platform[]> {
       return this.repo.list(userId);
     }
   }
   ```
3. `bun test apps/api/src/application/platforms/create-platform.test.ts` + `list-platforms.test.ts` → GREEN.
**Rezultat:** create + list działają.

### Step 3: `countByPlatform` w `GameRepository` + implementacja Drizzle + `DeletePlatform`
**Co robimy:**
1. W `src/domain/games/game-repository.ts` dodaj do interfejsu:
   ```ts
   countByPlatform(userId: string, platformName: string): Promise<number>;
   ```
2. W `src/infrastructure/games/drizzle-game-repository.ts` zaimplementuj:
   ```ts
   async countByPlatform(userId: string, platformName: string): Promise<number> {
     const r = await db.select({ count: sql<number>`count(*)` }).from(gamesTable)
       .where(and(eq(gamesTable.userId, userId), eq(gamesTable.platform, platformName)));
     return r[0]?.count ?? 0;
   }
   ```
3. W `FakeGameRepository` w testach gier i platform: `async countByPlatform(userId, name) { return [...this.store.values()].filter(g => g.userId === userId && g.platform === name).length; }`. Jeżeli `FakeGameRepository` jest re-używany w wielu testach — dodaj tę metodę wszędzie, gdzie `implements GameRepository` (TypeScript wymusi).
4. `src/application/platforms/delete-platform.ts`:
   ```ts
   export type DeletePlatformError = { kind: 'not_found' } | { kind: 'in_use' };
   export class DeletePlatform {
     constructor(
       private readonly repo: PlatformRepository,
       private readonly gameRepo: GameRepository,
     ) {}
     async execute(id: number, userId: string): Promise<Result<Platform, DeletePlatformError>> {
       const existing = await this.repo.findById(id);
       if (!existing || existing.userId !== userId) return err({ kind: 'not_found' });
       const inUse = await this.gameRepo.countByPlatform(userId, existing.name);
       if (inUse > 0) return err({ kind: 'in_use' });
       const deleted = await this.repo.delete(id);
       if (!deleted) return err({ kind: 'not_found' });
       return ok(deleted);
     }
   }
   ```
5. `bun test apps/api/src/application/platforms` → GREEN. `bun run check` → czyste.
**Rezultat:** delete-platform z in-use + ownership.

### Step 4: Usuń enum `GAME_PLATFORMS` z domeny + walidacja niepustej platform
**Co robimy:**
1. W `src/domain/games/game.ts`:
   - Usuń export `GAME_PLATFORMS`.
   - Zmień `export type GamePlatform = 'PS3' | ... | 'Switch'` → `export type GamePlatform = string`.
   - W `NewGame.create`: zamień `if (!GAME_PLATFORMS.includes(props.platform))` na:
     ```ts
     const trimmedPlatform = props.platform?.trim();
     if (!trimmedPlatform) return err({ kind: 'platform_invalid', value: String(props.platform) });
     ```
     I używaj `trimmedPlatform` zamiast `props.platform` w konstruktorze.
   - **Istnienie w słowniku** sprawdza warstwa application — NIE w domenie.
2. W `src/application/games/create-game.ts` w `CreateGameInputSchema`:
   - Zmień `platform: z.enum(['PS3', 'PS4', 'PS5', 'PC', 'Xbox', 'Switch'])` → `platform: z.string().min(1)`.
3. To samo w `src/application/games/update-game.ts` (jeśli ma własną Zod schemę — sprawdź; jeśli importuje z create-game — wystarczy raz).
4. `bun run check` z `apps/api` — sprawdź czy są inne miejsca używające `GAME_PLATFORMS` (np. testy domeny gier). W razie czego napraw przez podanie literala stringa zamiast importu.
5. `bun test apps/api` → istniejące testy gier dalej zielone (większość używała stringów typu `'PS5'`, które dalej są poprawne).
**Rezultat:** domena nie zna stałej listy platform.

### Step 5: Wstrzyknij `PlatformRepository` do `CreateGame` / `UpdateGame`
**Co robimy:**
1. W `CreateGame`:
   ```ts
   constructor(
     private readonly repo: GameRepository,
     private readonly platformRepo: PlatformRepository,
   ) {}
   ```
   W `execute` po Zod parse, PRZED `NewGame.create`:
   ```ts
   const platform = await this.platformRepo.findByName(userId, data.platform);
   if (!platform) return err({ kind: 'domain', error: { kind: 'platform_invalid', value: data.platform } });
   ```
2. To samo w `UpdateGame.execute` — po `findById` i ownership check, po Zod parse, PRZED `NewGame.create`.
3. Zaktualizuj testy `create-game.test.ts` i `update-game.test.ts`:
   - Dodaj `FakePlatformRepository`, w `beforeEach` zasiej platformę `'PS5'` (lub jakąkolwiek używaną w testach) dla `'user-A'`.
   - Zmień konstruowanie use case'a: `new CreateGame(gameRepo, platformRepo)`, `new UpdateGame(gameRepo, platformRepo)`.
   - Dodaj test: gra z platformą której nie ma w słowniku → `err({ kind: 'domain', error: { kind: 'platform_invalid', value: 'Wii U' } })`.
4. `bun test apps/api` → wszystko zielone. `bun run check` → czyste.
**Rezultat:** Game use cases walidują przez słownik. Testy zielone.

## If you get stuck
- Jeżeli `bun run check` po Step 4 wyrzuca błędy w innych miejscach (np. infrastruktura `drizzle-game-repository.ts` rzutuje `row.platform as GamePlatform`) — to OK, `as string` dalej działa, bo `GamePlatform = string`. Jeśli mocno marudzi, usuń rzutowanie (`row.platform` jest już stringiem).
- Jeżeli istniejący `FakeGameRepository` musi dostać `countByPlatform` w wielu plikach — możesz wyciągnąć go do współdzielonego helpera w `src/application/games/__tests__/fake-game-repository.ts`. Ale to nice-to-have, nie blokuj się tym.
- Jeżeli race między `findByName` a `create` w testach failuje — to nie jest race, to logiczny błąd. Sprawdź czy pierwszy `create` zapisuje TĘ SAMĄ instancję `Platform` co później `findByName` widzi.
- Po 2 próbach: ZATRZYMAJ. Napisz:
  `STUCK at Step <N>: <co, jaki błąd, jaka hipoteza>`
