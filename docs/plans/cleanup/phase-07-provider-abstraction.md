# Phase 07 — Provider abstraction (config-driven)

## Goal
Wyrzucić hardkodowane `'igdb'` literal i listę hostów obrazków z domain layer. Dodanie drugiego providera (RAWG, MobyGames) ma być zmianą konfiguracji + nowy adapter, nie modyfikacją domeny.

## Definition of Done
- [ ] `ProviderName` w `apps/api/src/domain/games/external-metadata-ref.ts` jest brandowanym stringiem, NIE literałem `'igdb'`.
- [ ] Walidacja konkretnych providerów dzieje się w **application/infrastructure** (lista z configu), nie w domain.
- [ ] Host whitelist w `apps/api/src/domain/games/cover-image-url.ts:31` przeniesiony do `apps/api/src/infrastructure/config/cover-hosts.ts` lub env var. Domena dostaje listę przez fabrykę / dependency.
- [ ] Test domain `CoverImageUrl.create` z różnymi listami hostów (parameterized).
- [ ] Wszystkie miejsca, które dziś zakładają `'igdb'` jako literal, działają z `string` z walidacją w odpowiedniej warstwie.
- [ ] `bun test` zielone, `bun run check` + `bun run lint` czyste.

## Context
**Aktualny stan**:
- `domain/games/external-metadata-ref.ts:4` → `export type ProviderName = 'igdb';`
- `domain/games/cover-image-url.ts:31` → hardcoded allowlist hostów (`images.igdb.com`, `utfs.io`, `*.ufs.sh`).
- `domain/games/game.ts:49, 606` → `metadataProvider?: 'igdb' | null`.
- `application/games/enrich-game-metadata.ts:10` → `z.literal('igdb')` w Zod schemacie.

**Cel**: domena zna pojęcie "provider name" jako `string`. Lista znanych providerów = config w `infrastructure/config/providers.ts`. Walidacja przy POST/PATCH = `z.string().refine(name => providersConfig.includes(name))`.

### Step 0: Context7
- (Brak — to refaktor wewnętrzny.)

### Relevant files (edit)
- `apps/api/src/domain/games/external-metadata-ref.ts` — `ProviderName` = brandowany string.
- `apps/api/src/domain/games/cover-image-url.ts` — fabryka przyjmuje `allowedHosts: readonly string[]` (lub wzorzec — host list może obsługiwać `*.example.com`).
- `apps/api/src/domain/games/game.ts:49, 606` — typy z `'igdb' | null` → `string | null`.
- `apps/api/src/infrastructure/config/providers.ts` — NOWY. Eksportuje `SUPPORTED_PROVIDERS = ['igdb'] as const` + helper `isProviderSupported(name)`.
- `apps/api/src/infrastructure/config/cover-hosts.ts` — NOWY. Lista hostów + `isHostAllowed(url)`.
- `apps/api/src/application/games/enrich-game-metadata.ts` — Zod schema: `z.string().refine(isProviderSupported)`.
- `apps/api/src/application/games/create-game.ts` — j.w. dla `metadataRef.providerName`.
- `apps/api/src/application/games/update-game.ts` — j.w.
- Testy domeny + nowe testy konfigu.

### Files to read but NOT edit
- `apps/api/src/infrastructure/igdb/igdb-game-metadata-provider.ts` — żeby zobaczyć jak adapter używa `providerName: 'igdb'` (zostaje literal w adapterze — to OK, adapter zna swoje vendora).
- `apps/api/src/wiring.ts` — chain IGDB.

## Design decisions
- **Brand**: `type ProviderName = string & { readonly __brand: 'ProviderName' }`. Fabryka `ProviderName.create(name: string): Result<ProviderName, ...>` waliduje przeciw `SUPPORTED_PROVIDERS` przekazanej liście (parameterized — domena nie zna konkretnej listy).
- **Lista**: w `infrastructure/config/providers.ts` jako `readonly string[]`. Łatwe rozszerzenie: dodaj string + adapter w `wiring.ts`.
- **Host whitelist**: również w `infrastructure/config/cover-hosts.ts`. Domain `CoverImageUrl.create(url, allowedHosts)` przyjmuje listę. Wiring przekazuje listę przy konstrukcji fabryki, ale `CoverImageUrl.create` jest statyczne... → **najlepiej**: zostaw `CoverImageUrl.create(url)` ale przerzuć walidację URL host do application layer / VO factory dostaje `allowedHosts` jako parametr opcjonalny.
- **Alternatywa lżejsza**: `CoverImageUrl.create(url, opts: { allowedHosts: ReadonlySet<string> })`. Wszystkie call sites (use-case'y) przekazują `coverHosts.allowedHosts` z configu.

## Constraints
- NIE wprowadzaj pełnego registry pattern (provider registry, plugin system) — to YAGNI dla jednego providera. Wystarczy config + walidacja stringa.
- NIE wycieknij hostów do schematu Zod jako enum — to znów zaszywa info na poziomie application zamiast config.
- NIE zmieniaj nazwy kolumny DB (`metadata_provider` — i tak jest neutralna).

## Steps

### Step 1: Config infrastructure files + testy
1. `infrastructure/config/providers.ts`:
   ```ts
   export const SUPPORTED_PROVIDERS = ['igdb'] as const;
   export type SupportedProvider = typeof SUPPORTED_PROVIDERS[number];
   export function isProviderSupported(name: string): name is SupportedProvider {
     return (SUPPORTED_PROVIDERS as readonly string[]).includes(name);
   }
   ```
2. `infrastructure/config/cover-hosts.ts`:
   ```ts
   export const ALLOWED_COVER_HOSTS: readonly string[] = [
     'images.igdb.com',
     'utfs.io',
   ];
   export const ALLOWED_COVER_HOST_SUFFIXES: readonly string[] = ['.ufs.sh'];
   export function isCoverHostAllowed(host: string): boolean {
     return ALLOWED_COVER_HOSTS.includes(host) ||
            ALLOWED_COVER_HOST_SUFFIXES.some(s => host.endsWith(s));
   }
   ```
3. Test `__tests__/cover-hosts.test.ts`, `__tests__/providers.test.ts`.

**Rezultat:** config wyizolowany, testowalny.

### Step 2: Domain — usuń literal `'igdb'`
1. `external-metadata-ref.ts`: `ProviderName = string & { __brand: 'ProviderName' }`. Fabryka `ExternalMetadataRef.create(providerName: string, providerId: string)` waliduje `providerName.length > 0`, NIE waliduje konkretnych nazw. Lista znanych — w application.
2. `game.ts:49, 606`: `metadataProvider?: string | null` (lub `ProviderName | null` po imporcie z `external-metadata-ref.ts`).
3. `cover-image-url.ts`: usuń hardkodowaną allowlist. `CoverImageUrl.create(url: string, opts: { isHostAllowed: (host: string) => boolean })`.
4. Zaktualizuj testy domeny — przekaż `isHostAllowed: isCoverHostAllowed` z config.
5. Wszystkie call sites `CoverImageUrl.create(url)` → `CoverImageUrl.create(url, { isHostAllowed: isCoverHostAllowed })`.

**Rezultat:** domena nie zna `'igdb'` ani listy hostów.

### Step 3: Application layer — walidacja providera
1. `create-game.ts`, `update-game.ts`, `enrich-game-metadata.ts`: zamień `z.literal('igdb')` → `z.string().refine(isProviderSupported, { message: 'Unsupported provider' })`.
2. Testy use-case'ów — sprawdź, że nieznany provider zwraca `err({ kind: 'invalid_input' })`.
3. `bun test` GREEN.

**Rezultat:** dodanie RAWG = `SUPPORTED_PROVIDERS = ['igdb', 'rawg']` + nowy adapter w wiring. Reszta kodu nie wymaga zmian.

## If you get stuck
Jeśli po 2 próbach coś nie działa: ZATRZYMAJ się. Napisz:
`STUCK at Step <N>: <co próbowałem, jaki błąd, jaka hipoteza>`
Zakończ pracę bez commitowania.
