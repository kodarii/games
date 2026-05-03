# Custom Covers — Faza 1: Domain + DB Schema

## Goal
Dodaj pole `coverImage` do domeny `Game` i kolumnę `cover_image` do tabeli `games`. Dodaj nowy method `findAllCoverImages()` do `GameRepository` (potrzebny dla crona w Fazie 2). Migracja.

**UWAGA:** wcześniejsza wersja planu zakładała tabelę `userSettings` na token UploadThing per-user. To znika — Faza 2 użyje globalnego tokena z ENV. **NIE** twórz `userSettings`, **NIE** twórz `DrizzleUserSettingsRepository`.

## Definition of Done
- [ ] `apps/api/src/domain/games/game.ts` eksportuje `coverImage` w `GameProps`, `NewGame`, `Game`, `toJSON`
- [ ] `apps/api/src/domain/games/game-repository.ts` ma method `findAllCoverImages()`
- [ ] `apps/api/src/infrastructure/db/schema.ts` ma kolumnę `cover_image` w `games`
- [ ] Migracja wygenerowana i wykonana: `cd apps/api && bunx drizzle-kit generate && bunx drizzle-kit migrate`
- [ ] `DrizzleGameRepository` mapuje `coverImage` w `mapRowToGame`, `create`, `update` + implementuje `findAllCoverImages`
- [ ] `cd apps/api && bun run check && bun test` — wszystko zielone

Agent kończy pracę WYŁĄCZNIE gdy powyższe są spełnione.

## Context
**Runtime:** Bun (NIE Node.js, NIE npm — używaj `bun run`, `bunx`)
**ORM:** Drizzle ORM + SQLite
**Architektura:** DDD — domain layer nie importuje nic z infrastructure

## Design decisions
- `coverImage` to opcjonalny URL string — NO Value Object (brak invariantów domenowych)
- Wzorzec jak istniejące `coverColor`: `string | undefined` w domain, `string | null` w DB
- NIE dodawaj walidacji URL w domenie — to rola Zod w application layer (Faza 2)
- `findAllCoverImages()` zwraca `string[]` (tylko non-null URLe ze wszystkich gier wszystkich userów) — będzie używane przez cron sprzątający orphany w UploadThing

## Relevant files

### Edytuj:
- `apps/api/src/domain/games/game.ts`
- `apps/api/src/domain/games/game-repository.ts`
- `apps/api/src/infrastructure/db/schema.ts`
- `apps/api/src/infrastructure/games/drizzle-game-repository.ts`

### Czytaj ale NIE edytuj:
- `apps/api/src/domain/shared/result.ts` — wzorzec Result<T,E>

---

## Steps

### Step 1: Extend `Game` domain — `game.ts`

Plik: `apps/api/src/domain/games/game.ts`

1. W `GameProps` dodaj pole na końcu:
   ```ts
   coverImage?: string;
   ```

2. W `NewGame` private constructor dodaj parametr po `_coverColor`:
   ```ts
   private readonly _coverImage: string | undefined,
   ```

3. W `NewGame.create()` przed `return ok(...)` dodaj:
   ```ts
   const coverImage = props.coverImage?.trim() || undefined;
   ```
   I przekaż `coverImage` jako ostatni argument do `new NewGame(...)`.

4. W `NewGame` dodaj getter (po `coverColor`):
   ```ts
   get coverImage(): string | undefined {
     return this._coverImage;
   }
   ```

5. W `Game` private constructor dodaj parametr po `_coverColor`:
   ```ts
   private readonly _coverImage: string | undefined,
   ```

6. W `Game.fromPersistence` w typie `row` dodaj:
   ```ts
   coverImage?: string | null;
   ```
   W `return new Game(...)` przekaż `row.coverImage ?? undefined` jako ostatni argument.

7. W `Game` dodaj getter:
   ```ts
   get coverImage(): string | undefined {
     return this._coverImage;
   }
   ```

8. W `Game.toJSON()` dodaj:
   ```ts
   coverImage: this._coverImage ?? null,
   ```
   (`null` zamiast `undefined` żeby pole zawsze było obecne w JSON-ie — symetria z innymi nullable polami)

**Sprawdź:** `cd apps/api && bun run check`

---

### Step 2: Extend `GameRepository` interface — dodaj `findAllCoverImages`

Plik: `apps/api/src/domain/games/game-repository.ts`

Dodaj na końcu interfejsu:
```ts
findAllCoverImages(): Promise<string[]>;
```

Komentarz nad metodą:
```ts
/**
 * Used by orphan-cleanup cron — returns all non-null cover URLs across all users.
 */
findAllCoverImages(): Promise<string[]>;
```

**Sprawdź:** TypeScript będzie krzyczał na `DrizzleGameRepository` — to OK, naprawimy w kroku 4.

---

### Step 3: DB schema — `schema.ts`

Plik: `apps/api/src/infrastructure/db/schema.ts`

W tabeli `games`, po linii `coverColor: text('cover_color'),` dodaj:
```ts
coverImage: text('cover_image'),
```

**NIE** dodawaj tabeli `userSettings` (była w starej wersji planu — usunięta).

**Sprawdź:** `cd apps/api && bun run check`

---

### Step 4: Update `DrizzleGameRepository`

Plik: `apps/api/src/infrastructure/games/drizzle-game-repository.ts`

1. W `mapRowToGame(row)` — do `Game.fromPersistence({...})` dodaj na końcu:
   ```ts
   coverImage: row.coverImage,
   ```

2. W `create(newGame)` — do `.values({...})` dodaj:
   ```ts
   coverImage: newGame.coverImage ?? null,
   ```

3. W `update(id, game)` — do `.set({...})` dodaj:
   ```ts
   coverImage: game.coverImage ?? null,
   ```

4. Na końcu klasy dodaj nową metodę:
   ```ts
   async findAllCoverImages(): Promise<string[]> {
     const rows = await db
       .select({ coverImage: gamesTable.coverImage })
       .from(gamesTable)
       .where(sql`${gamesTable.coverImage} IS NOT NULL`);
     return rows.map((r) => r.coverImage).filter((u): u is string => u != null);
   }
   ```

**Sprawdź:** `cd apps/api && bun run check`

---

### Step 5: Migracja

```bash
cd apps/api
bunx drizzle-kit generate
bunx drizzle-kit migrate
```

Oczekiwany output: nowy plik migracji w `apps/api/drizzle/` z `ALTER TABLE games ADD COLUMN cover_image text`. Migracja wykonana bez błędów.

Jeśli „no changes detected" → sprawdź czy plik schema.ts jest zapisany.

---

### Step 6: Sanity check istniejących testów

```bash
cd apps/api && bun test
```

Wszystkie testy powinny być zielone — Faza 1 nic nie psuje, dodaje tylko opcjonalne pole. Jeśli któryś test sypie się na FakeGameRepository (`update-game.test.ts`, `delete-game.test.ts`, `create-game.test.ts`) bo nie implementuje nowego `findAllCoverImages` — dodaj do `FakeGameRepository`:

```ts
findAllCoverImages = async (): Promise<string[]> => [];
```

---

## If you get stuck

Jeśli po 2 próbach coś nie działa, ZATRZYMAJ się i napisz:
```
STUCK at Step <N>: <co konkretnie, jaki błąd, hipoteza>
```
Zakończ pracę i poczekaj na pomoc.
