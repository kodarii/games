# releaseYear optional — Faza 1: Domain + DB schema

## Goal
Zrób `releaseYear` nullable w warstwie domenowej (`game.ts`) i w schemacie bazy danych.
Po tej fazie domena akceptuje brak roku wydania; infrastruktura i frontend są w fazie 2-3.

## Definition of Done
- [ ] `bun test apps/api/src/domain` — wszystkie testy zielone
- [ ] `bun run typecheck` (w katalogu `apps/api`) — zero błędów
- [ ] Migracja DB wygenerowana i zastosowana

Agent kończy pracę WYŁĄCZNIE gdy powyższe są spełnione.

## Context
**Runtime:** Bun (NIE Node.js, NIE npm — `bun test`, `bun run typecheck`)
**Architektura:** domain layer NIE importuje infrastructure
**Error handling:** Result<T, E> pattern — `ok(value)` / `err(error)` z `src/domain/shared/result.ts`
**ORM:** Drizzle — migracje: `bunx drizzle-kit generate` + `bunx drizzle-kit migrate`

## Design decisions
- `ReleaseYear` pozostaje Value Object — walidacja gdy wartość jest podana
- `releaseYear?: number` w `GameProps` (opcjonalne, nie null)
- Wewnątrz klas `_releaseYear: ReleaseYear | null`
- `ReleaseYear.create()` wywołuj TYLKO gdy `props.releaseYear != null`
- `fromPersistence` — `row.releaseYear: number | null` → `ReleaseYear.fromTrusted` tylko gdy nie null
- `toJSON` — `releaseYear: this._releaseYear?.value ?? null`
- DB: `integer('release_year')` bez `.notNull()` — kolumna nullable

## Relevant files (edit only these)
- `apps/api/src/infrastructure/db/schema.ts` — usunąć `.notNull()` z releaseYear
- `apps/api/src/domain/games/game.ts` — GameProps, NewGame, Game
- `apps/api/src/domain/games/__tests__/game.test.ts` — testy domeny

## Files to read but NOT edit
- `apps/api/src/domain/shared/result.ts` — Result, ok, err

---

## Steps

### Step 0: Przeczytaj pliki
Przeczytaj przed edycją:
- `apps/api/src/infrastructure/db/schema.ts`
- `apps/api/src/domain/games/game.ts`
- `apps/api/src/domain/games/__tests__/game.test.ts`

### Step 1: DB schema + migracja
**Edytuj** `apps/api/src/infrastructure/db/schema.ts`:
```
// PRZED:
releaseYear: integer('release_year').notNull(),
// PO:
releaseYear: integer('release_year'),
```

Następnie wygeneruj i zastosuj migrację:
```bash
cd apps/api && bunx drizzle-kit generate
cd apps/api && bunx drizzle-kit migrate
```

**Rezultat:** migracja OK, kolumna nullable w DB.

### Step 2: Testy domeny — zaktualizuj (RED → GREEN dla nowych, GREEN dla istniejących)
**Edytuj** `apps/api/src/domain/games/__tests__/game.test.ts`:

Dodaj nowe przypadki testowe (OBOK istniejących — nie usuwaj starych):

**Test: NewGame bez releaseYear**
```typescript
it('creates NewGame without releaseYear', () => {
  const props = { ...validProps, releaseYear: undefined };
  const result = NewGame.create(props);
  expect(result.ok).toBe(true);
  if (result.ok) {
    expect(result.value.releaseYear).toBeNull();
  }
});
```

**Test: Game.fromPersistence z null releaseYear**
```typescript
it('creates Game from persistence with null releaseYear', () => {
  const row = { ...validRow, releaseYear: null };
  const game = Game.fromPersistence(row);
  expect(game.releaseYear).toBeNull();
  expect(game.toJSON().releaseYear).toBeNull();
});
```

Uruchom: `bun test apps/api/src/domain` → nowe testy FAILUJĄ (RED). To oczekiwane.

### Step 3: Implementacja domeny (GREEN)
**Edytuj** `apps/api/src/domain/games/game.ts`:

**1. `GameProps`** — `releaseYear: number` → `releaseYear?: number`

**2. `NewGame` — pole prywatne:**
```typescript
private readonly _releaseYear: ReleaseYear | null,
```

**3. `NewGame.create()` — blok walidacji releaseYear:**
```typescript
// PRZED:
const releaseYearResult = ReleaseYear.create(props.releaseYear);
if (!releaseYearResult.ok) {
  return releaseYearResult;
}
// PO:
let releaseYear: ReleaseYear | null = null;
if (props.releaseYear != null) {
  const releaseYearResult = ReleaseYear.create(props.releaseYear);
  if (!releaseYearResult.ok) {
    return releaseYearResult;
  }
  releaseYear = releaseYearResult.value;
}
```
Przekaż `releaseYear` (nie `releaseYearResult.value`) do konstruktora.

**4. `NewGame` getter:**
```typescript
get releaseYear(): ReleaseYear | null {
  return this._releaseYear;
}
```

**5. `Game` — pole prywatne:**
```typescript
private readonly _releaseYear: ReleaseYear | null,
```

**6. `Game.fromPersistence` — typ row:**
```typescript
releaseYear: number | null;  // zmień z: number
```
**I logika:**
```typescript
// PRZED:
ReleaseYear.fromTrusted(row.releaseYear),
// PO:
row.releaseYear != null ? ReleaseYear.fromTrusted(row.releaseYear) : null,
```

**7. `Game` getter:**
```typescript
get releaseYear(): ReleaseYear | null {
  return this._releaseYear;
}
```

**8. `Game.toJSON()`:**
```typescript
// PRZED:
releaseYear: this._releaseYear.value,
// PO:
releaseYear: this._releaseYear?.value ?? null,
```

Uruchom: `bun test apps/api/src/domain` → ALL GREEN

### Step 4: Weryfikacja końcowa
```bash
bun test apps/api/src/domain
bun run typecheck   # w katalogu apps/api
```
Oba muszą przejść bez błędów.

## If you get stuck
Jeśli po 2 próbach coś nie działa: ZATRZYMAJ się. Napisz:
`STUCK at Step <N>: <co, jaki błąd, jaka hipoteza>`
Zakończ pracę.
