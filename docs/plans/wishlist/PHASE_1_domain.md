---
name: Wishlist Phase 1 Domain
description: Rozdzielenie kind od status w domenie Game + invarianty per-kind (TDD)
type: plan
---

# Wishlist — Faza 1: Domain refactor

## Goal
Rozdzielić w domenie `Game` dwa wymiary: **posiadanie** (`kind: 'owned' | 'wishlist'`) i **stan rozgrywki** (`status`). `Wishlist` znika ze `GameStatus`. Pola `status`, `hoursPlayed`, `developer` stają się nullable z invariantem per-kind. ŻADNYCH zmian w DB ani w API w tej fazie — tylko warstwa domain + testy.

## Definition of Done
- [ ] Testy domeny przechodzą: `bun test apps/api/src/domain/games`
- [ ] Typecheck `apps/api`: `bun run typecheck` → 0 błędów
- [ ] `GameStatus` NIE zawiera już `'Wishlist'` (4 wartości: Playing/Completed/Backlog/Dropped)
- [ ] Eksportowane: `GameKind`, `GAME_KINDS`
- [ ] `NewGame.create({ kind: 'wishlist', ... })` z `status` lub `hoursPlayed` ≠ null → `err({ kind: 'kind_invalid_state', reason })`
- [ ] `NewGame.create({ kind: 'owned', status: undefined })` → `err({ kind: 'kind_invalid_state', reason })`
- [ ] `developer = null` jest dozwolone na obu kindach (testy to potwierdzają)

Agent kończy pracę WYŁĄCZNIE gdy powyższe są spełnione.

## Context
**Runtime:** Bun (NIE Node.js, NIE npm — `bun test`, `bun run typecheck`)
**Katalog roboczy:** `apps/api`
**Architektura:** domain layer NIE importuje nic z infrastructure ani application
**Error handling:** `Result<T, E>` z `src/domain/shared/result.ts` — `ok(value)` / `err(error)`

## Design decisions
- `kind` jest dyskryminatorem ortogonalnym do `status`. `Game` to JEDEN agregat z dyskryminatorem (nie dwie klasy). Migracja A→B (osobne klasy `WishlistGame`/`OwnedGame`) odłożona — wykonywalna mechanicznie później bez zmian w DB.
- Invariant per-kind w `NewGame.create`:
  - `kind='owned'` → `status` musi być wartością z `GAME_STATUSES`, `hoursPlayed` nie może być null
  - `kind='wishlist'` → `status === null`, `hoursPlayed === null`, `purchasedAt === null`
- `developer` staje się nullable na obu kindach (placeholder `'Unknown'` znika — backfill w fazie 2).
- `'Wishlist'` znika ze `GameStatus` — to wymaga zaktualizowania istniejących testów (te które używały `status: 'Wishlist'` muszą teraz używać `kind: 'wishlist', status: null`).
- Wszystkie nowe walidacje zwracają jeden kind błędu: `kind_invalid_state` z polem `reason: string` (np. `'wishlist_must_have_null_status'`). To prościej niż 4 osobne kindy — wciąż unikalne na poziomie `kind`.

## Relevant files (edit only these)
- `src/domain/games/game.ts` — typy, VO, `NewGame`, `Game`
- `src/domain/games/__tests__/game.test.ts` — testy

## Files to read but NOT edit
- `src/domain/shared/result.ts` — `Result`, `ok`, `err`
- `src/domain/games/game-repository.ts` — port (zmiany dopiero w fazie 2)

## Constraints
- TDD: NAJPIERW zaktualizuj testy (RED), POTEM zmień implementację (GREEN)
- NIE dotykaj `src/infrastructure/`, `src/application/`, `src/routes/` w tej fazie
- NIE używaj `'Wishlist'` jako wartości `status` nigdzie po refaktorze
- Każdy nowy invariant w `NewGame.create` zwraca `err({ kind: 'kind_invalid_state', reason })` — `reason` to krótki snake_case string opisujący naruszenie
- `Game.fromPersistence` MUSI akceptować nullable `status` i `hoursPlayed` (i `developer`); `toJSON` zwraca te pola jako `null` gdy puste
- NIE próbuj usuwać starych testów — zaktualizuj je do nowego kontraktu

## Steps

### Step 1: Zaktualizuj testy do nowego kontraktu (RED)
**Co robimy:**
1. Otwórz `src/domain/games/__tests__/game.test.ts`. Dla każdego istniejącego testu który nie podaje `kind` — dopisz `kind: 'owned'` w propsach.
2. Każdy test który używał `status: 'Wishlist'` — przepisz na `kind: 'wishlist', status: null, hoursPlayed: null, purchasedAt: null`.
3. Dodaj nowe testy:
   - `NewGame.create({ kind: 'owned', ...validProps, status: 'Backlog', hoursPlayed: 0 })` → `ok`, `value.kind === 'owned'`
   - `NewGame.create({ kind: 'wishlist', userId, title, platform, status: null, hoursPlayed: null, purchasedAt: null })` → `ok`, `value.kind === 'wishlist'`, `value.status === null`, `value.hoursPlayed === null`
   - `NewGame.create({ kind: 'wishlist', ..., status: 'Backlog', hoursPlayed: null })` → `err({ kind: 'kind_invalid_state', reason: 'wishlist_must_have_null_status' })`
   - `NewGame.create({ kind: 'wishlist', ..., status: null, hoursPlayed: 5 })` → `err({ kind: 'kind_invalid_state', reason: 'wishlist_must_have_null_hours_played' })`
   - `NewGame.create({ kind: 'wishlist', ..., status: null, hoursPlayed: null, purchasedAt: '2024-01-01' })` → `err({ kind: 'kind_invalid_state', reason: 'wishlist_must_have_null_purchased_at' })`
   - `NewGame.create({ kind: 'owned', ..., status: undefined as any, hoursPlayed: 0 })` → `err({ kind: 'kind_invalid_state', reason: 'owned_must_have_status' })`
   - `NewGame.create({ kind: 'owned', ..., status: 'Backlog', hoursPlayed: null as any })` → `err({ kind: 'kind_invalid_state', reason: 'owned_must_have_hours_played' })`
   - `NewGame.create({ kind: 'owned', ..., developer: null as any })` → `ok` (developer nullable na owned)
   - `NewGame.create({ kind: 'wishlist', ..., developer: null as any })` → `ok` (developer nullable na wishlist)
   - `Game.fromPersistence({ ..., kind: 'wishlist', status: null, hoursPlayed: null, developer: null })` → instancja, `toJSON()` zawiera `kind: 'wishlist', status: null, hoursPlayed: null, developer: null`
4. `bun test apps/api/src/domain/games` → testy FAILUJĄ (kompilacja może nie przejść — to OK).

**Rezultat:** testy istnieją w nowym kontrakcie, suite RED.

### Step 2: Zaktualizuj typy i `NewGame.create` (GREEN — domena)
**Co robimy:**
1. W `src/domain/games/game.ts`:
   - Dodaj: `export type GameKind = 'owned' | 'wishlist';` i `export const GAME_KINDS = ['owned', 'wishlist'] as const;`
   - Zmień `GameStatus` na `'Playing' | 'Completed' | 'Backlog' | 'Dropped'` (BEZ `'Wishlist'`)
   - Zmień `GAME_STATUSES` na 4 wartości
   - Dodaj `kind` do `GameProps` (wymagane)
   - Zmień w `GameProps`: `status: GameStatus | null`, `hoursPlayed: number | null`, `developer: string | null`
   - Dodaj do `GameValidationError`: `| { kind: 'kind_invalid_state'; reason: string }`
2. W `NewGame`:
   - Dodaj prywatne pole `_kind: GameKind`
   - Zmień typy: `_developer: string | null`, `_hoursPlayed: HoursPlayed | null`, `_status: GameStatus | null`
   - W `create()` na początku zwaliduj `kind` (musi być w `GAME_KINDS`); jeśli nie → `err({ kind: 'kind_invalid_state', reason: 'unknown_kind' })`
   - Po wszystkich VO walidacjach, dodaj blok invariantów per-kind:
     - jeśli `kind='wishlist'`:
       - `props.status != null` → `err({ kind: 'kind_invalid_state', reason: 'wishlist_must_have_null_status' })`
       - `props.hoursPlayed != null` → `err({ kind: 'kind_invalid_state', reason: 'wishlist_must_have_null_hours_played' })`
       - `props.purchasedAt != null` → `err({ kind: 'kind_invalid_state', reason: 'wishlist_must_have_null_purchased_at' })`
     - jeśli `kind='owned'`:
       - `props.status == null || !GAME_STATUSES.includes(props.status)` → `err({ kind: 'kind_invalid_state', reason: 'owned_must_have_status' })`
       - `props.hoursPlayed == null` → `err({ kind: 'kind_invalid_state', reason: 'owned_must_have_hours_played' })`
   - `developer`: usuń sprawdzenie `developer_empty` jako blokujące — pozwól na `null`/pusty string (znormalizuj pusty string do `null`)
   - `hoursPlayed` walidacja przez `HoursPlayed.create` TYLKO gdy nie-null (na owned)
   - `status` walidacja TYLKO gdy nie-null (na owned)
   - Dodaj getter `get kind(): GameKind`
3. Zaktualizuj `static create` sygnaturę zwracaną — instancja z `_kind` w konstruktorze.

**Rezultat:** `NewGame` z invariantami, getter `kind` istnieje.

### Step 3: Zaktualizuj `Game.fromPersistence` + `toJSON` + uruchom testy (GREEN)
**Co robimy:**
1. W `Game`:
   - Dodaj `_kind: GameKind` do prywatnych pól i konstruktora
   - Zmień typy pól: `_status: GameStatus | null`, `_hoursPlayed: HoursPlayed | null`, `_developer: string | null`
   - W `fromPersistence`:
     - dodaj `kind: GameKind` do typu `row`
     - `status: GameStatus | null` w typie `row`
     - `hoursPlayed: number | null` w typie `row`
     - `developer: string | null` w typie `row`
     - mapuj nullable: `row.status ?? null`, `row.hoursPlayed != null ? HoursPlayed.fromTrusted(row.hoursPlayed) : null`, `row.developer ?? null`
   - Dodaj getter `get kind(): GameKind`
   - Zmień gettery `status`, `hoursPlayed`, `developer` na nullable returns
   - W `toJSON()`:
     - dodaj `kind: this._kind`
     - `status: this._status ?? null`
     - `hoursPlayed: this._hoursPlayed?.value ?? null`
     - `developer: this._developer ?? null`
2. `bun test apps/api/src/domain/games` → GREEN
3. `bun --cwd apps/api run typecheck` → 0 błędów (UWAGA: w innych warstwach mogą pojawić się błędy — to NIE jest problem tej fazy; sprawdzaj TYLKO `apps/api/src/domain/games/`. Jeżeli typecheck dla całego apps/api nie przechodzi przez błędy w `application/` lub `routes/` — zignoruj, naprawi je faza 2)

**Rezultat:** testy domeny zielone, refaktor ukończony w domain layer.

## If you get stuck
Jeśli po 2 próbach coś nie działa: ZATRZYMAJ. Napisz:
`STUCK at Step <N>: <co, jaki błąd, jaka hipoteza>`
Zakończ pracę.
