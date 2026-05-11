# IGDB enrichment — Faza 2: Domain layer

## Goal
Dodaj vendor-neutralny port providera metadanych, Value Objecty (`CoverImageUrl`, `ExternalMetadataRef`) i metodę `Game.applyMetadata()`. Rozszerz repozytorium o mapowanie 3 nowych kolumn. ZERO kodu IGDB tutaj — domain musi przetrwać podmianę providera bez zmian.

## Definition of Done
- [ ] Testy domeny przechodzą: `bun test apps/api/src/domain/games/__tests__/` (nowe + istniejące)
- [ ] Testy `bun test apps/api/src/application/` nadal zielone (nic nie zepsuliśmy)
- [ ] `bun run check` (z roota) czyste
- [ ] Słowo "igdb" / "Igdb" / "IGDB" NIE występuje w `apps/api/src/domain/` ani `apps/api/src/application/` — sprawdź: `grep -ri "igdb" apps/api/src/domain apps/api/src/application` zwraca PUSTO
- [ ] `Game.fromPersistence` przyjmuje 3 nowe pola opcjonalne i zwraca Game z `metadataRef`
- [ ] `DrizzleGameRepository` mapuje DB rows ↔ Game z metadanymi w obie strony

Agent kończy pracę WYŁĄCZNIE gdy powyższe są spełnione.

## Context
**Runtime:** Bun (NIE Node.js, NIE npm). `bun test`, `bun run check`.
**Architektura:** DDD + Ports & Adapters. Domain NIE importuje `infrastructure/` ani `application/`.
**Error handling:** Result<T, E> pattern. Helpers: `ok(value)` / `err(error)` z `apps/api/src/domain/shared/result.ts`.
**Wzór VO w projekcie:** `ReleaseYear`, `HoursPlayed`, `Price`, `PurchasedAt` w `apps/api/src/domain/games/game.ts:49-129`. Wszystkie mają `static create()` zwracający `Result` i `static fromTrusted()` używane przez `Game.fromPersistence`.
**Wzór aggregate:** `Game` w `game.ts:500-667`. `Game.fromPersistence(row)` rekonstruuje agregat z DB. Brak setterów — mutacje przez nowe instancje (zobacz `toOwned()` jako wzór "metoda biznesowa zwracająca nowy Game").

## Design decisions
- **`metadataRef` to Value Object opcjonalny na `Game`, NIE osobny aggregate.** Dane providera to atrybuty gry usera, nie samodzielna encja. Pole `metadataRef: ExternalMetadataRef | null`.
- **`ExternalMetadataRef` ma 3 pola:** `providerName: 'igdb'` (string-literal union, dziś tylko `'igdb'`), `providerId: string` (NIE number), `matchedAt: Date`.
- **`CoverImageUrl` VO:** waliduje `https://` + non-empty path. NIE waliduje IGDB-specific shape (musi przyjąć też UploadThing URLs). Ten sam VO służy dla obu źródeł cover image.
- **Dodatkowa walidacja `CoverImageUrl` host whitelist:** dokładnie 3 dozwolone formy hosta (zweryfikowane w `apps/api/src/application/cover-storage/cleanup-orphans.test.ts:58` — projekt używa OBU rodzin równolegle):
  1. `images.igdb.com` (exact)
  2. `utfs.io` (exact)
  3. dowolny host kończący się na `.ufs.sh` (subdomain wildcard, np. `xxxx.ufs.sh`)
  Logika check: `host === 'images.igdb.com' || host === 'utfs.io' || host.endsWith('.ufs.sh')`. Każdy inny host → `err({ kind: 'cover_url_host_not_allowed' })`. Powód: defense-in-depth przeciw malicious client snapshotowi w `POST /api/games`.
- **Port `GameMetadataProvider` żyje w `domain/games/`:** vendor-neutralny interfejs + DTO `GameMetadataCandidate` (primitives only, no VOs — to nieverified data z zewnątrz; staje się VO dopiero przy mergu w `applyMetadata`).
- **Error union providera (FINAL, 4 warianty — używany przez Phase 4 use case do rozróżnienia degraded reasons):** `{ kind: 'unavailable' } | { kind: 'rate_limited' } | { kind: 'invalid_response' } | { kind: 'platform_unsupported' }`.
- **Port return shape (FINAL, used for stale-while-error in PHASE 4):** `search()` zwraca `Promise<Result<GameMetadataSearchHit, GameMetadataProviderError>>` gdzie `GameMetadataSearchHit = { readonly candidates: readonly GameMetadataCandidate[]; readonly fetchedAt: Date }`. Caching decorator z fazy 4 ustawia `fetchedAt` na timestamp ostatniego fetcha (cache hit → cached `fetchedAt`; cache miss + provider success → `now`).
- **`Game.applyMetadata(snapshot, ref)` zwraca nowy `Game`** z nadpisanym `coverImage`, `releaseYear`, `developer`, `metadataRef`. NIE mutuje. Zwraca `Result<Game, GameValidationError>` bo `ReleaseYear.create` może failować.
- **Snapshot z providera ma null-able pola:** `coverImageUrl: string | null`, `releaseYear: number | null`, `developer: string | null`. `applyMetadata` nadpisuje tylko pola które przyszły (jeśli `snapshot.releaseYear === null`, zachowaj istniejące).
- **Repozytorium mapuje 3 nowe kolumny BIDIRECTIONALLY:** czyta `metadata_provider`/`metadata_provider_id`/`metadata_matched_at` w `fromPersistence`, pisze przy `save`/`update` jeśli `metadataRef != null`.

### Relevant files (edit only these)
- `apps/api/src/domain/games/cover-image-url.ts` — NOWY VO
- `apps/api/src/domain/games/external-metadata-ref.ts` — NOWY VO
- `apps/api/src/domain/games/game-metadata-provider.ts` — NOWY port + DTO + error union
- `apps/api/src/domain/games/__tests__/cover-image-url.test.ts` — NOWE testy
- `apps/api/src/domain/games/__tests__/external-metadata-ref.test.ts` — NOWE testy
- `apps/api/src/domain/games/__tests__/game-apply-metadata.test.ts` — NOWE testy
- `apps/api/src/domain/games/game.ts` — DODAJ pole `_metadataRef`, getter, parametr w konstruktorze, gałąź w `fromPersistence`, gałąź w `toJSON`, metoda `applyMetadata`. NIE zmieniaj nic istniejącego poza dodaniem opcjonalnych pól.
- `apps/api/src/infrastructure/games/drizzle-game-repository.ts` — mapowanie 3 kolumn

### Files to read but NOT edit
- `apps/api/src/domain/games/game.ts` (cały — wzór VO i aggregate)
- `apps/api/src/domain/shared/result.ts` (typ Result, helpers)
- `apps/api/src/domain/games/release-year-range.ts` + `release-year-range.test.ts` (wzór testu domeny)
- `apps/api/src/infrastructure/db/schema.ts` (znasz nazwy kolumn z fazy 1)
- `apps/api/src/infrastructure/cover-storage/` (żeby zobaczyć jaki host UploadThing używa)

## Constraints
- TDD: NAJPIERW testy (RED), POTEM implementacja (GREEN). Każdy step kończy się test runem.
- NIE importuj nic z `infrastructure/` ani `application/` w plikach pod `domain/`
- NIE parsuj `unknown` w `domain/` — `applyMetadata` przyjmuje typowane argumenty. Parsowanie zewnętrznych danych to Zod w warstwie application (faza 4).
- NIE używaj słowa "igdb" / "Igdb" w identyfikatorach pod `domain/` ani `application/`. Wyjątek: w `ExternalMetadataRef` typ `ProviderName = 'igdb'` to STRING-LITERAL VALUE, nie identifier — to jest OK.
- Każdy error kind UNIKALNY w całym pliku — NIE reużywaj `kind: 'invalid_url'` z innym znaczeniem.
- `fromTrusted` factory tylko dla rekonstrukcji z DB (już zaufanych danych) — `create` dla zewnętrznego inputu.
- ID dla `ExternalMetadataRef` nie istnieje — to Value Object, nie agregat (brak tożsamości).

## Steps

### Step 1: VOs + port — testy (RED)
**Co robimy:**
1. (Host whitelist już pre-resolved w Design decisions — pomiń grep i użyj dokładnej listy: `images.igdb.com`, `utfs.io`, `*.ufs.sh` przez `host.endsWith('.ufs.sh')`.)
2. Utwórz plik `cover-image-url.ts` z PUSTYM typem (signature only):
   ```ts
   import type { Result } from '../shared/result';
   export type CoverImageUrlError =
     | { kind: 'cover_url_empty' }
     | { kind: 'cover_url_not_https' }
     | { kind: 'cover_url_invalid' }
     | { kind: 'cover_url_host_not_allowed' };
   export class CoverImageUrl {
     readonly value: string;
     private constructor(value: string) { this.value = value; }
     static create(raw: string): Result<CoverImageUrl, CoverImageUrlError> { throw new Error('NYI'); }
     static fromTrusted(value: string): CoverImageUrl { return new CoverImageUrl(value); }
   }
   ```
3. Utwórz plik `external-metadata-ref.ts`:
   ```ts
   export type ProviderName = 'igdb';
   export class ExternalMetadataRef {
     readonly providerName: ProviderName;
     readonly providerId: string;
     readonly matchedAt: Date;
     private constructor(providerName: ProviderName, providerId: string, matchedAt: Date) {
       this.providerName = providerName; this.providerId = providerId; this.matchedAt = matchedAt;
     }
     static create(props: { providerName: ProviderName; providerId: string; matchedAt: Date }): ExternalMetadataRef {
       // walidacja: providerId non-empty
       throw new Error('NYI');
     }
     static fromTrusted(props: { providerName: ProviderName; providerId: string; matchedAt: Date }): ExternalMetadataRef {
       return new ExternalMetadataRef(props.providerName, props.providerId, props.matchedAt);
     }
   }
   export type ExternalMetadataRefError = { kind: 'provider_id_empty' };
   ```
   Uwaga: `create` może zwrócić Result jeśli walidacja, lub być statyczną factory bez walidacji jeśli providerId pochodzi już z `EnrichGameMetadata` (zwalidowanej tam Zodem). **Decyzja:** `create` zwraca `Result<ExternalMetadataRef, ExternalMetadataRefError>` z walidacją `providerId.trim().length > 0` — defense-in-depth.
4. Utwórz `game-metadata-provider.ts`:
   ```ts
   import type { Result } from '../shared/result';
   import type { ProviderName } from './external-metadata-ref';

   export interface GameMetadataCandidate {
     readonly providerName: ProviderName;
     readonly providerId: string;
     readonly title: string;
     readonly developer: string | null;
     readonly releaseYear: number | null;
     readonly coverImageUrl: string | null;
     readonly platformNames: readonly string[];
   }

   export type GameMetadataProviderError =
     | { kind: 'unavailable' }
     | { kind: 'rate_limited' }
     | { kind: 'invalid_response' }
     | { kind: 'platform_unsupported' };

   export interface GameMetadataSearchHit {
     readonly candidates: readonly GameMetadataCandidate[];
     readonly fetchedAt: Date;  // when raw provider returned; caching decorator stamps this
   }

   export interface GameMetadataProvider {
     search(query: { title: string; platform: string; limit?: number }):
       Promise<Result<GameMetadataSearchHit, GameMetadataProviderError>>;
   }
   ```
5. Napisz testy `cover-image-url.test.ts`:
   - `''` → `err({ kind: 'cover_url_empty' })`
   - `'http://images.igdb.com/foo.jpg'` → `err({ kind: 'cover_url_not_https' })`
   - `'https://malicious.example.com/x.jpg'` → `err({ kind: 'cover_url_host_not_allowed' })`
   - `'https://images.igdb.com/igdb/image/upload/t_cover_big/abc.jpg'` → `ok` z `.value` równym inputowi
   - `'https://utfs.io/f/abc-key'` → `ok`
   - `'https://xxxx.ufs.sh/f/abc-key'` → `ok` (sprawdza wildcard `.ufs.sh`)
   - `'not-a-url'` → `err({ kind: 'cover_url_invalid' })`
6. Napisz testy `external-metadata-ref.test.ts`:
   - `create({ providerName: 'igdb', providerId: '12345', matchedAt: new Date() })` → `ok` z polami
   - `create({ providerName: 'igdb', providerId: '', matchedAt: new Date() })` → `err({ kind: 'provider_id_empty' })`
   - `create({ providerName: 'igdb', providerId: '   ', matchedAt: new Date() })` → `err({ kind: 'provider_id_empty' })`
7. `bun test apps/api/src/domain/games/__tests__/cover-image-url.test.ts` → RED
   `bun test apps/api/src/domain/games/__tests__/external-metadata-ref.test.ts` → RED

**Rezultat:** pliki istnieją, testy FAILUJĄ (NYI).

### Step 2: VOs — implementacja (GREEN)
**Co robimy:**
1. Zaimplementuj `CoverImageUrl.create`:
   - trim raw, jeśli puste → `cover_url_empty`
   - try `new URL(raw)` — w catch → `cover_url_invalid`
   - if `url.protocol !== 'https:'` → `cover_url_not_https`
   - if not (`url.host === 'images.igdb.com' || url.host === 'utfs.io' || url.host.endsWith('.ufs.sh')`) → `cover_url_host_not_allowed`
   - else → `ok(new CoverImageUrl(raw.trim()))`
2. Zaimplementuj `ExternalMetadataRef.create` (walidacja `providerId.trim().length > 0`).
3. `bun test apps/api/src/domain/games/__tests__/cover-image-url.test.ts` → GREEN
   `bun test apps/api/src/domain/games/__tests__/external-metadata-ref.test.ts` → GREEN
4. `bun run check` czyste.

**Rezultat:** dwa VO działają, testy zielone.

### Step 3a: `applyMetadata` tests (RED) + `fromPersistence` row signature extension
**Co robimy:**
1. W `apps/api/src/domain/games/game.ts`:
   - Dodaj import: `import { ExternalMetadataRef } from './external-metadata-ref';`
   - Do `Game` private constructor dodaj ostatni parametr: `private readonly _metadataRef: ExternalMetadataRef | null = null`
   - Dodaj getter: `get metadataRef(): ExternalMetadataRef | null { return this._metadataRef; }`
   - W `Game.fromPersistence` row signature dodaj opcjonalnie:
     ```ts
     metadataProvider?: 'igdb' | null;
     metadataProviderId?: string | null;
     metadataMatchedAt?: string | null;  // ISO string
     ```
     i przekaż do konstruktora jako ostatni argument (zbuduj `ExternalMetadataRef.fromTrusted` jeśli wszystkie 3 pola obecne, inaczej `null`).
   - Dodaj STUB metody:
     ```ts
     applyMetadata(snapshot: {
       coverImageUrl: string | null;
       releaseYear: number | null;
       developer: string | null;
     }, ref: ExternalMetadataRef): Result<Game, GameValidationError | CoverImageUrlError> {
       throw new Error('NYI');
     }
     ```
2. Napisz testy `game-apply-metadata.test.ts`:
   - test: Game bez cover/year/developer → applyMetadata z pełnym snapshotem → nowy Game ma wszystkie 3 pola + metadataRef
   - test: snapshot z `releaseYear: null` → zachowuje istniejący releaseYear
   - test: snapshot z invalid releaseYear (np. 1500) → err `release_year_out_of_range`
   - test: snapshot z malicious coverImageUrl (`https://evil.com/x`) → err `cover_url_host_not_allowed`
   - test: returned Game ma ten sam `id`, `externalId`, `userId`, `kind`
   - test: applyMetadata NIE mutuje oryginalnego Game (oryginał zachowuje stare wartości)
3. `bun test apps/api/src/domain/games/__tests__/game-apply-metadata.test.ts` → RED na wszystkich 6 przypadkach.

**Rezultat:** stub + testy, wszystkie 6 testów failują z `NYI`.

### Step 3b: `applyMetadata` impl (GREEN) + `toJSON` + `toOwned`
**Co robimy:**
1. Zaimplementuj body `applyMetadata`:
   - jeśli `snapshot.coverImageUrl !== null` → `CoverImageUrl.create(snapshot.coverImageUrl)`, on err → return err
   - jeśli `snapshot.releaseYear !== null` → `ReleaseYear.create(snapshot.releaseYear)`, on err → return err
   - wybierz nowe wartości: `snapshot.X ?? this._X` (zachowaj istniejące jeśli `null`)
   - zwróć `ok(new Game(...))` — ten sam `id`, `externalId`, `userId`, `kind`, etc., z nowymi cover/year/developer i `metadataRef: ref`
2. W `toJSON()` dodaj:
   ```ts
   metadataRef: this._metadataRef
     ? { providerName: this._metadataRef.providerName, providerId: this._metadataRef.providerId, matchedAt: this._metadataRef.matchedAt.toISOString() }
     : null,
   ```
3. `toOwned()` musi przekazać `metadataRef` dalej — dopisz w obiekcie wejściowym `toOwned` pola `metadataProvider`/`metadataProviderId`/`metadataMatchedAt` z `_metadataRef`, tak że `Game.fromPersistence` rekonstruuje VO.
4. `bun test apps/api/src/domain/games/__tests__/` → wszystkie GREEN.
5. `bun run check` czyste.

**Rezultat:** Game ma metadataRef, applyMetadata działa, testy zielone.

### Step 4: DrizzleGameRepository — mapowanie 3 kolumn (oba kierunki)
**Co robimy:**
1. Otwórz `apps/api/src/infrastructure/games/drizzle-game-repository.ts`. Znajdź WSZYSTKIE miejsca które:
   - mapują DB row → Game (`Game.fromPersistence(row)` calls): przekaż `metadataProvider`, `metadataProviderId`, `metadataMatchedAt` z row. Drizzle row już je ma po fazie 1 (`games.metadataProvider` etc.).
   - mapują Game → INSERT/UPDATE values: jeśli istnieje `game.metadataRef`, dodaj 3 pola do values:
     ```ts
     metadataProvider: game.metadataRef?.providerName ?? null,
     metadataProviderId: game.metadataRef?.providerId ?? null,
     metadataMatchedAt: game.metadataRef?.matchedAt.toISOString() ?? null,
     ```
2. Sprawdź typ `metadataMatchedAt` w kolumnie. **W fazie 1 dodaliśmy `text('metadata_matched_at')` (NIE timestamp).** Repo musi pisać ISO string i czytać ISO string. Jeśli widzisz inną decyzję w schema — sprawdź i wyrównaj.
3. Uruchom `bun test` z roota — wszystkie istniejące testy zielone. Nowe rekordy NIE mają jeszcze metadataRef (brak use case w tej fazie), istniejące rekordy mają NULL we wszystkich 3 kolumnach.
4. `bun run check` czyste.
5. `grep -ri "igdb" apps/api/src/domain apps/api/src/application` → wynik PUSTY.

**Rezultat:** repo zapisuje i odczytuje metadataRef, vendor name nie wycieka do domain/application.

## If you get stuck
Jeśli po 2 próbach coś nie działa: ZATRZYMAJ się. Napisz:
STUCK at Step <N>: <co dokładnie nie działa, jaki błąd dostałeś, jaka twoja hipoteza co jest przyczyną>
Zakończ pracę. Nie próbuj obejść problemu w inny sposób.
