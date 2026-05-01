# releaseYear optional — Faza 2: Application + Infrastructure

## Goal
Zaktualizuj warstwy application i infrastructure: Zod schematy, repozytoria Drizzle,
import/export — żeby `releaseYear` był opcjonalny w całym backend pipeline.

## Definition of Done
- [ ] `bun test apps/api` — wszystkie testy zielone
- [ ] `bun run typecheck` (w katalogu `apps/api`) — zero błędów
- [ ] POST `/api/games` akceptuje payload bez `releaseYear`

Agent kończy pracę WYŁĄCZNIE gdy powyższe są spełnione.

## Context
**Runtime:** Bun (NIE Node.js, NIE npm — `bun test`, `bun run typecheck`)
**ORM:** Drizzle — kolumna `release_year` jest już nullable (zrobione w fazie 1)
**Faza 1 output:** `game.ts` — `_releaseYear: ReleaseYear | null`, gettery zwracają `ReleaseYear | null`

## Design decisions
- Zod: `.optional()` na releaseYear w create-game i update-game — gdy brak = `undefined` → `null` w DB
- Infrastructure: `newGame.releaseYear?.value ?? null` przy insert/update
- Export sort nulls last: `(a.releaseYear?.value ?? Infinity) - (b.releaseYear?.value ?? Infinity)`
- Shared schemas (import): `.nullish()` (nie `.optional()`) — eksport produkuje `null`, Zod `.optional()` go odrzuca; `.nullish()` akceptuje `number | null | undefined`
- Import mappings: `releaseYear: g.releaseYear ?? undefined` — normalizuj `null → undefined` przed przekazaniem do `NewGame.create()` (bo `GameProps.releaseYear?: number` nie akceptuje `null`)
- DB sort: przy sortowaniu po `releaseYear DESC` wymuś `NULLS LAST` — domyślnie Postgres daje `NULLS FIRST` przy DESC, co wyrzuca gry bez roku na górę listy
- Nie ma potrzeby dodawania nowego error kind — walidacja dzieje się tylko gdy wartość istnieje

## Relevant files (edit only these)
- `apps/api/src/application/games/create-game.ts`
- `apps/api/src/application/games/update-game.ts`
- `apps/api/src/application/games/create-game.test.ts`
- `apps/api/src/application/games/update-game.test.ts`
- `apps/api/src/application/export/export-snapshot.ts`
- `apps/api/src/application/import/import-data.ts`
- `apps/api/src/application/import/migrations/external-to-current.ts`
- `apps/api/src/infrastructure/games/drizzle-game-repository.ts`
- `apps/api/src/infrastructure/import/drizzle-import-repository.ts`
- `packages/shared/src/import-schema-external.ts`
- `packages/shared/src/import-schema-v1.ts`

## Files to read but NOT edit
- `apps/api/src/domain/games/game.ts` — typy z fazy 1 (NewGame, Game, ReleaseYear | null)
- `apps/api/src/application/games/list-games.ts` — tylko przekazuje sort do repo, żadnych zmian

---

## Steps

### Step 0: Przeczytaj pliki
Przed edycją przeczytaj każdy plik z listy "Relevant files".

### Step 1: Zod schematy — application layer

**`apps/api/src/application/games/create-game.ts`** (linia ~17):
```typescript
// PRZED:
releaseYear: z.coerce.number().min(1970).max(2100),
// PO:
releaseYear: z.coerce.number().int().min(1970).max(2100).optional(),
```
Przekazanie do `NewGame.create()` (linia ~68): `releaseYear: data.releaseYear` — zostaje bez zmian
(domain dostaje `undefined` gdy brak, a faza 1 to obsługuje).

**`apps/api/src/application/games/update-game.ts`** (linia ~17):
```typescript
// PRZED:
releaseYear: z.coerce.number().min(1970).max(2100),
// PO:
releaseYear: z.coerce.number().int().min(1970).max(2100).optional(),
```

**`packages/shared/src/import-schema-external.ts`** (linia ~9):
```typescript
// PRZED:
releaseYear: z.number().int().min(1970).max(2100),
// PO:
releaseYear: z.number().int().min(1970).max(2100).nullish(),
```

**`packages/shared/src/import-schema-v1.ts`** (linia ~13):
```typescript
// PRZED:
releaseYear: z.number().int().min(1970).max(2100),
// PO:
releaseYear: z.number().int().min(1970).max(2100).nullish(),
```

### Step 2: Infrastructure — repozytoria Drizzle

**`apps/api/src/infrastructure/games/drizzle-game-repository.ts`**:

Insert (linia ~109):
```typescript
// PRZED:
releaseYear: newGame.releaseYear.value,
// PO:
releaseYear: newGame.releaseYear?.value ?? null,
```

Update (linia ~129):
```typescript
// PRZED:
releaseYear: game.releaseYear.value,
// PO:
releaseYear: game.releaseYear?.value ?? null,
```

Mapping z DB row (linia ~27 — gdzie mapujesz row → domain):
Sprawdź czy `releaseYear` przechodzi jako `row.releaseYear` — DB zwróci `number | null`,
`Game.fromPersistence` już to obsługuje (faza 1). Żadna zmiana w samym mappingu nie powinna być potrzebna.

Sort NULLS LAST (linia ~74 — blok `orderBy`):
Postgres domyślnie daje `NULLS FIRST` przy `DESC`, co wyrzuca gry bez roku na górę. Gdy sortowana kolumna to `releaseYear`, wymuś `NULLS LAST`:
```typescript
// PRZED:
if (sortColumn)
  baseQuery = baseQuery.orderBy(dir === 'desc' ? desc(sortColumn) : asc(sortColumn));
// PO:
if (sortColumn) {
  const isReleaseYear = sort === 'releaseYear';
  const order =
    dir === 'desc'
      ? isReleaseYear ? sql`${gamesTable.releaseYear} DESC NULLS LAST` : desc(sortColumn)
      : asc(sortColumn); // ASC już daje NULLS LAST w Postgres
  baseQuery = baseQuery.orderBy(order);
}
```
Dodaj import `sql` z `drizzle-orm` jeśli go nie ma.

**`apps/api/src/infrastructure/import/drizzle-import-repository.ts`**:

Wszystkie inserty z `ng.releaseYear.value` (linie ~42 i ~91):
```typescript
// PRZED:
releaseYear: ng.releaseYear.value,
// PO:
releaseYear: ng.releaseYear?.value ?? null,
```

### Step 3: Export + Import mappings

**`apps/api/src/application/export/export-snapshot.ts`**:

Typ (linia ~16):
```typescript
// PRZED:
releaseYear: number;
// PO:
releaseYear: number | null;
```

Sort nulls last (linia ~41):
```typescript
// PRZED:
return a.releaseYear.value - b.releaseYear.value;
// PO:
return (a.releaseYear?.value ?? Infinity) - (b.releaseYear?.value ?? Infinity);
```

Mapping gry (linia ~48):
```typescript
// PRZED:
releaseYear: g.releaseYear.value,
// PO:
releaseYear: g.releaseYear?.value ?? null,
```

**`apps/api/src/application/import/import-data.ts`** (linia ~82):
Po zmianie na `.nullish()` `g.releaseYear` będzie `number | null | undefined`. `GameProps.releaseYear` akceptuje tylko `number | undefined`, więc wymagana normalizacja:
```typescript
// PRZED:
releaseYear: g.releaseYear,
// PO:
releaseYear: g.releaseYear ?? undefined,
```

**`apps/api/src/application/import/migrations/external-to-current.ts`** (linia ~15):
Analogicznie:
```typescript
// PRZED:
releaseYear: g.releaseYear,
// PO:
releaseYear: g.releaseYear ?? undefined,
```

### Step 4: Testy backend

**`apps/api/src/application/games/create-game.test.ts`** — dodaj test:
```typescript
it('creates game without releaseYear', async () => {
  const input = { ...validInput };
  delete input.releaseYear;  // lub: releaseYear: undefined
  const result = await createGame(input, fakeRepo, fakeUserRepo);
  expect(result.ok).toBe(true);
});
```

**`apps/api/src/application/games/update-game.test.ts`** — dodaj test:
```typescript
it('updates game clearing releaseYear', async () => {
  const input = { ...validInput, releaseYear: undefined };
  const result = await updateGame(existingGameId, input, fakeRepo);
  expect(result.ok).toBe(true);
});
```

Uruchom wszystkie testy:
```bash
bun test apps/api
```
Muszą przejść — zarówno stare (z releaseYear) jak i nowe (bez).

### Step 5: Weryfikacja końcowa
```bash
bun test apps/api
bun run typecheck   # w katalogu apps/api
```
Oba muszą przejść bez błędów.

## If you get stuck
Jeśli po 2 próbach coś nie działa: ZATRZYMAJ się. Napisz:
`STUCK at Step <N>: <co, jaki błąd, jaka hipoteza>`
Zakończ pracę.
