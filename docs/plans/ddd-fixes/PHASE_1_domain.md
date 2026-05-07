# DDD Fixes — Faza 1: Domain

## Goal
Naprawić dwa krytyczne błędy domenowe: (1) alias `GameUpdate = NewGame` który kłamie
semantycznie i generuje zbędne UUID przy każdym update, (2) brak metody domenowej
`toOwned()` na agregacie `Game` wymaganej przez `MoveToCollection`.

## Definition of Done
- [ ] `bun test apps/api/src/domain` — wszystkie testy zielone
- [ ] `bun run check` — zero błędów TypeScript
- [ ] `GameUpdate` to osobna klasa bez pola `externalId` i bez wywołania `idGenerator`
- [ ] `GameUpdate` ma statyczną metodę `fromGame(game: Game): GameUpdate`
- [ ] `Game` ma metodę `toOwned(): Game`
- [ ] `GameRepository` interface używa `externalId: string` w sygnaturach `update` i `delete`

## Context
**Runtime:** Bun (NIE Node.js, NIE npm — `bun test`, `bun run check`)
**Architektura:** domain layer nie importuje nic z infrastructure ani application
**Error handling:** Result<T, E> pattern — `ok(value)` / `err(error)` z `domain/shared/result.ts`
**Testy:** `apps/api/src/domain/games/__tests__/game.test.ts`

## Design decisions

- `GameUpdate` to niezależna klasa (nie alias), ma te same pola co `NewGame` BEZ `_externalId`
- Walidacja w `GameUpdate.create()` identyczna jak w `NewGame.create()` — brak idGenerator
- `GameUpdate.fromGame(game: Game)` — factory bez walidacji (dane z Game są już zwalidowane);
  `GameUpdate` zna `Game` (aplikacja → domena), NIE odwrotnie — to właściwy kierunek zależności
- `Game.toOwned()` zwraca `Game` (nowy stan agregatu), NIE `GameUpdate`;
  używa `Game.fromPersistence()` wewnętrznie; zachowuje `_id`, `_externalId`, `_userId`
- Port `GameRepository.update` i `delete` używają `externalId: string` (nie wewnętrznego `id: number`);
  `externalId` to domenowy identyfikator — wewnętrzny integer SQLite nie należy do portu
- Index `games_user_id_external_id_unq` już istnieje w schemacie — Drizzle WHERE będzie efektywny

### Files to edit
- `apps/api/src/domain/games/game.ts` — główna zmiana
- `apps/api/src/domain/games/game-repository.ts` — sygnatury update/delete
- `apps/api/src/domain/games/__tests__/game.test.ts` — nowe testy

### Files to read but NOT edit
- `apps/api/src/domain/shared/result.ts` — typ Result, ok/err
- `apps/api/src/application/games/update-game.test.ts` — sprawdź jak FakeGameRepository
  implementuje update/delete (zaktualizujesz je w Fazie 2, tu tylko PRZECZYTAJ)

## Constraints
- TDD: NAJPIERW nowe testy (RED), POTEM implementacja (GREEN)
- NIE importuj niczego z `infrastructure/`, `application/`, `routes/`
- `GameUpdate` NIE ma pola `externalId` ani wywołania `idGenerator`
- `GameUpdate` MUSI mieć gettery dla wszystkich pól (te same co `NewGame` minus `externalId`)
- `GameUpdate.fromGame()` używa prywatnego konstruktora przez `new (GameUpdate as any)(...)`
  lub — lepiej — dodaj `private static _build(...)` które wołają i `create()` i `fromGame()`
- Istniejące testy `NewGame.create` i `Game.fromPersistence` muszą przechodzić bez zmian
- NIE zmieniaj `NewGame` — tylko dodaj nową klasę obok

## Steps

### Step 1: Testy GameUpdate i Game.toOwned() (RED)

**Co robimy:**
1. Otwórz `apps/api/src/domain/games/__tests__/game.test.ts`
2. Dodaj blok `describe('GameUpdate.create', ...)` NA KOŃCU pliku:
   - `GameUpdate.create(validProps())` → `ok`, TypeScript NIE kompiluje `result.value.externalId`
   - `GameUpdate.create({ ...validProps(), title: '' })` → `err({ kind: 'title_empty' })`
   - `GameUpdate.create({ ...validProps(), platform: '' })` → `err({ kind: 'platform_invalid' })`
   - `GameUpdate.create(wishlistProps())` → `ok`, `kind === 'wishlist'`
   - `GameUpdate.create({ ...wishlistProps(), status: 'Backlog' as any })` → `err({ kind: 'kind_invalid_state' })`

3. Dodaj blok `describe('GameUpdate.fromGame', ...)`:
   - Utwórz `Game.fromPersistence(validRow)` → wywołaj `GameUpdate.fromGame(game)`
   - Zwrócony obiekt ma te same pola co gra (kind, title, developer itd.)
   - Zwrócony obiekt NIE ma pola `externalId` (TypeScript error jeśli próbujesz odczytać)

4. Dodaj blok `describe('Game.toOwned', ...)`:
   - Utwórz wishlist Game: `Game.fromPersistence({ ...validRow, kind: 'wishlist', status: null, hoursPlayed: null })`
   - `.toOwned()` → zwraca `Game` z `kind='owned'`, `status='Backlog'`, `hoursPlayed=0`
   - Zwrócona gra MA TEN SAM `id`, `externalId`, `userId`, `title`, `platform`
   - `purchasedAt` jest `null`

5. `bun test apps/api/src/domain` → RED

**Rezultat:** testy istnieją, FAILUJĄ.

### Step 2: Implementacja GameUpdate i Game.toOwned() (GREEN)

**Co robimy:**

1. W `apps/api/src/domain/games/game.ts`, dodaj klasę `GameUpdate` PO klasie `NewGame`:

```typescript
export class GameUpdate {
  private constructor(
    private readonly _kind: GameKind,
    private readonly _userId: string,
    private readonly _title: string,
    private readonly _developer: string | null,
    private readonly _genre: string,
    private readonly _releaseYear: ReleaseYear | null,
    private readonly _platform: GamePlatform,
    private readonly _edition: string | undefined,
    private readonly _hoursPlayed: HoursPlayed | null,
    private readonly _status: GameStatus | null,
    private readonly _format: GameFormat,
    private readonly _coverColor: string | undefined,
    private readonly _coverImage: string | undefined,
    private readonly _price: Price | null,
    private readonly _purchasedAt: PurchasedAt | null,
    private readonly _notes: string | null,
  ) {}

  static create(props: GameProps): Result<GameUpdate, GameValidationError> {
    // Skopiuj CAŁĄ logikę walidacji z NewGame.create() bez linii z idGenerator.
    // Na końcu zamiast new NewGame(externalId, ...) daj new GameUpdate(...)
    // (te same argumenty co NewGame, tylko bez pierwszego — externalId)
  }

  static fromGame(game: Game): GameUpdate {
    // Dane z Game są już zwalidowane — pomijamy walidację
    return new GameUpdate(
      game.kind,
      game.userId,
      game.title,
      game.developer,
      game.genre,
      game.releaseYear,        // ReleaseYear | null (już jest VO)
      game.platform,
      game.edition,
      game.hoursPlayed,        // HoursPlayed | null (już jest VO)
      game.status,
      game.format,
      game.coverColor,
      game.coverImage,
      game.price,              // Price | null (już jest VO)
      game.purchasedAt,        // PurchasedAt | null (już jest VO)
      game.notes,
    );
  }

  // Gettery — te same co NewGame, BEZ get externalId()
  get kind(): GameKind { return this._kind; }
  get userId() { return this._userId; }
  get title() { return this._title; }
  get developer(): string | null { return this._developer; }
  get genre() { return this._genre; }
  get releaseYear(): ReleaseYear | null { return this._releaseYear; }
  get platform(): GamePlatform { return this._platform; }
  get edition(): string | undefined { return this._edition; }
  get hoursPlayed(): HoursPlayed | null { return this._hoursPlayed; }
  get status(): GameStatus | null { return this._status; }
  get format(): GameFormat { return this._format; }
  get coverColor(): string | undefined { return this._coverColor; }
  get coverImage(): string | undefined { return this._coverImage; }
  get price(): Price | null { return this._price; }
  get purchasedAt(): PurchasedAt | null { return this._purchasedAt; }
  get notes(): string | null { return this._notes; }
}
```

2. Usuń alias `export type GameUpdate = NewGame` (linia 318)

3. Dodaj metodę `toOwned()` do klasy `Game`:
```typescript
toOwned(): Game {
  return Game.fromPersistence({
    id: this._id,
    externalId: this._externalId,
    kind: 'owned',
    userId: this._userId,
    title: this._title,
    developer: this._developer,
    genre: this._genre,
    releaseYear: this._releaseYear?.value ?? null,
    platform: this._platform,
    edition: this._edition ?? null,
    hoursPlayed: 0,
    status: 'Backlog',
    format: this._format,
    coverColor: this._coverColor ?? null,
    coverImage: this._coverImage ?? null,
    price: this._price?.value ?? null,
    purchasedAt: null,
    notes: this._notes,
  });
}
```

4. `bun test apps/api/src/domain` → GREEN

**Rezultat:** nowe testy zielone, stare testy zielone, `bun run check` czyste.

### Step 3: Zaktualizuj port GameRepository

**Co robimy:**

1. Otwórz `apps/api/src/domain/games/game-repository.ts`
2. Zmień sygnatury `update` i `delete`:
```typescript
// PRZED:
update(id: number, game: GameUpdate): Promise<Game | null>;
delete(id: number): Promise<Game | null>;

// PO:
update(userId: string, externalId: string, game: GameUpdate): Promise<Game | null>;
delete(userId: string, externalId: string): Promise<Game | null>;
```
3. Dodaj import `GameUpdate` (lub sprawdź czy już jest — wcześniej był jako alias `NewGame`)
4. `bun run check` → TypeScript pokaże błędy w `infrastructure/` i `application/` —
   to jest oczekiwane, naprawisz je w Fazie 2

**Rezultat:** port zaktualizowany, `bun test apps/api/src/domain` nadal zielone.

## If you get stuck
Jeśli po 2 próbach coś nie działa: ZATRZYMAJ się. Napisz:
`STUCK at Step <N>: <co, jaki błąd, jaka hipoteza>`
Zakończ pracę.
