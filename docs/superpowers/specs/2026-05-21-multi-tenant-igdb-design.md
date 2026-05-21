# Multi-tenant IGDB — design

**Status:** approved (brainstorming)
**Date:** 2026-05-21
**Scope:** `apps/api/` — domain/integrations, application/integrations, infrastructure/igdb, infrastructure/integrations, schema, routes/games-metadata, routes/games, app.ts.

## Problem

Schema and the `IntegrationCredentials` aggregate are already per-user, but the IGDB runtime is single-tenant in three places:

1. `IgdbChainHolder` holds **one** global `chain` + breaker. `swap()` overwrites it — user B configuring IGDB destroys user A's chain.
2. `igdb_oauth_token` is a `SINGLETON_ID=1` row. The cached Twitch app-access token is bound to one `(clientId, clientSecret)`. Multiple users with different IGDB apps overwrite each other.
3. `Application.firstUserIdOrNull()` at startup literally takes the first user from `auth.user`. The whole bootstrap is single-tenant.

Comment in `domain/integrations/integration-token-storage.ts` already flags this as breaking work waiting to happen.

## Goal

Bring-your-own-key IGDB per user. Each authenticated user provides their own IGDB credentials in `POST /api/integrations/igdb` and their requests to `api.igdb.com` go out under their own `clientId` with their own Twitch token. Users are isolated for credentials, tokens, and rate-limit budget. IGDB API health is observed once globally.

Non-goal: multi-provider abstraction (Steam/RAWG). The generic `integration_oauth_token` table makes it easier later, but we do not add adapter scaffolding for them now.

## Design decisions (locked)

| Decision | Choice |
|---|---|
| Tenancy model | BYOK per user (each user owns creds + chain) |
| Runtime chain shape | Per-request build via `IgdbChainFactory` |
| Stateful sub-component scopes | Breaker global; rate limiter, token store per user; chain per request |
| Token cache schema | `integration_oauth_token` with PK = `(user_id, integration)`, drop legacy `igdb_oauth_token` row |
| `EnrichGameMetadata` placement | Singleton, not inside per-user chain (it never calls IGDB; only reads `metadata_cache`) |
| `PATCH /:externalId/metadata` gate | P1 — per-user IGDB-enabled gate at the route layer |
| Cache `metadata_cache` | Stays global (vendor-neutral key `(provider, cacheKey)`, candidates are provider data not user data) |
| Eviction in resource cache | None (no TTL/LRU). YAGNI for hobby scale. Note in code. |

### Rationale: why scope-correct, not "per-user everything"

CircuitBreaker protects `api.igdb.com` — a *service*, not credentials. With N users you do not want N independent breakers each having to rediscover that IGDB is down; one global breaker observes failures across all users and trips faster. RateLimiter and `inflightRefresh` lock, however, are bound to a single `clientId`/credentials set, so they belong per user. Putting everything per-user is symmetric but wrong; putting everything per-request silently disables protections.

## Architecture

```
                    ┌────────────────────────────┐
                    │ IgdbApiBreaker  (singleton)│  ← protects api.igdb.com
                    └─────────────┬──────────────┘
                                  │ injected globally
                                  ▼
  ┌───────────────────────────────────────────────────────┐
  │ IgdbChainFactory.buildFor(userId): IgdbChain | null   │  ← per-request
  └─────────────┬─────────────────────────────────────────┘
                │ asks
                ▼
  ┌───────────────────────────────────────────────────────┐
  │ IgdbPerUserResources.get(userId)                      │  ← lazy cache
  │   → { clientId, tokenStore, rateLimiter }              │
  │   build = credsRepo + cipher + new IgdbTokenStore +    │
  │            new TokenBucketRateLimiter                  │
  └───────────────────────────────────────────────────────┘
```

| Component | Scope | Lifecycle |
|---|---|---|
| `IgdbApiBreaker` | global | process |
| `IgdbPerUserResources` map | per user | invalidated by Save/Clear |
| `IgdbChain` | per request | discarded after request |
| `EnrichGameMetadata` | global (stateless) | process — **not in per-user chain** |
| `SearchGameMetadata` | per user (holds per-user `httpClient` via `CachingGameMetadataProvider`) | per request |
| `MetadataCacheRepository` | global (vendor-neutral) | process |

`IgdbChain` narrows to `{ searchGameMetadata: SearchGameMetadata }`. `EnrichGameMetadata` is built once in `app.ts` and injected directly into the games router.

## Domain layer changes

### `IntegrationTokenStorage` port — gains `(userId, kind)`

```ts
export interface IntegrationTokenStorage {
  read(userId: string, kind: IntegrationKind): Promise<StoredIntegrationToken | null>;
  write(userId: string, kind: IntegrationKind, record: StoredIntegrationToken): Promise<void>;
  clear(userId: string, kind: IntegrationKind): Promise<void>;
  withTx(tx: unknown): IntegrationTokenStorage;
}
```

Two arguments, not a context object. `(userId, kind)` is the row PK — the contract states that without both you cannot find the row. Drizzle-typed `IntegrationKind` enum catches argument ordering mistakes at compile time.

Delete the `BREAKING-CHANGE WATCH` TSDoc comment — it becomes reality.

### What does NOT change in domain

- `IntegrationCredentials` aggregate (already carries `userId`)
- `IntegrationCredentialsRepository` (already `findByUserAndKind`)
- `IntegrationCipher`, `IgdbCredentialsVerifier`, value objects, `NewIntegrationCredentials`

## Infrastructure layer changes

### Schema + migration

New table in `infrastructure/db/schema.ts`:

```ts
export const integrationOauthToken = sqliteTable('integration_oauth_token', {
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  integration: text('integration').notNull(), // 'igdb' | future providers
  accessToken: text('access_token').notNull(),
  expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
  obtainedAt: integer('obtained_at', { mode: 'timestamp' }).notNull(),
}, (t) => ({
  pk: primaryKey({ columns: [t.userId, t.integration] }),
}));
```

Migration `drizzle/00XX_multi_tenant_igdb_token.sql`:

```sql
DROP TABLE igdb_oauth_token;
CREATE TABLE integration_oauth_token (...);
```

Existing `id=1` row is discarded. First per-user request after deploy triggers a fresh Twitch refresh (~200–800ms), acceptable.

### Generic Drizzle adapter — replaces `DrizzleIgdbTokenStorage`

`infrastructure/integrations/drizzle-integration-oauth-token-storage.ts`. Implements the new `IntegrationTokenStorage` port verbatim against `integration_oauth_token`, with `withTx(tx)` returning a transaction-bound instance. `onConflictDoUpdate` keyed on `(user_id, integration)` for write.

`DrizzleIgdbTokenStorage` deleted. Lifted to `infrastructure/integrations/` alongside cipher and credentials repo — semantically belongs with "integration-generic" not "igdb-specific".

### `IgdbTokenStore` — minor change

Constructor gains `userId`. Internal calls become `storage.read(this.userId, 'igdb')` / `write(...)` / `clear(...)`. `inflightRefresh`, `REFRESH_GRACE_MS`, Twitch fetch logic unchanged.

### `IgdbApiBreaker` factory

`infrastructure/igdb/igdb-api-breaker.ts` exports `createIgdbApiBreaker(logger)` returning a `CircuitBreaker` configured for `api.igdb.com`. `CircuitBreaker` class itself unchanged. One instance per process, lifetime = process.

### `IgdbPerUserResources` — new

`infrastructure/igdb/igdb-per-user-resources.ts`:

```ts
interface IgdbUserResources {
  readonly clientId: string;
  readonly tokenStore: IgdbTokenStore;
  readonly rateLimiter: TokenBucketRateLimiter;
}

export class IgdbPerUserResources {
  private readonly cache = new Map<string, IgdbUserResources>();

  constructor(
    private readonly credsRepo: IntegrationCredentialsRepository,
    private readonly cipher: IntegrationCipher,
    private readonly tokenStorage: IntegrationTokenStorage,
    private readonly logger: Logger,
  ) {}

  async get(userId: string): Promise<IgdbUserResources | null> { /* lazy load */ }
  invalidate(userId: string): void { this.cache.delete(userId); }
}
```

Behaviour:
- Cold cache → `findByUserAndKind(userId, 'igdb')` + decrypt + build resources, write into map.
- `row === null` or `!row.enabled` → `null` (and nothing cached).
- Decrypt failure → `null` + log event `igdb.resources.decrypt_failed`.
- Concurrent first-builds for same userId may race; last write wins, no corruption. Documented in TSDoc.

### `IgdbChainFactory` — replaces `IgdbChainHolder`

`infrastructure/igdb/igdb-chain-factory.ts`. Methods:

```ts
async buildFor(userId: string): Promise<IgdbChain | null>
async isConfiguredFor(userId: string): Promise<boolean>
```

`buildFor` consults resources, assembles `IgdbHttpClient` + `CachingGameMetadataProvider` + `SearchGameMetadata` using the global breaker. Returns `null` when resources unavailable. `isConfiguredFor` is `resources.get(userId) !== null`.

### Deletions

- `infrastructure/igdb/igdb-chain-holder.ts` (entire file)
- `infrastructure/igdb/drizzle-igdb-token-storage.ts`
- `apps/api/src/__tests__/_fixtures/igdb-chain-fixture.ts` (replaced — see Testing)
- Legacy `igdb_oauth_token` table

## Application layer changes

### `SaveIgdbIntegration`

- Replace `chainHolder: IgdbChainSwapper` dep with `resourceCache: IgdbResourceCacheInvalidator { invalidate(userId): void }`.
- After `repo.save`, call `resourceCache.invalidate(userId)` unconditionally. Drop the `effectiveEnabled ? swap(creds) : swap(null)` branch — next request rebuilds based on the freshly persisted `row.enabled`.

### `ClearIgdbIntegration`

- Replace `chainHolder` dep with `resourceCache: IgdbResourceCacheInvalidator`.
- `txStorage.clear()` → `txStorage.clear(userId, IGDB_KIND)`.
- After commit, `resourceCache.invalidate(userId)`.

### Unchanged use cases

`GetIgdbIntegrationStatus`, `SearchGameMetadata`, `EnrichGameMetadata` — class internals unchanged. Only their wiring (where they are instantiated) changes.

## Routes changes

### `routes/games-metadata.ts`

`chainHolder` dep → `chainFactory`. Both handlers become per-user:

- `GET /status` → `{ igdbConfigured: await chainFactory.isConfiguredFor(userId) }`. This **changes behaviour**: previously global, now per-user (correct).
- `GET /candidates` → `await chainFactory.buildFor(userId)`; null → 503; otherwise `chain.searchGameMetadata.execute(...)`.

### `routes/games.ts` — `PATCH /:externalId/metadata`

Gate switches to per-user. Receives `igdbChainFactory` + injected `enrichGameMetadata` singleton:

```ts
if (!(await deps.igdbChainFactory.isConfiguredFor(userId))) {
  return c.json(featureDisabledProblem('...'), 503);
}
const result = await deps.enrichGameMetadata.execute(externalId, body, userId);
```

`createGamesMetadataRouter` is mounted with `{ chainFactory: deps.igdbChainFactory }`.

### `routes/integrations.ts`

No handler changes. Use cases' `.execute()` signature unchanged.

## `app.ts` wiring

### Deletions

- `Application.prime()` method
- `Application.firstUserIdOrNull()` method
- `prime` call in `start()` + its `igdb.prime.failed` try/catch
- `IgdbChainHolder` import + field
- `igdbHolderForTesting()` getter

### `buildIgdbStack()` — new shape

```ts
private buildIgdbStack(): IgdbStack {
  const metadataCacheRepository = new MetadataCacheRepository();
  const integrationCipher = new Aes256GcmCipher();
  const credentialsRepo = new DrizzleIntegrationCredentialsRepository();
  const tokenStorage = new DrizzleIntegrationOauthTokenStorage();

  const breaker = createIgdbApiBreaker(baseLogger);
  const resources = new IgdbPerUserResources(
    credentialsRepo, integrationCipher, tokenStorage, baseLogger,
  );
  const chainFactory = new IgdbChainFactory(
    resources, breaker, metadataCacheRepository, baseLogger,
    env.IGDB_TIMEOUT_MS, env.IGDB_CACHE_TTL_DAYS,
  );
  const enrich = new EnrichGameMetadata(
    this.persistence.gameRepository,
    this.persistence.transactionRunner,
    metadataCacheRepository,
    isCoverHostAllowed,
  );
  const verifier = new TwitchIgdbCredentialsVerifier({ fetch, timeoutMs: env.IGDB_TIMEOUT_MS, logger: baseLogger });
  const save = new SaveIgdbIntegration({
    repo: credentialsRepo, cipher: integrationCipher, verifier,
    resourceCache: resources,
    now: () => new Date(), uuid: () => crypto.randomUUID(),
  });
  const clear = new ClearIgdbIntegration({
    repo: credentialsRepo, tokenStorage,
    resourceCache: resources,
    transactionRunner: this.persistence.transactionRunner,
  });
  const getStatus = new GetIgdbIntegrationStatus(credentialsRepo);

  return Object.freeze({ chainFactory, resources, enrich, save, clear, getStatus });
}
```

`IgdbStack` interface:

```ts
interface IgdbStack {
  readonly chainFactory: IgdbChainFactory;
  readonly resources: IgdbPerUserResources;
  readonly enrich: EnrichGameMetadata;
  readonly save: SaveIgdbIntegration;
  readonly clear: ClearIgdbIntegration;
  readonly getStatus: GetIgdbIntegrationStatus;
}
```

`registerRoutes()` passes `igdbChainFactory` and `enrichGameMetadata` to `createGamesRouter` and `{ chainFactory: this.igdb.chainFactory }` to `createGamesMetadataRouter` (under the games router).

## Testing

### New tests

- **`IgdbPerUserResources` unit:** cold/warm cache, missing row → null, disabled row → null, decrypt failure → null + log, `invalidate`, isolation between users, no DB hit on warm cache.
- **`IgdbChainFactory` unit:** null when resources null; non-null returns chain whose http client carries the user's clientId; asserts the same global breaker reference is used across `buildFor('A')` and `buildFor('B')`; `isConfiguredFor` delegation.
- **`DrizzleIntegrationOauthTokenStorage` integration:** per-user isolation, upsert idempotency, `withTx` propagation, IDOR-like read with wrong userId → null.
- **Multi-tenant integration (`routes/__tests__/igdb-multi-tenant.int.test.ts`):** user A + user B each `POST /api/integrations/igdb` (verifier mocked) → two rows; A's search hits IGDB with `clientId=A`, B's with `clientId=B`; A's DELETE removes A's creds + token row atomically, B unaffected; A's subsequent `GET /candidates` → 503.

### Updated tests

- `save-igdb-integration.test.ts`: `IgdbChainSwapper` mock → `IgdbResourceCacheInvalidator` mock. Assert `invalidate(userId)` called after `repo.save`.
- `clear-igdb-integration.test.ts`: token storage `clear()` → `clear(userId, 'igdb')`; chain swap → resource invalidate; transaction handle propagation unchanged.
- `games-metadata.int.test.ts`: replace `_fixtures/igdb-chain-fixture.ts` with `_fixtures/igdb-resources-fixture.ts` exposing `__seedForTest(userId, resources)` on `IgdbPerUserResources` (same `__` test-only marker convention; CI grep updated). `/status` assertions become per-user-session.
- `integrations.int.test.ts`: assert `integration_oauth_token` row's `user_id` matches caller, not a singleton.
- `routes/games.idor.test.ts`: add per-user gating case — user without IGDB enabled hitting `PATCH /:externalId/metadata` → 503.
- `app.test.ts` / wiring tests: drop `IgdbChainHolder`, `prime`, `__setChainForTest` references. Assert no `firstUserIdOrNull` method and no `prime` call in `start()`.

### Fixture marker

`__setChainForTest` (used outside `_fixtures/` triggered a CI grep failure) → `__seedForTest`. Same convention, same CI grep, same intent.

### DB migration test

If existing schema-test infra is light, add a minimal `bun test` that boots a fresh sqlite, runs the migration, verifies `igdb_oauth_token` is gone and `integration_oauth_token` exists with correct PK. Otherwise rely on migration review + adapter integration tests that physically hit the new table.

## Logging events

- `igdb.resources.decrypt_failed` (new) — `{ userId, reason }` when cipher fails for stored creds.
- `igdb.breaker.open` / `igdb.breaker.close` (unchanged) — global breaker; no `userId` in payload because breaker is process-global.
- `igdb.prime.*` (deleted).
- `igdb.chain.cleared` / `igdb.chain.configured` (deleted) — swap is gone; lazy build / invalidate are not separate observable events.

## Out of scope

- Multi-provider adapters (Steam, RAWG). Generic table makes it cheap later.
- Per-user metadata cache isolation. `metadata_cache` stays global; candidates are provider data and may be served cross-user. Snapshot validation in `EnrichGameMetadata` already ensures clients cannot forge entries.
- TTL/LRU on `IgdbPerUserResources`. Note added in TSDoc.
- Auto-pick top candidate in a single request. Separate feature.
- Horizontal scale-out (multi-process token refresh race). Existing `single-process assumption` comment in `IgdbTokenStore` stays accurate.

## Risks and mitigations

| Risk | Mitigation |
|---|---|
| Existing `igdb_oauth_token` token thrown away on deploy → first request slow | One Twitch fetch (~200–800ms) once per user. Acceptable. |
| Resource cache grows unbounded with many users | Hobby scale (<100 users). YAGNI for LRU; revisit when it matters. |
| `__seedForTest` leaks into production code | Same CI grep guard as before, just renamed. Wiring test enforces. |
| Test inter-file isolation under shared module cache | Snapshot/restore fixture model preserved, target swapped from holder to resources cache. |
| Concurrent first-`get` for same userId double-loads from DB | Acceptable race, no corruption. Documented. |
| `PATCH /metadata` gate (P1) keeps users locked out of enrichment if they haven't connected IGDB | Intentional; preserves current UX. P2 (ungate) explicitly rejected. |
