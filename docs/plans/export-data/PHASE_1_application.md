---
name: Phase 1 Application
description: Use case ExportData + ExportSnapshot DTO + rozszerzenie portu GameRepository o listAll
type: plan
---

# Export Data — Faza 1: Application

## Goal
Zbudować w warstwie application use case `ExportData`, który dla danego `userId`
składa pełny snapshot (wszystkie gry + wszystkie platformy usera) do
deterministycznego DTO `ExportSnapshot` w schemacie wersji 1. Bez infrastruktury,
bez HTTP — tylko logika, kontrakt portu i testy z `FakeGameRepository` /
`FakePlatformRepository`.

## Definition of Done
- [ ] Testy use case przechodzą: `bun test apps/api/src/application/export`
- [ ] Wszystkie istniejące testy nadal zielone: `bun test`
- [ ] Typecheck z `apps/api`: `bun run check` → 0 błędów
- [ ] `src/application/export/export-snapshot.ts` eksportuje typ `ExportSnapshot` (z `version`, `exportedAt`, `platforms`, `games`) oraz pure funkcję `toSnapshot(games, platforms, now): ExportSnapshot`
- [ ] `src/application/export/export-data.ts` eksportuje klasę `ExportData` z metodą `execute(userId, now?: Date): Promise<ExportSnapshot>`
- [ ] `GameRepository` ma nową metodę `listAll(userId: string): Promise<Game[]>` (TYLKO interfejs — implementacja Drizzle w fazie 2)
- [ ] Snapshot pomija `id`, `userId`, `createdAt` zarówno dla games jak i platforms
- [ ] Pola opcjonalne `edition` i `coverColor` są pomijane (nie ma `undefined` ani `null` w wyjściu) gdy nie są ustawione

Agent kończy pracę WYŁĄCZNIE gdy powyższe są spełnione.

## Context
**Runtime:** Bun (NIE Node.js, NIE npm — `bun test`, `bun run check`)
**Katalog roboczy:** `apps/api`
**Architektura:** vertical slice DDD. Application layer NIE importuje nic z infrastructure.
**Error handling:** ten use case **nie ma** błędów biznesowych — jedyne co może się nie udać to repo (rzut). Nie używamy `Result` tutaj. Use case zwraca `Promise<ExportSnapshot>` wprost.
**Determinizm czasu:** `execute(userId, now?: Date)` — jeśli `now` nie podane, użyj `new Date()`. Test wstrzykuje stały `Date`.

## Design decisions
- `ExportSnapshot` to **DTO** (typ TS, plain object), NIE agregat domenowy. Nie ma invariantów do egzekwowania. Trzymamy go w application, nie w domain.
- Schemat **wersjonowany**: stała `EXPORT_SCHEMA_VERSION = 1`. Każda zmiana kształtu pliku → bump i migracja w przyszłym importerze.
- Eksport **omijaa** identyfikatory bazy (`id`, `userId`, `createdAt`). Plik ma być przenośny między instancjami / userami.
- Eksport platform: `[{ name }]` — tylko nazwa. `id`/`userId`/`createdAt` pomijane. Nazwa platformy jest naturalnym kluczem w zakresie usera (unique index `platforms_user_id_name_unq`).
- Eksport gier: identyczny shape jak `Game.toJSON()` MINUS `id`/`userId`. Pola opcjonalne (`edition`, `coverColor`) pomijane gdy `undefined` — nie wstawiamy `null`.
- **Kolejność stabilna:** sortuj `platforms` po `name` ASC, `games` po `title` ASC, `releaseYear` ASC (tie-break). Determinizm ułatwia diff/test/idempotencję.
- **`listAll(userId)`** w porcie — eksport potrzebuje wszystkich gier, paging z `list` jest do UI. Repozytorium odpowiada za pobranie pełnego zbioru.
- Use case dostaje **dwa porty** (`GameRepository`, `PlatformRepository`) — równolegle dwa zapytania (`Promise.all`). Brak transakcji (read-only, eventual consistency akceptowalna).

## Relevant files (edit only these)
- `src/application/export/export-snapshot.ts` — typy + pure mapper
- `src/application/export/export-data.ts` — klasa use case
- `src/application/export/__tests__/export-data.test.ts` — testy
- `src/domain/games/game-repository.ts` — dodaj sygnaturę `listAll`

## Files to read but NOT edit
- `src/domain/games/game.ts` — kształt `Game`, `toJSON()`, gettery
- `src/domain/games/game-repository.ts` — istniejący port (wzorzec)
- `src/domain/platforms/platform.ts` — kształt `Platform`, `toJSON()`
- `src/domain/platforms/platform-repository.ts` — istniejący port (już ma `list(userId)`)
- `src/application/games/list-games.ts` — wzorzec klasy use case (DI portu, `execute`)
- `src/application/games/list-games.test.ts` — wzorzec stylu testów (jeśli istnieje fake repo)

## Constraints
- TDD: NAJPIERW testy (RED), POTEM implementacja (GREEN).
- NIE importuj `db`, `drizzle-orm`, ani niczego z `src/infrastructure/`. Application zależy WYŁĄCZNIE od domain.
- NIE używaj `Date.now()` ani `new Date()` w mapperze `toSnapshot` — `now: Date` musi być argumentem, żeby testy były deterministyczne.
- Mapper `toSnapshot` musi być **pure** (czyste przekształcenie wejść → wyjście, bez side effectów).
- Pola opcjonalne pomijaj przez warunkowe spread (`...(value !== undefined && { key: value })`), NIE wstawiaj `null` ani `undefined` do JSON-a.
- `version` zawsze równa stałej `EXPORT_SCHEMA_VERSION` (pojedyncze źródło prawdy), nie hardcoduj `1` w mapperze.
- `exportedAt` — `now.toISOString()`.

## Steps

### Step 1: Rozszerzenie portu + typy snapshotu (RED — testy)
**Co robimy:**
1. Otwórz `src/domain/games/game-repository.ts`. Dodaj do interfejsu:
   ```ts
   listAll(userId: string): Promise<Game[]>;
   ```
   (TYLKO sygnatura — żadnej implementacji.)
2. Utwórz `src/application/export/export-snapshot.ts`:
   ```ts
   import type { Game } from '../../domain/games/game';
   import type { Platform } from '../../domain/platforms/platform';

   export const EXPORT_SCHEMA_VERSION = 1 as const;

   export interface ExportedPlatform {
     name: string;
   }

   export interface ExportedGame {
     title: string;
     developer: string;
     genre: string;
     releaseYear: number;
     platform: string;
     hoursPlayed: number;
     status: 'Playing' | 'Completed' | 'Backlog' | 'Dropped' | 'Wishlist';
     format: 'physical' | 'digital';
     edition?: string;
     coverColor?: string;
   }

   export interface ExportSnapshot {
     version: typeof EXPORT_SCHEMA_VERSION;
     exportedAt: string;
     platforms: ExportedPlatform[];
     games: ExportedGame[];
   }

   export function toSnapshot(
     games: Game[],
     platforms: Platform[],
     now: Date,
   ): ExportSnapshot {
     // implementacja w Step 3
     throw new Error('not implemented');
   }
   ```
3. Utwórz `src/application/export/__tests__/export-data.test.ts` z testami (zaczynamy od mappera, potem use case). Użyj Bun's `test` / `expect`. Testy:
   - `toSnapshot([], [], new Date('2026-01-15T10:00:00.000Z'))` → `{ version: 1, exportedAt: '2026-01-15T10:00:00.000Z', platforms: [], games: [] }`.
   - `toSnapshot` z 2 platformami w odwrotnej kolejności alfabetycznej → wynik posortowany ASC po `name`.
   - `toSnapshot` z 2 grami: jedna z `edition` i `coverColor`, druga bez → pierwsza ma te pola, druga **nie ma w ogóle kluczy** (`expect(snapshot.games[1]).not.toHaveProperty('edition')`, `not.toHaveProperty('coverColor')`).
   - `toSnapshot` z grami o tym samym tytule, różne `releaseYear` → posortowane wtórnie po `releaseYear` ASC.
   - `toSnapshot` NIE zawiera `id`, `userId`, `createdAt` w żadnej grze ani platformie (`Object.keys(snapshot.games[0])` nie zawiera `'id'`/`'userId'`).
   - Test use case: `ExportData` z `FakeGameRepository` (in-memory, implementuje port) i `FakePlatformRepository`. Wstaw 2 gry i 1 platformę dla `userId='u1'` oraz 1 grę dla `userId='u2'`. `execute('u1', new Date('2026-01-15T10:00:00.000Z'))` → snapshot zawiera tylko dane usera u1, w odpowiedniej kolejności.
4. `bun test apps/api/src/application/export` → RED (mapper rzuca, use case nie istnieje).
**Rezultat:** testy istnieją i FAILUJĄ. Port ma nową metodę. Typecheck `bun run check` MOŻE failować bo `listAll` nie jest jeszcze zaimplementowana w `DrizzleGameRepository` — to OK na tym etapie i naprawimy w fazie 2; jeśli TypeScript w `apps/api` od razu krzyczy o brakującą metodę w klasie, dodaj tymczasowy stub `listAll` w `DrizzleGameRepository` rzucający `new Error('not implemented')`. UWAGA: nie testuj tego stuba.

### Step 2: Use case `ExportData` (RED → GREEN dla testów use case)
**Co robimy:**
1. Utwórz `src/application/export/export-data.ts`:
   ```ts
   import type { GameRepository } from '../../domain/games/game-repository';
   import type { PlatformRepository } from '../../domain/platforms/platform-repository';
   import { toSnapshot, type ExportSnapshot } from './export-snapshot';

   export class ExportData {
     constructor(
       private readonly gameRepo: GameRepository,
       private readonly platformRepo: PlatformRepository,
     ) {}

     async execute(userId: string, now: Date = new Date()): Promise<ExportSnapshot> {
       const [games, platforms] = await Promise.all([
         this.gameRepo.listAll(userId),
         this.platformRepo.list(userId),
       ]);
       return toSnapshot(games, platforms, now);
     }
   }
   ```
2. W teście dodaj minimalne fake repos w pliku testowym:
   ```ts
   class FakeGameRepository implements GameRepository {
     constructor(private readonly games: Game[]) {}
     async listAll(userId: string): Promise<Game[]> {
       return this.games.filter(g => g.userId === userId);
     }
     // pozostałe metody portu: rzuć new Error('not used in this test')
     // (dotyczy: list, findById, create, update, delete, countByPlatform)
     ...
   }
   class FakePlatformRepository implements PlatformRepository {
     constructor(private readonly platforms: Platform[]) {}
     async list(userId: string): Promise<Platform[]> {
       return this.platforms.filter(p => p.userId === userId);
     }
     // findById, findByName, create, delete: rzuć new Error('not used')
     ...
   }
   ```
3. Konstruuj `Game.fromPersistence(...)` i `Platform.fromPersistence(...)` w testach, NIE używaj prywatnych konstruktorów.
4. Mapper `toSnapshot` ciągle rzuca → testy use case też failują (RED).
**Rezultat:** Use case napisany, ale testy failują (mapper unimplemented).

### Step 3: Implementacja `toSnapshot` (GREEN)
**Co robimy:**
1. Zaimplementuj `toSnapshot` w `export-snapshot.ts`:
   ```ts
   export function toSnapshot(
     games: Game[],
     platforms: Platform[],
     now: Date,
   ): ExportSnapshot {
     const sortedPlatforms = [...platforms]
       .sort((a, b) => a.name.localeCompare(b.name))
       .map<ExportedPlatform>((p) => ({ name: p.name }));

     const sortedGames = [...games]
       .sort((a, b) => {
         const byTitle = a.title.localeCompare(b.title);
         if (byTitle !== 0) return byTitle;
         return a.releaseYear.value - b.releaseYear.value;
       })
       .map<ExportedGame>((g) => ({
         title: g.title,
         developer: g.developer,
         genre: g.genre,
         releaseYear: g.releaseYear.value,
         platform: g.platform,
         hoursPlayed: g.hoursPlayed.value,
         status: g.status,
         format: g.format,
         ...(g.edition !== undefined && { edition: g.edition }),
         ...(g.coverColor !== undefined && { coverColor: g.coverColor }),
       }));

     return {
       version: EXPORT_SCHEMA_VERSION,
       exportedAt: now.toISOString(),
       platforms: sortedPlatforms,
       games: sortedGames,
     };
   }
   ```
2. `bun test apps/api/src/application/export` → GREEN.
3. `bun test` (cały api) → GREEN (nic nie powinno regresować).
4. `bun run check` z `apps/api` → 0 błędów. Jeśli TS narzeka, że `DrizzleGameRepository` nie implementuje `listAll` — dodaj tymczasowy stub w klasie (zostanie zastąpiony w fazie 2):
   ```ts
   async listAll(_userId: string): Promise<Game[]> { throw new Error('listAll not implemented yet'); }
   ```
**Rezultat:** Faza 1 zamknięta — use case działa na fake repos, snapshot jest deterministyczny i pomija identyfikatory.

## If you get stuck
Jeśli po 2 próbach coś nie działa: ZATRZYMAJ. Napisz:
`STUCK at Step <N>: <co, jaki błąd, jaka hipoteza>`
Zakończ pracę.

Najczęstsze pułapki:
- Test mówi "expected not to have property `edition`" — sprawdź czy używasz warunkowego spread, NIE `edition: g.edition` (to wstawi klucz z `undefined`, co serializuje się do `null` lub jest pominięte przez `JSON.stringify` ale `Object.hasOwn` zwróci `true`).
- `Game.fromPersistence` wymaga konkretnego shape rowa — popatrz na typ argumentu, NIE zgaduj.
- TypeScript narzeka, że `DrizzleGameRepository` nie implementuje `listAll` — dodaj stub jak wyżej. Faza 2 zastąpi go prawdziwą implementacją.
