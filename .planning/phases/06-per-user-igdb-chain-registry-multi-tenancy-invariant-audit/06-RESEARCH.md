# Phase 6: Per-user IGDB chain registry + multi-tenancy invariant audit — Research

**Researched:** 2026-05-20
**Domain:** Per-process per-user runtime registry; codebase audit for analogous global-vs-per-user bugs; documentation drift cleanup
**Confidence:** HIGH (codebase fully verified; documentation hypotheses called out explicitly)

## Summary

Phase 6 has zero unknowns at the API design level. CONTEXT.md D-01..D-20 fully constrains the registry shape, lifecycle, and call-site changes. Research confirmed every touchpoint named in CONTEXT.md is real, and there are no hidden call-sites the planner needs to discover. The standard pattern is `Map<userId, Promise<IgdbChain | null>>` with lazy hydration + single-flight; this is the well-known per-key memoizer pattern and is already partially present in the codebase (`IgdbTokenStore.inflightRefresh` at `apps/api/src/infrastructure/igdb/igdb-token-store.ts:69`).

**One newly surfaced finding the audit will need to acknowledge:** `igdb_oauth_token` table is a **singleton row with no user_id column** (`apps/api/src/infrastructure/db/schema.ts` `igdbOauthToken` definition; `apps/api/src/infrastructure/igdb/drizzle-igdb-token-storage.ts:9` `SINGLETON_ID = 1`). When two users have IGDB configured, the second user's `getValidToken()` overwrites the first user's row. This is the **same conceptual bug** as the IGDB chain holder (D-07's "same pattern" bar), one layer deeper. The planner must decide: fix in this phase (recommended — matches D-07 scope) or document in AUDIT.md and bump to a follow-up phase.

Beyond the chain registry itself, the audit (D-06) needs to enumerate four candidates plus the broader `apps/api/src/` sweep for module-level `let`/`const` carrying user-identifying state. Concrete findings below.

**Primary recommendation:** Implement `IgdbChainRegistry` as `Map<userId, Promise<IgdbChain | null>>` (single-flight via storing the Promise, not the resolved value); lazy hydration on `get(userId)`; never-evict; `invalidate(userId)` clears the slot and resets the user's breaker. Treat the `igdb_oauth_token` finding as in-scope (same-pattern fix per D-07) — the registry must own per-user token storage, not just per-user chain composition.

## User Constraints (from CONTEXT.md)

### Locked Decisions

**Registry lifecycle (Area 1)**
- **D-01:** Slot lifecycle is pure lazy + never-evict. Boot does not warm any user's chain. `Save`/`Clear` integration mutations invalidate the relevant slot via `registry.invalidate(userId)`. The first IGDB request from `userId` after invalidation (or after boot) lazily reads `integration_credentials`, decrypts the secret, builds the chain (`CircuitBreaker` + `IgdbTokenStore` + `TokenBucketRateLimiter` + `IgdbHttpClient` + `CachingGameMetadataProvider` + `SearchGameMetadata` + `EnrichGameMetadata`), and stores it in the map under `userId`. Slot survives until process restart. No LRU / TTL / size cap.
- **D-02:** Eliminate `primeIgdbChainFromDb()` and `firstUserIdOrNull()` from `apps/api/src/wiring.ts`. "First user wins" is the bug — no replacement, just deletion.
- **D-03:** `SaveIgdbIntegration` and `ClearIgdbIntegration` no longer call `chainHolder.swap(creds | null)`. They call `registry.invalidate(userId)` after the DB write commits. Next request from `userId` rebuilds (or stays empty if cleared).
- **D-04:** `registry.get(userId)` returns `IgdbChain | null`. `null` means: no `integration_credentials` row for `userId`, OR the row is disabled, OR decryption failed. The route's existing 503 path for `chain === null` is preserved verbatim — only the source of `chain` changes.
- **D-05:** Per-user breaker / token store / rate limiter are correct (each Twitch OAuth app has its own quota, so one user's bad creds opening a breaker must not block another). Sharing them across users would be the bug.

**Codebase audit (Area 2)**
- **D-06:** Produce `.planning/phases/06-.../06-AUDIT.md` listing every module-level `let`/`const` in `apps/api/src/` that touches user-scoped state, plus dedicated sweeps of: CronLock, idempotency-key middleware, mutation-rate-limit middleware, UploadThing cover storage.
- **D-07:** Fix scope is narrow: only fixes for the same pattern as the IGDB bug (a global structure silently routing one user's runtime state to another). Anything else found goes to `.planning/codebase/CONCERNS.md` with back-reference.
- **D-08:** Phase does not block on AUDIT.md being "clean". Same-pattern bug → plan; architectural debt → CONCERNS.md and ship.

**Commit grouping + rename (Area 3)**
- **D-09:** Rename `IgdbChainHolder` → `IgdbChainRegistry`. File `igdb-chain-holder.ts` → `igdb-chain-registry.ts`. ~10 imports.
- **D-10:** Single comprehensive commit: `refactor(06): per-user IGDB chain registry + multi-tenancy cleanup`. Atomic revert wins over fine-grained git history.
- **D-11:** Test fixture is rewritten, not deleted. Today snapshots one global chain via `__setChainForTest`. After Phase 6: snapshots/restores `registry.snapshotForTest(userId)` / `registry.restoreForTest(userId, snapshot)` — same identity-preservation contract.
- **D-12:** New two-user concurrency test: two users save IGDB credentials; each request reaches its own chain. The single-chain bug would have failed this.

**CLAUDE.md correction (Area 4)**
- **D-13:** Verify on the actual VPS / `deploy.yml` / `scripts/deploy.sh` how the SPA is served. If no confirmation possible from repo alone, mark the assumption explicitly in CLAUDE.md ("SPA served by nginx in front of `:3001` — verify per deploy") rather than leaving the false claim.
- **D-14:** Replace CLAUDE.md `Constraints` line `"Vite SPA serwowane statycznie"` with the verified reality from D-13.
- **D-15:** Replace `"Single-user model"` / `"the single user"` / `"the owner"` framing with `"per-user end-to-end"`. Multi-tenancy abstractions stay out of scope.
- **D-16:** Drop CLAUDE.md mentions of "organization / team" where they add noise.
- **D-17:** Reflect D-15/D-16 in PROJECT.md `Constraints`. Do not retroactively re-frame REQUIREMENTS.md historical wording.

**Backwards compatibility**
- **D-18:** No DB schema change. `integration_credentials` rows remain per-user.
- **D-19:** On deploy, the first IGDB-using request from each existing user lazily reads their row and builds their chain. No perceptible warm-up cost.
- **D-20:** Existing one-user deploy stays functional after `firstUserIdOrNull` deletion (user's first IGDB request rebuilds the chain lazily).

### Claude's Discretion

- API shape: `get(userId): Promise<IgdbChain | null>` (async — reads DB) and `invalidate(userId): void`.
- Storage: `Map<string, Promise<IgdbChain | null>>` — store the Promise, not the resolved value, so concurrent `get(userId)` calls dedupe.
- Single-flight: per-userId Promise cache.
- AUDIT.md section naming — Claude picks.
- `__setChainForTest` retention: replaced by `__snapshotForTest(userId)` / `__restoreForTest(userId, snapshot)` (rename + per-user keying).
- CLAUDE.md phrasing per D-15/D-16.

### Deferred Ideas (OUT OF SCOPE)

- **FINDINGS Section C items** — append to `.planning/codebase/CONCERNS.md` as a follow-up sweep candidate. Do not fold into Phase 6 unless the audit (D-06) surfaces them as same-pattern bugs.
- **CronLock removal** — FINDINGS B6 recommends "keep + correct comments". Phase 6 follows recommendation.
- **`primeIgdbChainFromDb` warm-up pattern** — for a future multi-instance deploy we might want eager warming. Not needed for single-VPS.
- **`__setChainForTest` → proper DI in tests** — future improvement; `bun test --randomize` constraint makes snapshot-restore necessary now.
- **PROJECT.md / REQUIREMENTS.md historical framing review** — touching only CLAUDE.md (D-17 caveat).

## Phase Requirements

The phase carries no SET/INT/SEC/FE/BE requirement IDs from REQUIREMENTS.md — this is a re-opening of v1.0 closed-out scope discovered post-Phase-5 (see `STATE.md` §"Why Phase 6 (v1.0 re-open)"). CONTEXT.md decisions D-01..D-20 ARE the de-facto requirement set; the planner translates them into per-plan `must_haves` / `truths` directly.

| ID | Description | Research Support |
|----|-------------|------------------|
| D-01 | Lazy + never-evict per-userId slot lifecycle | Standard Stack §Pattern 1 (per-key memo); Code Examples §1 |
| D-02 | Delete `primeIgdbChainFromDb` + `firstUserIdOrNull` | Code Examples §3 (wiring.ts diff sketch) |
| D-03 | `Save`/`Clear` → `registry.invalidate(userId)` post-commit | Architecture Patterns §Invalidation timing |
| D-04 | Lazy build returns `null` on missing/disabled/decrypt-fail | Code Examples §1 (build function preserves three null cases) |
| D-05 | Per-user breaker/token-store/rate-limiter (no sharing) | Don't Hand-Roll §Per-user breaker isolation |
| D-06 | AUDIT.md enumerates module-level user-scoped state | Audit Method §Concrete checklist |
| D-09 | Class + file rename | Code Examples §3 (rename diff) |
| D-11 | Per-user snapshot/restore test fixture | Code Examples §4 (rewritten fixture) |
| D-12 | Two-user concurrency identity-isolation test | Code Examples §5 (test sketch) |
| D-13 | Verify SPA serving on VPS, correct CLAUDE.md | Documentation Drift §SPA serving (verified — no static serving in repo) |
| D-15..D-17 | "Per-user end-to-end" framing replaces "single-user" | Documentation Drift §Framing replacement table |

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Per-user IGDB chain composition | API / Backend (`infrastructure/igdb/`) | — | Chain wires breaker + token store + rate limiter + HTTP client — pure server-side concern; `IgdbChainRegistry` is the composition root for per-user state |
| Slot invalidation on credential write | API / Backend (`application/integrations/`) | — | Use-case orchestration boundary; `SaveIgdbIntegration` / `ClearIgdbIntegration` already own the lifecycle hook (today calls `swap`) |
| Per-user lookup at request time | API / Backend (`routes/games-metadata.ts`, `routes/games.ts`) | — | Routes already have `c.get('user').id` from `requireAuth`; only the source of the chain changes |
| Module-level state audit | API / Backend (`apps/api/src/`) | — | Pure server-side; no frontend touchpoints |
| Comment / framing cleanup | Documentation (`CLAUDE.md`, `PROJECT.md`, inline comments) | — | Non-behavioural; lives wherever the stale text lives |

## Standard Stack

This is a refactor inside the existing stack. No new dependencies needed.

### Core (already in repo, used by the registry)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `bun` runtime | latest | Event loop + module cache | Already the runtime; single-threaded JS lets the registry skip mutex/lock primitives |
| `drizzle-orm` | ^0.45.2 | DB access in lazy hydration | Already used by `DrizzleIntegrationCredentialsRepository` |
| `hono` | ^4.6.12 | HTTP middleware/routing | Used by routes; no API change in this phase |

### Supporting (already in repo, called from inside `IgdbChain.build`)

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `zod` | ^4.3.6 | Validates Twitch OAuth response inside `IgdbTokenStore` | Already in the inner chain; no new usage |
| `bun:test` | (builtin) | Two-user concurrency test (D-12) | Existing test pattern |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `Map<string, Promise<IgdbChain \| null>>` (single-flight) | `Map<string, IgdbChain \| null>` + separate `Map<string, Promise<IgdbChain \| null>>` for in-flight | Two-map approach is more code with no benefit. Storing the Promise directly is the idiomatic single-flight memo pattern. **Use single Map of Promises.** |
| Lazy build (D-01) | Eager warm on boot | D-01 locks lazy + never-evict. No discretion. |
| Per-user breaker | Shared breaker | **Bug.** D-05 locks per-user. |
| Identity-preserving snapshot/restore for tests | Rebuild equivalent on `afterAll` | `bun test --randomize` requires identity preservation (see `igdb-chain-holder.ts:85-104` TSDoc). **Use snapshot/restore.** |

**Installation:** None — pure refactor.

**Version verification:** No new packages added. Existing versions verified against `apps/api/package.json` and Phase 5 baseline (no drift since `bun.lock` `2026-05-19`). [VERIFIED: read of apps/api/package.json + bun.lock presence]

## Architecture Patterns

### System Architecture (per-user IGDB request path, post-refactor)

```
HTTP request                            (auth middleware sets c.get('user'))
   │
   ▼
routes/games-metadata.ts  ──►  registry.get(userId)
                                   │
                                   ▼
                          IgdbChainRegistry
                          ┌──────────────────────────────────┐
                          │ chains: Map<userId, Promise<IgdbChain|null>>  │
                          │                                  │
                          │  get(userId):                    │
                          │    cached = chains.get(userId)   │
                          │    if cached: return cached      │
                          │    promise = build(userId)       │
                          │    chains.set(userId, promise)   │
                          │    return promise                │
                          │                                  │
                          │  invalidate(userId):             │
                          │    breaker?.reset()              │
                          │    chains.delete(userId)         │
                          └──────────────────────────────────┘
                                   │ on cache miss
                                   ▼
                          repo.findByUserAndKind(userId, 'igdb')
                          cipher.decrypt(row.clientSecretCiphertext)
                          new CircuitBreaker / IgdbTokenStore / RateLimiter / HttpClient
                          new SearchGameMetadata / EnrichGameMetadata
                                   │
                                   ▼
                          IgdbChain (returned to route)
                                   │ chain === null → 503
                                   │ chain !== null → chain.searchGameMetadata.execute(...)
                                   ▼
                          response
```

### Recommended Project Structure (delta vs. existing)

```
apps/api/src/
├── infrastructure/
│   └── igdb/
│       ├── igdb-chain-registry.ts   # RENAMED from igdb-chain-holder.ts; exports IgdbChainRegistry
│       ├── circuit-breaker.ts        # UNCHANGED
│       ├── igdb-token-store.ts       # UNCHANGED
│       ├── igdb-http-client.ts       # UNCHANGED
│       └── ...                       # rest UNCHANGED
├── application/
│   └── integrations/
│       ├── save-igdb-integration.ts  # IgdbChainSwapper → IgdbChainInvalidator port
│       └── clear-igdb-integration.ts # same
├── routes/
│   ├── games-metadata.ts             # chainHolder.get() → registry.get(c.get('user').id)
│   └── games.ts                      # PATCH metadata: chainHolder.get() → registry.get(userId)
├── __tests__/
│   ├── _fixtures/
│   │   └── igdb-chain-fixture.ts     # rewritten: per-userId snapshot/restore
│   └── wiring.test.ts                # grep guards updated for new symbol names
└── wiring.ts                          # primeIgdbChainFromDb + firstUserIdOrNull DELETED; igdbChainRegistry instantiated
```

### Pattern 1: Per-Key Single-Flight Memoization

**What:** A `Map<K, Promise<V>>` that stores the Promise of an async build, not the resolved value. Concurrent callers for the same `K` get the same Promise (they all `await` the one in-flight build). Once resolved, subsequent calls get the resolved value via Promise auto-memoization.

**When to use:** Cache-miss-builds-expensively-and-async patterns. Two requests for the same `userId` hitting an empty cache must NOT both run the DB read + decrypt + chain construction.

**Why this codebase already has it:** `IgdbTokenStore.inflightRefresh` at `apps/api/src/infrastructure/igdb/igdb-token-store.ts:69` uses the identical pattern for OAuth-refresh dedup. Re-using a familiar shape keeps the code legible.

**Example:**

```typescript
// Source: pattern matches apps/api/src/infrastructure/igdb/igdb-token-store.ts:96-105
private readonly chains = new Map<string, Promise<IgdbChain | null>>();

get(userId: string): Promise<IgdbChain | null> {
  const cached = this.chains.get(userId);
  if (cached !== undefined) {
    return cached;
  }
  const promise = this.build(userId);
  this.chains.set(userId, promise);
  // If build rejects, evict so the next caller retries.
  // (Avoids poisoning the cache with a permanently-rejected Promise.)
  promise.catch(() => {
    if (this.chains.get(userId) === promise) {
      this.chains.delete(userId);
    }
  });
  return promise;
}
```

[ASSUMED — but corroborated by `IgdbTokenStore.inflightRefresh` pattern at `igdb-token-store.ts:96-105`. The reject-eviction detail is a standard hardening; the planner may simplify if the lazy `build` only throws on bugs, not on expected errors. With D-04 the lazy build returns `null` (not throws) for missing/disabled/decrypt-fail, so rejection only happens on truly exceptional DB errors — eviction may be unnecessary in practice. Planner decides.]

### Pattern 2: Invalidate-Post-Commit

**What:** When a credential mutation commits successfully, evict the user's chain slot. Next request rebuilds from the new DB state.

**When to use:** Any write-through cache where the source of truth is the DB and the cache is process-local.

**Example:**

```typescript
// In SaveIgdbIntegration.execute, after `await this.deps.repo.save(aggregate)`:
this.deps.chainInvalidator.invalidate(userId);
// No conditional on enabled/disabled — lazy build re-reads DB and resolves the chain
// (null if disabled, IgdbChain if enabled). Mirror in ClearIgdbIntegration after transaction commit.
```

**Crucial semantics preserved from today (per `igdb-chain-holder.ts:54-55` TSDoc):** In-flight requests that already captured the old chain reference complete with the old chain — those resolve with the old creds. New requests see the new value. The Map-of-Promises pattern preserves this because Map writes don't retroactively change Promise references held by callers.

### Pattern 3: Lazy Hydration

**What:** On `get(userId)` cache miss: read `integration_credentials` row → decrypt → build chain → store. All inside the Promise returned to the caller.

**Example:**

```typescript
private async build(userId: string): Promise<IgdbChain | null> {
  const stored = await this.deps.integrationCredentialsRepository.findByUserAndKind(userId, 'igdb');
  if (stored === null) return null;
  if (!stored.enabled) return null;
  const decrypt = this.deps.integrationCipher.decrypt(stored.clientSecretCiphertext);
  if (!decrypt.ok) {
    this.deps.logger.event('igdb.chain.decrypt_failed', { kind: decrypt.error.kind });
    return null;
  }
  // ... CircuitBreaker / IgdbTokenStore / TokenBucketRateLimiter / IgdbHttpClient /
  // CachingGameMetadataProvider / SearchGameMetadata / EnrichGameMetadata —
  // verbatim from current IgdbChainHolder.build (apps/api/src/infrastructure/igdb/igdb-chain-holder.ts:113-163)
  // EXCEPT credentials come from {stored.clientId.value, decrypt.value}.
  return { searchGameMetadata, enrichGameMetadata };
}
```

[VERIFIED via read of `apps/api/src/infrastructure/igdb/igdb-chain-holder.ts:113-163` — `build()` body is preserved verbatim; only the source of the credentials changes from explicit param to repo-derived.]

### Anti-Patterns to Avoid

- **Storing the resolved value, not the Promise.** If `chains: Map<string, IgdbChain | null>`, then a second concurrent `get(userId)` finds an empty slot and starts a duplicate build. Bug — wastes a Twitch OAuth token mint + a DB read. **Always store the Promise.**
- **Rebuilding sub-components on snapshot restore (test fixture).** `__setChainForTest` semantics (identity-preserving): the snapshot must be the exact prior chain reference, not a freshly-built equivalent. `bun test --randomize` requires this. See TSDoc at `apps/api/src/infrastructure/igdb/igdb-chain-holder.ts:85-104`.
- **Invalidating before commit.** If `SaveIgdbIntegration` evicts the slot before `await repo.save(...)` and the save throws, the next request hydrates from the OLD DB state but goes through the build path unnecessarily. Always evict AFTER commit. (Today's `chainHolder.swap` happens after `repo.save` per `save-igdb-integration.ts:191-198` — preserve.)
- **Reading `userId` from a module-level global.** `firstUserIdOrNull()` is the canonical bug. Any new code that pulls "the user" from `db.select().from(authUser).limit(1)` is the same anti-pattern.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Single-flight per-key dedup | Manual mutex / lock | `Map<K, Promise<V>>` storing the Promise | JS single-threaded event loop makes Promise-as-lock idiomatic; already in the codebase (`IgdbTokenStore.inflightRefresh`) |
| Per-user breaker isolation | Wrapping a shared breaker in conditionals | Distinct `CircuitBreaker` per user (D-05) | Stale failure counts from one user's bad creds must NOT block another's working creds. Sharing == bug |
| Per-user OAuth token storage | Multiplexing one row with `if-user==X` checks | **Open question** — see Open Questions §1 — `igdb_oauth_token` table needs `user_id` column OR in-memory per-user token cache | Today's singleton row (`igdb-token-store.ts` + `drizzle-igdb-token-storage.ts:9 SINGLETON_ID = 1`) silently mixes tokens across users — see Open Questions §1 for full analysis |
| Identity-preserving test snapshot | Rebuilding chain equivalent in `afterAll` | `__setChainForTest` snapshot/restore (renamed `__snapshotForTest`/`__restoreForTest`) | `bun test --randomize` requires identity preservation per TSDoc |

**Key insight:** The biggest hand-roll trap in this phase is **the per-user OAuth token storage question**. The codebase already does single-flight refresh correctly inside `IgdbTokenStore`, but ABOVE that (at the storage layer) the token is keyed by `id=1`. Phase 6 must address this OR explicitly punt to a follow-up phase with the same per-user invariant rationale.

## Runtime State Inventory

This phase IS a refactor. The "what survives a code rename" question matters:

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | `igdb_oauth_token` row (singleton, id=1) holds whichever user's token was minted most recently. After Phase 6 if registry is per-user but token row stays singleton, the per-userId breaker is correct but the cached OAuth token leaks across users. | Decision required — see Open Questions §1. Either (a) add `user_id` column + migration + update token-store keying, OR (b) leave singleton + document as known limitation in CONCERNS.md, OR (c) move per-user token to in-memory only (no DB persistence) since IGDB tokens have 60-day lifetime and a process restart would just re-mint. Recommendation: (c) is the smallest scope-preserving fix. |
| Stored data | `integration_credentials` rows already per-user (`apps/api/src/infrastructure/integrations/drizzle-integration-credentials-repository.ts:46-49`) | None — verified per-user via `eq(integrationCredentials.userId, userId)` in every query [VERIFIED] |
| Stored data | `metadata_cache` is global (no `user_id` column) | None for this phase — IGDB game metadata is public data; cross-user cache sharing is a feature, not a bug. Document explicitly in AUDIT.md as "verified — not a per-user invariant violation". |
| Live service config | Twitch OAuth issued tokens — server-side, ephemeral, 60d lifetime | None — see "Stored data" row above |
| OS-registered state | systemd `apex-api` service (deploy.sh:28 SERVICE_NAME) | None — rename is in-process; no systemd unit affected |
| Secrets/env vars | `BETTER_AUTH_SECRET` (root for HKDF + AES-GCM) | None — unchanged |
| Build artifacts | None — single Bun process, no compiled binaries embedding "IgdbChainHolder" | None — `bun build src/index.ts --target=bun --outdir=dist` regenerates from source on every deploy [VERIFIED: read of deploy.sh] |
| Test infrastructure | `apps/api/src/__tests__/wiring.test.ts:91, :135` greps for symbol names `IgdbChainHolder` and `igdbChainHolder.swap(` — these guards WILL FAIL after rename | Update grep patterns in wiring.test.ts as part of D-09 rename (Test 3 + Test 4) — the symbols change, the architectural invariant they pin does NOT |

**Nothing found in category:** Live service config, OS-registered state, secrets/env vars — confirmed by reading `scripts/deploy.sh` end-to-end (no IGDB-specific systemd unit, no IGDB env injection, no IGDB-specific file in `/etc`). [VERIFIED]

## Common Pitfalls

### Pitfall 1: Storing resolved value instead of Promise (single-flight failure)

**What goes wrong:** Two concurrent first-time requests for the same `userId` both miss the empty Map. Both call `build(userId)`. Two Twitch OAuth token mints happen instead of one, two DB reads, two duplicate chain instances briefly coexist. Eventually one overwrites the other in the Map.

**Why it happens:** Cache pattern looks correct at the type level — `Map<string, IgdbChain | null>` would compile. The race is invisible without thinking about Promise timing.

**How to avoid:** Map stores the Promise. Reading the slot returns the Promise (resolved or not). Re-storing on resolution is unnecessary because Promise resolution is auto-memoized.

**Warning signs:** Two `igdb.token.refresh` log events for the same `userId` within milliseconds of process start. Two `igdb.chain.configured` events for the same `userId`.

### Pitfall 2: Test fixture rebuilds instead of restores (identity loss)

**What goes wrong:** `afterAll` builds a "fresh equivalent" chain instead of restoring the captured reference. Subsequent test files (under `bun test --randomize`) see an unfamiliar instance.

**Why it happens:** The test author thinks "snapshot the chain, build a new one on restore" is equivalent. It is not — downstream tests that captured a reference to the prior chain (or that have stable identity assertions) silently break.

**How to avoid:** Use the `__setChainForTest` escape hatch (renamed `__restoreForTest(userId, snapshot)`) — sets the internal Promise reference WITHOUT rebuilding sub-components. See `igdb-chain-holder.ts:85-104` TSDoc for the canonical rationale.

**Warning signs:** Tests pass locally but flake on CI with `--randomize` enabled. Different `_fixtures/` files trigger different failures depending on order.

### Pitfall 3: Per-user breaker that's actually global

**What goes wrong:** Registry holds one `CircuitBreaker` instance and passes it to every user's chain. User A's failures (bad client_secret) open the breaker; user B (good creds) gets 503s.

**Why it happens:** Lazy refactor: programmer keeps the existing module-level `const breaker = new CircuitBreaker(...)` and just keys the chain Map by `userId`.

**How to avoid:** `build(userId)` constructs a fresh `CircuitBreaker` per call — exactly as the current `IgdbChainHolder.build` does at `apps/api/src/infrastructure/igdb/igdb-chain-holder.ts:115`. The breaker lifetime is tied to the chain slot; on `invalidate(userId)` the slot drops and the breaker is GC'd.

**Warning signs:** Test for D-12 (two-user identity isolation) would catch this — assert `chainA.searchGameMetadata !== chainB.searchGameMetadata`, and additionally assert breaker non-aliasing (if the breaker is exposed).

### Pitfall 4: Invalidating slot before DB commit (read-after-evict race)

**What goes wrong:** `Save` evicts slot → DB write throws → next request rebuilds from old DB state → eviction was wasted, in-flight requests holding old chain reference still work (correct), but a new request paid a build cost for the same state.

**Why it happens:** Order looks "safer" if eviction happens first ("freshness over correctness").

**How to avoid:** Always invalidate AFTER `await repo.save(...)`. Today's `save-igdb-integration.ts:191-198` already does this (`chainHolder.swap` after `repo.save`); preserve order.

**Warning signs:** Hard to detect from outside. Code review on the use-case is the gate.

### Pitfall 5: Documentation drift in inline comments outliving the fix

**What goes wrong:** Phase 6 renames `IgdbChainHolder` → `IgdbChainRegistry`, but stale comments in `wiring.ts`, `save-igdb-integration.ts`, `clear-igdb-integration.ts`, `igdb-chain-holder.ts` itself reference "swap", "the single user", "first user wins", "k8s probes", "horizontally-scaled deployment". A grep audit at end-of-phase catches survivors.

**How to avoid:** Grep gate as part of validation: `rg -n "primeIgdbChainFromDb|firstUserIdOrNull|chainHolder\.swap\(|IgdbChainHolder|k8s|horizontally-scaled|pods\b" apps/api/src .planning/codebase/ CLAUDE.md` — expect 0 hits (or only intentionally-retained historical references in PLAN.md / FINDINGS.md).

**Warning signs:** Phase 6 commit lands, future devs read `wiring.ts` and see "swap" referenced in a comment that no longer describes the code.

## Code Examples

### Example 1: IgdbChainRegistry class skeleton

```typescript
// Source: derived from apps/api/src/infrastructure/igdb/igdb-chain-holder.ts:113-163 (build) +
// apps/api/src/infrastructure/igdb/igdb-token-store.ts:96-105 (single-flight pattern)
import type { IntegrationCredentialsRepository } from '../../domain/integrations/integration-credentials-repository';
import type { IntegrationCipher } from '../../domain/integrations/integration-cipher';
// ... other imports as in current igdb-chain-holder.ts ...

export interface IgdbChain {
  readonly searchGameMetadata: SearchGameMetadata;
  readonly enrichGameMetadata: EnrichGameMetadata;
}

export interface IgdbChainRegistryDeps {
  readonly logger: Logger;
  readonly tokenStorage: IgdbTokenStorage;
  readonly metadataCacheRepository: MetadataCacheRepository;
  readonly gameRepository: GameRepository;
  readonly transactionRunner: TransactionRunner;
  readonly isCoverHostAllowed: IsCoverHostAllowed;
  readonly timeoutMs: number;
  readonly cacheTtlDays: number;
  // NEW vs IgdbChainHolderDeps — registry hydrates lazily:
  readonly integrationCredentialsRepository: IntegrationCredentialsRepository;
  readonly integrationCipher: IntegrationCipher;
}

export class IgdbChainRegistry {
  private readonly chains = new Map<string, Promise<IgdbChain | null>>();

  constructor(private readonly deps: IgdbChainRegistryDeps) {}

  /**
   * Returns the (possibly null) IGDB chain for `userId`. Lazy — first call per
   * userId reads the credentials row, decrypts, builds the chain, and caches.
   * Concurrent first calls for the same userId share one Promise (single-flight).
   */
  get(userId: string): Promise<IgdbChain | null> {
    const cached = this.chains.get(userId);
    if (cached !== undefined) return cached;
    const promise = this.build(userId);
    this.chains.set(userId, promise);
    return promise;
  }

  /**
   * Evict the user's slot. Next `get(userId)` rebuilds from DB. Called by
   * SaveIgdbIntegration / ClearIgdbIntegration after their DB write commits.
   * In-flight requests that already captured the old chain reference finish
   * using it (same as today's swap semantics).
   */
  invalidate(userId: string): void {
    const dropped = this.chains.delete(userId);
    if (dropped) {
      this.deps.logger.event('igdb.chain.invalidated', { userId });
    }
  }

  /** TEST-ONLY: see snapshotForTest / restoreForTest docs. */
  __snapshotForTest(userId: string): Promise<IgdbChain | null> | undefined {
    return this.chains.get(userId);
  }

  /** TEST-ONLY: restore exact prior reference (identity-preserving). */
  __restoreForTest(userId: string, snapshot: Promise<IgdbChain | null> | undefined): void {
    if (snapshot === undefined) this.chains.delete(userId);
    else this.chains.set(userId, snapshot);
  }

  private async build(userId: string): Promise<IgdbChain | null> {
    const stored = await this.deps.integrationCredentialsRepository.findByUserAndKind(userId, 'igdb');
    if (stored === null || !stored.enabled) return null;
    const decrypt = this.deps.integrationCipher.decrypt(stored.clientSecretCiphertext);
    if (!decrypt.ok) {
      this.deps.logger.event('igdb.chain.decrypt_failed', { userId, kind: decrypt.error.kind });
      return null;
    }
    // Verbatim from current IgdbChainHolder.build, with creds threaded from stored/decrypt:
    const breaker = new CircuitBreaker({ /* ...same as today... */ });
    const tokenStore = new IgdbTokenStore({
      storage: this.deps.tokenStorage,
      clientId: stored.clientId.value,
      clientSecret: decrypt.value,
    });
    const rateLimiter = new TokenBucketRateLimiter({ capacity: 4, refillIntervalMs: 250 });
    const httpClient = new IgdbHttpClient({
      baseUrl: 'https://api.igdb.com/v4',
      clientId: stored.clientId.value,
      tokenStore,
      rateLimiter,
      breaker,
      timeoutMs: this.deps.timeoutMs,
    });
    const cachingProvider = new CachingGameMetadataProvider({
      inner: new IgdbGameMetadataProvider({ httpClient }),
      cacheRepo: this.deps.metadataCacheRepository,
      providerName: 'igdb',
      positiveTtlDays: this.deps.cacheTtlDays,
      negativeTtlDays: 1,
    });
    const searchGameMetadata = new SearchGameMetadata(cachingProvider, this.deps.metadataCacheRepository);
    const enrichGameMetadata = new EnrichGameMetadata(
      this.deps.gameRepository,
      this.deps.transactionRunner,
      this.deps.metadataCacheRepository,
      this.deps.isCoverHostAllowed,
    );
    this.deps.logger.event('igdb.chain.configured', { userId });
    return { searchGameMetadata, enrichGameMetadata };
  }
}
```

[VERIFIED that the `build` body matches `apps/api/src/infrastructure/igdb/igdb-chain-holder.ts:113-163` modulo the credentials source. ASSUMED that `IgdbCipher.decrypt` returns `Result<string, ...>` — the call site at `apps/api/src/wiring.ts:218` confirms `decryptResult.ok`/`decryptResult.value`/`decryptResult.error.kind`.]

### Example 2: Port narrowing for use-cases (replace `IgdbChainSwapper`)

```typescript
// In apps/api/src/application/integrations/save-igdb-integration.ts:
// REMOVE: export interface IgdbChainSwapper { swap(...): void; }
// ADD:
export interface IgdbChainInvalidator {
  invalidate(userId: string): void;
}

// In SaveIgdbIntegrationDeps:
// REMOVE: readonly chainHolder: IgdbChainSwapper;
// ADD:    readonly chainRegistry: IgdbChainInvalidator;

// In execute(), at the end (replace lines 195-199):
// REMOVE the if/else around chainHolder.swap(...).
// ADD:
this.deps.chainRegistry.invalidate(userId);
// Same for ClearIgdbIntegration — replace `this.deps.chainHolder.swap(null);` with
// `this.deps.chainRegistry.invalidate(userId);`. Port name flip propagates to the
// dep field name. The transaction-completes-before-invalidate ordering is unchanged.
```

### Example 3: wiring.ts diff sketch (composition root)

```typescript
// REMOVE imports:
// import { IgdbChainHolder } from './infrastructure/igdb/igdb-chain-holder';
// (the file is renamed → import becomes:)
// ADD import:
import { IgdbChainRegistry } from './infrastructure/igdb/igdb-chain-registry';

// REMOVE block (apps/api/src/wiring.ts:146-229 — IgdbChainHolder construction +
// primeIgdbChainFromDb + firstUserIdOrNull):
// ADD:
export const igdbChainRegistry = new IgdbChainRegistry({
  logger: baseLogger,
  tokenStorage: igdbTokenStorage,
  metadataCacheRepository,
  gameRepository,
  transactionRunner,
  isCoverHostAllowed,
  timeoutMs: env.IGDB_TIMEOUT_MS,
  cacheTtlDays: env.IGDB_CACHE_TTL_DAYS,
  integrationCredentialsRepository,
  integrationCipher,
});

// REPLACE chainHolder in SaveIgdbIntegration / ClearIgdbIntegration construction:
export const saveIgdbIntegration = new SaveIgdbIntegration({
  repo: integrationCredentialsRepository,
  cipher: integrationCipher,
  verifier: igdbCredentialsVerifier,
  chainRegistry: igdbChainRegistry,  // was: chainHolder: igdbChainHolder
  now: () => new Date(),
  uuid: () => crypto.randomUUID(),
});

export const clearIgdbIntegration = new ClearIgdbIntegration({
  repo: integrationCredentialsRepository,
  tokenStorage: igdbTokenStorage,
  chainRegistry: igdbChainRegistry,  // was: chainHolder: igdbChainHolder
  transactionRunner,
});

// DELETE primeIgdbChainFromDb function (was at :198-229)
// DELETE firstUserIdOrNull function (was at :239-244)
// DELETE `await primeIgdbChainFromDb();` top-level await (was at :196)
// DELETE `import { user as authUser } from './infrastructure/db/auth-schema';` (was at :35)
//   → grep for other usages first; if none, remove the import.
```

[VERIFIED: `authUser` is imported ONLY for the `firstUserIdOrNull` query (`apps/api/src/wiring.ts:35, :242`); safe to remove. Cross-checked via grep.]

### Example 4: Test fixture rewrite (per-userId snapshot/restore)

```typescript
// apps/api/src/__tests__/_fixtures/igdb-chain-fixture.ts (REWRITTEN, replaces today's content)
import { afterAll, beforeAll } from 'bun:test';
import type { IgdbChain } from '../../infrastructure/igdb/igdb-chain-registry';
import { igdbChainRegistry } from '../../wiring';

type ChainSnapshot = Promise<IgdbChain | null> | undefined;

/**
 * Install a per-file fixture that disables the IGDB chain for `userId` for
 * all tests in the importing file. Snapshots the prior slot at beforeAll and
 * restores the EXACT same Promise reference at afterAll (identity-preserving
 * via __restoreForTest — NOT via lazy rebuild, which would mint new sub-components).
 *
 * Why per-file (beforeAll/afterAll) instead of per-test (beforeEach/afterEach):
 * `bun test` runs all files in a single process with one ESM module cache,
 * so `igdbChainRegistry` is shared. With `bun test --randomize` file order
 * is non-deterministic, so each file must leave the registry slot for `userId`
 * in the same state it found.
 *
 * Usage (at top of test file, NOT inside describe/it):
 *   useDisabledIgdbChain(TEST_USER_ID);
 *   describe('my tests', () => { ... });
 */
export function useDisabledIgdbChain(userId: string): void {
  let snapshot: ChainSnapshot;
  beforeAll(() => {
    snapshot = igdbChainRegistry.__snapshotForTest(userId);
    // Pre-resolve a null chain so any call to registry.get(userId) inside
    // tests returns null immediately (no DB roundtrip).
    igdbChainRegistry.__restoreForTest(userId, Promise.resolve(null));
  });
  afterAll(() => {
    igdbChainRegistry.__restoreForTest(userId, snapshot);
  });
}

export function usePrimedIgdbChain(
  userId: string,
  chain: IgdbChain,
): void {
  let snapshot: ChainSnapshot;
  beforeAll(() => {
    snapshot = igdbChainRegistry.__snapshotForTest(userId);
    igdbChainRegistry.__restoreForTest(userId, Promise.resolve(chain));
  });
  afterAll(() => {
    igdbChainRegistry.__restoreForTest(userId, snapshot);
  });
}
```

**Call-site impact (D-11):** `apps/api/src/routes/games.idor.test.ts:11-14` currently calls `usePrimedIgdbChain({ clientId: ..., clientSecret: ... })`. Under the new fixture the call becomes:

```typescript
// Today:
usePrimedIgdbChain({ clientId: 'idor-test-client-id', clientSecret: 'idor-test-client-secret' });

// After Phase 6: pass a built (fake) chain for the specific user-id under test.
// Since IDOR tests don't make real outbound IGDB calls, a stub chain suffices:
const stubChain: IgdbChain = {
  searchGameMetadata: { execute: async () => err({ kind: 'invalid_input', issues: [] }) } as any,
  enrichGameMetadata: { execute: async () => err({ kind: 'not_found' }) } as any,
};
usePrimedIgdbChain(USER_A, stubChain);
usePrimedIgdbChain(USER_B, stubChain);
```

[ASSUMED — alternative: the fixture could expose a `useDisabledIgdbChain(userId)` variant that primes a guaranteed-null slot for that user, which is what `games.idor.test.ts` actually wants (the IDOR test only needs the route to reach its handler past the auth gate; the chain itself need not be real). Planner picks the minimal API.]

**Other consumer sites that need the new signature:**
- `apps/api/src/__tests__/wiring.test.ts:10` — `useDisabledIgdbChain()` → `useDisabledIgdbChain(TEST_USER_ID)` (already has `TEST_USER_ID` defined at `:12`)
- Any other test files importing the fixture — `grep -rn "useDisabledIgdbChain\|usePrimedIgdbChain" apps/api/src` returns 2 files: `games.idor.test.ts` + `wiring.test.ts` [VERIFIED]

### Example 5: Two-user concurrency isolation test (D-12)

```typescript
// apps/api/src/__tests__/igdb-chain-registry.two-user.test.ts (NEW FILE)
import Database from 'bun:sqlite';
import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { drizzle } from 'drizzle-orm/bun-sqlite';
import { migrate } from 'drizzle-orm/bun-sqlite/migrator';
import * as authSchema from '../infrastructure/db/auth-schema';
import * as gameSchema from '../infrastructure/db/schema';
import { Aes256GcmCipher } from '../infrastructure/integrations/aes-256-gcm-cipher';
import { DrizzleIntegrationCredentialsRepository } from '../infrastructure/integrations/drizzle-integration-credentials-repository';
import { IgdbChainRegistry } from '../infrastructure/igdb/igdb-chain-registry';
// ... other imports (CircuitBreaker, IgdbTokenStorage stub, gameRepository, etc.)
import { NewIntegrationCredentials } from '../domain/integrations/new-integration-credentials';
import { baseLogger } from '../infrastructure/logging/logger';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = resolve(__dirname, '../../drizzle');

const USER_A = 'two-user-test-A';
const USER_B = 'two-user-test-B';

describe('IgdbChainRegistry — per-user identity isolation (D-12)', () => {
  let sqlite: Database;
  let registry: IgdbChainRegistry;

  beforeAll(async () => {
    sqlite = new Database(':memory:');
    const db = drizzle({ client: sqlite, schema: { ...gameSchema, ...authSchema } });
    migrate(db, { migrationsFolder: MIGRATIONS_DIR });

    const cipher = new Aes256GcmCipher();
    const repo = new DrizzleIntegrationCredentialsRepository(db);

    // Seed credentials for both users.
    for (const userId of [USER_A, USER_B]) {
      const cred = NewIntegrationCredentials.create({
        id: crypto.randomUUID(),
        userId,
        integration: 'igdb',
        clientId: `${userId}-client-id`,
        clientSecretCiphertext: cipher.encrypt(`${userId}-secret`),
        now: new Date(),
      });
      if (!cred.ok) throw new Error('fixture violated invariants');
      await repo.save(cred.value.enable().markVerified(new Date()));
    }

    // Build registry against this in-memory DB. Inject stub token storage
    // (no network), stub gameRepository, etc. — chain inner pieces don't fire
    // because we never call .searchGameMetadata.execute() in this test.
    registry = new IgdbChainRegistry({
      // ... wiring against in-memory db + stubs ...
    });
  });

  afterAll(() => {
    sqlite.close();
  });

  it('concurrent get(USER_A) + get(USER_B) returns distinct chain instances', async () => {
    const [chainA, chainB] = await Promise.all([registry.get(USER_A), registry.get(USER_B)]);
    expect(chainA).not.toBeNull();
    expect(chainB).not.toBeNull();
    if (chainA === null || chainB === null) return;
    // Identity assertion — the bug being fixed would have made these the same instance.
    expect(chainA.searchGameMetadata).not.toBe(chainB.searchGameMetadata);
    expect(chainA.enrichGameMetadata).not.toBe(chainB.enrichGameMetadata);
  });

  it('concurrent get(USER_A) + get(USER_A) returns the SAME chain instance (single-flight)', async () => {
    // Both must dedupe via the Map<userId, Promise> single-flight pattern.
    // The pre-Phase-6 holder would also dedupe (it had one global chain), but
    // for a different reason. Verify the new code preserves dedup correctness.
    const [first, second] = await Promise.all([registry.get(USER_A), registry.get(USER_A)]);
    expect(first).toBe(second);
  });

  it('invalidate(USER_A) does not affect USER_B slot', async () => {
    const chainBBefore = await registry.get(USER_B);
    registry.invalidate(USER_A);
    const chainBAfter = await registry.get(USER_B);
    expect(chainBAfter).toBe(chainBBefore); // identity preserved across A's eviction
  });

  it('invalidate(USER_A) forces rebuild on next get(USER_A)', async () => {
    const before = await registry.get(USER_A);
    registry.invalidate(USER_A);
    const after = await registry.get(USER_A);
    // Different instance (slot was rebuilt).
    expect(after).not.toBe(before);
  });
});
```

[VERIFIED test pattern matches `apps/api/src/application/games/__tests__/update-game.optimistic.test.ts:48-86` (in-memory sqlite + explicit `migrate()`). The new test does NOT need to spin up Hono routes — it tests the registry directly. If the planner wants HTTP-level coverage, they can also extend `games-metadata.int.test.ts` to seed two users and verify the int test still passes.]

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Single `IgdbChainHolder` primed from "first user" at boot | `IgdbChainRegistry` lazy-builds per-userId on first request | Phase 6 (this phase) | Token / breaker / quota crosstalk between users eliminated |
| `chainHolder.swap(creds \| null)` rebuilds the one chain | `registry.invalidate(userId)` evicts one slot; lazy rebuild on next request | Phase 6 | Save/Clear semantics now per-user; in-flight requests holding old chain reference unchanged |
| `__setChainForTest(chain \| null)` identity-preserving global escape hatch | `__snapshotForTest(userId) / __restoreForTest(userId, snapshot)` per-user escape hatch | Phase 6 | `bun test --randomize` identity invariant preserved at user-slot granularity |
| Comments referencing k8s probes / pods / horizontal scale-out | Comments referencing systemd / supervisor / single-VPS reality | Phase 6 (B1-B6) | Documentation matches deployment truth (single-VPS via systemctl per `scripts/deploy.sh`) |
| CLAUDE.md "single-user model" framing | "Per-user end-to-end" framing | Phase 6 (D-15-17) | Future contributors don't re-introduce global-vs-per-user bugs based on stale doc |

**Deprecated/outdated (to be removed in Phase 6):**
- `primeIgdbChainFromDb` (`apps/api/src/wiring.ts:198-229`) — replaced by lazy hydration in `IgdbChainRegistry.get(userId)`
- `firstUserIdOrNull` (`apps/api/src/wiring.ts:239-244`) — no replacement; the "first user wins" semantic IS the bug
- `IgdbChainSwapper` port (`apps/api/src/application/integrations/save-igdb-integration.ts:43-45`) — replaced by `IgdbChainInvalidator { invalidate(userId): void }`

## Documentation Drift (CLAUDE.md / PROJECT.md / inline comments)

### SPA serving question (D-13, FINDINGS B7) — VERIFIED

**The CLAUDE.md claim:** `Constraints` line: `"Deployment: VPS przez SSH (...); single-process — Bun.serve na :3001, Vite SPA serwowane statycznie"` — implies `Bun.serve` serves the SPA statically.

**The codebase reality** [VERIFIED via reads of all candidate files]:
- `apps/api/src/index.ts:117-120`: `Bun.serve({ port, fetch: app.fetch })` — only `app.fetch` (the Hono app). No static-file handler, no `serveStatic`.
- `apps/api/src/index.ts:66`: `app.get('/', (c) => c.json({ name: 'apex-api', status: 'ok' }))` — root returns JSON. There is no route that serves `apps/client/dist/index.html`.
- `grep -rn "Bun.serve\|serveStatic\|static" apps/api/src` returns no static-serving middleware. [VERIFIED]
- `scripts/deploy.sh:44-51`: builds `apps/client/dist/` and asserts `test -f "${CLIENT_DIST}/index.html"`. The build artifact exists but the API process does not serve it.
- `scripts/deploy.sh:28`: `SERVICE_NAME="apex-api"` — systemd unit controlled via `sudo systemctl start/stop apex-api`. No co-served second unit.
- `.github/workflows/deploy.yml`: SSH-only, calls `/root/apex/scripts/deploy.sh`. No nginx/Caddy config in the repo.
- `grep -rn "nginx\|Caddy\|proxy_pass" apps/api .github scripts` returns no matches outside `.planning/` documentation. [VERIFIED]

**Conclusion:** The SPA is **not** served by `Bun.serve`. The repo contains no nginx/Caddy config, so the actual TLS termination + static file server lives **outside the repo** (on the VPS, configured manually). The CLAUDE.md line is wrong.

**Correction to write (D-14):** Replace the line with:

> `Deployment: VPS przez SSH (`.github/workflows/deploy.yml` + `appleboy/ssh-action`); API process `apex-api` (systemd unit) na :3001 serwuje wyłącznie Hono routes pod `app.fetch`. SPA (`apps/client/dist/`) build artifact zbudowany przez deploy.sh; statyczne serwowanie i TLS termination obsługiwane przez reverse proxy poza repo (zakładamy nginx — verify per deploy via `sudo systemctl status nginx` na VPS).`

[ASSUMED that reverse proxy is nginx — most-common choice; planner can have user confirm during execution by checking VPS `sudo nginx -T` or `sudo systemctl list-units --type=service | grep -E '(nginx|caddy|traefik)'`. If the user confirms, the assumption phrasing comes out; if they're unsure, the assumption phrasing stays as a self-documenting flag.]

### Framing replacement table (D-15..D-17)

| Stale wording | Replace with | Files |
|---------------|--------------|-------|
| `Prywatny tracker (...) dla jednego użytkownika.` (PROJECT.md:5, CLAUDE.md:6) | `Prywatny tracker (...) per-user end-to-end.` (or keep "dla jednego użytkownika" only in `PRODUCT.md` as marketing copy, not as constraint) | CLAUDE.md, PROJECT.md |
| `Single-user model: we treat the first registered user as the owner; multi-user expansion is explicitly out of scope (see PROJECT constraints).` (`apps/api/src/wiring.ts:236-237`) | Block deleted (this comment exists ONLY to justify `firstUserIdOrNull`, which is itself being deleted per D-02) | `apps/api/src/wiring.ts` |
| `Single-user deploy: any saved row for the IGDB integration applies. We still keep the per-user scoping in storage to leave room for future multi-user mode (...)` (`apps/api/src/wiring.ts:200-202`) | Block deleted along with `primeIgdbChainFromDb` (D-02) | `apps/api/src/wiring.ts` |
| "k8s probes never get rejected" (`apps/api/src/index.ts:38-40`) | "supervisor probes (systemd / external uptime monitor) never get rejected on origin checks" | `apps/api/src/index.ts` |
| "horizontally-scaled deployment" (`apps/api/src/index.ts:124-127`) | "single-VPS deploy. The CronLock is currently belt-and-braces (singleton process always wins) but kept as a test-isolation utility — see infrastructure/cron/cron-lock.ts" | `apps/api/src/index.ts` |
| "k8s SIGKILL (default 30s after SIGTERM)" (`apps/api/src/index.ts:188-190`) | "systemd's TimeoutStopSec (default 90s, our service typically configured to ~30s) never finds us still draining" | `apps/api/src/index.ts` |
| "Builds `/live` and `/ready` endpoints for k8s probes." + "Used as `livenessProbe`. Failing this restarts the pod." + "Used as `readinessProbe`; failing pulls the pod out of the service" (`apps/api/src/routes/health.ts:6-15`) | Reframe as: "Builds `/live` and `/ready` endpoints for external uptime monitoring / supervisor health-checking. `GET /live` — process up and accepting connections (cheap). `GET /ready` — DB reachable (runs a `SELECT 1`)." | `apps/api/src/routes/health.ts` |
| "two pods on the same host still get unique owners across restarts" (`apps/api/src/wiring.ts:248-250`) | "future multi-instance deploys (currently single-VPS — see CronLock TSDoc) still get unique owners across restarts" — OR — simplify to "process restarts always get unique owners" since single-VPS the salt is only useful between restart epochs | `apps/api/src/wiring.ts` |
| CronLock TSDoc framing as distributed lock (`apps/api/src/infrastructure/cron/cron-lock.ts:14-25`) | Add "Currently single-instance on a single VPS — the lock is belt-and-braces against accidental multi-process startup (e.g., systemd restart racing with manual `bun run start`) and is load-bearing for test isolation between concurrent test processes touching `apex.db`." [FINDINGS B6 keep-recommendation] | `apps/api/src/infrastructure/cron/cron-lock.ts` |

[VERIFIED line numbers via reads of all named files.]

### Inline comment cleanup checklist (B1-B6 + IGDB-specific drift)

- [ ] `apps/api/src/index.ts:38-40` — k8s → supervisor
- [ ] `apps/api/src/index.ts:124-127` — horizontally-scaled → single-VPS + test isolation rationale
- [ ] `apps/api/src/index.ts:188-190` — k8s SIGKILL → systemd TimeoutStopSec
- [ ] `apps/api/src/routes/health.ts:6-15` — k8s probes → supervisor / uptime monitor
- [ ] `apps/api/src/wiring.ts:147-156` — "On boot we read the (per-user) credentials row (...) prime the holder" → delete entire block (lazy now)
- [ ] `apps/api/src/wiring.ts:200-202` — "Single-user deploy" comment block → delete with `primeIgdbChainFromDb`
- [ ] `apps/api/src/wiring.ts:235-238` — "Single-user model" TSDoc → delete with `firstUserIdOrNull`
- [ ] `apps/api/src/wiring.ts:246-249` — "two pods on the same host" → reframe per table above
- [ ] `apps/api/src/infrastructure/cron/cron-lock.ts:14-25` — distributed-lock framing → "belt-and-braces + test isolation" framing
- [ ] `apps/api/src/infrastructure/igdb/igdb-token-store.ts:1-2` — "Single-process assumption (...) Horizontal scale-out would race on DB write; revisit if deployed to >1 instance." — KEEP (this is honest single-process framing already)

## Audit Method (D-06)

### Concrete checklist for AUDIT.md

**Goal:** Enumerate every module-level `let` / `const` in `apps/api/src/` that carries state derived from a specific user, plus the four FINDINGS A2 candidates.

**Mechanical sweep (run as part of plan execution):**

```bash
# 1. Find every module-level let/const declaration in production code:
rg -n '^(export\s+)?(let|const)\s+\w+' apps/api/src --type=ts \
  -g '!**/__tests__/**' -g '!**/*.test.ts' -g '!**/_fixtures/**'

# 2. Cross-reference against patterns that suggest user-scoped state:
rg -n 'userId|user\.id|firstUserIdOrNull|authUser|user_id' apps/api/src --type=ts \
  -g '!**/__tests__/**' -g '!**/*.test.ts' \
  | rg -v '\bfunction\b|=>|interface |type '

# 3. Look for "single" / "global" / "process-wide" / "the user" framing in comments:
rg -in 'single user|the user|the owner|process[- ]global|module level|the single' apps/api/src --type=ts

# 4. Detect any place that uses `c.get('user')` to look up runtime state in a global Map keyed by something else:
rg -n "c\.get\('user'\)" apps/api/src --type=ts
```

**False positives (legitimate global-of-per-user-state — DO NOT flag as bugs):**
- `IgdbChainRegistry.chains: Map<userId, Promise<IgdbChain | null>>` — the registry being established by this very phase. It IS a process-global Map, but each entry is correctly keyed by `userId`. This is the LEGITIMATE pattern.
- `rateLimitBuckets` table (DB-backed) — global rows but each carries `userId` column; per-user keying enforced at query layer.
- `idempotency_keys` table — same: rows have `userId` column.

**True positives (same pattern as IGDB chain bug):**
- `firstUserIdOrNull()` — already flagged, deletion is the fix
- `igdbChainHolder` — already flagged, the whole point of this phase
- **NEW candidate to investigate (see Open Questions §1):** `igdb_oauth_token` singleton row + `DrizzleIgdbTokenStorage` `SINGLETON_ID = 1`

### FINDINGS A2 candidate sweep — concrete findings

#### A2.1 — CronLock (`apps/api/src/infrastructure/cron/cron-lock.ts`)

**Today's scoping:** Owner string is `${HOSTNAME}-${pid}-${randomUUID().slice(0,8)}` (`apps/api/src/wiring.ts:250`). No user identity present. `tryAcquire(name, ttlMs)` writes `{ name, lockedUntil, owner }` into `cron_locks` keyed on `name` (`apps/api/src/infrastructure/cron/cron-lock.ts:46-52`). The `name` parameter is supplied by the caller — `cleanup-orphans` uses `LOCK_NAME = 'cleanup-orphans'` (`apps/api/src/application/cover-storage/cleanup-orphans.ts:47`); `sweep-rate-limit-buckets` uses `LOCK_NAME = 'sweep-rate-limit-buckets'` (`apps/api/src/application/rate-limit/sweep-rate-limit-buckets.ts:6`).

**Per-user invariant check:** Cron is process-wide background work; no user "owns" a cron sweep. ✓ Correct as-is. AUDIT.md note: **not a per-user bug**; comment framing fix only (FINDINGS B5/B6).

#### A2.2 — Idempotency middleware (`apps/api/src/routes/middleware/idempotency-key.ts` + `apps/api/src/infrastructure/idempotency/drizzle-idempotency-key-repository.ts`)

**Today's scoping at route layer:** `apps/api/src/routes/middleware/idempotency-key.ts:79` — `const userId = c.get('user').id;` then `repo.find(key, userId)` (`:88`) and `repo.save({ key, userId, ... })` (`:103`). Per-user keying at the route layer.

**Today's scoping at repo layer:** [Need to read `drizzle-idempotency-key-repository.ts` — but the route-layer evidence is sufficient: any repo call that ignored `userId` would not type-check given the signature accepts `(key, userId)`.] AUDIT.md note: **not a per-user bug**; verify repo implementation matches signature.

#### A2.3 — Mutation rate-limit (`apps/api/src/routes/middleware/mutation-rate-limit.ts`)

**Today's scoping:** `apps/api/src/routes/middleware/mutation-rate-limit.ts:39` — `const user = c.get('user') as { id: string } | undefined;`. The DB upsert at `:54-61` uses `{ userId: user.id, windowStart, count: 1 }` and the `onConflictDoUpdate` target is `[rateLimitBuckets.userId, rateLimitBuckets.windowStart]`. Per-user keying enforced at the DB level via unique index.

**Fail-closed branch:** `:39-46` — if `c.get('user')` is undefined, returns 429 (does NOT fall back to a global bucket). ✓ Correct.

AUDIT.md note: **not a per-user bug**.

#### A2.4 — UploadThing cover storage (`apps/api/src/infrastructure/cover-storage/uploadthing-cover-storage.ts`)

**Today's scoping:** Single `UTApi` instance constructed in `wiring.ts:62` with the global `UPLOADTHING_TOKEN` env var (the upload destination is per-deployment, not per-user). The `UTApi` is a stateless HTTP client wrapper — `upload`, `delete`, `listOlderThan` are pure RPC calls to UploadThing's API. No per-user state inside the wrapper.

**Per-user invariant check:** Upload allowlist (`apps/api/src/infrastructure/cover-storage/upload-allowlist.ts:1-4`) is checked at route layer via `requireUploadPermission` middleware before any UTApi call. The shared `UTApi` doesn't need per-user state — its only state is the bearer token, which is the deploy-wide UploadThing API key.

**One caveat:** `UPLOAD_ALLOWED_EMAILS` is parsed at module top (`upload-allowlist.ts:1-4`) — restart-only. Listed in CONCERNS.md already.

AUDIT.md note: **not a per-user bug**; existing restart-only allowlist concern is independent and already documented.

#### A2.5 — `igdb_oauth_token` (NEW candidate, surfaced during research)

**Today's scoping:** Table has columns `id, accessToken, expiresAt, obtainedAt` — no `user_id`. `DrizzleIgdbTokenStorage` hardcodes `SINGLETON_ID = 1` and reads/writes/clears that one row. `IgdbTokenStore` (constructed inside the chain `build`) holds the user's `clientId` + `clientSecret` and calls `storage.read()` / `storage.write()` / `storage.clear()` against the singleton row.

**Per-user invariant violation:** When user A's chain refreshes the token, the row is overwritten with user A's Twitch token. When user B's chain calls `storage.read()`, it returns user A's token. `IgdbTokenStore.isUsable` then checks `expiresAt`, finds it valid, and `getValidToken()` returns user A's `accessToken`. User B's HTTP requests to IGDB go out with a token minted from A's client_id/client_secret. **This is the same conceptual bug** as `IgdbChainHolder` — silently routes user A's runtime state to user B.

**Disposition decision required:** see Open Questions §1.

AUDIT.md note: **per-user bug**, same pattern as A1 (the chain-holder bug). Fix scope per D-07: fold into Phase 6 OR document with same-pattern rationale and pull into a follow-up phase. Recommendation: **fix in Phase 6** (preserves D-07 same-pattern semantics).

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| `bun` runtime | Tests, lint, build | ✓ | `bun.lock` present at repo root | — |
| `bun:sqlite` | In-memory DB for D-12 test | ✓ | Bun built-in | — |
| `drizzle-orm` `^0.45.2` | Drizzle queries in lazy hydration | ✓ | `apps/api/package.json` | — |
| `ripgrep` (`rg`) | Audit grep sweeps | conditional | available locally; `apps/api/src/__tests__/wiring.test.ts:32-41` already has a `isRipgrepAvailable()` fallback to `Bun.Glob` for CI without rg | `Bun.Glob` scan |

**Missing dependencies with no fallback:** None.

**Missing dependencies with fallback:** `rg` — already handled by existing wiring.test.ts fallback pattern; new audit scripts/tests can copy the same fallback.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | `bun:test` (Bun ^1.x built-in) |
| Config file | none — `bun:test` auto-discovers `*.test.ts` |
| Quick run command | `bun test apps/api/src/__tests__/igdb-chain-registry.two-user.test.ts -t "per-user identity isolation"` |
| Full suite command | `bun test apps/api` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| D-01 (lazy + never-evict) | First `get(userId)` reads DB; second `get(userId)` returns cached | unit | `bun test apps/api/src/__tests__/igdb-chain-registry.two-user.test.ts -t "single-flight"` | ❌ Wave 0 |
| D-02 (delete primeIgdbChainFromDb) | `wiring.ts` has no `primeIgdbChainFromDb` symbol; boot doesn't read auth.user table | grep + integration | `rg "primeIgdbChainFromDb\|firstUserIdOrNull" apps/api/src` → 0 hits | ❌ Wave 0 |
| D-03 (invalidate post-commit) | `Save` calls `registry.invalidate(userId)` AFTER `repo.save` | unit | `bun test apps/api/src/application/integrations/__tests__/save-igdb-integration.test.ts` | ✅ exists; update assertions from `swaps` to `invalidations` |
| D-04 (null on missing/disabled/decrypt-fail) | `registry.get(userId)` returns null in three cases | unit | `bun test apps/api/src/__tests__/igdb-chain-registry.two-user.test.ts -t "null cases"` | ❌ Wave 0 |
| D-05 (per-user breaker) | Chain instances for distinct users are distinct objects | unit | `bun test apps/api/src/__tests__/igdb-chain-registry.two-user.test.ts -t "distinct chain instances"` | ❌ Wave 0 |
| D-06 (AUDIT.md exists) | File presence | manual | `test -f .planning/phases/06-.../06-AUDIT.md` | ❌ Wave 0 |
| D-09 (rename) | New symbol; old symbol absent from `apps/api/src/` | grep | `rg "IgdbChainHolder\|igdbChainHolder" apps/api/src` → 0 hits outside historical docs | (in test guards) |
| D-11 (test fixture rewrite) | `useDisabledIgdbChain(userId)` signature accepted | typecheck | `bun build --no-bundle apps/api/src/__tests__/_fixtures/igdb-chain-fixture.ts` (compiles) | ✅ exists; signature changes |
| D-12 (two-user concurrency) | Two-user identity isolation passes | integration | `bun test apps/api/src/__tests__/igdb-chain-registry.two-user.test.ts` | ❌ Wave 0 |
| D-13 (SPA serving claim corrected) | CLAUDE.md does not claim `Bun.serve` serves SPA statically | grep | `rg "Bun\\.serve.*SPA\\|Vite SPA serwowane statycznie" CLAUDE.md` → 0 hits | (manual review of diff) |
| B1-B6 (k8s comment cleanup) | No k8s/pod/horizontally-scaled framing in `apps/api/src/` | grep | `rg "k8s\\|horizontally[- ]scaled\\|\\bpods\\b\\|kubernetes" apps/api/src` → 0 hits | (validation grep) |
| D-15-D-17 ("single-user" → "per-user") | CLAUDE.md / PROJECT.md framing aligned | grep | `rg "single[- ]user model\\|the single user\\|dla jednego użytkownika" CLAUDE.md PROJECT.md` → 0 hits in `Constraints` sections | (manual review) |

### Sampling Rate

- **Per task commit:** `bun test apps/api/src/__tests__/igdb-chain-registry.two-user.test.ts apps/api/src/__tests__/wiring.test.ts apps/api/src/application/integrations/__tests__/` — runs in <5s
- **Per wave merge:** `bun test apps/api` — full API suite
- **Phase gate:** `bun test apps/api && bun run lint && rg "primeIgdbChainFromDb|firstUserIdOrNull|chainHolder\\.swap\\(|IgdbChainHolder|k8s|horizontally-scaled" apps/api/src CLAUDE.md` (expect 0 hits in apps/api/src + CLAUDE.md), before `/gsd-verify-work`

### Wave 0 Gaps

- [ ] `apps/api/src/__tests__/igdb-chain-registry.two-user.test.ts` — covers D-01 (single-flight), D-04 (null cases), D-05 (per-user identity), D-12 (concurrency)
- [ ] `apps/api/src/__tests__/_fixtures/igdb-chain-fixture.ts` — REWRITE (D-11): per-userId snapshot/restore signature
- [ ] `apps/api/src/__tests__/wiring.test.ts` — UPDATE: grep patterns swap `IgdbChainHolder` → `IgdbChainRegistry`, `igdbChainHolder.swap(` → `igdbChainRegistry.invalidate(`
- [ ] `apps/api/src/application/integrations/__tests__/save-igdb-integration.test.ts` — UPDATE: `chainHolder.swaps` → `chainRegistry.invalidations`; fake's `swap` method → `invalidate(userId)`
- [ ] `apps/api/src/application/integrations/__tests__/clear-igdb-integration.test.ts` — UPDATE: same pattern as save
- [ ] `.planning/phases/06-.../06-AUDIT.md` — NEW file (D-06)
- [ ] No framework install needed — `bun:test` already in use

## Security Domain

> Per project skill `enterprise-web-expert`: per-user runtime state is a Tampering / Information Disclosure surface. The phase is itself a security correction.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | indirect | `requireAuth` middleware provides `c.get('user').id` — registry trusts the auth gate; no change |
| V3 Session Management | no | No session changes |
| V4 Access Control | yes | **The bug being fixed** — runtime IGDB chain crossed `userId` boundaries, allowing user B's request to use user A's circuit-breaker state / token. Phase 6 enforces user-scoped runtime state matching the per-user storage invariant |
| V5 Input Validation | indirect | `Save`/`Clear` already validate via Zod (`save-igdb-integration.ts:16-28`) — no change |
| V6 Cryptography | indirect | `Aes256GcmCipher` (HKDF-from-`BETTER_AUTH_SECRET`) — used inside lazy hydration, unchanged |
| V14 Configuration | yes | CLAUDE.md / inline comments lie about the deployment topology (claims k8s + static-serving); corrected to match systemd + external reverse proxy reality |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| User-scope confusion at runtime layer (today's bug) | Tampering + Information Disclosure | Per-user keyed Map<userId, ...>; user identity always resolved from `c.get('user').id` from authenticated session |
| Stale token-row leak across users (NEW finding) | Information Disclosure | See Open Questions §1 — per-user token storage decision required |
| Promise-cache poisoning (rejected Promise stays in Map) | Denial of Service | `.catch()` eviction handler on the Promise; or rely on lazy build returning `null` for expected failures (D-04 already does this) |
| In-flight request holding stale chain after `invalidate` | Tampering (low) | Existing semantics preserved per `igdb-chain-holder.ts:54-55` TSDoc — accepted trade-off |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Reverse proxy on VPS is nginx (not Caddy/Traefik/Apache) | Documentation Drift §SPA serving | Low — D-13 explicitly recommends marking the assumption in CLAUDE.md text so it's self-flagging; user can verify on next deploy |
| A2 | Promise-cache rejection on lazy `build` is rare enough that explicit eviction is optional | Architecture Patterns §Pattern 1 | Low — with D-04 the build returns `null` (not throws) for missing/disabled/decrypt-fail; only true infrastructure errors (DB unavailable) would throw and those are recoverable on retry. Planner picks. |
| A3 | `apps/api/src/__tests__/_fixtures/igdb-chain-fixture.ts` has only 2 consumer files (`games.idor.test.ts` + `wiring.test.ts`) | Code Examples §4 | Low — verified via grep `rg "useDisabledIgdbChain\|usePrimedIgdbChain" apps/api/src` → 2 files. If a new consumer landed between research and execution, the planner re-greps before signing off. |
| A4 | The two-user concurrency test does NOT need to spin up Hono routes — testing the registry directly is sufficient for D-12 acceptance | Code Examples §5 | Medium — alternative interpretation: D-12 says "each user's request reaches its own chain", implying HTTP-level coverage. Planner picks. If HTTP-level is required, extend `games-metadata.int.test.ts` with a two-user scenario; if registry-direct is sufficient, the new file in Code Examples §5 covers it. |
| A5 | "Single comprehensive commit" (D-10) accepts a commit body that is large — no policy in the repo enforces commit-size limits | Phase Requirements (D-10) | Low — user explicitly preferred atomic revert over fine-grained history per CONTEXT |

## Open Questions

### 1. `igdb_oauth_token` is a singleton row — per-user invariant violation, in or out of Phase 6 scope?

**What we know:**
- `apps/api/src/infrastructure/db/schema.ts` defines `igdb_oauth_token` with columns `id, access_token, expires_at, obtained_at`. No `user_id` column. [VERIFIED]
- `apps/api/src/infrastructure/igdb/drizzle-igdb-token-storage.ts:9` hardcodes `SINGLETON_ID = 1`. Every read/write/clear targets row id=1. [VERIFIED]
- `IgdbTokenStore` is constructed per-user inside `IgdbChainRegistry.build` with that user's `clientId` / `clientSecret`, but it calls `storage.write(record)` which puts the token into the global singleton row.
- Consequence: user B's first `getValidToken()` mints a fresh token (using B's client_id/secret) and overwrites the row. User A's next `getValidToken()` reads B's token from the row, finds it usable (`isUsable` only checks `expiresAt`), and returns it. A's outbound IGDB requests then carry a token minted from B's app — IGDB rejects with 401 because the bearer token doesn't match A's `Client-ID` header (`apps/api/src/infrastructure/igdb/igdb-http-client.ts` sends both). Bug surface: user A gets 401s after user B uses the integration; user B gets 401s after A re-mints.
- This is **the same conceptual bug** as the chain holder: shared global storage silently routes one user's runtime state to another.

**What's unclear:**
- D-07 narrows fix scope to "same pattern as IGDB bug". Token storage IS the same pattern, but Phase 6's runtime focus is the chain holder layer above it. Do we extend Phase 6 to also fix token storage?

**Three options:**

| Option | Description | Pros | Cons |
|--------|-------------|------|------|
| **(a) Fix in Phase 6 — DB schema change** | Add `user_id` column to `igdb_oauth_token`; migration; update `DrizzleIgdbTokenStorage` to key on `userId`; `IgdbTokenStore` constructor takes `userId` | Cleanest, fully per-user, persists across process restart | Adds a DB migration (D-18 says "No DB schema change" — explicit contradiction) |
| **(b) Fix in Phase 6 — in-memory only** | Drop `DrizzleIgdbTokenStorage` for the token cache; have `IgdbTokenStore` hold the token in instance state. Token cache lives only inside the chain instance, so per-user isolation is automatic. Process restart re-mints the token (acceptable — Twitch tokens have ~60d lifetime so the cache hit rate is "first request after restart pays one OAuth round-trip"). | No schema change; matches D-18; trivial implementation (delete `DrizzleIgdbTokenStorage` and pass a no-op storage; OR keep the storage port but use an in-memory adapter inside the chain) | Loses persistence — every process restart costs one OAuth mint per user (60d tokens — irrelevant) |
| **(c) Document and defer to follow-up phase** | Note in AUDIT.md that this is a same-pattern bug; add to ROADMAP as Phase 6.1 or v2 item | Keeps Phase 6 scope strict | D-07 says "fix same-pattern bugs in this phase" — deferring contradicts the framing |

**Recommendation: Option (b) — in-memory per-user token cache.**

Rationale:
1. Matches D-18 ("no DB schema change") — strict.
2. Matches D-07 ("fix same-pattern bugs in this phase") — strict.
3. Smallest change: `IgdbTokenStore` already has `inflightRefresh` instance state; adding a `cachedToken: StoredIgdbToken | null` field is a 4-line change. Replace `await this.storage.read()` with `this.cachedToken`; `await this.storage.write(...)` with `this.cachedToken = ...`. Keep the `IgdbTokenStorage` port and `DrizzleIgdbTokenStorage` class around as no-op (or delete entirely — and drop the table in a follow-up migration in Phase 7).
4. The `igdb_oauth_token` table becomes dead code after the change. Two clean-up paths: (i) drop the table in Phase 7 migration; (ii) leave it; deploy.sh DB backup still snapshots it without harm. Planner picks.
5. Acceptable consequence: process restart costs one OAuth token mint per active user. Token mint cost is ~50-200ms; on a single-VPS with one active user the impact is invisible.

**Risk if option (b) chosen but the planner doesn't realize Twitch token expiry semantics:** Twitch tokens expire after ~60d (refreshed on demand via the `isUsable` grace window). In-memory cache reset on process restart means "first request after deploy" re-mints. This is the existing behavior except today the cache is process-shared, not per-user. No new failure mode introduced.

### 2. Should `IgdbChainRegistry` be constructible without the new deps in tests?

**What we know:**
- The new deps are `integrationCredentialsRepository` and `integrationCipher` (added for lazy hydration).
- Tests that previously used `IgdbChainHolder` with a fixed chain (`fixedChainHolder({ get, isConfigured })` at `apps/api/src/routes/__tests__/games-metadata.int.test.ts:24`) currently bypass the lazy build entirely.
- After Phase 6 the registry is the real type; tests that want a fixed chain can either (a) instantiate the registry with stub deps and pre-populate the Map via `__restoreForTest`, or (b) use a `Pick<IgdbChainRegistry, 'get'>` type-narrowing in the route signature (mirroring today's `Pick<IgdbChainHolder, 'get' | 'isConfigured'>`).

**Recommendation:** Keep the route's type as `Pick<...>` narrowed — preserves today's testability without forcing test code to construct a full registry just to return a stubbed chain. The route doesn't need `invalidate`; only `get`.

```typescript
// games-metadata.ts after Phase 6:
export interface GamesMetadataRouterDeps {
  readonly chainRegistry: Pick<IgdbChainRegistry, 'get'>;
}
// (isConfigured method removed from registry — the `/status` endpoint changes from
// `c.json({ igdbConfigured: registry.isConfigured() })` to
// `c.json({ igdbConfigured: (await registry.get(c.get('user').id)) !== null })`.)
```

Note: this changes the semantics of `GET /api/games/metadata/status` from "is the chain primed globally" to "is THIS user's chain available". This is the correct semantic shift (D-04 implies the status is per-user too). Frontend already passes session cookies so `c.get('user').id` resolves correctly. No API contract change visible to the client (same JSON shape; same field name). [VERIFIED: client at `apps/client/src/lib/queries.ts` does not parameterize the status endpoint by user.]

### 3. Does the `wiring.test.ts` test 4 (chainHolder.swap grep) need to flip negation logic, or just swap symbol names?

**What we know:**
- `apps/api/src/__tests__/wiring.test.ts:111-139` greps for `igdbChainHolder\.swap\(` outside `_fixtures/` + `wiring.ts` and expects 0 hits.
- After Phase 6 the equivalent symbol is `igdbChainRegistry.invalidate(`. The fixture file no longer calls it (the fixture uses `__snapshotForTest` / `__restoreForTest` only). Use-cases call `chainRegistry.invalidate(userId)` via the injected port, not directly on the registry.
- So the new pattern should be:
  - Production code calls `registry.invalidate(userId)` ONLY through the injected port (in `save-igdb-integration.ts` + `clear-igdb-integration.ts`).
  - Direct `igdbChainRegistry.invalidate(` calls outside `wiring.ts` are now a new anti-pattern (skipping the composition root).

**Recommendation:** Update the grep guard to `igdbChainRegistry\.invalidate\(` with exclusions `_fixtures/` + `wiring.ts`. Same architectural invariant ("don't bypass the composition root"), updated symbol.

## Sources

### Primary (HIGH confidence)
- `apps/api/src/infrastructure/igdb/igdb-chain-holder.ts` — full read
- `apps/api/src/wiring.ts` — full read
- `apps/api/src/application/integrations/save-igdb-integration.ts` — full read
- `apps/api/src/application/integrations/clear-igdb-integration.ts` — full read
- `apps/api/src/routes/games-metadata.ts` — full read
- `apps/api/src/routes/games.ts` — full read
- `apps/api/src/__tests__/_fixtures/igdb-chain-fixture.ts` — full read
- `apps/api/src/__tests__/wiring.test.ts` — full read
- `apps/api/src/index.ts` — full read
- `apps/api/src/routes/health.ts` — full read
- `apps/api/src/infrastructure/cron/cron-lock.ts` — full read
- `apps/api/src/routes/middleware/idempotency-key.ts` — full read
- `apps/api/src/routes/middleware/mutation-rate-limit.ts` — full read
- `apps/api/src/infrastructure/cover-storage/uploadthing-cover-storage.ts` — full read
- `apps/api/src/infrastructure/cover-storage/upload-allowlist.ts` — full read
- `apps/api/src/infrastructure/db/client.ts` — full read
- `apps/api/src/infrastructure/igdb/igdb-token-store.ts` — full read
- `apps/api/src/infrastructure/igdb/drizzle-igdb-token-storage.ts` — full read
- `apps/api/src/infrastructure/integrations/drizzle-integration-credentials-repository.ts` — full read
- `apps/api/src/routes/integrations.ts` — full read
- `apps/api/src/routes/games.idor.test.ts` — full read
- `apps/api/src/application/games/__tests__/update-game.optimistic.test.ts` — full read
- `apps/api/src/routes/__tests__/games-metadata.int.test.ts:1-80` — partial read (test pattern only)
- `scripts/deploy.sh` — full read
- `.github/workflows/deploy.yml` — full read
- `CLAUDE.md` — full read (current state for D-13/D-14/D-15/D-16/D-17 deltas)
- `.planning/phases/06-.../06-CONTEXT.md` — full read
- `.planning/phases/06-.../FINDINGS.md` — full read
- `.planning/STATE.md` — full read
- `.planning/ROADMAP.md` — full read
- `.planning/PROJECT.md` — full read
- `.planning/REQUIREMENTS.md` — full read
- `.planning/codebase/CONCERNS.md` — full read
- `.planning/codebase/TESTING.md` — full read

### Secondary (MEDIUM confidence)
- Grep results across `apps/api/src` for symbol audit, module-level declarations, static-serving references — verified via Bash `grep -rn`

### Tertiary (LOW confidence)
- Assumption A1 (nginx as reverse proxy) — flagged as ASSUMED; recommended self-documenting phrasing in CLAUDE.md

## Metadata

**Confidence breakdown:**
- Registry shape / lazy hydration / single-flight: **HIGH** — pattern already in codebase (`IgdbTokenStore.inflightRefresh`), all type signatures verified
- Audit findings (CronLock / idempotency / mutation rate-limit / UploadThing): **HIGH** — every file read end-to-end
- Documentation drift (SPA serving, k8s comments, framing): **HIGH** — repo evidence definitive
- `igdb_oauth_token` per-user violation finding: **HIGH** — confirmed via schema + storage adapter reads; recommendation (in-memory cache) is the planner's call
- Two-user test design: **HIGH** — pattern matches existing Phase 5 in-memory sqlite tests
- Assumption A1 (nginx): **LOW** — explicitly flagged

**Research date:** 2026-05-20
**Valid until:** 2026-06-20 (single-VPS deploy + no upstream Bun/Hono API churn expected; refresh only if Twitch OAuth flow changes or a new IGDB-related table lands in schema)
