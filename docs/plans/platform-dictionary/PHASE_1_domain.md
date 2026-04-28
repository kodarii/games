---
name: Phase 1 Domain
description: Agregat Platform per-user, VO PlatformName, port repozytorium
type: plan
---

# Platform Dictionary — Faza 1: Domain

## Goal
Wprowadzić w domenie agregat `Platform` (z VO `PlatformName`) oraz port
`PlatformRepository`. Platform jest **prywatny per użytkownik** (`userId` jest
polem agregatu, dokładnie jak w `Game`). Żadnej infrastruktury, żadnego
application — wyłącznie domain layer + interfejs portu.

## Definition of Done
- [ ] Testy domeny przechodzą: `bun test apps/api/src/domain/platforms`
- [ ] Typecheck z `apps/api`: `bun run check` → 0 błędów
- [ ] Plik `src/domain/platforms/platform.ts` eksportuje `Platform`, `NewPlatform`, `PlatformName`, `PlatformProps`, `PlatformValidationError`
- [ ] Plik `src/domain/platforms/platform-repository.ts` eksportuje `PlatformRepository` z metodami `list`, `findById`, `findByName`, `create`, `delete`
- [ ] `NewPlatform.create({...})` waliduje: pusty userId → `missing_user_id`; pusta nazwa → `name_empty`; >40 znaków → `name_too_long`
- [ ] `Platform.toJSON()` zwraca `{ id, userId, name }`

Agent kończy pracę WYŁĄCZNIE gdy powyższe są spełnione.

## Context
**Runtime:** Bun (NIE Node.js, NIE npm — `bun test`, `bun run check`)
**Katalog roboczy:** `apps/api`
**Architektura:** domain layer NIE importuje nic z infrastructure ani application
**Error handling:** `Result<T, E>` z `src/domain/shared/result.ts` — `ok(value)` / `err(error)`

## Design decisions
- `Platform` jest **aggregate root** z `userId: string` (analogicznie do `Game.userId`). Słownik jest prywatny per user.
- `PlatformName` to **Value Object**: trim, długość 1–40 znaków, niewrażliwa na końcowe spacje, ale CASE-SENSITIVE (np. "Wii U" ≠ "WII U" — pozwalamy userowi mieć preferowaną pisownię).
- **Unikalność nazwy w obrębie usera** to invariant aplikacyjny — sprawdza go use case w fazie 3 przez `findByName`. NIE jest w domenie, bo wymagałby dostępu do repo.
- `userId` to plain `string` (jak w `Game`) — pochodzi z Better-Auth, brak VO.
- Port `PlatformRepository`: `list(userId)` filtruje po user, `findById(id)` BEZ filtru (ownership w use case), `findByName(userId, name)` dla unikalności, `create(newPlatform)`, `delete(id)`.
- `findByName` przyjmuje `userId` i `name: string` (niemodel) — repo ma sprawdzić istnienie, nie zna VO. Zwraca `Platform | null`.
- NIE robimy update — nazwa platformy jest niezmienna po utworzeniu (gdyby user chciał inną — usuwa i tworzy nową; mniej rzeczy do zepsucia w MVP).

## Relevant files (edit only these)
- `src/domain/platforms/platform.ts` — agregaty, VO, typy, errory
- `src/domain/platforms/platform-repository.ts` — interfejs portu
- `src/domain/platforms/__tests__/platform.test.ts` — testy domeny

## Files to read but NOT edit
- `src/domain/shared/result.ts` — `Result`, `ok`, `err`
- `src/domain/games/game.ts` — wzorzec (jak zbudowano `NewGame`, `Game`, `ReleaseYear` VO) — naśladuj styl
- `src/domain/games/game-repository.ts` — wzorzec interfejsu repozytorium

## Steps

### Step 1: Przeczytaj wzorzec `Game` i napisz testy (RED)
**Co robimy:**
1. Przeczytaj `src/domain/games/game.ts` i `src/domain/games/__tests__/game.test.ts` — zrozum styl: `private constructor`, `static create()`, `fromTrusted()`, `fromPersistence()`, gettery, `toJSON()`.
2. Utwórz `src/domain/platforms/__tests__/platform.test.ts` z testami:
   - `PlatformName.create('PS5')` → `ok` z `value === 'PS5'`
   - `PlatformName.create('  Wii U  ')` → `ok` z `value === 'Wii U'` (trim)
   - `PlatformName.create('')` → `err({ kind: 'name_empty' })`
   - `PlatformName.create('   ')` → `err({ kind: 'name_empty' })`
   - `PlatformName.create('a'.repeat(41))` → `err({ kind: 'name_too_long', length: 41 })`
   - `NewPlatform.create({ userId: 'user-A', name: 'Wii U' })` → `ok`, `result.value.userId === 'user-A'`, `result.value.name === 'Wii U'`
   - `NewPlatform.create({ userId: '', name: 'PS5' })` → `err({ kind: 'missing_user_id' })`
   - `NewPlatform.create({ userId: '   ', name: 'PS5' })` → `err({ kind: 'missing_user_id' })`
   - `NewPlatform.create({ userId: 'user-A', name: '' })` → `err({ kind: 'name_empty' })`
   - `Platform.fromPersistence({ id: 1, userId: 'user-A', name: 'Wii U' })` → instance, `toJSON()` zwraca dokładnie `{ id: 1, userId: 'user-A', name: 'Wii U' }`
3. `bun test apps/api/src/domain/platforms` → RED.
**Rezultat:** testy istnieją i FAILUJĄ (pliki produkcyjne nie istnieją).

### Step 2: Implementacja `PlatformName` + `NewPlatform` + `Platform` (GREEN)
**Co robimy:**
1. Utwórz `src/domain/platforms/platform.ts`. Zdefiniuj typy:
   ```ts
   export type PlatformValidationError =
     | { kind: 'missing_user_id' }
     | { kind: 'name_empty' }
     | { kind: 'name_too_long'; length: number };

   export type PlatformProps = { userId: string; name: string };
   ```
2. Zaimplementuj VO `PlatformName` zgodnie ze wzorcem `ReleaseYear` z `game.ts`:
   - `private constructor(public readonly value: string)`
   - `static create(raw: string): Result<PlatformName, PlatformValidationError>` — trim, sprawdź długość 1–40
   - `static fromTrusted(value: string): PlatformName`
3. Zaimplementuj `NewPlatform`:
   - `private constructor(private readonly _userId: string, private readonly _name: PlatformName)`
   - `static create(props: PlatformProps): Result<NewPlatform, PlatformValidationError>` — najpierw waliduj userId (trim, niepusty), potem `PlatformName.create`
   - Gettery: `get userId()`, `get name(): string` (zwraca `_name.value`)
4. Zaimplementuj `Platform`:
   - `private constructor(private readonly _id: number, private readonly _userId: string, private readonly _name: PlatformName)`
   - `static fromPersistence(row: { id: number; userId: string; name: string }): Platform` — używa `PlatformName.fromTrusted`
   - Gettery: `get id()`, `get userId()`, `get name(): string`
   - `toJSON()` → `{ id, userId, name }`
5. `bun test apps/api/src/domain/platforms` → GREEN.
6. `bun run check` z `apps/api` → 0 błędów.
**Rezultat:** domena działa, testy zielone.

### Step 3: Port `PlatformRepository`
**Co robimy:**
1. Utwórz `src/domain/platforms/platform-repository.ts`:
   ```ts
   import type { NewPlatform, Platform } from './platform';

   export interface PlatformRepository {
     list(userId: string): Promise<Platform[]>;
     findById(id: number): Promise<Platform | null>;
     findByName(userId: string, name: string): Promise<Platform | null>;
     create(platform: NewPlatform): Promise<Platform>;
     delete(id: number): Promise<Platform | null>;
   }
   ```
2. `bun run check` z `apps/api` → 0 błędów (TYLKO interfejs — implementacja Drizzle będzie w fazie 2).
**Rezultat:** port zdefiniowany, kod kompiluje się.

## If you get stuck
Jeśli po 2 próbach coś nie działa: ZATRZYMAJ. Napisz:
`STUCK at Step <N>: <co, jaki błąd, jaka hipoteza>`
Zakończ pracę.
