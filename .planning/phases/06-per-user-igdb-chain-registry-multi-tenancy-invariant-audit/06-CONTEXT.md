# Phase 6: Per-user IGDB chain registry + multi-tenancy invariant audit — Context

**Gathered:** 2026-05-20
**Status:** Ready for planning

<domain>
## Phase Boundary

This phase replaces the **process-global** `IgdbChainHolder` (single chain shared across the process) with a **per-user** `IgdbChainRegistry` (one chain per `userId`) so that the IGDB runtime pipeline (token store, circuit breaker, rate limiter, use-cases) matches the per-user storage invariant that already holds for `integration_credentials`. The phase also retires CLAUDE.md / inline-comment framing that pretends we are k8s-deployed, horizontally-scaled, or single-user — none of which is true on our single-VPS-via-SSH deploy.

**In scope:**
1. Runtime: introduce `IgdbChainRegistry` keyed on `userId`; route `chainHolder.get()` call-sites to use `registry.get(userId)`; update `SaveIgdbIntegration` / `ClearIgdbIntegration` to invalidate the right slot; remove `primeIgdbChainFromDb()` + `firstUserIdOrNull()`. Rename `IgdbChainHolder` → `IgdbChainRegistry`.
2. Audit: sweep codebase for analogous "global state pretending to be per-user" bugs (FINDINGS A2 candidates: CronLock, idempotency, mutation rate-limiter, UploadThing) + grep for module-level user-scoped `let`/`const`. Produce `06-AUDIT.md`. Fix only items matching the same pattern; everything else goes to `.planning/codebase/CONCERNS.md`.
3. Comment cleanup (FINDINGS B1–B6): remove k8s / horizontal-scale / pods framing from `apps/api/src/index.ts:38-40`, `:124-127`, `:188-190`; `apps/api/src/routes/health.ts:7-16`; `apps/api/src/wiring.ts:248-250`; and the CronLock TSDoc.
4. CLAUDE.md correction (FINDINGS B7 + STATE.md framing retirement): verify how the SPA is actually served on the VPS (likely nginx in front of `:3001`, not `Bun.serve` static-serving) and fix the line; replace "single-user model" framing with "per-user end-to-end" in `Constraints`; drop multi-tenant abstractions (organizations/teams) wording where it adds noise.

**Out of scope:** FINDINGS Section C items (SIGTERM cron drain gap, DRY `mountProtected` helper, top-level side effects on import, `app.on(['POST','GET'])` → `app.all`, better-auth requestId handoff, `/ready` raw error leak, `shuttingDown` → `clearInterval` race, `process.exit(0)` sledgehammer). These belong to a follow-up sweep documented in `.planning/codebase/CONCERNS.md`.

</domain>

<decisions>
## Implementation Decisions

### Registry lifecycle (Area 1)
- **D-01:** Slot lifecycle is **pure lazy + never-evict**. Boot does **not** warm any user's chain. `Save` / `Clear` integration mutations invalidate the relevant slot via `registry.invalidate(userId)`. The first IGDB request from `userId` after invalidation (or after boot) lazily reads `integration_credentials`, decrypts the secret, builds the chain (`CircuitBreaker` + `IgdbTokenStore` + `TokenBucketRateLimiter` + `IgdbHttpClient` + `CachingGameMetadataProvider` + `SearchGameMetadata` + `EnrichGameMetadata`), and stores it in the map under `userId`. Slot survives until process restart. No LRU / TTL / size cap.
- **D-02:** Eliminate `primeIgdbChainFromDb()` and `firstUserIdOrNull()` from `apps/api/src/wiring.ts`. The "first user wins" semantic is the bug — no replacement, just deletion.
- **D-03:** `SaveIgdbIntegration` and `ClearIgdbIntegration` no longer call `chainHolder.swap(creds | null)`. They call `registry.invalidate(userId)` after the DB write commits. The next request from `userId` rebuilds (or stays empty if cleared).
- **D-04:** `registry.get(userId)` returns `IgdbChain | null`. `null` means: no `integration_credentials` row for `userId`, OR the row is disabled, OR decryption failed. The route's existing 503 path for `chain === null` is preserved verbatim — only the source of `chain` changes.
- **D-05:** Per-user breaker / token store / rate limiter are correct (each Twitch OAuth app has its own quota, so one user's bad creds opening a breaker must not block another). Sharing them across users would be the bug.

### Codebase audit (Area 2 — FINDINGS A2)
- **D-06:** Produce `.planning/phases/06-per-user-igdb-chain-registry-multi-tenancy-invariant-audit/06-AUDIT.md` listing every module-level `let` / `const` in `apps/api/src/` that touches user-scoped state, plus dedicated sweeps of the four FINDINGS A2 candidates: `apps/api/src/infrastructure/cron/cron-lock.ts`, `apps/api/src/routes/middleware/idempotency-key.ts`, `apps/api/src/routes/middleware/mutation-rate-limit.ts`, `apps/api/src/infrastructure/cover-storage/uploadthing-cover-storage.ts`.
- **D-07:** Fix scope is narrow: **only fixes for the same pattern as the IGDB bug** (a global structure silently routing one user's runtime state to another). Anything else found (CronLock-on-single-VPS architectural cosplay, missing `mountProtected` helper, comment drift) is appended to `.planning/codebase/CONCERNS.md` with a back-reference to `06-AUDIT.md` and `FINDINGS.md §C`.
- **D-08:** Phase does **not** block on AUDIT.md being "clean". If the audit surfaces another global-vs-per-user bug, it gets a plan; if it surfaces architectural debt, it goes to CONCERNS.md and we ship.

### Commit grouping + rename (Area 3)
- **D-09:** Rename `IgdbChainHolder` → `IgdbChainRegistry`. Touches: `apps/api/src/infrastructure/igdb/igdb-chain-holder.ts` → `igdb-chain-registry.ts`, class name, ~10 imports (`apps/api/src/wiring.ts`, `apps/api/src/application/integrations/save-igdb-integration.ts`, `apps/api/src/application/integrations/clear-igdb-integration.ts`, `apps/api/src/routes/games-metadata.ts`, `apps/api/src/routes/games.ts`, `apps/api/src/__tests__/_fixtures/igdb-chain-fixture.ts`, test files).
- **D-10:** **Single comprehensive commit:** `refactor(06): per-user IGDB chain registry + multi-tenancy cleanup`. Includes: runtime (D-01..D-05), rename (D-09), test-fixture rework, comment cleanup B1–B6, CLAUDE.md updates (D-15..D-17), AUDIT.md (D-06), any global-vs-per-user fixes the audit surfaced. Atomic revert wins over fine-grained git history for this phase per user's explicit preference.
- **D-11:** Test fixture (`apps/api/src/__tests__/_fixtures/igdb-chain-fixture.ts`) is rewritten, not deleted. Today it snapshots one global chain via `__setChainForTest`. After Phase 6 it snapshots/restores `registry.snapshotForTest(userId)` / `registry.restoreForTest(userId, snapshot)` — same identity-preservation contract that `bun test --randomize` requires (see `igdb-chain-holder.ts:85-104` TSDoc).
- **D-12:** Optimistic-concurrency / IDOR test patterns from Phase 5 (`apps/api/src/routes/games.idor.test.ts`) inform a NEW test: two users save IGDB credentials concurrently; each user's request reaches its own chain. The single-chain bug would have failed this.

### CLAUDE.md correction (Area 4 — FINDINGS B7 + STATE.md framing retirement)
- **D-13:** Verify on the actual VPS / `deploy.yml` / `scripts/deploy.sh` how the SPA is served. Hypothesis: nginx terminates TLS on `:443`, proxies `/api/*` to `Bun.serve` on `:3001`, serves `apps/client/dist/` directly from disk. Confirm by reading deploy artifacts; if no confirmation possible from repo alone, mark the assumption explicitly in CLAUDE.md ("SPA served by nginx in front of `:3001` — verify per deploy") rather than leaving the false claim.
- **D-14:** Replace the CLAUDE.md `Constraints` line `"Vite SPA serwowane statycznie"` (attached to `Bun.serve` on `:3001`) with the verified reality from D-13.
- **D-15:** Replace `"Single-user model"` / `"the single user"` / `"the owner"` framing in CLAUDE.md with `"per-user end-to-end"` framing matching the runtime invariant. The constraint stays — multi-tenancy abstractions (organizations / teams) remain out of scope. Per-user is about scoping every resource to `userId`, not about tenancy.
- **D-16:** Drop CLAUDE.md mentions of "organization / team" abstractions where they add noise (they are conflated with per-user scoping in current text).
- **D-17:** Reflect D-15/D-16 in PROJECT.md `Constraints` if the same framing appears there. Do not retroactively re-frame Validated requirements in REQUIREMENTS.md (they are time-stamped historical records).

### Backwards compatibility
- **D-18:** No DB schema change. `integration_credentials` rows remain per-user (they already are). No migration.
- **D-19:** On deploy, the first IGDB-using request from each existing user lazily reads their `integration_credentials` row and builds their chain. There is no warm-up cost the user can perceive (single HTTP request adds ~one DB read + one Twitch OAuth token fetch, which already happened on first use anyway in the old code).
- **D-20:** Existing deploy with one configured user remains functional. The old `firstUserIdOrNull` priming is removed, but the user's first IGDB request rebuilds the chain (D-01 lazy build).

### Claude's Discretion
- API shape of `IgdbChainRegistry` (e.g., `get(userId): Promise<IgdbChain | null>` vs sync — likely async because it reads `integration_credentials` and decrypts; the route code at `routes/games-metadata.ts:16` is already async, so async is non-disruptive).
- Internal storage: `Map<string, IgdbChain>` vs class-internal cache structure. `Map<string, IgdbChain>` is the obvious default.
- Concurrency on first build for `userId` (two simultaneous requests both miss the cache): single-flight by per-userId `Promise<IgdbChain | null>` cache. Standard pattern; no need to ask the user.
- Naming for AUDIT.md sections — Claude picks.
- Whether to delete `__setChainForTest` in favor of the new snapshot/restore API or keep both during transition — Claude picks based on test-fixture rewrite cost.
- Exact line edits in CLAUDE.md text — Claude picks phrasing per D-15/D-16; user reviews via PR diff.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase input artifacts (highest priority)
- `.planning/phases/06-per-user-igdb-chain-registry-multi-tenancy-invariant-audit/FINDINGS.md` — grill-me audit of `apps/api/src/index.ts` (2026-05-20). Sections A (runtime fix scope), B (comment + CLAUDE.md staleness), C (out-of-scope items going to CONCERNS.md). **Read first.**
- `.planning/STATE.md` §"Why Phase 6 (v1.0 re-open)" — narrative of why this phase exists; explicitly retires "single-user model" framing
- `.planning/ROADMAP.md` §"Phase 6" — goal + dependency on Phase 5
- `.planning/PROJECT.md` §"Constraints" — per-user invariant statement (the one this phase makes real)

### Project conventions (must follow)
- `CLAUDE.md` — current state to amend per D-13..D-17; downstream agents must read existing version to know what to replace
- `.planning/codebase/ARCHITECTURE.md` — hexagonal layering; the registry lives in `infrastructure/igdb/`, called from `wiring.ts` and `routes/games-metadata.ts`
- `.planning/codebase/CONVENTIONS.md` — Biome rules (2-space, single quotes, semicolons), named exports only, no barrel `index.ts` in API
- `.planning/codebase/CONCERNS.md` — append destination for non-fix audit findings (D-07, D-08)
- `.planning/codebase/INTEGRATIONS.md` — IGDB integration overview
- `.planning/codebase/TESTING.md` — `bun:test` patterns; in-memory sqlite + explicit `migrate()`

### Existing code touchpoints (read before editing)
- `apps/api/src/infrastructure/igdb/igdb-chain-holder.ts` — entire file. The new `IgdbChainRegistry` lives here (renamed file). Note `__setChainForTest` TSDoc (lines 85-104) — keep the identity-preservation contract under the new API
- `apps/api/src/wiring.ts:46-50` — `IgdbChainHolder` import + integration credential repo wiring; D-02 deletes `primeIgdbChainFromDb` and `firstUserIdOrNull`
- `apps/api/src/wiring.ts:146-229` — IGDB chain block; full replacement target
- `apps/api/src/wiring.ts:239-250` — `firstUserIdOrNull` + CronLock owner-id comment (cleanup B5 lives here)
- `apps/api/src/application/integrations/save-igdb-integration.ts:14, 51, 196-198` — `chainHolder.swap()` call sites; D-03 replaces with `registry.invalidate(userId)`
- `apps/api/src/application/integrations/clear-igdb-integration.ts:14, 26, 43` — same pattern; D-03 replaces with `registry.invalidate(userId)`
- `apps/api/src/routes/games-metadata.ts:1-56` — `chainHolder.get()` call sites at `:13` and `:16`; D-04 replaces with `registry.get(c.get('user').id)` (route already has `requireAuth` so `user.id` is present)
- `apps/api/src/routes/games.ts:8, 156` — registers the metadata sub-router; pass the registry instead of the holder
- `apps/api/src/__tests__/_fixtures/igdb-chain-fixture.ts` — full rewrite per D-11. Today uses `igdbChainHolder.get()` / `swap()` / `__setChainForTest()`. New API: per-userId snapshot/restore
- `apps/api/src/index.ts:38-40` — k8s comment (B1) cleanup
- `apps/api/src/index.ts:124-127` — horizontal-scale comment (B2) cleanup
- `apps/api/src/index.ts:188-190` — k8s SIGKILL comment (B3) cleanup
- `apps/api/src/routes/health.ts:7-16` — k8s probe docblock (B4) cleanup
- `apps/api/src/wiring.ts:248-250` — pods comment (B5) cleanup; CronLock multi-owner salt TSDoc (B6) cleanup
- `apps/api/src/infrastructure/cron/cron-lock.ts` — read but **do not delete** per FINDINGS B6 recommendation (keep + correct framing, test-isolation utility)

### Audit candidates (D-06)
- `apps/api/src/infrastructure/cron/cron-lock.ts` — verify no user identity leak
- `apps/api/src/routes/middleware/idempotency-key.ts` + `apps/api/src/infrastructure/idempotency/drizzle-idempotency-key-repository.ts` — verify per-user keying at route layer, not just repo
- `apps/api/src/routes/middleware/mutation-rate-limit.ts:39` — keyed on `user.id` per FINDINGS; verify no fallback to global key
- `apps/api/src/infrastructure/cover-storage/uploadthing-cover-storage.ts` — single client instance; verify no per-user state leaks into shared `UTApi`

### Cross-cutting user preferences (MEMORY)
- `~/.claude/projects/-Users-kodari-projects-games/memory/feedback_polish_user_facing.md` — Polish for user-facing prompts; English for code/commits/file names
- `~/.claude/projects/-Users-kodari-projects-games/memory/feedback_no_regex_hacks.md` — if rename touches the same line in >2 places, extract a helper; never sed-substitute
- `~/.claude/projects/-Users-kodari-projects-games/memory/feedback_grill_then_enterprise.md` — after planner returns PLAN.md, chain grill-me then enterprise-web-expert before execution

### Stack docs (Context7 if planner needs API details)
- Hono `app.route` + sub-router pattern (no API change expected, just consumer-side)
- Drizzle ORM — no schema change expected (D-18)
- Better-auth — `user.id` already available via `requireAuth` middleware (`apps/api/src/routes/middleware/require-auth.ts`); no auth change

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **`CircuitBreaker`, `IgdbTokenStore`, `TokenBucketRateLimiter`, `IgdbHttpClient`, `CachingGameMetadataProvider`, `SearchGameMetadata`, `EnrichGameMetadata`** — all preserved verbatim. Phase 6 only changes who owns the *instances* of these and how they are keyed. Internal classes do not learn about `userId`.
- **`integrationCredentialsRepository.findByUserAndKind(userId, 'igdb')`** — already per-user. Registry reuses this to lazily hydrate a slot.
- **`integrationCipher.decrypt(stored.clientSecretCiphertext)`** — already exists. Registry calls it inside `get(userId)` on cache miss.
- **Test harness pattern from Phase 5** — `apps/api/src/application/games/__tests__/update-game.optimistic.test.ts:49-85` (in-memory sqlite + explicit `migrate()`) — reused for the new two-user concurrency test (D-12).
- **IDOR test pattern from `apps/api/src/routes/games.idor.test.ts`** — two-user fixture pattern reused to prove user A's request cannot reach user B's chain.

### Established Patterns
- **Composition root in `wiring.ts`** — `IgdbChainRegistry` is instantiated here (module-level `const` is **correct**: the registry itself is per-process, but it stores per-user chains inside — this is the legitimate global-state pattern that Phase 6 *establishes*, distinct from the bug being fixed).
- **Constructor-injected deps** — `IgdbChainRegistry({ logger, tokenStorage, metadataCacheRepository, gameRepository, transactionRunner, isCoverHostAllowed, timeoutMs, cacheTtlDays, integrationCredentialsRepository, integrationCipher })` — same shape as today's `IgdbChainHolderDeps` plus the two repos it needs for lazy hydration.
- **`Result<T, E>`** — domain/app errors never throw. Lazy `get(userId)` can return `null` (not configured / decrypt failed) — same shape as today's `holder.get()`. The route's 503 path is preserved.
- **Optimistic locking** — not relevant here (no aggregate mutation).
- **Per-user scoping at repo layer** — preserved; not what this phase fixes. This phase fixes the *runtime* mirror of that invariant.

### Integration Points
- **`Save` / `Clear` integration routes** → use-cases → `registry.invalidate(userId)` (D-03). DB commit precedes invalidate; in-flight requests holding an old chain reference complete with the old chain (consistent with today's `swap` semantics per `igdb-chain-holder.ts:54-55` TSDoc).
- **`/api/games/metadata/status` and `/candidates`** → `registry.get(c.get('user').id)` (D-04). 503 path preserved.
- **Boot** → no IGDB-related boot work. `primeIgdbChainFromDb` deleted (D-02).

</code_context>

<specifics>
## Specific Ideas

- Naming: **`IgdbChainRegistry`** is final (D-09). Methods: `get(userId): Promise<IgdbChain | null>` (lazy build) and `invalidate(userId): void` (clear slot). File rename: `igdb-chain-holder.ts` → `igdb-chain-registry.ts`.
- Single commit message format: `refactor(06): per-user IGDB chain registry + multi-tenancy cleanup` (D-10).
- AUDIT.md filename: `06-AUDIT.md` (same dir as `06-CONTEXT.md`).
- CLAUDE.md framing change is intentional retirement of "single-user model" wording per STATE.md, **not** a new policy. PROJECT.md says: "aplikacja jest per-user end-to-end". That sentence stays; everything contradicting it gets aligned (D-15..D-17).
- Test (D-12) is the new acceptance check: two users save IGDB creds in the same process; each request reaches its own chain. The single-chain bug would have failed this. Without this test the regression slips back in.

</specifics>

<deferred>
## Deferred Ideas

- **FINDINGS Section C items** — already enumerated in FINDINGS.md, not duplicated here. Disposition: append to `.planning/codebase/CONCERNS.md` as a follow-up sweep candidate. Do not fold into Phase 6 unless the audit (D-06) surfaces them as same-pattern bugs.
- **CronLock removal vs keep** — FINDINGS B6 recommends "keep + correct comments" (test-isolation utility). Phase 6 follows the recommendation; full removal of CronLock would be a future cleanup if test isolation is solved another way.
- **`primeIgdbChainFromDb` warm-up pattern** — for a future multi-instance deploy we might want eager warming. Not needed for single-VPS. If we ever horizontally scale, revisit lifecycle (Area 1 option C from discussion: eager + LRU).
- **`__setChainForTest` test-only API** — kept under the new registry name (`__snapshotForTest(userId)` / `__restoreForTest(userId, snapshot)`) per D-11. Future improvement: replace with proper DI in tests, but the current `bun test --randomize` constraint (single ESM module cache, shared singleton) makes the snapshot-restore pattern necessary.
- **PROJECT.md / REQUIREMENTS.md historical framing review** — touching only CLAUDE.md in this phase (D-17 caveat). REQUIREMENTS.md historical wording stays as-is.

</deferred>

---

*Phase: 06-per-user-igdb-chain-registry-multi-tenancy-invariant-audit*
*Context gathered: 2026-05-20*
