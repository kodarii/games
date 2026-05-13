# IGDB integration tile — Phase 2: Domain aggregate + repository

## Goal
Model `IntegrationCredentials` as a DDD aggregate with `ClientId` and
`ClientSecret` value objects, define the repository port in `domain/`, and
implement a Drizzle adapter in `infrastructure/`. Per-user IDOR scoping
is enforced at the adapter level. No HTTP layer yet.

## Definition of Done
- [ ] Domain tests pass: `bun --filter @apex/api test apps/api/src/domain/integrations`
- [ ] Repository tests pass: `bun --filter @apex/api test apps/api/src/infrastructure/integrations/__tests__/drizzle-integration-credentials-repository.test.ts`
- [ ] All existing API tests still pass: `bun --filter @apex/api test`
- [ ] `bun --filter @apex/api run typecheck` clean, `bun --filter @apex/api run lint` clean

## Context
**Runtime:** Bun. Always `bun --filter @apex/api ...`.
**Architecture:** DDD vertical slice. The domain layer is pure TypeScript —
no Drizzle, no Hono, no Zod. The repository INTERFACE lives in `domain/`;
the Drizzle IMPLEMENTATION lives in `infrastructure/`.
**Error handling:** `Result<T, E>` from `apps/api/src/domain/shared/result.ts`.
Business errors are returned, never thrown. The one exception (per project
convention) is `OptimisticLockError`, but this aggregate does NOT need
optimistic locking — single-user, low contention.

## Design decisions
- Aggregate root: `IntegrationCredentials`. Private constructor. Two factories:
  - `IntegrationCredentials.fromPersistence(row)` — trusted hydration from DB.
  - `NewIntegrationCredentials.create(props)` — validating construction.
- Value objects:
  - `ClientId` — non-empty trimmed string, max 128 chars (Twitch IDs are ~30,
    keep headroom). `create(raw): Result<ClientId, ...>` + `fromTrusted(raw)`.
    Expose raw via `.value`.
  - `ClientSecret` — non-empty trimmed string, max 128 chars. Same shape.
- The aggregate stores `clientSecretCiphertext: string` (already encrypted).
  Encryption happens in the use-case layer using `IntegrationCipher`. The
  domain never holds the plaintext secret.
- Aggregate is IMMUTABLE. Mutating helpers (`enable()`, `disable()`,
  `replaceSecret(newCipher)`, `markVerified(at)`) return a fresh instance.
- `integration` field is currently always `'igdb'`, modeled as a string so
  the table can host more integrations later without a migration. The domain
  exposes a `type IntegrationKind = 'igdb'` and validates at the boundary.
- Repository port returns the aggregate (or `null` for absence). The adapter
  maps DB rows ↔ aggregate via the trusted factories.
- IDOR safety is structural: EVERY repo method takes `userId` and includes
  `eq(integrationCredentials.userId, userId)` in the WHERE clause. There is
  no method that returns "all rows" — only per-user queries exist.

## Relevant files (edit only these)
- `apps/api/src/domain/integrations/integration-credentials.ts` — aggregate
- `apps/api/src/domain/integrations/new-integration-credentials.ts` — validating factory + props type
- `apps/api/src/domain/integrations/integration-value-objects.ts` — `ClientId`, `ClientSecret`, error types, `IntegrationKind`
- `apps/api/src/domain/integrations/integration-credentials-repository.ts` — port
- `apps/api/src/domain/integrations/__tests__/integration-credentials.test.ts` — aggregate tests
- `apps/api/src/domain/integrations/__tests__/integration-value-objects.test.ts` — VO tests
- `apps/api/src/infrastructure/integrations/drizzle-integration-credentials-repository.ts` — adapter
- `apps/api/src/infrastructure/integrations/__tests__/drizzle-integration-credentials-repository.test.ts` — adapter tests

## Files to read but NOT edit
- `apps/api/src/domain/games/game.ts` — canonical aggregate shape (private ctor + factories)
- `apps/api/src/domain/games/new-game.ts` — canonical `Newxxx.create` pattern
- `apps/api/src/domain/games/game-value-objects.ts` — canonical VO style (`create` + `fromTrusted`)
- `apps/api/src/domain/games/game-repository.ts` — canonical port shape
- `apps/api/src/infrastructure/games/drizzle-game-repository.ts` — canonical adapter style (per-user scoping, `withTx`)
- `apps/api/src/domain/shared/result.ts` — `Result`, `ok`, `err`
- `apps/api/src/infrastructure/db/schema.ts` — `integrationCredentials` table from Phase 1
- `apps/api/src/infrastructure/db/client.ts` — test DB setup pattern (see how existing tests get a fresh sqlite)

## Constraints
- TDD: VO tests + aggregate tests FIRST (RED), then implement.
- DOMAIN LAYER NEVER imports Drizzle, Zod, Hono, or anything from
  `infrastructure/`. The TypeScript compiler will catch this; do not bypass it.
- All factory methods that validate return `Result<T, ValidationError>`.
  `fromPersistence` / `fromTrusted` are PURE constructors — no validation,
  trust the caller (the adapter).
- Repository methods are `async`. Throws are reserved for genuine
  infrastructure failures (network, malformed DB row). DO NOT throw for
  "row not found" — return `null`.
- The adapter must support transactional binding via `withTx(tx)` — return
  a new repo instance whose internal DB handle is the supplied transaction.
  Mirror exactly the pattern from `drizzle-game-repository.ts`.
- `clientId.value` is the raw string. Never store a `ClientId` instance in
  the DB row — always project to its `.value`.
- Tests must not hit the real network or rely on shared state. Use a fresh
  in-memory sqlite per test (`new Database(':memory:')` then run migrations
  via the `migrate()` helper — copy the pattern from existing repo tests).
- Follow Biome formatting + named exports only.

## Steps

### Step 1: Value objects + tests (RED → GREEN)
**Files:**
- `apps/api/src/domain/integrations/integration-value-objects.ts`
- `apps/api/src/domain/integrations/__tests__/integration-value-objects.test.ts`

In the VO test, write these cases for BOTH `ClientId` and `ClientSecret`:
- `create('')` → `err({ kind: 'invalid_<name>'; reason: 'empty' })`
- `create('   ')` → trims, then errors as empty
- `create('a'.repeat(129))` → `err({ kind: 'invalid_<name>'; reason: 'too_long' })`
- `create('valid-value')` → `ok(...)`, `.value === 'valid-value'`
- `fromTrusted('whatever')` → constructs without validation

Then implement the VOs. Both use the same shape — share a small helper
inside the module if it stays internal. Each VO has its OWN error kind
(`invalid_client_id` vs `invalid_client_secret`) so use-case error unions
stay unambiguous.

Also export `type IntegrationKind = 'igdb'`. Reserve it for later use.

Run the test → GREEN.

### Step 2: Aggregate + factory + tests (RED → GREEN)
**Files:**
- `apps/api/src/domain/integrations/integration-credentials.ts`
- `apps/api/src/domain/integrations/new-integration-credentials.ts`
- `apps/api/src/domain/integrations/__tests__/integration-credentials.test.ts`

**Aggregate shape:**
```ts
export class IntegrationCredentials {
  private constructor(
    readonly id: string,
    readonly userId: string,
    readonly integration: IntegrationKind,
    readonly enabled: boolean,
    readonly clientId: ClientId,
    readonly clientSecretCiphertext: string,
    readonly lastVerifiedAt: Date | null,
    readonly createdAt: Date,
    readonly updatedAt: Date,
  ) {}

  static fromPersistence(row: {
    id: string;
    userId: string;
    integration: IntegrationKind;
    enabled: boolean;
    clientId: string;
    clientSecretCiphertext: string;
    lastVerifiedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
  }): IntegrationCredentials { /* uses fromTrusted on the VO */ }

  enable(): IntegrationCredentials { /* returns fresh instance with enabled=true, updatedAt=new Date() */ }
  disable(): IntegrationCredentials { /* same with enabled=false */ }
  replaceSecret(newCiphertext: string): IntegrationCredentials { /* secret + updatedAt */ }
  replaceClientId(newClientId: ClientId): IntegrationCredentials { /* clientId + updatedAt */ }
  markVerified(at: Date): IntegrationCredentials { /* lastVerifiedAt + updatedAt */ }
}
```

`new-integration-credentials.ts` exports:
```ts
export interface NewIntegrationCredentialsProps {
  id: string;          // caller-generated UUID
  userId: string;
  integration: IntegrationKind;
  clientId: string;    // raw, will be validated
  clientSecretCiphertext: string; // already encrypted by caller
  now: Date;           // injected clock
}

export const NewIntegrationCredentials = {
  create(props: NewIntegrationCredentialsProps): Result<IntegrationCredentials, ClientIdError>
};
```
The factory sets `enabled = false`, `lastVerifiedAt = null`, `createdAt = updatedAt = now`.
`enabled` flips to true via `.enable()` in the use-case AFTER Twitch verification.

**Tests (in `integration-credentials.test.ts`):**
- `NewIntegrationCredentials.create` with valid props → `ok`, `enabled === false`,
  `lastVerifiedAt === null`, `createdAt === updatedAt === now`
- `.create` with empty `clientId` → `err({ kind: 'invalid_client_id' })`
- `.enable()` returns a fresh instance with `enabled: true` and a NEW `updatedAt`
  (assert reference inequality with the original — the aggregate is immutable)
- `.disable()` mirror of enable
- `.markVerified(at)` sets `lastVerifiedAt: at` and bumps `updatedAt`
- `.replaceSecret('newCiphertext')` swaps the ciphertext, bumps `updatedAt`,
  keeps everything else
- `.replaceClientId(ClientId.fromTrusted('new'))` swaps the client id, bumps `updatedAt`
- `fromPersistence` round-trips: build from a row, project back to row-shape
  fields, assert equality

Then implement the aggregate and the factory until tests pass.

### Step 3: Repository port + Drizzle adapter + tests
**Files:**
- `apps/api/src/domain/integrations/integration-credentials-repository.ts`
- `apps/api/src/infrastructure/integrations/drizzle-integration-credentials-repository.ts`
- `apps/api/src/infrastructure/integrations/__tests__/drizzle-integration-credentials-repository.test.ts`

**Port:**
```ts
export interface IntegrationCredentialsRepository {
  findByUserAndKind(userId: string, kind: IntegrationKind): Promise<IntegrationCredentials | null>;
  save(creds: IntegrationCredentials): Promise<void>; // INSERT OR REPLACE on (user_id, integration)
  delete(userId: string, kind: IntegrationKind): Promise<void>;
  withTx(tx: unknown): IntegrationCredentialsRepository;
}
```

**Adapter:** Mirror `DrizzleGameRepository`. Key points:
- Constructor takes a Drizzle DB handle (default = the module-level `db`).
- `withTx(tx)` returns a new instance bound to `tx as BunSQLiteDatabase`.
- All queries include `eq(integrationCredentials.userId, userId)`.
- `save` performs an upsert keyed on `(user_id, integration)` — use
  Drizzle's `.onConflictDoUpdate({ target: [...userId, integration], set: { ... } })`.
- Map Date ↔ unix ms manually if the schema uses raw `integer` (look at
  how `idempotencyKeys` and `games` handle this — there's a convention).

**Tests:** Use a fresh in-memory sqlite per test. Copy the bootstrap from
the closest existing repo test (`apps/api/src/infrastructure/games/__tests__/...`
or a `routes/games.idor.test.ts` if that's where it lives — read it first).

Cases:
- `save` then `findByUserAndKind(sameUser, 'igdb')` → returns the same aggregate
- `findByUserAndKind` with no row → returns `null`
- `findByUserAndKind(otherUser, 'igdb')` after saving for user A → returns `null`
  (IDOR isolation)
- `save` twice with the same `(user, kind)` but different client_id → second
  save overwrites the first
- `delete(user, 'igdb')` then `findByUserAndKind` → `null`
- `delete(otherUser, 'igdb')` does NOT affect user A's row (IDOR isolation)

Run all tests → GREEN.

## If you get stuck
If after 2 attempts a test fails or the upsert behavior is unclear, STOP and write:
```
STUCK at Step <N>: <what failed, what error, what hypothesis>
```
Do not invent a new error type, do not change the port signature, do not
introduce optimistic locking. Wait for human review.
