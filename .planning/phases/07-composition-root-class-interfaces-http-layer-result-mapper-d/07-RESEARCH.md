# Phase 7: Composition root class + interfaces/http + result mapper + domain events — Research

**Researched:** 2026-05-20
**Domain:** Architectural refactor (composition root lifecycle, hexagonal layer naming, error mapping, in-process domain events)
**Confidence:** HIGH — every claim verified against the Apex codebase (read at HEAD on `execution-branch`) or the electrician-offer-app reference repo.

## Summary

Phase 7 to **chirurgiczny refactor architekturalny** istniejącej, stabilnej aplikacji. Zakres dzieli się na cztery niezależne, ale tematycznie powiązane bloki: (1) zastąpienie `wiring.ts` klasą `Application` z explicit lifecycle (start/stop/cleanup, sygnały, migracje), (2) przeniesienie `routes/` do `interfaces/http/<aggregate>/` (czysty hexagonal naming), (3) cienki helper `resultToResponse` eliminujący boilerplate `switch (result.error.kind)` przy ZACHOWANIU `Result<T, E>`, (4) scaffolding `AggregateRoot` + `DomainEvent` + `InProcessEventBus` wpięty w dwa realne case'y (`GameDeleted` → cover cleanup handler, `GameMetadataApplied` → log handler).

Refactor ma **zachować 100 % istniejącego invariantu** per-user, optimistic locking, idempotency, IGDB chain holder (z escape hatchem `__setChainForTest` dla testów), request-scoped logger. Każda zmiana to przenosiny pliku + aktualizacja importów, nie zmiana semantyki.

**Primary recommendation:** Rozbij phase na 5 wave'ów wykonywanych sekwencyjnie z atomowymi commitami po każdym wave (każdy wave zostawia tree zielone `bun test apps/api`). Sugerowany order: (1) `application.ts` + migracje + lifecycle parity → (2) `interfaces/http/_shared/` (problem-json, result-to-response, make-dictionary-router) → (3) `interfaces/http/<aggregate>/` migracja per-aggregate (games, integrations, dictionaries, export, import, upload, me, health) → (4) `domain/shared/aggregate-root.ts` + event-bus + `Game.delete()` + `GameDeleted` handler → (5) `Game.applyMetadata` event + log handler + new event-flow.test.ts. Wave 3 wewnętrznie dalej atomowo per-aggregate.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Process lifecycle (start, signal handlers, drain) | API / Backend (composition root) | — | `Application` jest entrypointem procesu — nie istnieje wyżej |
| Migrations runner | API / Backend (`Application.runMigrations`) | — | Migracje są stanem schematu DB, nie warstwy interfejsu |
| HTTP route mounting | API / Backend (`interfaces/http`) | — | Hexagonal: interfaces są adapterami input |
| Result → HTTP response mapping | API / Backend (`interfaces/http/_shared`) | — | Helper warstwy interfejsów — nie zna domeny |
| Aggregate event raising | Domain | — | `AggregateRoot.raise()` to mechanizm domeny |
| Event handler dispatch | Application (event handler classes) | Infrastructure (in-process bus adapter) | Handler = use-case-like; bus = adapter |
| Domain event emission punkt wywołania | Application (use-case po commit) | — | Eventy są skutkiem ubocznym persisted transition |
| Cover cleanup eager handler | Application (`GameDeletedCoverCleanupHandler`) | Infrastructure (`CoverStorage.delete`) | Handler orkiestruje, adapter wykonuje |
| Cron orphan cleanup (fallback) | Application (`CleanupOrphans`) | — | Bez zmian — sweep dla deletów sprzed deployu |

## Project Constraints (from CLAUDE.md)

- **Per-user invariant**: każdy zasób MUSI być scoped do `userId` z bieżącej sesji. Eventy zatem **muszą nosić `userId`**, handler nie czyta z globalnego stanu.
- **Named exports only** — `Application` MUSI być `export class Application`, NIE `export default`.
- **No barrel `index.ts`** — `interfaces/http/games/games-router.ts` jest importowany bezpośrednio, NIE przez `interfaces/http/games/index.ts`.
- **Kebab-case filenames** — `application.ts`, `aggregate-root.ts`, `domain-event.ts`, `event-bus.ts`, `in-process-event-bus.ts`, `result-to-response.ts`, `games-router.ts`.
- **`Result<T, E>` zamiast throw** dla business errors — `OptimisticLockError` jest jedynym dozwolonym wyjątkiem przy granicy route'a. **Refactor NIE zmienia tej konwencji** — `resultToResponse` jest CIENKĄ skórą nad `Result<>`, NIE zastąpieniem.
- **Per-user scoping enforced at repo layer** — handler eventu czyta `userId` z eventu i przekazuje dalej; nie wymyśla własnego scope'u.
- **No `console.*`** — handler eventu używa `c.get('logger')`/logger z DI, NIE bezpośrednio `console`.
- **TS strict, Biome rules** — wszystkie nowe pliki muszą przejść `bun run lint` + typecheck przed commitem.
- **CRITICAL**: NIE wprowadzamy `organizationId`/multi-tenancy z electrician-offer-app. Apex jest **per-user end-to-end** (PROJECT.md + Phase 6 invariant audit). Reference repo to inspiracja na strukturę, NIE na model wielodostępu.

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| AR-01 | `wiring.ts` → `application.ts` z lifecycle, migracje z `db/client.ts` | Sekcje 3 + 4 (migration side-effects + composition-root state inventory) |
| AR-02 | `routes/` → `interfaces/http/<aggregate>/<aggregate>-router.ts` | Sekcja 1 (full file-level inventory + destination map) |
| AR-03 | `resultToResponse` helper, 0 `switch(result.error.kind)` | Sekcja 2 (call-site inventory + discriminant map) |
| AR-04 | `AggregateRoot`, `DomainEvent`, `EventBus`, `InProcessEventBus` | Sekcja 5 + 7 (Game boundary + design questions) |
| AR-05 | `Game.delete()` + `GameDeleted` + cover cleanup handler | Sekcja 5 + 6 (Game boundary + cover cleanup paths) |
| AR-06 | `Game.applyMetadata` raise + log handler | Sekcja 5 (applyMetadata call-site + immutability tension) |
| AR-07 | `event-flow.test.ts` + IDOR + full suite green | Sekcja 8 + 9 (tests to preserve + validation architecture) |

## 1. Inventory: `routes/` files to move

Pełna lista plików w `apps/api/src/routes/` w stanie HEAD (zweryfikowane przez `ls -la`):

| Current path | Exported router/value | Depends on (wiring imports) | Mounted in `index.ts` | Destination |
|---|---|---|---|---|
| `routes/games.ts` | `export const games` (Hono) | `createGame`, `deleteGame`, `getGame`, `idempotencyKeyMiddleware`, `igdbChainHolder`, `listGames`, `moveToCollection`, `updateGame` z `../wiring` | `app.route('/api/games', games)` (line 72) | `interfaces/http/games/games-router.ts` |
| `routes/games-metadata.ts` | `createGamesMetadataRouter(deps)` (factory) | injected `chainHolder` (już clean) | mount przez `games.route('/metadata', createGamesMetadataRouter({chainHolder}))` (games.ts:156) | `interfaces/http/games/games-metadata-router.ts` |
| `routes/integrations.ts` | `createIntegrationsRouter(deps)` (factory) | injected — clean | `app.route('/api/integrations', createIntegrationsRouter({...}))` (index.ts:101) | `interfaces/http/integrations/integrations-router.ts` |
| `routes/upload.ts` | `createUploadRoute(storage, mw)` (factory) | injected — clean | `app.route('/api/upload', createUploadRoute(...))` (index.ts:113) | `interfaces/http/upload/upload-router.ts` |
| `routes/import.ts` | `export const importRoute` | `idempotencyKeyMiddleware`, `importData` z `../wiring` | `app.route('/api/import', importRoute)` (line 92) | `interfaces/http/import/import-router.ts` |
| `routes/export.ts` | `export const exportRoute` | `exportData` z `../wiring` | `app.route('/api/export', exportRoute)` (line 88) | `interfaces/http/export/export-router.ts` |
| `routes/me.ts` | `export const me` | `coverStorageAvailable` z `../wiring` | `app.route('/api/me', me)` (line 96) | `interfaces/http/me/me-router.ts` |
| `routes/health.ts` | `createHealthRouter(checkDb)` (factory) | clean | `app.route('/health', createHealthRouter(...))` (line 41) | `interfaces/http/health/health-router.ts` |
| `routes/platforms.ts` | `export { platformsRouter as platforms } from '../wiring'` (re-export) | wiring | `app.route('/api/platforms', platforms)` (line 76) | DELETE — zastąpione bezpośrednim mount w `Application.registerRoutes` (Application wywoła `makeDictionaryRouter(platformUseCases)` inline) LUB cienki `interfaces/http/platforms/platforms-router.ts` factory wrapper. **Recommendation:** factory wrapper dla konsystencji z innymi aggregate'ami (Q7) |
| `routes/genres.ts` | `export { genresRouter as genres } from '../wiring'` | wiring | `app.route('/api/genres', genres)` (line 80) | jak wyżej → `interfaces/http/genres/genres-router.ts` |
| `routes/developers.ts` | `export { developersRouter as developers } from '../wiring'` | wiring | `app.route('/api/developers', developers)` (line 84) | jak wyżej → `interfaces/http/developers/developers-router.ts` |
| `routes/_make-dictionary-router.ts` | `makeDictionaryRouter<TKind>(deps)` factory | clean | wywoływany przez wiring | `interfaces/http/_shared/make-dictionary-router.ts` |
| `routes/_problem-json.ts` | `zodIssuesToProblemJson`, `domainProblem`, `optimisticLockProblem`, `payloadTooLargeProblem`, `internalProblem`, `problemResponse`, `attachProblemJsonErrorHandler` | clean | mount w `index.ts:36` + import w wielu routes | `interfaces/http/_shared/problem-json.ts` |
| `routes/middleware/require-auth.ts` | `requireAuth`, `AuthVariables` type | clean | `app.use('/api/*/*', requireAuth)` (index.ts wielokrotnie) | `interfaces/http/middleware/require-auth.ts` |
| `routes/middleware/idempotency-key.ts` | `idempotencyKey` factory | clean | wywoływany w wiring.ts:256 | `interfaces/http/middleware/idempotency-key.ts` |
| `routes/middleware/mutation-rate-limit.ts` | `mutationRateLimit` factory | clean (importuje `db` type-only) | wywoływany w wiring.ts:274 | `interfaces/http/middleware/mutation-rate-limit.ts` |
| `routes/middleware/origin-guard.ts` | `originGuard` | clean | `app.use('/api/*', originGuard(...))` (index.ts:64) | `interfaces/http/middleware/origin-guard.ts` |
| `routes/middleware/require-upload-permission.ts` | `requireUploadPermission` | clean | `app.use('/api/upload/*', requireUploadPermission)` (line 111) | `interfaces/http/middleware/require-upload-permission.ts` |

### Co-located tests (must move with their target file)

| Current path | Destination |
|---|---|
| `routes/games.test.ts` | `interfaces/http/games/__tests__/games-router.test.ts` (lub `games-router.test.ts` co-located — D-08 dopuszcza oba) |
| `routes/games.idor.test.ts` | `interfaces/http/games/__tests__/games-idor.test.ts` |
| `routes/__tests__/games-metadata.int.test.ts` | `interfaces/http/games/__tests__/games-metadata.int.test.ts` |
| `routes/__tests__/integrations.int.test.ts` | `interfaces/http/integrations/__tests__/integrations.int.test.ts` |
| `routes/__tests__/idempotency.int.test.ts` | `interfaces/http/middleware/__tests__/idempotency.int.test.ts` |
| `routes/__tests__/csrf-origin-guard.int.test.ts` | `interfaces/http/middleware/__tests__/csrf-origin-guard.int.test.ts` |
| `routes/__tests__/rate-limit.int.test.ts` | `interfaces/http/middleware/__tests__/rate-limit.int.test.ts` |
| `routes/__tests__/health.test.ts` | `interfaces/http/health/__tests__/health.test.ts` |
| `routes/middleware/__tests__/idempotency-key.test.ts` | `interfaces/http/middleware/__tests__/idempotency-key.test.ts` |
| `routes/middleware/__tests__/mutation-rate-limit.test.ts` | `interfaces/http/middleware/__tests__/mutation-rate-limit.test.ts` |
| `routes/middleware/__tests__/origin-guard.test.ts` | `interfaces/http/middleware/__tests__/origin-guard.test.ts` |

### External imports into `routes/` (must update)

`rg -ln "from.*routes/"` poza `routes/` zwraca **dokładnie 3 pliki**: `index.ts`, `wiring.ts`, `__tests__/wiring.test.ts`. To bardzo wąski blast radius — Application class (zastępując zarówno `index.ts` jak i `wiring.ts`) wchłania ich import-paths, a `wiring.test.ts` migruje do `__tests__/application.test.ts` z odpowiednio zaktualizowanymi import paths.

## 2. Inventory: `switch (result.error.kind)` i analogiczne mappingi

**`rg "switch \(result\.error\.kind\)" apps/api/src/routes/` → zero matches**. Apex NIE używa explicit `switch` na error.kind. Zamiast tego używa **chain of `if`** patternu. Pełna inwentaryzacja `if (!result.ok)` blocków:

### Per-file mapping table

| File:Line | Discriminants used | Status codes | Pattern |
|---|---|---|---|
| `routes/games.ts:131-137` (POST `/`) | `'invalid_input'`, `'domain'`, fallback | 400, 400, 500 | if-chain |
| `routes/games.ts:144-149` (POST `/:externalId/move-to-collection`) | `'not_found'`, `'conflict'`, fallback (`'already_owned'`) | 404, 409, 409 | if-chain |
| `routes/games.ts:180-225` (PATCH `/:externalId/metadata`) | `'not_found'`, `'invalid_input'`, `'domain'`, `'conflict'`, `'snapshot_mismatch'`, `'cache_miss'`, fallback | 404, 400, 400, 409, 400, 409, 500 | if-chain + custom problem bodies + IDOR side-channel log |
| `routes/games.ts:242` (GET `/:externalId`) | — `if (!result.ok)` jednolinijka | 404 | simplest case |
| `routes/games.ts:251-257` (PUT `/:externalId`) | `'not_found'`, `'invalid_input'`, `'domain'`, `'conflict'`, fallback | 404, 400, 400, 409, 500 | if-chain |
| `routes/games.ts:266-269` (DELETE `/:externalId`) | `'conflict'`, fallback (`'not_found'`) | 409, 404 | if-chain |
| `routes/_make-dictionary-router.ts:36-43` (POST) | `'invalid_input'`, `'domain'`, `'name_taken'`, fallback | 400, 400, 409, 500 | if-chain |
| `routes/_make-dictionary-router.ts:51-56` (DELETE `/:id`) | `'not_found'`, `'in_use'`, fallback | 404, 409, 500 | if-chain |
| `routes/games-metadata.ts:38-43` (GET `/candidates`) | `'invalid_input'`, fallback | 400, 500 | if-chain |
| `routes/integrations.ts:75-127` `saveErrorToHttp` (PUT `/igdb`) | `'invalid_input'`, `'invalid_credentials'`, `'twitch_unavailable'`, `'network_unreachable'`, `'storage_corrupt'` | 400, 422, 503, 504, 409 | **explicit `switch`** w helper function — DOBRY wzorzec do uogólnienia |
| `routes/import.ts:30-32` (POST `/`) | dowolny `result.error.kind` (forwarded as-is) | 400 | catch-all 400 |

### Union of all discriminants (target type for `resultToResponse` mapper)

`'not_found'` (404), `'conflict'` (409), `'invalid_input'` (400 z issues), `'domain'` (400 z domainProblem), `'name_taken'` (409), `'in_use'` (409), `'already_owned'` (409), `'snapshot_mismatch'` (400 z fields), `'cache_miss'` (409), `'invalid_credentials'` (422), `'twitch_unavailable'` (503), `'network_unreachable'` (504), `'storage_corrupt'` (409)

**Confirmation of 404/409/422 hypothesis:** zdecydowana większość mapuje się na 400/404/409. 422 dotyczy tylko `invalid_credentials` z integracji. 503/504 specyficzne dla zewnętrznych dostawców. **Helper musi obsługiwać oba style:** prosty `Record<kind, number>` dla 80 % przypadków + custom function override dla edge case'ów (snapshot_mismatch z `fields`, twitch_unavailable z `upstreamStatus`).

## 3. Inventory: migration side-effects

### Trigger point

**`apps/api/src/infrastructure/db/client.ts:24-28`:**
```typescript
const g = globalThis as unknown as { __apexDbMigrated?: boolean };
if (process.env.NODE_ENV !== 'production' && !g.__apexDbMigrated) {
  migrate(db, { migrationsFolder: MIGRATIONS_DIR });
  g.__apexDbMigrated = true;
}
```

Migracje uruchamiają się **tylko gdy `NODE_ENV !== 'production'`** AND **`__apexDbMigrated` flag nie ustawiona**. To celowy fence dla testów + dev — w produkcji Phase 5 (BE-01) planuje wymóg `bun run db:migrate` w deploy script, ale ten task pozostaje otwarty (Phase 5 plans not yet executed per STATE.md). **Phase 7 musi nie psuć tej semantyki w międzyczasie.**

### Callers of `db` / `sqlite` (potential triggers)

`rg -ln "from.*db/client"` → 24 pliki importujące `db`/`sqlite`:
- **Production runtime:** `index.ts`, `wiring.ts`, repos pod `infrastructure/games/`, `infrastructure/dictionary/`, `infrastructure/import/`, `infrastructure/igdb/drizzle-igdb-token-storage.ts`, `infrastructure/integrations/drizzle-integration-credentials-repository.ts`, `infrastructure/metadata/metadata-cache-repository.ts`, `infrastructure/idempotency/drizzle-idempotency-key-repository.ts`, `infrastructure/cron/cron-lock.ts`, `infrastructure/auth/auth.ts`, `infrastructure/db/seed.ts`, middleware `mutation-rate-limit.ts`, `application/rate-limit/sweep-rate-limit-buckets.ts`.
- **Tests:** route int-tests + `wiring.test.ts` + repository tests + auth tests.

**Każdy** z tych plików, importowany pierwszy w `bun test` run, triggeruje side-effect migrate w `db/client.ts:25`. To jest **funkcjonalność** w testach — bez tego pierwszy test, który próbuje INSERT-ować, dostaje "no such table". W produkcji side-effect jest no-op (NODE_ENV guard).

### What breaks if we just delete the side-effect

W trybie `bun test apps/api`: **wszystkie testy idące przez DB zerwą** ("no such table: games", "no such table: integration_credentials" etc.), ponieważ żadna ścieżka nie wywoła `migrate()` przed pierwszym `INSERT`.

### Required migration strategy

`Application.runMigrations()` musi być **wywoływane przed `Application.start()` listening**, ale dla testów jest opcja:
- **Opcja A** (zalecana): wyodrębnić `runMigrations()` jako **publiczną funkcję** w nowym pliku `infrastructure/db/run-migrations.ts`, którą `Application.start()` woła **oraz** którą **fixture testowy** (`apps/api/src/__tests__/_fixtures/migrations-fixture.ts`) woła w `beforeAll` z `globalThis.__apexDbMigrated` jako idempotency guard. Side-effect z `db/client.ts:24-28` jest usuwany i zastępowany jawnym wywołaniem na początku każdego runa (production via `Application`, tests via fixture imported in a setup file).
- **Opcja B** (mniej idealna): zostawić side-effect w `db/client.ts` JAK JEST i `Application.runMigrations()` tylko delegate do tej samej funkcji. Sukces criterion AR-01 wymaga "regression test pinuje że re-import `db/client.ts` w teście nie powoduje rerun migracji ani zmian w `apps/api/data/`" — co `globalThis.__apexDbMigrated` flag już zapewnia. **Ale** AR-01 explicit mówi "Migracje są wywoływane z `Application.runMigrations()` — `infrastructure/db/client.ts` NIE odpala migracji jako side-effect". **Opcja A jest jedyną zgodną z literą requirements.**

### Concrete plan

1. Wyodrębnić `infrastructure/db/run-migrations.ts` z funkcją `runMigrations(): Promise<void>` (chronioną `__apexDbMigrated` flag — idempotent across re-imports).
2. Usunąć blok side-effect z `db/client.ts:24-28`.
3. `Application.start()` woła `await runMigrations()` BEFORE `Bun.serve`.
4. Dodać `apps/api/src/__tests__/_fixtures/migrations-setup.ts` z `beforeAll(async () => { await runMigrations(); });` LUB włączyć to do `bunfig.toml` `preload`. **Recommendation:** `bunfig.toml` `preload` jest cleanest — jeden plik setupu uruchamia się przed wszystkimi testami w procesie.
5. Regression test (część `application.test.ts`) — re-import `db/client.ts` 2× nie powoduje rerun (flag pinuje).

## 4. Inventory: composition-root state

Pełna inwentaryzacja module-level singletonów w `wiring.ts` (linie referowane do HEAD):

| Singleton / state | Line(s) | Init dependency | Lifecycle phase needed | Cleanup needed |
|---|---|---|---|---|
| `coverStorage: CoverStorage \| null` | 61-63 | `env.UPLOADTHING_TOKEN` | Constructor / start | none (stateless HTTP client) |
| `gameRepository` | 65 | none (uses module `db`) | Constructor | none |
| `platformRepository`, `genreRepository`, `developerRepository` | 66-77 | `db` | Constructor | none |
| `importRepository` | 78 | `db` | Constructor | none |
| `idempotencyKeyRepository` | 79-80 | `db` | Constructor | none |
| `transactionRunner` | 81 | `db` | Constructor | none |
| Use-cases (`createGame`, `updateGame`, `deleteGame`, `listGames`, `getGame`, `moveToCollection`) | 83-88 | repos + tx | Constructor | none |
| Dictionary use-cases (×3 kinds) + routers | 94-141 | repos + tx | Constructor | none |
| `exportData`, `importData` | 143-144 | repos | Constructor | none |
| `metadataCacheRepository`, `igdbTokenStorage`, `integrationCipher`, `integrationCredentialsRepository` | 158-161 | `db` | Constructor | none |
| `igdbChainHolder` | 163-172 | `IgdbChainHolderDeps` | Constructor | none (in-memory holder; chain torn down on `swap(null)`) |
| `igdbCredentialsVerifier`, `saveIgdbIntegration`, `clearIgdbIntegration` | 174-194 | misc | Constructor | none |
| **`await primeIgdbChainFromDb()`** | 196 | `integrationCredentialsRepository`, `integrationCipher`, auth user table | **Async start — top-level await ⚠️** | none |
| `cronOwner` string + `cronLock` | 250-251 | `process.env.HOSTNAME`, `process.pid`, `crypto.randomUUID()` | Constructor | none (no acquired locks at boot) |
| `idempotencyKeyMiddleware` | 256-258 | `idempotencyKeyRepository` | Constructor | none |
| `cleanupOrphans` | 260-266 | coverStorage, gameRepo, idempotencyRepo, cronLock | Constructor | none |
| `sweepRateLimitBuckets` | 268-272 | db, cronLock | Constructor | none |
| `rateLimitMutations` middleware | 274 | db | Constructor | none |

### Module-level state in `db/client.ts`

| Singleton | Line(s) | Notes |
|---|---|---|
| `sqlite: Database` | 19 | **MUST close on shutdown** — `sqlite.close()` w `index.ts:208` |
| `db` (Drizzle wrapper) | 22 | no cleanup |
| `globalThis.__apexDbMigrated` | 24 | flag — kept after migracje move |

### Lifecycle in `index.ts`

| Concern | Lines | Goes to |
|---|---|---|
| Hono app construction | 34, `attachProblemJsonErrorHandler`, route mount | `Application.constructor()` + `Application.registerRoutes()` |
| Health probe + CORS + originGuard + requestContext | 41-64 | `Application.registerMiddleware()` |
| Auth handler mount | 68 | `Application.registerRoutes()` |
| Per-aggregate `app.use(...).route(...)` blocks | 70-108 | `Application.registerRoutes()` |
| `Bun.serve` start | 117-122 | `Application.start(port)` — sets `this.server` |
| **Cron 1**: orphan cleanup setInterval (1h) | 124-155 | `Application.startCrons()` (or just inline in `start()`) — store timer for cleanup |
| **Cron 2**: rate-limit sweep setInterval (5min) | 157-175 | jak wyżej |
| `shuttingDown` flag | 178 | `private shuttingDown` field na `Application` |
| `shutdown(signal)` function | 180-219 | `Application.stop(exitCode)` + `Application.cleanup()` |
| `clearInterval(cleanupTimer)`, `clearInterval(rateLimitSweepTimer)` | 185-186 | `Application.cleanup()` |
| `server.stop(false/true)` + drain race | 191-205 | `Application.stop()` |
| `sqlite.close()` | 208 | `Application.cleanup()` (last) |
| `process.on('SIGTERM' / 'SIGINT')` | 221-226 | `Application.registerProcessHandlers()` |

### Required `Application` API (per AR-01)

```typescript
class Application {
  // Eager construction (replaces module-top instantiations in wiring.ts)
  constructor() { /* repos, use-cases, holder, middleware, crons; calls registerProcessHandlers() */ }

  // Lifecycle
  async start(port: number): Promise<void>     // runMigrations → primeIgdbChainFromDb → registerEventHandlers → registerMiddleware → registerRoutes → Bun.serve → startCrons
  async stop(exitCode = 0): Promise<void>      // setShuttingDown → clearIntervals → server.stop(drain) → cleanup → process.exit
  private async cleanup(): Promise<void>       // sqlite.close

  // Boot stages (each callable in tests)
  async runMigrations(): Promise<void>
  registerProcessHandlers(): void              // SIGTERM, SIGINT
  registerMiddleware(): void                    // problem-json error handler, requestContext, CORS, originGuard
  registerRoutes(): void                        // health, auth, games, platforms, ..., integrations, upload
  registerEventHandlers(): void                 // eventBus.subscribe(...)
}
```

### Tricky bits

- **`primeIgdbChainFromDb()` top-level await (wiring.ts:196).** Currently blocks module evaluation. W `Application.start()` to staje się jawnym `await this.primeIgdbChainFromDb()` po `runMigrations()`. **Wave 1 musi tę kolejność zachować** — bez migracji `integration_credentials` table nie istnieje.
- **`cronOwner` używa `process.pid` + UUID** — to musi być stworzone w `Application.constructor()` (raz na proces), NIE w start() (idempotency w testach).
- **`db` exportowany** z `db/client.ts` jest używany przez ~20 plików **type-only** (`typeof defaultDb`) + runtime. `Application` MUSI import-ować `db` z client (jeden moduł, jeden Drizzle instance) — NIE owijać go ponownie.
- **`coverStorage: CoverStorage | null`** używane w `routes/me.ts` (`coverStorageAvailable`) i `routes/upload.ts`. Po move'ie do `Application` instancja musi być przekazana do `createUploadRoute(coverStorage, idempotencyMw)` factory + dostępna w `me-router` (przekazana przez factory, NIE re-export z application.ts — composition root invariant).

## 5. Inventory: `Game` aggregate boundary for events

### `Game.applyMetadata` call sites

`rg -n "applyMetadata"` → **dokładnie jedno wywołanie produkcyjne**:
- `apps/api/src/application/games/enrich-game-metadata.ts:135` — `existing.applyMetadata(data.snapshot, refResult.value, { isCoverHostAllowed })` wewnątrz `this.tx.run(async (tx) => { ... })`.

Pozostałe `applyMetadata` matches to testy domenowe (`game-apply-metadata.test.ts`).

### `repo.delete` call sites (na Game)

`rg -n "repo\.delete|gameRepository\.delete"` → **dokładnie jedno wywołanie produkcyjne dla Game**:
- `apps/api/src/application/games/delete-game.ts:33` — `return repo.delete(userId, externalId, existing.updatedAt)` wewnątrz `tx.run`.

Inne `repo.delete` matches dotyczą `DrizzleIntegrationCredentialsRepository` (integrations) i unrelated test setupów.

### Event publish insertion points

**Dla `GameDeleted`:** publish MUSI być po `tx.run` (po commit), w `delete-game.ts`:
```typescript
if (!deleted) return err({ kind: 'not_found' });
await this.eventBus.publishAll(deleted.pullDomainEvents()); // ← tutaj
return ok(deleted);
```
**Dla `GameMetadataApplied`:** analogicznie po `tx.run` w `enrich-game-metadata.ts`:
```typescript
if (!outcome.ok) return err(outcome.error);
await this.eventBus.publishAll(outcome.saved.pullDomainEvents()); // ← tutaj
return ok(outcome.saved);
```

### `Game` extends `AggregateRoot` — compatibility analysis

Current `Game` (apps/api/src/domain/games/game.ts):
- **Private constructor** (line 19) — JS dziedziczenie wymaga że subklasa woła `super()`. `AggregateRoot.constructor` jest **niejawnie public no-arg** (`class AggregateRoot { private _domainEvents = [] }`), więc `Game` może wywołać `super()` bez argumentów w swoim private constructorze. **Kompatybilne.**
- **Immutable aggregate** (CLAUDE.md): mutating methods zwracają nową instancję. `AggregateRoot._domainEvents` jest **mutable field**. To jest **konflikt projektowy** — patrz Sekcja 7 Q2.
- **`fromPersistence` / factory pattern**: nie ma znaczenia — `super()` wewnątrz `new Game(...)` z private constructora działa identycznie.
- **`applyMetadata` zwraca `Result<Game, ...>`** — nowa instancja Game. Jeśli `_domainEvents` jest na nowej instancji, to oryginał (`existing`) ma puste eventy, a `enrichedResult.value` (saved) ma event. **To jest właściwa semantyka** dla immutable aggregate — patrz Q2 rekomendacja.
- **Moja rekomendacja** (Q2): NIE robić `_domainEvents` mutable na instancji. Zamiast tego `Game.applyMetadata` jawnie tworzy nową instancję i wywołuje `protected raise()` na tej nowej instancji w jej constructorze (private factory path). `pullDomainEvents()` na świeżej instancji zwraca te eventy. Use-case wywołuje na `outcome.saved`, nie na `existing`. **To zachowuje immutability.**

### Concrete change set

```typescript
// domain/games/game.ts
export class Game extends AggregateRoot {
  private constructor(/* ... */, _raiseDeletedFor?: { coverImageUrl: string | undefined }) {
    super();
    // ...assign fields...
  }

  // NEW: domain method that produces the event before infra delete
  delete(): GameDeletedEvent {
    return new GameDeletedEvent(this._externalId, this._userId, this._coverImage ?? null);
  }

  applyMetadata(snapshot, ref, opts): Result<Game, ...> {
    // ...existing logic, but produce next Game and have it raise GameMetadataApplied
    const next = new Game(/* ... */);
    next.raise(new GameMetadataAppliedEvent(next._externalId, next._userId, ref));
    return ok(next);
  }
}
```

**Note on `delete()`**: AR-05 mówi że `Game.delete()` raise'uje event. **Ale** delete-game.ts używa istniejącej (loaded) instancji, nie nowej. **Dwie opcje:**
- **5A**: `Game.delete()` zwraca event jawnie (typed: `GameDeletedEvent`), use-case publishuje go ręcznie. Czystsze dla immutability, ale łamie symetrię z `applyMetadata`.
- **5B**: `Game.delete()` to side-effect wewnątrz aggregate — woła `this.raise(new GameDeletedEvent(...))`. Łamie immutability, ale jest **idiomatyczne dla AggregateRoot pattern** i AR-05 explicit mówi "raise'uje". **Recommendation: 5B**, z TSDoc commentem że "delete-game" jest jedyną metodą która muta instancję — uzasadnienie: "delete oznacza koniec życia agregatu; mutacja `_domainEvents` na właśnie-usuwanej instancji jest acceptable bo instancja idzie do garbage po `pullDomainEvents()`".

## 6. Inventory: cover cleanup paths

### Existing cron (production behaviour)

`apps/api/src/application/cover-storage/cleanup-orphans.ts:93-125` — `sweep()` flow:
1. List wszystkie cover URLs z UploadThing starsze niż **24h** (safety window): `storage.listOlderThan(24)`.
2. List wszystkie URL-e z `games.cover_image` w DB: `gameRepo.findAllCoverImages()`.
3. Diff → orphan URLs (w storage, nie w DB).
4. Loop `storage.delete(url)` z try/catch counter (deleted/failed).
5. Także prune `idempotency_key` starsze niż 24h.

Cadence: **co 1 godzinę** (`apps/api/src/index.ts:128` `ONE_HOUR_MS`). Guarded przez `CronLock` (cross-instance — choć przy single-VPS unused per Phase 6).

### Existing race documented in `delete-game.ts:9-19`

TSDoc explicitly: pre-commit `storage.delete()` + transaction rollback → live row z brakiem pliku; post-commit `void storage.delete()` + SIGTERM między commit a remote DELETE → file orphaned bez DB pointera. **Single source of truth = cron**.

### What changes z `GameDeletedCoverCleanupHandler`

Nowy handler woła `coverStorage.delete(event.coverImageUrl)` **po commicie tx** (use-case wywołuje `eventBus.publishAll(...)` po `tx.run`). Czyli mamy:

```
tx.run { ... repo.delete commit ... }  ← DB row gone
↓
eventBus.publishAll → handler → storage.delete(url)
```

**Race analysis:**
- **No transaction rollback race** — handler jest wywoływany TYLKO po pomyślnym commicie (use-case zwraca `ok(deleted)` po publishAll). Jeśli tx zwraca null/throw → eventy nie są publikowane (`pullDomainEvents()` nie ma sensu na rolled-back nowej instancji bo `delete()` jest na loaded instancji która i tak zostaje).
- **SIGTERM race STILL EXISTS** — między commit a `storage.delete()` proces może umrzeć. Wtedy DB nie ma row'a, file pozostaje orphan. **Cron orphan-cleanup pozostaje jako fallback** dla dokładnie tego case'u.
- **Cron handles "old deletes"** — deletes które wykonały się PRZED deploy'em z event handlerem (file orphans już są na storage'u), oraz SIGTERM-race orphans.

### TSDoc update needed

`delete-game.ts:9-19` aktualny TSDoc says "cover-image cleanup is intentionally NOT performed here. ... single source of truth is the hourly CleanupOrphans cron". **Po Phase 7 to musi być zaktualizowane**:

> NOTE: cover-image cleanup is now performed via the `GameDeleted` domain event,
> dispatched after the transaction commits. The hourly `CleanupOrphans` cron
> remains as a fallback for: (a) deletes from pre-Phase-7 deploys that never
> raised the event, (b) SIGTERM races between commit and the storage DELETE
> call, (c) any future code path that bypasses the event bus.

### TSDoc on cron itself

Cron loop w `index.ts:124-155` (→ `application.ts.startCrons()` post-refactor) potrzebuje analogicznego commentu wyjaśniającego że teraz to fallback, NIE primary cleanup.

## 7. Design questions the planner must resolve

### Q1: Gdzie żyje `DomainEvent.userId`?

**Trade-off:** (A) base interface `DomainEvent` ma `userId: string` jako wymagane pole (Apex-specific) vs (B) base interface trzyma się minimum (`eventName`, `occurredAt`, `aggregateId`) i `userId` jest na concrete event classes.

**Recommendation: (A)**. CLAUDE.md "per-user invariant" + AR-04 explicit mówi `interface DomainEvent { eventName; aggregateId; userId; occurredAt }`. Czyni handler verification trivial — `event.userId` jest zawsze dostępny dla per-user scope check'ów w przyszłych handlerach. Reference repo (electrician) miał `organizationId` na concrete classes, ale Apex **nie ma** organization scope'u — `userId` jest the scope.

### Q2: `AggregateRoot.raise` muta state vs immutable

**Trade-off:** (A) `_domainEvents: DomainEvent[]` jako mutable field na instancji (idiomatic AggregateRoot pattern) — **łamie immutability Game** vs (B) WeakMap external storage — czystsza separacja, dodaje memory pressure i complexity vs (C) eventy wracają jawnie z metody domeny (`applyMetadata() : Result<{game: Game, events: DomainEvent[]}, ...>`).

**Recommendation: (A)** z dwoma uściśleniami:
1. **`applyMetadata` `raise`-uje na NOWEJ instancji** (`next.raise(...)` po `new Game(...)`). Stara instancja ma pusty bufor. Use-case wywołuje `pullDomainEvents()` na zwróconej (saved) instancji. **To zachowuje semantyczną immutability** — `existing` nigdy nie ma eventu, tylko `outcome.saved`.
2. **`Game.delete()` raise'uje NA loaded instancji** (zwracanej z `repo.findByExternalId`). To **jest mutacja** ale akceptowalna: instancja po `pullDomainEvents()` idzie do garbage; nikt z niej nie korzysta po use-case zakończeniu. TSDoc na `delete()` to documentuje.

Option (C) byłby teoretycznie czystszy ale rozwala spójność z reference repo i wymaga że KAŻDY caller manuały to managuje. AggregateRoot pattern jest standardem w DDD i odbiorca planu (electrician-offer-app ma identyczny pattern) ma low cognitive friction.

### Q3: Event bus dispatch INSIDE `TransactionRunner.run` vs AFTER commit

**Trade-off:** (A) inside tx — handler atomicy z DB write (jeśli handler throw → rollback). Ale handler ma side-effects (storage.delete) — atomicity meaningless, side-effect już się zdarzył. Plus tx jest synchroniczny względem DB lock — long-running handler blokuje tx. vs (B) after commit — best-effort dispatch; przy SIGTERM między commit a publish event się gubi. To akceptowalne dla cleanup eventów bo cron fallback łapie. vs (C) outbox pattern — event row zapisywany w tej samej tx, osobny worker dispatcher. Najtrwalsze, ale +1 tabela, +1 worker — out-of-scope per Phase 7.

**Recommendation: (B)** — after commit, w-process, fail-fast log. Cron orphan-cleanup jest fallback dla utraconych eventów. Outbox jest follow-up dla v2 jeśli kiedyś przyjdzie webhook integration (dziś NIE jest potrzebne). Reference (electrician) używa również after-commit dispatch.

**Important nuance:** `delete-game.ts` i `enrich-game-metadata.ts` mają `tx.run(...)` blok. Publishall MUSI być po `await this.tx.run(...)` (po `try/catch OptimisticLockError`), NIE wewnątrz callbacka. Plan musi explicit to wyspecyfikować.

### Q4: `resultToResponse` shape — `Record<kind, number>` vs `Record<kind, (err) => Response>` vs overload

**Trade-off:** (A) tylko status map — pokrywa 80 % przypadków, ale `snapshot_mismatch` (custom body z `fields`), `twitch_unavailable` (custom body z `upstreamStatus`), `invalid_input` (issues → zod problem) wymagają custom logic. vs (B) tylko function map — verbose dla prostych kindów. vs (C) overload — dwa sygnatury: `resultToResponse(c, result, statusMap)` i `resultToResponse(c, result, handlerMap)`.

**Recommendation: hybrid C** — single signature gdzie value w `mapper: Record<kind, number | (err, c) => Response>` jest sumą `number` lub funkcji. Jeden sweep, zerowy overhead, wszystkie przypadki pokryte. Przykład:

```typescript
type StatusOrHandler<E, C> = number | ((err: E, c: C) => Response);

export function resultToResponse<T, E extends { kind: string }, C extends Context>(
  c: C,
  result: Result<T, E>,
  mapper: { [K in E['kind']]: StatusOrHandler<Extract<E, { kind: K }>, C> },
  onSuccess: (value: T, c: C) => Response,
): Response {
  if (result.ok) return onSuccess(result.value, c);
  const handler = mapper[result.error.kind as E['kind']];
  if (typeof handler === 'number') {
    return c.json({ error: result.error.kind }, handler as ContentfulStatusCode);
  }
  return handler(result.error as Extract<E, { kind: typeof result.error.kind }>, c);
}
```

Dla większości routes mapper będzie tylko-statusowy `{ not_found: 404, conflict: 409 }`. Dla games `PATCH /:externalId/metadata` mapper będzie mieszany — `not_found: customHandler`, `conflict: 409`, `snapshot_mismatch: customHandler`, etc. Wszystkie helpery z `_problem-json.ts` (`zodIssuesToProblemJson`, `domainProblem`, `optimisticLockProblem`) pozostają — są budulcami dla custom handlers.

### Q5: Co żyje w `interfaces/http/_shared/`?

**Recommendation:**
- `problem-json.ts` (moved from `routes/_problem-json.ts`, leading `_` zniknie bo folder już sygnalizuje shared)
- `result-to-response.ts` (NEW)
- `make-dictionary-router.ts` (moved from `routes/_make-dictionary-router.ts`)
- **Test helpers DO NOT live tutaj** — `apps/api/src/__tests__/_fixtures/` zostaje jako globalny scope dla cross-aggregate fixture'ów (igdb-chain-fixture). Per-aggregate test helpers idą do `interfaces/http/<aggregate>/__tests__/_fixtures/` jeśli kiedyś będą potrzebne (dziś brak takich).

### Q6: Dictionary aggregates — folder per aggregate?

`makeDictionaryRouter` jest polymorphic factory. Każdy z `platforms`/`genres`/`developers` ma własny mount w `index.ts` z dedykowanym middleware (rate-limit). **Recommendation:** każdy aggregate dostaje swój folder `interfaces/http/{platforms,genres,developers}/<aggregate>-router.ts` z **trzylinijkowym** plikiem:

```typescript
// interfaces/http/platforms/platforms-router.ts
import { makeDictionaryRouter } from '../_shared/make-dictionary-router';
import type { DictionaryUseCases } from '../../../application/dictionary/make-dictionary-use-cases';
import type { PlatformKind } from '../../../domain/platforms/platform';

export function createPlatformsRouter(useCases: DictionaryUseCases<PlatformKind>) {
  return makeDictionaryRouter({ useCases });
}
```

Czyni `Application.registerRoutes()` symmetric:
```typescript
this.hono.route('/api/platforms', createPlatformsRouter(this.platformUseCases));
this.hono.route('/api/genres', createGenresRouter(this.genreUseCases));
this.hono.route('/api/developers', createDevelopersRouter(this.developerUseCases));
```

Alternative — single `interfaces/http/_shared/make-dictionary-router.ts` + bezpośredni mount w `Application` `this.hono.route('/api/platforms', makeDictionaryRouter({useCases: this.platformUseCases}))` — eliminuje 3 thin wrappers. **Lighter, but breaks symmetry** z innymi aggregate'ami. Wybór planner'a.

### Q7: Event handler lokalizacja

**Recommendation:** `apps/api/src/application/events/` (nowy folder).
- `application/events/game-deleted-cover-cleanup.handler.ts` (class `GameDeletedCoverCleanupHandler` z `handle(event: GameDeletedEvent): Promise<void>` method, constructor takes `CoverStorage` + `Logger`).
- `application/events/game-metadata-applied-log.handler.ts` (placeholder handler).

Application class `registerEventHandlers()` instantiates obie i `eventBus.subscribe('game.deleted', (e) => handler.handle(e as GameDeletedEvent))`.

Event class location:
- `domain/games/events/game-deleted.event.ts`
- `domain/games/events/game-metadata-applied.event.ts`

(Pattern z electrician-offer-app — `domain/<aggregate>/events/<event-name>.event.ts`.)

### Q8: Kolejność wave'ów

**Recommendation:**
1. **Wave 1**: `application.ts` skeleton + `runMigrations` extraction + bunfig.toml preload setup + lifecycle parity (graceful shutdown, crons, signal handlers, primeIgdbChainFromDb). `wiring.ts` pozostaje tymczasowo — `application.ts` woła `import * from './wiring'` w pierwszej iteracji. `index.ts` → `new Application().start(port)`. **Zielony test suite po Wave 1.**
2. **Wave 2**: `interfaces/http/_shared/` (problem-json, result-to-response, make-dictionary-router) + `interfaces/http/middleware/` (move + import-path updates). Routes pozostają w `routes/` ale importują z `interfaces/`. **Zielony test suite.**
3. **Wave 3**: per-aggregate atomic moves (games + games-metadata, integrations, dictionaries ×3, export, import, upload, me, health). Każdy aggregate to jeden commit. Po **każdym** sub-commit `bun run lint && bun test apps/api`. **Zielony test suite.**
4. **Wave 4**: `domain/shared/{aggregate-root,domain-event,event-bus}.ts` + `infrastructure/events/in-process-event-bus.ts` + `Game extends AggregateRoot` + `Game.delete()` + `GameDeleted` event + cover cleanup handler + delete-game.ts publishAll + TSDoc updates (delete-game + cron). **Zielony test suite + GameDeleted handler invokes storage.delete.**
5. **Wave 5**: `Game.applyMetadata` raise + `GameMetadataApplied` event + log handler + enrich-game-metadata.ts publishAll + new `application/__tests__/event-flow.test.ts` + final `wiring.ts` removal. **Zielony test suite + cała sucha suita zielona.**

`wiring.ts` istnieje przez Wave 1-4 jako tymczasowa fasada, znika dopiero w Wave 5 (gdy `Application` jawnie konstruuje wszystkie singletony). To pozwala każdemu wave'owi być atomic + revertable.

### Q9: `Application` instance shape — fields vs registry

**Trade-off:** (A) wszystkie singletony jako `private readonly` fields na `Application` (~30 fields) — reference repo wzorzec. vs (B) lokalne `const` w `Application.constructor()` body + jawne przekazywanie do `registerRoutes()` przez parametry.

**Recommendation:** (A) z grupowaniem komentarzem: `// ── Repositories ──`, `// ── Use cases (games) ──`, `// ── IGDB chain ──`, `// ── Crons ──`. Pozwala testom (jeśli kiedyś trzeba) zrobić `(app as any).gameRepository` dla introspekcji, nie utrudnia rebuild — tak samo jak reference repo (electrician-offer-app/server/src/app.ts:68-94).

## 8. Tests to preserve

### Tests with import-path updates (mechanical, not behavioral)

| Test file | Update needed |
|---|---|
| `apps/api/src/__tests__/wiring.test.ts` | Rename → `apps/api/src/__tests__/application.test.ts`. Replace `import { igdbChainHolder } from '../wiring'` z `import { application } from '../application'` (lub eksport singletona `app` z `application.ts`). Update fixture path. Update `--glob=!**/wiring.ts` → `--glob=!**/application.ts`. Update `'igdbChainHolder\\.swap\\('` enforcement scope (still must be `_fixtures/` only). |
| `apps/api/src/__tests__/_fixtures/igdb-chain-fixture.ts` | Update `import { igdbChainHolder } from '../../wiring'` → import z `application`. |
| `apps/api/src/routes/games.test.ts` + `games.idor.test.ts` | Move to `interfaces/http/games/__tests__/`. Update `from '../games'` etc. + `from '../middleware/*'` paths. |
| `apps/api/src/routes/__tests__/integrations.int.test.ts` | Move + update imports. |
| `apps/api/src/routes/__tests__/games-metadata.int.test.ts` | Move + update imports. |
| `apps/api/src/routes/__tests__/idempotency.int.test.ts` | Move + update imports. |
| `apps/api/src/routes/__tests__/csrf-origin-guard.int.test.ts` | Move + update imports. |
| `apps/api/src/routes/__tests__/rate-limit.int.test.ts` | Move + update imports. |
| `apps/api/src/routes/__tests__/health.test.ts` | Move + update imports. |
| `apps/api/src/routes/middleware/__tests__/*.test.ts` | Move to `interfaces/http/middleware/__tests__/` + update imports. |

### Tests requiring behavioral verification (no path change, but must stay green)

| Test file | Why it matters |
|---|---|
| `apps/api/src/application/games/delete-game.test.ts` | Use-case behaviour zmienia się (publishAll po commit). Test mock eventBus z `publishAll: spy` i assert wywołanie po `repo.delete`. |
| `apps/api/src/application/games/__tests__/enrich-game-metadata.test.ts` | Use-case publishuje `GameMetadataApplied`. Test mock eventBus. |
| `apps/api/src/application/games/__tests__/enrich-game-metadata.snapshot.test.ts` | Snapshot pinuje że `applyMetadata` jest wywołane PO walidacji. Z dodaniem `raise()` w applyMetadata test musi nadal pinować order. |
| `apps/api/src/domain/games/__tests__/game-apply-metadata.test.ts` | `applyMetadata` zwraca `Result<Game>` — nowa instancja Game powinna mieć event w `pullDomainEvents()`. Dodać assertion. |
| `apps/api/src/domain/games/__tests__/game.test.ts` + `game-invariants.test.ts` | `Game extends AggregateRoot` nie powinno złamać invariant'ów. Re-run as-is. |
| `apps/api/src/application/cover-storage/cleanup-orphans.test.ts` | Cron sweep zachowuje semantykę. Re-run. |

### Tests pinning per-user IDOR (CRITICAL)

| Test file | Why critical |
|---|---|
| `apps/api/src/routes/games.idor.test.ts` | **AR-07 explicit**: ten test MUSI być green po refactor. Move + update imports + verify że nowy event handler nie crosstalkuje. |

### Pre-flight check w planie

Planner MUSI mieć w każdym wave commit checkpoint: `bun test apps/api && bun run lint`. Wave 4-5 dodatkowo `bun test apps/api/src/application/__tests__/event-flow.test.ts` jako sanity.

## 9. Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | `bun:test` (built-in Bun test runner) |
| Config file | None (`bunfig.toml` minimal; tests autodiscover) |
| Quick run command | `bun test apps/api/src/<path>/<file>.test.ts` |
| Full suite command | `bun test apps/api` |
| Lint command | `bun run lint` (= `biome check .`) |
| Typecheck command | `bun run typecheck` (per workspace `tsc --noEmit`) |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| AR-01 (lifecycle) | `new Application()` constructs without side-effects beyond signal-handler register; `Application.start(port)` runs migrations, primes IGDB, starts Bun.serve | smoke | `bun test apps/api/src/__tests__/application.test.ts` | Wave 0 (rename + extend from wiring.test.ts) |
| AR-01 (migrations not side-effect) | re-import `db/client.ts` 2× nie triggeruje `migrate()` (flag pinuje) | unit | `bun test apps/api/src/__tests__/application.test.ts -t "migrations idempotent"` | Wave 0 (new test case) |
| AR-02 (routes moved) | `bun run lint && bun run typecheck` z 0 errors po move | static | `bun run lint && bun run typecheck -w apps/api` | EXISTS (build pipeline) |
| AR-02 (no rogue route mounts) | `rg "from.*routes/" apps/api/src/` zwraca 0 wyników (poza `__tests__/_legacy/`) | grep | inline shell w application.test.ts (analog do "no rogue `new DrizzleX()`") | Wave 0 (new assertion) |
| AR-03 (resultToResponse used) | `rg "switch \\(result\\.error\\.kind\\)" apps/api/src/interfaces` returns 0 (already 0; refactor must keep 0); `rg "if \\(!result\\.ok\\)" apps/api/src/interfaces/http` significantly reduced (manual check) | grep | inline test | Wave 0 |
| AR-04 (scaffolding files exist + compile) | `bun test apps/api/src/domain/shared/__tests__/aggregate-root.test.ts` | unit | `bun test apps/api/src/domain/shared` | Wave 0 (new tests for AggregateRoot.raise/pullDomainEvents and InProcessEventBus) |
| AR-05 (`GameDeleted` flow) | `Game.delete()` raises event; use-case publishes after commit; handler calls `coverStorage.delete(url)` | integration | `bun test apps/api/src/application/__tests__/event-flow.test.ts -t "GameDeleted"` | Wave 0 (new file) |
| AR-06 (`GameMetadataApplied` flow) | `Game.applyMetadata` raises event; use-case publishes after commit; handler logs with `eventName: 'game.metadata.applied'` | integration | `bun test apps/api/src/application/__tests__/event-flow.test.ts -t "GameMetadataApplied"` | Wave 0 (new file) |
| AR-07 (per-user IDOR preserved) | `games.idor.test.ts` zielony | integration | `bun test apps/api/src/interfaces/http/games/__tests__/games-idor.test.ts` | EXISTS (move only) |
| AR-07 (full suite green) | wszystkie istniejące testy zielone | full suite | `bun test apps/api` | EXISTS |

### Sampling Rate

- **Per task commit:** `bun run lint && bun test apps/api/src/<changed-area>` (sub-second per file)
- **Per wave merge:** `bun test apps/api && bun run lint && bun run typecheck` (cały workspace API)
- **Phase gate:** Full suite green + `bun run lint` + `bun run typecheck` + frontend build clean (`bun run build -w apps/client`)

### Wave 0 Gaps (to be created BEFORE behavior changes)

- [ ] `apps/api/src/__tests__/application.test.ts` — extend od `wiring.test.ts`; new cases: "Application.start awaits migrations before serve", "migrations idempotent across re-imports of db/client.ts", "rogue `from 'routes/'` returns 0 hits".
- [ ] `apps/api/src/domain/shared/__tests__/aggregate-root.test.ts` — `raise() → pullDomainEvents()` buffer semantics; `pullDomainEvents()` clears buffer.
- [ ] `apps/api/src/infrastructure/events/__tests__/in-process-event-bus.test.ts` — subscribe + publish + publishAll + fail-fast on handler throw.
- [ ] `apps/api/src/application/__tests__/event-flow.test.ts` — end-to-end: `Game.delete()` → `eventBus.publish` → `GameDeletedCoverCleanupHandler.handle` → `coverStorage.delete(url)` with correct URL; `Game.applyMetadata` → `eventBus.publish` → `GameMetadataAppliedLogHandler.handle` → `logger.info('game.metadata.applied')`.
- [ ] `apps/api/src/__tests__/_fixtures/migrations-setup.ts` (preloaded via `bunfig.toml`) — ensures all tests boot with migrated DB even after `db/client.ts` side-effect is removed.

## 10. Risk Register

| # | Risk | Likelihood | Impact | Mitigation |
|---|------|-----------|--------|-----------|
| R1 | Deleting `db/client.ts:24-28` side-effect breaks `bun test` (no migrations runner before first INSERT) | HIGH (default) | HIGH (testy nie startują) | `bunfig.toml` `preload = ['apps/api/src/__tests__/_fixtures/migrations-setup.ts']` przed Wave 1. Verify każdy wave testy zielone. Fallback: ostatecznie zostawić side-effect z TSDoc "do not depend on this — Application.runMigrations() is the production path" — tylko jeśli option A się nie udaje pomimo prób. |
| R2 | Moving 18 route files at once produces giant diff hard to review | MEDIUM | MEDIUM (review fatigue → bugs ignored) | Wave 3 dzieli się na sub-commits per aggregate. Każdy sub-commit ≤5 plików + ich testy. `git mv` zachowuje history. |
| R3 | `Game extends AggregateRoot` z mutable `_domainEvents` łamie immutability invariant udokumentowany w CLAUDE.md ("Aggregates are immutable") | HIGH | MEDIUM (architectural inconsistency — but contained) | (a) `applyMetadata` raise'uje na NOWEJ instancji (immutability preserved at the public API level), (b) `delete()` jest jedyną metodą która muta loaded instance bo instancja idzie do garbage po use-case — TSDoc na `Game.delete()` to wyjaśnia. (c) CLAUDE.md update: dodać wzmiankę "AggregateRoot._domainEvents jest internal mutable bufer, public API agregatów pozostaje immutable". |
| R4 | Event handler exception (np. storage.delete network throw) crashuje use-case → user widzi 500 zamiast 200 mimo że DELETE się powiódł | HIGH (rzeczywista możliwość w produkcji) | HIGH (user-facing regression) | `eventBus.publishAll` w use-case **MUSI** być wrapped w try/catch — error logged ale NIE propagated do response. Cover cleanup ma cron fallback. Plan musi explicit wymagać tego patternu w `delete-game.ts` i `enrich-game-metadata.ts`. Inny rozważany wzorzec: `setImmediate(() => eventBus.publishAll(...))` — fire-and-forget; ale tracimy ordering guarantee. **Recommendation: sync try/catch z log.error + swallow.** Reference repo (electrician) re-throwuje — Apex robi inaczej bo cover cleanup ma fallback. |
| R5 | `wiring.ts` import w `application.ts` przez Wave 1-4 powoduje cyclic dependency lub double instantiation jeśli ktoś importuje `application.ts` z innego miejsca w wiring path | MEDIUM | HIGH (silent state corruption) | **Tylko `index.ts` importuje `application.ts`**. `wiring.ts` NIE importuje `application.ts`. Sprawdzane przez assertion w application.test.ts: `rg "from.*'\\./application'" apps/api/src/` zwraca tylko `index.ts` (i własne testy). Po Wave 5 `wiring.ts` znika, ryzyko eliminowane. |
| R6 | Top-level await `primeIgdbChainFromDb()` w `wiring.ts:196` nie konwertuje się trywialnie na `Application.start()` flow — przeniesienie zmienia kolejność boot'u | MEDIUM | HIGH (IGDB integration disabled at boot bo prime nie odpalił) | Wave 1 MUSI verify że `Application.start()` woła `await this.primeIgdbChainFromDb()` PO `await this.runMigrations()` ale PRZED `Bun.serve`. Smoke test: po `start()` → `igdbChainHolder.isConfigured()` zwraca `true` jeśli row w DB istnieje. Dodać do application.test.ts. |
| R7 | `coverStorage: CoverStorage \| null` (line 61) — handler `GameDeletedCoverCleanupHandler` musi obsłużyć `null` storage (env bez `UPLOADTHING_TOKEN`) | LOW (env config rzadko bez tokenu) | MEDIUM | Handler constructor takes `CoverStorage \| null`. `handle(event)`: if `storage === null` → log warning + return (cron fallback i tak nie zadziała bo on też ma `storage === null` check). |
| R8 | `bun:sqlite` `sqlite.close()` w `Application.cleanup()` jest synchroniczne — przy SHUTDOWN_DRAIN_MS timeout może zostać niezamknięte | LOW | LOW (process kończy się i tak) | Zachowaj try/catch + log z `index.ts:207-215`. Brak zmian. |
| R9 | Reference repo używa `organizationId` w wielu miejscach (`DomainEvent`, handlerach billing) — copy/paste z reference może zanieść multi-tenancy do Apex | MEDIUM (cognitive trap) | HIGH (łamie CLAUDE.md + Phase 6 invariant) | Plan każdy code snippet MUSI używać `userId` (CLAUDE.md). Reviewer (gsd-plan-checker) flaguje każde `organizationId` w plan files. Research file (ten plik) to documentuje explicit. |
| R10 | `bun test --randomize` z `bunfig.toml` preload — kolejność `_fixtures/igdb-chain-fixture.ts` snapshot/restore vs `migrations-setup.ts` preload musi się nie kolidować | LOW | MEDIUM (flaky tests w `--randomize`) | Migration setup preload to **process-level** before-all (preload runs once). IGDB fixture jest **per-file** beforeAll. Kolejność: preload zawsze pierwszy. Verify lokalnie `bun test --randomize apps/api` 3× — wszystkie zielone. |

## Sources

### Primary (HIGH confidence)

- Apex repo HEAD (execution-branch) — wszystkie pliki czytane z `/Users/kodari/projects/games/apps/api/src/` 2026-05-20
- Reference: `/Users/kodari/Developer/electrician-offer-app/server/src/app.ts` (Application class structure)
- Reference: `/Users/kodari/Developer/electrician-offer-app/server/src/domain/shared/{aggregate-root,domain-event,event-bus}.ts`
- Reference: `/Users/kodari/Developer/electrician-offer-app/server/src/infrastructure/events/in-process-event-bus.ts`
- `.planning/ROADMAP.md` Phase 7 (goal + 7 success criteria)
- `.planning/REQUIREMENTS.md` (AR-01..AR-07)
- `.planning/STATE.md` (Phase 7 evolution entry)
- `CLAUDE.md` (project constraints — per-user, named exports, kebab-case, Result over throw, no barrel)

### Secondary (MEDIUM confidence)

- Reference: `/Users/kodari/Developer/electrician-offer-app/server/src/interfaces/http/middleware/handle-domain-error.ts` — pattern adapted to `resultToResponse` (Apex zachowuje Result<>, NIE throw-based DomainError).

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Phase 5 (BE-01 migrations out of boot) jest niewykonany w produkcji w czasie Phase 7 startu — więc `Application.runMigrations()` jest pierwszą realną implementacją tego invariantu | Sekcja 3 | LOW — jeśli BE-01 wykonany wcześniej, AR-01 staje się no-op dla production path; testy nadal wymagają preload setup. |
| A2 | Reference electrician-offer-app dispatch-after-commit jest aplikowalny do Apex mimo różnic w stack (Apex użyje `bun:sqlite` zamiast pg pool, Result<> zamiast throw) | Sekcja 7 Q3 | LOW — pattern jest stack-agnostic. Risk R4 mitigation pokrywa edge case. |
| A3 | `interfaces/http/<aggregate>/<aggregate>-router.ts` naming convention (single dash, aggregate name powtórzone w pliku) jest the konwencja, nie `interfaces/http/<aggregate>/router.ts` | Sekcja 1 | LOW — AR-02 mówi explicit `games-router.ts` jako przykład. Pattern zgodny z reference repo. |
| A4 | `bunfig.toml` `preload` pole działa per-workspace (apps/api ma własny bunfig) — pozwala dodać `_fixtures/migrations-setup.ts` bez wpływu na client tests | Sekcja 3 + R10 | MEDIUM — wymaga weryfikacji przez planner; jeśli nie działa per-workspace, fallback: ręczne `await runMigrations()` w `beforeAll` w każdym test file (verbose ale działa). |

**Note:** A4 dotyczy implementacyjnego detal'u — planner powinien `bunfig.toml` przeczytać i potwierdzić `preload` semantykę przed Wave 1.

## Open Questions

1. **Czy `Application` ma być exportowany jako instance singleton (`export const application = new Application()`) czy class (`export class Application`) z `new Application().start(port)` w `index.ts`?**
   - What we know: AR-01 mówi "`index.ts` reduces to `new Application().start(port)`" → preferred class export with construction in index.
   - What's unclear: testy aplikacyjne (application.test.ts) potrzebują dostępu do internal singletonów (`igdbChainHolder` etc.) — czy przez class instance fields (`(app as any).igdbChainHolder`) czy przez side-channel singleton export?
   - Recommendation: **class export + instance constructed once w `index.ts`**; testy importują class + ręcznie konstruują testową instancję (`new Application()`) ze swoją signal-handler-free konfiguracją. Reference repo robi `new Application().start(port).catch(...)` w `server/src/index.ts`.

2. **`origin-guard.ts` middleware obecnie nie jest in wiring** (constructed inline w `index.ts:64` jako `originGuard(corsAllowlist)`). Po refactor `Application.registerMiddleware` to inline'uje. Czy zachowujemy factory `originGuard(allowlist)` czy konwertujemy do class?**
   - What we know: pattern factory + closure jest standardem w Apex (np. `requestContext()`, `idempotencyKey()`).
   - Recommendation: zachować factory — minimal change.

3. **`coverStorage` vs `cleanupOrphans` referencja w handler vs cron.**
   - Question: handler `GameDeletedCoverCleanupHandler` używa `coverStorage.delete(url)`. Cron też. Czy oba używają **tej samej instancji** `coverStorage`?
   - Recommendation: TAK — `Application` ma jeden `this.coverStorage` field, przekazywany do obu (`registerEventHandlers` + `cleanupOrphans` construction). Brak duplikacji.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — code patterns are reference-implementation level (Apex existing patterns + reference repo).
- Architecture: HIGH — every file path verified by read; every line reference checked.
- Pitfalls: HIGH — runtime state (migrations side-effect, top-level await, mutable AggregateRoot) all directly enumerated.

**Research date:** 2026-05-20
**Valid until:** 2026-06-20 (30 days; refactor surface stable, no upstream library churn expected)

## RESEARCH COMPLETE
