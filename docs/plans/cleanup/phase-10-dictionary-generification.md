# Phase 10 — Dictionary generification (genres / developers / platforms)

## Goal
Trzy klony — `genres.ts`, `developers.ts`, `platforms.ts` — różnią się tylko nazwami. To samo route'y (~49 linii ×3), use-case'y (`Create*` ×3, `Delete*` ×3), domain entities (`*Name` VO ×3). Zunifikować w jeden generyczny moduł + 3 konfiguracje. ~300 LOC mniej, dodanie nowego dictionary (np. `publishers`) staje się 20-linijkową konfiguracją.

## Definition of Done
- [ ] Istnieje `apps/api/src/domain/dictionary/dictionary.ts` (generic types) + `apps/api/src/domain/dictionary/dictionary-name.ts` (VO).
- [ ] Istnieje `apps/api/src/application/dictionary/make-dictionary-use-cases.ts` zwracający `{ create, delete, list }` factory.
- [ ] Istnieje `apps/api/src/routes/_make-dictionary-router.ts` zwracający `Hono` z 3 endpointami (GET, POST, DELETE).
- [ ] `routes/genres.ts`, `routes/developers.ts`, `routes/platforms.ts` skurczone do ~10 linii konfiguracji każdy.
- [ ] **Wszystkie istniejące testy zielone** (kontrakt API niezmieniony — to refaktor wewnętrzny).
- [ ] Można dodać `publishers` dictionary dopisując ~20 linii: config + Drizzle schema.
- [ ] `bun test` zielone, `bun run check` + `bun run lint` czyste.

## Context
**Aktualny stan**:
- `routes/{genres,developers,platforms}.ts` — 49 linii każdy, identyczne handlery.
- `application/{genres,developers,platforms}/{create,delete}-*.ts` — 6 plików, ~20 linii każdy, identyczne.
- `domain/{genres,developers,platforms}/{genre,developer,platform}.ts` — 3 pliki, identyczne struktury + `*Name` VO.
- `infrastructure/{genres,developers,platforms}/drizzle-*.ts` — 3 repo adapter, identyczne CRUD.

**Różnice** między dictionary:
1. **Nazwa**: `genres` vs `developers` vs `platforms`.
2. **Tabela DB**: `genres` vs `developers` vs `platforms`.
3. **Counter w `GameRepository`**: `countByGenre` vs `countByDeveloper` vs `countByPlatform`.
4. **Endpoint path**: `/genres`, `/developers`, `/platforms`.
5. **Max length name**: zweryfikuj w istniejących VO. Może identyczne.

### Step 0: Context7
- TypeScript: "generic class with constructor signature".
- Drizzle: "generic table queries with sql template".

### Relevant files (edit / create)
- NEW: `apps/api/src/domain/dictionary/dictionary.ts` — typy.
- NEW: `apps/api/src/domain/dictionary/dictionary-name.ts` — VO.
- NEW: `apps/api/src/domain/dictionary/__tests__/dictionary-name.test.ts`.
- NEW: `apps/api/src/application/dictionary/make-dictionary-use-cases.ts` — factory.
- NEW: `apps/api/src/application/dictionary/__tests__/make-dictionary-use-cases.test.ts`.
- NEW: `apps/api/src/infrastructure/dictionary/make-drizzle-dictionary-repository.ts` — generic factory.
- NEW: `apps/api/src/routes/_make-dictionary-router.ts` — Hono router factory.
- EDIT: `apps/api/src/routes/genres.ts`, `developers.ts`, `platforms.ts` — slim wrappers.
- EDIT: `apps/api/src/wiring.ts` — instancjowanie 3 dictionary przez factory.
- DELETE: stare pliki `domain/{genres,developers,platforms}/`, `application/{genres,developers,platforms}/`, `infrastructure/{genres,developers,platforms}/` PO upewnieniu że testy są zielone z nową implementacją.

### Files to read but NOT edit
- `apps/api/src/domain/games/game-repository.ts` — kontrakt `countByX` (po fazie 11 może zostać zmieniony, ale ta faza nie zmienia tych metod).
- Wszystkie 3 obecne implementacje — żeby zrozumieć kontrakt i powtarzające się reguły.

## Design decisions
- **`DictionaryName` VO**: jedno value object dla wszystkich (zakładając ten sam max length). Jeśli istnieją różnice w max length — przyjmij `maxLength` jako parametr w fabryce VO.
- **`DictionaryEntity`** generic:
  ```ts
  interface DictionaryEntity<TKind extends string> {
    readonly id: number;
    readonly userId: string;
    readonly externalId: string;
    readonly name: DictionaryName;
    readonly kind: TKind;  // 'genre' | 'developer' | 'platform' — phantom type dla bezpieczeństwa
  }
  ```
- **`DictionaryRepository<TKind>`** generic interface:
  ```ts
  interface DictionaryRepository<TKind extends string> {
    list(userId: string): Promise<DictionaryEntity<TKind>[]>;
    findById(userId, id): Promise<DictionaryEntity<TKind> | null>;
    create(userId, name): Promise<Result<...>>;
    delete(userId, id): Promise<Result<...>>;
    countUsages(userId, name): Promise<number>;  // delegated to GameRepository
  }
  ```
- **Use-case factory**:
  ```ts
  function makeDictionaryUseCases<TKind>({ repo, countUsages, entityKind }) {
    return {
      list: new ListDictionary(repo),
      create: new CreateDictionary(repo, entityKind),
      delete: new DeleteDictionary(repo, countUsages, entityKind),
    };
  }
  ```
- **Router factory**:
  ```ts
  function makeDictionaryRouter({ list, create, delete: del, errorPrefix }): Hono { ... }
  ```
- **`errorPrefix`**: w obecnych routach jest np. `'platform_already_exists'`, `'genre_already_exists'`. Generic factory używa prefiksu z configu (np. `'genre'` → `'genre_already_exists'`).

## Constraints
- Kontrakt HTTP **bez zmian** — to czysto wewnętrzny refaktor. Klient nie wie o zmianie.
- NIE usuwaj testów starego kodu — przepisz je tak, by testowały nową implementację (same scenariusze, inne importy).
- NIE łącz tej fazy z fazą 11 (domain split) — robione osobno, łatwiej review.
- Jeśli `Platform` ma dodatkowe pole (np. `externalId` którego inni nie mają) — zostaw `Platform` poza generic ALBO rozszerz generic o opcjonalne pola.

## Steps

### Step 1: Generic domain + VO + testy (RED→GREEN)
1. `dictionary-name.ts` — VO z fabryką `DictionaryName.create(value: string, maxLength: number)`. Testy.
2. `dictionary.ts` — typy `DictionaryEntity<TKind>`, `DictionaryRepository<TKind>`.
3. Test: tworzenie entity z różnymi `TKind` (kompiluje się; różne kindy nie są przypisywalne — phantom type works).

**Rezultat:** generic types + VO przetestowane.

### Step 2: Generic repository factory + use-case factory + router factory
1. `make-drizzle-dictionary-repository.ts` — przyjmuje Drizzle table reference + countUsages callback, zwraca implementację `DictionaryRepository<TKind>`.
2. `make-dictionary-use-cases.ts` — buduje use-case'y.
3. `_make-dictionary-router.ts` — buduje router (GET, POST, DELETE).
4. **Każdy** plik ma test używający fake-repo + sample-table.

**Rezultat:** infrastruktura generic gotowa.

### Step 3: Migracja routes/genres + developers + platforms + wiring
1. `wiring.ts`:
   ```ts
   const genreRepo = makeDrizzleDictionaryRepository({ table: genresTable, kind: 'genre', countUsages: gameRepository.countByGenre.bind(gameRepository) });
   const genreUseCases = makeDictionaryUseCases({ repo: genreRepo, entityKind: 'genre', errorPrefix: 'genre' });
   export const genresRouter = makeDictionaryRouter({ ...genreUseCases });
   ```
2. `routes/genres.ts`: `export { genresRouter as genres } from '../wiring';` (lub dummy re-export — zachowaj nazwę importu).
3. To samo `developers` i `platforms`.
4. `bun test` — wszystkie istniejące testy muszą przejść.
5. DELETE starych `application/{genres,developers,platforms}/`, `domain/{genres,developers,platforms}/`, `infrastructure/{genres,developers,platforms}/` — TYLKO po potwierdzeniu zielonych testów.

**Rezultat:** 3 słowniki przez 1 generic moduł. Test "dodaj 4-ty słownik `publishers`" jako sanity check (dodać w PR description).

## If you get stuck
Jeśli po 2 próbach coś nie działa: ZATRZYMAJ się. Napisz:
`STUCK at Step <N>: <co próbowałem, jaki błąd, jaka hipoteza>`
Zakończ pracę bez commitowania.
