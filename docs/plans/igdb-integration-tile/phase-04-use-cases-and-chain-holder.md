# IGDB integration tile — Phase 4: Use cases + chain holder

## Goal
Wire the pieces together at the application layer:
1. `SaveIgdbIntegration` — validate input, verify against Twitch, encrypt
   secret, upsert in DB, swap the runtime IGDB chain.
2. `ClearIgdbIntegration` — delete the row, flush the IGDB OAuth token,
   reset the circuit breaker, swap the chain to `null`.
3. Refactor `wiring.ts` so the IGDB chain becomes swappable via a new
   `IgdbChainHolder`. On boot it reads the DB; when it's empty the chain
   is `null` and `igdbConfigured` reflects that dynamically.

## Definition of Done
- [ ] Use-case tests pass: `bun --filter @apex/api test apps/api/src/application/integrations`
- [ ] All previous tests still pass: `bun --filter @apex/api test`
- [ ] `bun --filter @apex/api run typecheck` + `bun --filter @apex/api run lint` clean
- [ ] `wiring.ts` boots cleanly with no `integration_credentials` row (chain = null,
      no warning thrown; `igdb.disabled` event is logged once)
- [ ] `wiring.ts` boots cleanly when a valid row exists (chain built from DB row)

## Context
**Runtime:** Bun. `bun --filter @apex/api ...`.
**Layering:** Application use-cases depend on domain ports only (repo,
cipher, verifier). They do NOT touch Drizzle or fetch directly.
**Transactions:** Multi-aggregate writes go through the `TransactionRunner`
port (`apps/api/src/application/shared/transaction-runner.ts`). The Clear
use-case deletes both `integration_credentials` and `igdb_oauth_token`, so
it MUST run inside a transaction.

## Design decisions
- `SaveIgdbIntegration` flow:
  1. Validate input (Zod at the boundary of this use-case).
  2. Load existing creds for the user (`repo.findByUserAndKind`).
  3. Resolve the secret:
     - If input `clientSecret` is non-empty → use the new plaintext.
     - If input `clientSecret` is empty/`null` AND existing row → decrypt
       the stored secret via `cipher.decrypt`. If decrypt fails (tampered),
       return `err({ kind: 'storage_corrupt' })`.
     - If input `clientSecret` is empty AND no existing row → return
       `err({ kind: 'invalid_input', issues: [...] })`.
  4. Verify with `IgdbCredentialsVerifier.verify({ clientId, clientSecret })`.
     If err → propagate as the use-case error (`invalid_credentials`,
     `twitch_unavailable`, `network_unreachable`).
  5. Encrypt the secret via `cipher.encrypt`.
  6. Build the aggregate:
     - If existing → mutate: `replaceClientId` (if changed), `replaceSecret`
       (with the new ciphertext), `markVerified(now)`, and `.enable()` ONLY
       if the input asked for `enabled: true` OR this is the first verified
       save (existing.lastVerifiedAt was null).
     - If new → `NewIntegrationCredentials.create({...})` then `.enable()`
       (first verified save defaults to ON) then `.markVerified(now)`.
  7. `repo.save(aggregate)` (no transaction needed — single-table write).
  8. After commit: `chainHolder.swap({ clientId, clientSecret })` so the
     running chain picks up the new creds immediately. This call is
     synchronous and side-effect-free if creds match the existing chain.
  9. Return `ok({ aggregate })`.
- `ClearIgdbIntegration` flow (all in `transactionRunner.run`):
  1. `repo.withTx(tx).delete(userId, 'igdb')`.
  2. `tokenStorage.withTx(tx).clear()` — flushes the single-row `igdb_oauth_token`.
     If the existing `IgdbTokenStorage` doesn't have `clear()`, add it as
     a new method on `DrizzleIgdbTokenStorage` + the `IgdbTokenStorage` interface
     (port lives in `apps/api/src/infrastructure/igdb/igdb-token-store.ts`).
  3. After commit: `chainHolder.swap(null)` AND `breakerReset()` (the holder
     owns the breaker — see below).
- `IgdbChainHolder` shape:
  ```ts
  export interface IgdbChain {
    readonly searchGameMetadata: SearchGameMetadata;
    readonly enrichGameMetadata: EnrichGameMetadata;
  }
  export interface IgdbChainHolder {
    get(): IgdbChain | null;
    isConfigured(): boolean; // equivalent to get() !== null
    swap(creds: { clientId: string; clientSecret: string } | null): void;
  }
  ```
- The holder owns the breaker instance (so reset on `swap(null)` is real)
  and the rate limiter. Both are recreated on every `swap(non-null)` to
  guarantee clean state when the user changes accounts.
- The token store also lives behind the holder. On `swap(non-null)` a new
  `IgdbTokenStore` is constructed bound to the new credentials. On `swap(null)`
  the holder forgets the store; the next swap-non-null rebuilds it.
- The Twitch verifier in Phase 3 is a SEPARATE port. It is NOT reused inside
  the IGDB chain — the chain has its own `IgdbTokenStore` for runtime tokens.

## Relevant files (edit only these)
- `apps/api/src/application/integrations/save-igdb-integration.ts` — use case
- `apps/api/src/application/integrations/clear-igdb-integration.ts` — use case
- `apps/api/src/application/integrations/__tests__/save-igdb-integration.test.ts`
- `apps/api/src/application/integrations/__tests__/clear-igdb-integration.test.ts`
- `apps/api/src/infrastructure/igdb/igdb-chain-holder.ts` — new class extracted from `wiring.ts`
- `apps/api/src/infrastructure/igdb/igdb-token-store.ts` — ADD `clear()` to the interface
- `apps/api/src/infrastructure/igdb/drizzle-igdb-token-storage.ts` — implement `clear()` + `withTx(tx)`
- `apps/api/src/wiring.ts` — refactor (see Step 3)

## Files to read but NOT edit (input)
- All phase-1, phase-2, phase-3 outputs (cipher, repo, verifier).
- `apps/api/src/application/games/create-game.ts` — canonical use-case shape with Zod at the boundary
- `apps/api/src/application/games/enrich-game-metadata.ts` — example of a use-case that calls a transactional runner
- `apps/api/src/application/shared/transaction-runner.ts` — port shape
- `apps/api/src/infrastructure/db/drizzle-transaction-runner.ts` — impl shape
- `apps/api/src/infrastructure/igdb/circuit-breaker.ts` — `reset()` method (if missing, add one)
- `apps/api/src/wiring.ts:145-216` — current static IGDB chain composition

## Constraints
- TDD per use case: tests FIRST (RED) → impl (GREEN).
- Use-cases NEVER `throw` for business errors. Always `Result`.
- DO NOT call `fetch` from inside the use-case — the verifier port handles HTTP.
- DO NOT touch DB directly from the use-case — always through the repo port.
- The chain holder is the ONLY thing in `wiring.ts` that knows how to
  construct an IGDB chain. The old `buildSearchGameMetadata` function moves
  into the holder (or a helper next to it).
- `enabled = true` is auto-set ONLY on the FIRST verified save. On subsequent
  saves, the use-case respects the `enabled` field from the input.
- After a chain swap to `null`, any in-flight request that already captured
  the old chain reference will finish using it. This is acceptable — those
  requests resolve with the old creds, and the next request sees `null`.
- DO NOT add backwards-compatibility shims for the old static
  `searchGameMetadata` export — change every importer to read from the holder.

## Steps

### Step 1: IgdbChainHolder + extract chain construction (no behavior change)
**Files:**
- `apps/api/src/infrastructure/igdb/igdb-chain-holder.ts` — new
- `apps/api/src/wiring.ts` — refactor only

In the holder, build a class:
```ts
export class IgdbChainHolder {
  private chain: IgdbChain | null = null;
  private breaker: CircuitBreaker | null = null;
  private tokenStore: IgdbTokenStore | null = null;
  constructor(
    private readonly deps: {
      logger: Logger;
      tokenStorage: IgdbTokenStorage;
      metadataCacheRepository: MetadataCacheRepository;
      gameRepository: GameRepository;
      transactionRunner: TransactionRunner;
      isCoverHostAllowed: (host: string) => boolean;
      timeoutMs: number;
      cacheTtlDays: number;
    },
  ) {}

  swap(creds: { clientId: string; clientSecret: string } | null): void { /* build/teardown chain */ }
  get(): IgdbChain | null { return this.chain; }
  isConfigured(): boolean { return this.chain !== null; }
}
```
Move the body of the existing `buildSearchGameMetadata` function into a
private method on the holder, parameterizing on `deps`.

In `wiring.ts`:
- Construct one `IgdbChainHolder`.
- On boot, read the DB once (using the Drizzle repo) and call
  `holder.swap(...)` with the decrypted creds if a row exists.
- Replace exports:
  - DELETE `export const searchGameMetadata`, `export const enrichGameMetadata`,
    `export const igdbConfigured`.
  - EXPORT `export const igdbChainHolder = holder`.
- Update all import sites (`routes/games-metadata.ts`, `routes/games.ts`,
  and any other file that imported `searchGameMetadata` / `enrichGameMetadata` /
  `igdbConfigured`) to call `igdbChainHolder.get()?.searchGameMetadata`
  (etc.) at request time. Use `?? null` to keep the existing 503 logic.
- Search the repo: `grep -rn "searchGameMetadata\|enrichGameMetadata\|igdbConfigured" apps/api/src apps/client/src`
  and update every hit on the api side. Don't touch the client side yet —
  the client status query still works against `/api/games/metadata/status`,
  which we'll update at the route level.

Run `bun --filter @apex/api test` — everything must still pass. The static
`igdbConfigured` test path is now exercised through the holder; existing
behavior (chain present when both creds set in DB; null otherwise) is preserved.

### Step 2: SaveIgdbIntegration use case + tests
**Files:**
- `apps/api/src/application/integrations/save-igdb-integration.ts`
- `apps/api/src/application/integrations/__tests__/save-igdb-integration.test.ts`

**Test scaffolding** (fakes, in-memory):
- `FakeIntegrationCredentialsRepository` — Map keyed by `${userId}:${kind}`.
- `FakeIntegrationCipher` — `encrypt(x) = 'enc:' + x`, `decrypt('enc:' + x) = ok(x)`,
  decrypt of anything else = `err({ kind: 'tampered' })`.
- `FakeVerifier` — programmable: returns whatever the test instructs.
- `FakeChainHolder` — captures `.swap()` calls in a public array.
- `fixedClock = () => new Date('2025-01-01T00:00:00.000Z')`.

**Test cases:**
- `first save with valid input + verifier OK → stores aggregate, enabled=true,
  lastVerifiedAt=now, holder.swap called once with the plaintext creds`
- `second save: clientSecret omitted, existing row → decrypts stored ciphertext
  for verifier, verifier OK → ciphertext unchanged, lastVerifiedAt bumped`
- `second save: clientSecret omitted, NO existing row → err({ kind: 'invalid_input' })`
- `verifier returns invalid_credentials → no DB write, no chain swap, err propagates`
- `verifier returns twitch_unavailable → err propagates, no DB write, no swap`
- `verifier returns network_unreachable → err propagates`
- `existing row, decrypt fails → err({ kind: 'storage_corrupt' })`
- `input clientId trimmed of whitespace before validation`
- `input enabled=false on a non-first save → aggregate stored with enabled=false,
  holder.swap STILL called with the new creds (so the chain reflects current
  state — but the route layer can choose not to call swap on disabled; OR
  swap is still called and the holder is responsible for honoring `enabled`.
  See note below.)`

**Note on `enabled === false`:** The chain holder doesn't know about `enabled`.
The use-case decides: if the input wants enabled=false, the use-case calls
`holder.swap(null)` (chain off), even though the row remains in DB. This way
`/api/games/metadata/status` reflects the actual chain state.

**Use-case signature:**
```ts
export type SaveIgdbIntegrationInput = {
  clientId: string;
  clientSecret: string | null; // null/'' means "keep existing"
  enabled: boolean;
};

export type SaveIgdbIntegrationError =
  | { kind: 'invalid_input'; issues: ZodIssue[] }
  | { kind: 'invalid_credentials'; reason: 'client_id' | 'client_secret' | 'unknown' }
  | { kind: 'twitch_unavailable'; status: number }
  | { kind: 'network_unreachable'; reason: 'timeout' | 'fetch_failed' }
  | { kind: 'storage_corrupt' };

export class SaveIgdbIntegration {
  constructor(deps: { repo, cipher, verifier, chainHolder, now: () => Date, uuid: () => string }) {}
  async execute(input: SaveIgdbIntegrationInput, userId: string): Promise<Result<{ creds: IntegrationCredentials }, SaveIgdbIntegrationError>> {}
}
```

Implement until tests are green.

### Step 3: ClearIgdbIntegration use case + tests
**Files:**
- `apps/api/src/application/integrations/clear-igdb-integration.ts`
- `apps/api/src/application/integrations/__tests__/clear-igdb-integration.test.ts`

Add `clear()` to the `IgdbTokenStorage` interface in
`apps/api/src/infrastructure/igdb/igdb-token-store.ts` and implement it in
`DrizzleIgdbTokenStorage` (`DELETE FROM igdb_oauth_token`). Also add a
`withTx(tx)` method to the storage if it doesn't already have one (it
needs to participate in the transaction).

If `CircuitBreaker` lacks a `reset()` method, add it (set internal state
back to `'closed'`, zero counters). Tests for that live alongside the
existing breaker tests.

The chain holder gets a small addition: on `swap(null)`, it also calls
its internal breaker's `reset()` before discarding it. Document this in
the holder's class TSDoc.

**Use-case shape:**
```ts
export class ClearIgdbIntegration {
  constructor(deps: { repo, tokenStorage, chainHolder, transactionRunner }) {}
  async execute(userId: string): Promise<Result<void, never>> {
    await this.deps.transactionRunner.run(async (tx) => {
      await this.deps.repo.withTx(tx).delete(userId, 'igdb');
      await this.deps.tokenStorage.withTx(tx).clear();
    });
    this.deps.chainHolder.swap(null);
    return ok(undefined);
  }
}
```
(`Result<void, never>` because there's no business failure mode — if the
DB throws, it's an infrastructure failure that propagates as an exception.)

**Tests:** Use fakes again.
- `clear with no existing row → no error, holder.swap(null) called`
- `clear with existing row + existing token → both deleted in transaction,
  holder.swap(null) called`
- `if repo.delete throws → transaction rolls back, token NOT deleted, holder.swap NOT called`
  (verify by inspecting fake state after the call rejects)
- `holder.swap(null) is called AFTER the transaction commits (test by ordering
  observation of fake calls — store a synthetic timestamp on each fake call)`

Implement until green.

Re-run the full suite: `bun --filter @apex/api test`. Everything green.

## If you get stuck
If wiring.ts becomes hard to refactor cleanly (circular imports, repo
needed before db is initialized, etc.) STOP and write:
```
STUCK at Step <N>: <what failed, what error, what hypothesis>
```
Do not paper over a circular import with a dynamic `import()`. The fix is
usually to move construction into a function that's called once after all
singletons are declared.
