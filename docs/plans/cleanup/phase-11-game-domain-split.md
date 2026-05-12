# Phase 11 — `domain/games/game.ts` split + `GameInvariants`

## Goal
Rozbić 808-linijkowy plik `apps/api/src/domain/games/game.ts` na sensowne moduły. Zlikwidować 90-linijkowy duplikat walidacji w `NewGame.create` i `GameUpdate.create` przez wspólne `GameInvariants.validate()`.

## Definition of Done
- [ ] `apps/api/src/domain/games/game.ts` zawiera TYLKO klasę `Game` (aggregate root) + `Game.fromPersistence` + ewentualne metody biznesowe.
- [ ] `apps/api/src/domain/games/new-game.ts` zawiera klasę `NewGame` + `NewGame.create`.
- [ ] `apps/api/src/domain/games/game-update.ts` zawiera klasę `GameUpdate` + `GameUpdate.create` + `GameUpdate.fromGame`.
- [ ] `apps/api/src/domain/games/game-invariants.ts` eksportuje `GameInvariants.validate(input): Result<ValidGameProps, GameError>` używany przez **oba** `NewGame.create` i `GameUpdate.create`.
- [ ] `Game.toJSON()` USUNIĘTE jeśli faza 08 tego nie zrobiła (zweryfikuj brak `JSON.stringify(game)` użyć).
- [ ] `Game.toOwned()` zastąpione metodą `Game.moveToCollection(): GameUpdate` (przejście wishlist → owned) — bez round-trip przez `fromPersistence`.
- [ ] `GameUpdate._build` ze 16 argumentami usunięte — public konstruktor `new GameUpdate(props: ValidGameUpdateProps)`.
- [ ] `bun test` zielone (istniejące testy domeny + nowe testy `GameInvariants`).
- [ ] `bun run check` + `bun run lint` czyste.

## Context
**Aktualny stan**: jeden plik 808 linii, 3 prawie identyczne klasy.
- `NewGame` (linie 131-334) — tworzenie nowej gry. `create()` (153-278) — 90 linii walidacji.
- `GameUpdate` (linie 336-562) — aktualizacja gry. `create()` (394-491) — duplikat 90 linii.
- `Game` (linie 564-807) — aggregate root z istniejącej gry. `fromPersistence` (587-644). `toJSON` (779-807).

**Po fazie 11** docelowo:
- `game.ts` (~250 linii) — `Game` klasa.
- `new-game.ts` (~120 linii) — `NewGame` klasa.
- `game-update.ts` (~120 linii) — `GameUpdate` klasa.
- `game-invariants.ts` (~150 linii) — wspólna walidacja.
- `__tests__/game-invariants.test.ts` — NOWY.

### Step 0: Context7
- (Brak — refaktor wewnętrzny, TypeScript only.)

### Relevant files (edit)
- SPLIT: `apps/api/src/domain/games/game.ts` → 4 pliki.
- EDIT: wszystkie konsumenty `Game`, `NewGame`, `GameUpdate`:
  - `apps/api/src/application/games/create-game.ts` — import `NewGame` z nowego pathu.
  - `apps/api/src/application/games/update-game.ts` — import `GameUpdate`.
  - `apps/api/src/application/games/move-to-collection.ts` — używa nowej metody `Game.moveToCollection()` zamiast `toOwned() + fromGame()`.
  - `apps/api/src/application/games/enrich-game-metadata.ts` — sprawdź użycie.
  - `apps/api/src/infrastructure/games/drizzle-game-repository.ts` — `Game.fromPersistence` z `game.ts`.
- NEW: `apps/api/src/domain/games/__tests__/game-invariants.test.ts`.

### Files to read but NOT edit
- `apps/api/src/domain/games/external-metadata-ref.ts`, `cover-image-url.ts`, `release-year.ts`, etc. — VO używane przez game.

## Design decisions
- **`GameInvariants.validate(input)`** zwraca `Result<ValidGameProps, GameError>`. `ValidGameProps` to typ z już walidowanymi VO. Oba `NewGame.create` i `GameUpdate.create` używają tej funkcji, potem własna logika kompletująca (`NewGame`: `externalId` generation + `metadataRef`; `GameUpdate`: `purchasedAt` jako nullable optional).
- **Różnice w walidacji NewGame vs GameUpdate**:
  - `purchasedAt`: NewGame `optional`, GameUpdate `nullable+optional`.
  - `price`: j.w.
  - `metadataRef`: tylko NewGame.
  → `GameInvariants.validate` waliduje **wspólny zestaw**, NewGame/GameUpdate dokładają własne pola.
- **`Game.moveToCollection()`** — nowa metoda na `Game`:
  ```ts
  moveToCollection(): GameUpdate {
    if (this.kind === 'owned') throw new Error('Already owned');  // invariant
    return GameUpdate.fromTrusted({
      ...this.toProps(),
      kind: 'owned',
      status: 'Backlog',
      hoursPlayed: HoursPlayed.fromTrusted(0),
    });
  }
  ```
  Nie zeruje fałszywie pól w trybie `'owned'` — przejście wishlist → owned jest jawne.
- **`GameUpdate._build`** ze sztywnym konstruktorem prywatnym — usuń, użyj `private constructor(props)`.
- **`fromTrusted` pattern**: zostawiamy, ale dokumentacja jasna — używane TYLKO przez `fromPersistence` (gdzie dane już zwalidowane przy zapisie). Komentarz w każdym `fromTrusted`.

## Constraints
- NIE zmieniaj kontraktu publicznego — wszystkie testy domeny + use-case'ów muszą przejść bez modyfikacji asercji.
- NIE łącz tego z fazą 12 (`useGameDraft`) — backend i frontend osobno.
- NIE usuwaj `GameUpdate.fromGame` jeśli używany — sprawdź call sites; jeśli używany tylko przez `MoveToCollection` (po nowej metodzie `Game.moveToCollection` zwracającej `GameUpdate`) — usuń.

## Steps

### Step 1: `GameInvariants.validate` + testy (RED→GREEN)
1. Test (RED): `game-invariants.test.ts` — 15+ scenariuszy walidacji (każde pole z invariantem):
   - Pusty `title` → err.
   - `releaseYear` < 1900 → err.
   - `releaseYear` > 2100 → err.
   - `hoursPlayed` < 0 → err.
   - `kind: 'wishlist'` + `hoursPlayed > 0` → err.
   - `kind: 'wishlist'` + `status` → err.
   - `kind: 'owned'` bez `status` → err.
   - `price < 0` → err.
   - `purchasedAt` invalid format → err.
   - happy path → ok.
2. Implementacja `GameInvariants.validate(input): Result<ValidGameProps, GameError>` — wyciągnij wspólne 90 linii z obu `NewGame.create` i `GameUpdate.create`.
3. `bun test` GREEN.

**Rezultat:** wspólna walidacja przetestowana niezależnie.

### Step 2: Split na 4 pliki, użyj `GameInvariants`
1. Przenieś `Game` (z `fromPersistence`, `toJSON` jeśli zostaje) do nowego `game.ts` — czyli usuń `NewGame` i `GameUpdate` z pliku.
2. Nowy plik `new-game.ts`: `NewGame.create` → woła `GameInvariants.validate`, dodaje `externalId: crypto.randomUUID()` i `metadataRef` walidację.
3. Nowy plik `game-update.ts`: `GameUpdate.create` → woła `GameInvariants.validate`, dodaje walidację `purchasedAt: nullable`.
4. `game-invariants.ts` (już istnieje z Step 1).
5. Update wszystkie importy konsumenckie.
6. `bun test` zielone — żaden test nie modyfikowany.

**Rezultat:** pliki rozdzielone, walidacja niezduplikowana.

### Step 3: `Game.moveToCollection()` + usunięcie `toOwned`
1. Test (RED, w `__tests__/game.test.ts`): `game.moveToCollection()` z `kind='wishlist'` → zwraca `GameUpdate` z `kind='owned'`, `status='Backlog'`, `hoursPlayed=0`. Z `kind='owned'` → throw.
2. Zaimplementuj metodę w `Game`. Usuń `Game.toOwned`.
3. Update `MoveToCollection.execute` — używa nowej metody.
4. `bun test` GREEN.

**Rezultat:** transition logic w domenie, czyste API.

### Step 4 (opcjonalnie): cleanup `_build`, `toJSON`
1. `GameUpdate._build` → public `constructor(props)`.
2. Jeśli faza 08 nie usunęła `Game.toJSON` — grep `JSON.stringify(game` w call sites; jeśli 0 → usuń.

## If you get stuck
Jeśli po 2 próbach coś nie działa: ZATRZYMAJ się. Napisz:
`STUCK at Step <N>: <co próbowałem, jaki błąd, jaka hipoteza>`
Zakończ pracę bez commitowania.
