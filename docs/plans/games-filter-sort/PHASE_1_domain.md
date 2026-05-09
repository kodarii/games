# Games Filter & Sort — Faza 1: Domain Layer

## Goal
Wprowadź Value Object `ReleaseYearRange` z walidacją invariantów (`from <= to`, bounds 1958–2100) oraz rozszerz interfejs `ListGamesQuery` o nowe pola filtrów (`platforms`, `formats`, `releaseYearRange`). Agregat `Game` pozostaje bez zmian.

## Definition of Done
- [ ] Plik `apps/api/src/domain/games/release-year-range.ts` istnieje i eksportuje VO + factory
- [ ] Plik `apps/api/src/domain/games/release-year-range.test.ts` istnieje, wszystkie testy przechodzą
- [ ] Interfejs `ListGamesQuery` w `apps/api/src/domain/games/game-repository.ts` ma nowe pola opcjonalne
- [ ] `bun test apps/api/src/domain/games/` zielone
- [ ] `bun run --cwd apps/api typecheck` zielone
- [ ] `bun run lint` zielone

Agent kończy pracę WYŁĄCZNIE gdy powyższe są spełnione.

## Context
**Runtime:** Bun (`bun test`, `bunx`, NIE npm)
**Architektura:** DDD — domain layer NIE importuje infrastructure ani application
**Error handling:** projekt ma `Result<T, E>` w `apps/api/src/domain/shared/result.ts`. Sprawdź faktyczne API tego pliku przed użyciem (funkcje `ok()`, `err()` lub podobne).
**Test runner:** `bun:test` (importy z `bun:test`)

## Design decisions
- `ReleaseYearRange` to **Value Object** (immutable, bez tożsamości), nie agregat. Tworzony przez factory `ReleaseYearRange.create(from, to)` zwracający `Result`.
- Invarianty: `from >= 1958` (rok wydania pierwszej gry komercyjnej), `to <= 2100`, `from <= to`. Każde naruszenie → osobny `kind` w error (`out_of_bounds_low`, `out_of_bounds_high`, `inverted`).
- Range może mieć `from === to` (pojedynczy rok) — to jest legalne.
- Niepełny range (tylko `from` lub tylko `to`) NIE jest VO — to przechodzi jako goły `number?` w innych warstwach. VO wymaga obu wartości. Nieobecność range = `releaseYearRange: undefined` w query.
- `Game` aggregate ma już `ReleaseYear` VO — nie myl z `ReleaseYearRange`. Range to nowy, samodzielny VO używany TYLKO w query, nie w persisted Game.
- `ListGamesQuery` to read-side query DTO (nie agregat) — rozszerzamy go o nowe pola filtrów. Fieldy filtrów GRUPUJEMY semantycznie:
  - `search`, `kind`, `platforms`, `formats`, `releaseYearRange` to filters
  - `sort`, `dir` to sort
  - `page`, `perPage` to pagination
  - W tej fazie NIE refaktoryzujemy do nested struct (`{ filters, sort, pagination }`) — to byłoby breaking change dla istniejącego repo. Zostawiamy płaską strukturę, ale dokumentujemy semantykę w komentarzu nad interfejsem.

### Relevant files (edit only these)
- `apps/api/src/domain/games/release-year-range.ts` (NOWY)
- `apps/api/src/domain/games/release-year-range.test.ts` (NOWY)
- `apps/api/src/domain/games/game-repository.ts` (EDIT — rozszerzenie ListGamesQuery)

### Files to read but NOT edit
- `apps/api/src/domain/shared/result.ts` — typ Result, funkcje ok/err (sprawdź dokładne API)
- `apps/api/src/domain/games/game.ts` — istniejące VO (`ReleaseYear`), styl kodu, branded types
- `apps/api/src/domain/games/game-repository.ts` — obecny kształt ListGamesQuery

## Constraints
- TDD: NAJPIERW test (RED), POTEM implementacja (GREEN)
- NIE importuj nic z `infrastructure/`, `application/`, `routes/`
- NIE używaj klas z mutowalnymi polami — VO musi być immutable (`readonly`)
- NIE rzucaj wyjątków — używaj Result. Wyjątek dozwolony tylko dla "to nie powinno się zdarzyć" (programming error).
- Każdy `kind` errora UNIKALNY i opisowy (`out_of_bounds_low`, NIE `invalid` ani `error`)
- NIE eksportuj `new ReleaseYearRange(...)` publicznie — tylko factory `create(...)` (private constructor)
- NIE waliduj typów wejściowych (że `from` jest `number`) — to robi Zod w application layer. Domain factory przyjmuje `number`, sprawdza tylko logikę biznesową.

## Steps

### Step 1: Test RED dla ReleaseYearRange
**Co robimy:**
1. Utwórz `apps/api/src/domain/games/release-year-range.test.ts`:
   ```ts
   import { describe, expect, it } from 'bun:test';
   import { ReleaseYearRange } from './release-year-range';

   describe('ReleaseYearRange', () => {
     it('creates valid range', () => {
       const r = ReleaseYearRange.create(2000, 2030);
       expect(r.ok).toBe(true);
       if (r.ok) {
         expect(r.value.from).toBe(2000);
         expect(r.value.to).toBe(2030);
       }
     });

     it('allows from === to (single year)', () => {
       const r = ReleaseYearRange.create(2020, 2020);
       expect(r.ok).toBe(true);
     });

     it('rejects from > to as inverted', () => {
       const r = ReleaseYearRange.create(2030, 2000);
       expect(r.ok).toBe(false);
       if (!r.ok) expect(r.error.kind).toBe('inverted');
     });

     it('rejects from below 1958 as out_of_bounds_low', () => {
       const r = ReleaseYearRange.create(1900, 2000);
       expect(r.ok).toBe(false);
       if (!r.ok) expect(r.error.kind).toBe('out_of_bounds_low');
     });

     it('rejects to above 2100 as out_of_bounds_high', () => {
       const r = ReleaseYearRange.create(2000, 2200);
       expect(r.ok).toBe(false);
       if (!r.ok) expect(r.error.kind).toBe('out_of_bounds_high');
     });

     it('rejects non-integer values', () => {
       const r = ReleaseYearRange.create(2000.5, 2030);
       expect(r.ok).toBe(false);
       if (!r.ok) expect(r.error.kind).toBe('not_integer');
     });
   });
   ```
2. Uruchom `bun test apps/api/src/domain/games/release-year-range.test.ts`
3. Powinno być RED (plik impl jeszcze nie istnieje)

**Rezultat:** plik testowy istnieje, testy FAILUJĄ (kompilacja lub runtime).

### Step 2: Implementacja ReleaseYearRange (GREEN)
**Co robimy:**
1. Utwórz `apps/api/src/domain/games/release-year-range.ts`:
   ```ts
   import { type Result, err, ok } from '../shared/result';
   // ⚠️ Sprawdź faktyczne API result.ts — funkcje mogą się nazywać inaczej (np. Result.ok / Result.fail).
   // Dostosuj importy do istniejącej konwencji.

   export type ReleaseYearRangeError =
     | { kind: 'inverted' }
     | { kind: 'out_of_bounds_low'; min: number }
     | { kind: 'out_of_bounds_high'; max: number }
     | { kind: 'not_integer' };

   const MIN_YEAR = 1958;
   const MAX_YEAR = 2100;

   export class ReleaseYearRange {
     private constructor(
       readonly from: number,
       readonly to: number,
     ) {}

     static create(from: number, to: number): Result<ReleaseYearRange, ReleaseYearRangeError> {
       if (!Number.isInteger(from) || !Number.isInteger(to)) {
         return err({ kind: 'not_integer' });
       }
       if (from < MIN_YEAR) return err({ kind: 'out_of_bounds_low', min: MIN_YEAR });
       if (to > MAX_YEAR) return err({ kind: 'out_of_bounds_high', max: MAX_YEAR });
       if (from > to) return err({ kind: 'inverted' });
       return ok(new ReleaseYearRange(from, to));
     }
   }
   ```
2. Uruchom `bun test apps/api/src/domain/games/release-year-range.test.ts` → musi być GREEN
3. Uruchom `bun run --cwd apps/api typecheck` → musi być zielone

**Rezultat:** VO zaimplementowany, wszystkie testy zielone.

### Step 3: Rozszerz interfejs ListGamesQuery
**Co robimy:**
1. Edytuj `apps/api/src/domain/games/game-repository.ts`. Dodaj import `ReleaseYearRange` i `GameFormat`. Rozszerz `ListGamesQuery`:
   ```ts
   import type { GameFormat, GameKind, GameUpdate, NewGame } from './game';
   import type { ReleaseYearRange } from './release-year-range';

   /**
    * Read-side query DTO for listing games.
    * Semantyka pól:
    *   - filters: search, kind, platforms, formats, releaseYearRange
    *   - sort: sort, dir
    *   - pagination: page, perPage
    * userId jest implicit constraint (auth) — zawsze ustawiony przez application layer.
    */
   export interface ListGamesQuery {
     userId: string;
     // filters
     search?: string;
     kind?: GameKind;
     platforms?: string[];
     formats?: GameFormat[];
     releaseYearRange?: ReleaseYearRange;
     // sort
     sort?: 'title' | 'genre' | 'platform' | 'format' | 'status' | 'releaseYear' | 'hoursPlayed';
     dir: 'asc' | 'desc';
     // pagination
     page: number;
     perPage: number;
   }
   ```
2. Uruchom `bun run --cwd apps/api typecheck` — może być **czerwone** (DrizzleGameRepository i ListGames jeszcze nie znają nowych pól, ale są opcjonalne, więc istniejący kod powinien się kompilować — TS powinien przepuścić). Jeśli typecheck pęknie z innego powodu, popraw lub udokumentuj jako "blocker dla fazy 3/4".
3. `bun test apps/api/` — wszystkie istniejące testy muszą być GREEN (nowe pola opcjonalne, niczego nie łamią).

**Rezultat:** interfejs rozszerzony, typecheck zielony, wszystkie testy zielone.

## If you get stuck
Jeśli po 2 próbach coś nie działa: ZATRZYMAJ się. Napisz:
`STUCK at Step <N>: <co, jaki błąd, jaka hipoteza>`
Zakończ pracę.
