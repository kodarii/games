# Architecture

*Last updated: 2026-05-12*

## System Overview

```text
┌──────────────────────────────────────────────────────────────────────┐
│                Browser (Vite + React 18 SPA)                          │
│   `apps/client/src/main.tsx` → React Router v6 → Pages                │
│   TanStack Query caches • TanStack Table renders • better-auth/react  │
└───────────────────────────────┬──────────────────────────────────────┘
                                │ fetch (credentials: include)
                                │ `/api/*` (Vite proxy in dev → :3001)
                                ▼
┌──────────────────────────────────────────────────────────────────────┐
│              Hono HTTP layer (Bun runtime, port 3001)                 │
│   `apps/api/src/index.ts` mounts:                                     │
│     /health/{live,ready}  (no auth, no CORS)                          │
│     /api/auth/*           → better-auth handler                       │
│     /api/{games,platforms,genres,developers,export,import,me,upload}/*│
│   Middleware chain: requestContext → CORS → requireAuth → route       │
└───────────────────────────────┬──────────────────────────────────────┘
                                │ resolves use-cases from `wiring.ts`
                                ▼
┌──────────────────────────────────────────────────────────────────────┐
│                   Application layer (use cases)                       │
│   `apps/api/src/application/**/<verb>-<aggregate>.ts`                 │
└───────────────────────────────┬──────────────────────────────────────┘
                                │ depends only on domain ports
                                ▼
┌──────────────────────────────────────────────────────────────────────┐
│                       Domain layer (pure)                             │
│   `apps/api/src/domain/**`  • Aggregates, value objects, ports        │
└───────────────────────────────┬──────────────────────────────────────┘
                                │ implemented by
                                ▼
┌──────────────────────────────────────────────────────────────────────┐
│                Infrastructure layer (adapters)                        │
│   `apps/api/src/infrastructure/**` — Drizzle, better-auth, IGDB,      │
│   UploadThing, logger, cron, config                                   │
└──────────────────────────────────────────────────────────────────────┘
```

## Component Responsibilities

| Component | Responsibility | File |
|-----------|----------------|------|
| HTTP entrypoint | Boot Bun.serve, mount routes, graceful shutdown, cron tick | `apps/api/src/index.ts` |
| Composition root | Instantiate repos, use cases, IGDB chain, idempotency middleware | `apps/api/src/wiring.ts` |
| Auth | better-auth + Drizzle adapter; rate-limited `/sign-in/email` | `apps/api/src/infrastructure/auth/auth.ts` |
| Auth gate (HTTP) | Resolve session, attach `user`/`session`/`logger` to context | `apps/api/src/routes/middleware/require-auth.ts` |
| Game aggregate | Encapsulate invariants, `applyMetadata`, `moveToCollection` | `apps/api/src/domain/games/game.ts` |
| Game repository (port) | Read/write game rows; optimistic update/delete; per-user filtering | `apps/api/src/domain/games/game-repository.ts` |
| Game repository (adapter) | Drizzle implementation; LIKE escaping; `withTx` binding | `apps/api/src/infrastructure/games/drizzle-game-repository.ts` |
| Dictionary subsystem | Generic CRUD factory shared by platforms / genres / developers | `apps/api/src/application/dictionary/make-dictionary-use-cases.ts`, `apps/api/src/routes/_make-dictionary-router.ts` |
| IGDB metadata chain | tokenStore → http client (breaker + rate limiter) → adapter → caching decorator → use cases | `apps/api/src/infrastructure/igdb/*`, `apps/api/src/infrastructure/metadata/*` |
| Cover storage | UploadThing adapter + orphan-cleanup cron | `apps/api/src/infrastructure/cover-storage/uploadthing-cover-storage.ts`, `apps/api/src/application/cover-storage/cleanup-orphans.ts` |
| Idempotency | Hashed request fingerprint, replay cached response, TTL sweep | `apps/api/src/routes/middleware/idempotency-key.ts`, `apps/api/src/infrastructure/idempotency/drizzle-idempotency-key-repository.ts` |
| SPA shell | React Router v6 with `AuthLayout` (public) and `ProtectedRoute → AppLayout` (private) | `apps/client/src/main.tsx`, `apps/client/src/components/auth/protected-route.tsx`, `apps/client/src/components/layout/app-layout.tsx` |
| Data fetching | TanStack Query hooks built on `apiFetch` (cookie auth + RFC 7807 parsing) | `apps/client/src/lib/queries.ts`, `apps/client/src/lib/api.ts`, `apps/client/src/lib/api-fetch.ts` |
| Shared contracts | Zod schemas for import/export snapshots (v1..v4 + external) | `packages/shared/src/index.ts` |

## Pattern Overview

**Overall:** Hexagonal / clean architecture on the API (domain → application → infrastructure, HTTP adapters in `routes/`), thin SPA on the client organized by feature pages with TanStack Query as the data layer.

**Key Characteristics:**
- Bun monorepo (`workspaces: ["apps/*", "packages/*"]`) — `@apex/api`, `@apex/client`, `@apex/shared`.
- Domain layer is pure TypeScript: no Drizzle, no Hono, no Zod (Zod only lives in `application/` at the boundary).
- Use cases are classes with `execute(input, userId)` returning `Result<T, E>` — no throws for business errors.
- Repositories: interfaces in `domain/`, `Drizzle<Aggregate>Repository` in `infrastructure/`, transactional binding via `withTx(tx)`.
- Cross-aggregate atomicity via the `TransactionRunner` port (`apps/api/src/application/shared/transaction-runner.ts`).
- Optimistic concurrency on `Game` via `expectedUpdatedAt` → `OptimisticLockError` → HTTP 409 problem+json.
- Per-user row scoping enforced at the repo layer (every query includes `eq(table.userId, …)`); routes get `userId` from `c.get('user').id`.
- IGDB chain composed in `wiring.ts` only when both credentials are present; otherwise endpoints return 503 and the rest of the API boots normally.

## Layers

**Routes (HTTP adapters):**
- Purpose: Map HTTP I/O ↔ use-case I/O; produce RFC 7807 problem+json.
- Location: `apps/api/src/routes/`
- Contains: Hono sub-routers, middleware, problem-json helpers.
- Depends on: `application/` (via `wiring.ts`).
- Used by: `apps/api/src/index.ts`.

**Application (use cases):**
- Purpose: Validate input, orchestrate domain + repositories, run transactions, return `Result`.
- Location: `apps/api/src/application/`
- Contains: `idempotency/`, `shared/`, `cover-storage/`, `dictionary/`, `export/`, `import/`, `games/`.
- Depends on: domain interfaces only.

**Domain (model):**
- Purpose: Aggregates, value objects, invariants, repository ports.
- Location: `apps/api/src/domain/`
- Contains: `games/`, `platforms/`, `genres/`, `developers/`, `dictionary/`, `import/`, `shared/result.ts`.

**Infrastructure (adapters):**
- Purpose: Drizzle repos, auth, IGDB, UploadThing, logging, cron, config.
- Location: `apps/api/src/infrastructure/`
- Contains: `db/`, `auth/`, `games/`, `dictionary/`, `idempotency/`, `igdb/`, `metadata/`, `cover-storage/`, `import/`, `logging/`, `cron/`, `config/`.

**Shared (cross-app contracts):**
- Purpose: Import/export Zod schemas reused by client + API.
- Location: `packages/shared/src/`

**Client (SPA):**
- Purpose: Render pages, mutate via fetch, cache reads with TanStack Query.
- Location: `apps/client/src/`
- Contains: `pages/`, `components/` (feature + `ui/` shadcn + `layout/` + `auth/`), `hooks/`, `lib/`.

## Data Flow

### Primary Request Path — `GET /api/games`

1. Browser hits `/api/games?...` via TanStack Query (`apps/client/src/lib/queries.ts:67` `useInfiniteGamesQuery`).
2. `apiFetch` adds `credentials: 'include'` and parses problem+json on error (`apps/client/src/lib/api-fetch.ts:1`).
3. Hono matches `/api/games/*` → CORS → `requireAuth` (`apps/api/src/routes/middleware/require-auth.ts:12`) sets `user`/`session`/`logger`.
4. `games.get('/')` parses query, enforces array-param limits, calls `listGames.execute({...}, userId)` (`apps/api/src/routes/games.ts:69`).
5. `ListGames` runs Zod, builds `ReleaseYearRange`, escapes LIKE wildcards, calls `gameRepository.list(query)` (`apps/api/src/application/games/list-games.ts:34`).
6. `DrizzleGameRepository.list` composes filters/sorts, returns mapped `Game` aggregates (`apps/api/src/infrastructure/games/drizzle-game-repository.ts:68`).
7. Route serializes each `Game` via `toGameResponse` (`apps/api/src/routes/games.ts:44`).

### Mutating Request Path — `POST /api/games`

1. Client calls `createGame(input)` attaching `Idempotency-Key` UUID v4 (`apps/client/src/lib/api.ts:70`).
2. `requireAuth` → `idempotencyKeyMiddleware` hashes (method + path + body), replays cached or stores new (`apps/api/src/routes/middleware/idempotency-key.ts:11`).
3. `CreateGame.execute` parses with discriminated union (`OwnedSchema` | `WishlistSchema`), verifies platform ownership, calls `repo.create` (`apps/api/src/application/games/create-game.ts:82`).
4. On `Result.ok=false`, route maps `error.kind` to problem+json.

### Metadata Enrichment Path — `POST /api/games/:id/metadata`

1. `SearchGameMetadata` consults `MetadataCacheRepository`; cache miss falls through `CachingGameMetadataProvider` → `IgdbGameMetadataProvider` → `IgdbHttpClient`.
2. `IgdbHttpClient` waits on `TokenBucketRateLimiter`, checks `CircuitBreaker`, fetches bearer via `IgdbTokenStore` / `DrizzleIgdbTokenStorage`.
3. `EnrichGameMetadata` validates the client snapshot against the cached candidate (rejects fingerprint mismatches), writes via `GameRepository.saveMetadata` inside `TransactionRunner.run`.

### Background — Orphan Cover Cleanup

1. `setInterval` every 1h in `apps/api/src/index.ts:96` calls `cleanupOrphans.run()`.
2. `CleanupOrphans` acquires a `CronLock` row (TTL); competing pods log `cleanup.orphans.skipped`.
3. Lists UploadThing keys vs DB-referenced covers; deletes orphans + expired idempotency rows.

**State Management:**
- Server: SQLite (`apps/api/data/apex.db`), WAL mode, migrations auto-run at boot (`apps/api/src/infrastructure/db/client.ts:25`).
- Process: `wiring.ts` holds singletons (repos, use cases, circuit breaker, rate limiter, token store, cron lock).
- Client: TanStack Query cache (`apps/client/src/lib/query-client.ts`); URL state via `useUrlState` (`apps/client/src/lib/url-state.ts`); session via `useSession` from better-auth/react.

## Key Abstractions

**`Result<T, E>`:** `apps/api/src/domain/shared/result.ts` — total function for success/error, used by every use case.

**Repository ports:** Interfaces in `domain/`, `Drizzle*Repository` implementations in `infrastructure/`, plus a `withTx(tx)` clone for transactional binding (`apps/api/src/domain/games/game-repository.ts`, `apps/api/src/infrastructure/games/drizzle-game-repository.ts`).

**Value objects:** Private constructor + `create(raw): Result<VO, Err>` + `fromTrusted(raw)` (`apps/api/src/domain/games/game-value-objects.ts`, `apps/api/src/domain/games/cover-image-url.ts`, `apps/api/src/domain/games/release-year-range.ts`).

**External metadata ref:** `apps/api/src/domain/games/external-metadata-ref.ts` — pins a row to `(providerName, providerId, matchedAt)` triple.

**Dictionary factory:** Generic CRUD pipeline parameterised by `DictionaryKind` so adding a new dictionary kind is ~10 lines in `wiring.ts` + a 3-line route file (`apps/api/src/application/dictionary/make-dictionary-use-cases.ts`, `apps/api/src/routes/_make-dictionary-router.ts`).

**Problem+JSON helpers:** Single source of error-response shape (`apps/api/src/routes/_problem-json.ts`).

**`apiFetch`:** Single client HTTP funnel — cookies, JSON coercion, idempotency-key header, problem+json parsing, typed `ApiError` (`apps/client/src/lib/api-fetch.ts`).

## Entry Points

**API process:** `apps/api/src/index.ts` — `bun run dev` / `bun run start`, port `process.env.PORT ?? 3001`. Mounts routes, CORS allowlist, problem-json error handler, hourly cleanup interval, SIGTERM/SIGINT graceful shutdown.

**Composition root:** `apps/api/src/wiring.ts` — built once at module evaluation; exports singleton use cases.

**SPA bootstrap:** `apps/client/src/main.tsx` — `vite` dev (port 5173, `/api` proxied to `:3001`), `vite build` for prod. Wires React Router (public `AuthLayout` vs `ProtectedRoute → AppLayout`) inside `QueryClientProvider` + `Toaster`.

**Health probes:** `apps/api/src/routes/health.ts` — mounted before CORS/auth.

**Auth handler:** `apps/api/src/index.ts:55` delegates to better-auth from `apps/api/src/infrastructure/auth/auth.ts`.

**DB migrations:** `apps/api/drizzle/0000_*.sql … 0004_*.sql`, applied at boot in `apps/api/src/infrastructure/db/client.ts:25`, guarded by `globalThis.__apexDbMigrated` for `bun --hot`.

## Architectural Constraints

- **Threading:** Single-threaded Bun event loop per process. SQLite WAL + serialized writes via Drizzle.
- **Global state:** Module-level singletons in `apps/api/src/wiring.ts`; module-level `db` and `sqlite` singletons in `apps/api/src/infrastructure/db/client.ts`; `globalThis.__apexDbMigrated` flag.
- **Per-user scoping:** Every game/dictionary/cover query MUST include `eq(table.userId, userId)`. Coverage verified by `apps/api/src/routes/games.idor.test.ts`.
- **Optimistic concurrency:** Mutating use cases re-read aggregate, capture `updatedAt`, pass to `repo.update/saveMetadata/delete`. `OptimisticLockError` → 409.
- **Idempotency:** All mutating routes use `idempotencyKeyMiddleware`. Clients generate one UUID per logical operation, reuse on retry.
- **CORS:** `corsAllowlist` from `CORS_ORIGIN` (CSV). `/health` mounted before CORS.
- **IGDB optional:** `igdbConfigured` gates the chain; off → 503 from search/enrich endpoints, rest of API boots fine.
- **Circular imports:** None observed.

## Anti-Patterns

### Skipping `wiring.ts` and `new`-ing dependencies in routes
**What happens:** A route imports `DrizzleXxxRepository` directly and constructs it inline.
**Why it's wrong:** Loses singleton circuit-breaker / rate-limiter / token-store state; tests can no longer swap the repo for a fake.
**Do this instead:** Add the use case to `apps/api/src/wiring.ts`, import the bound instance (see `apps/api/src/routes/games.ts:1-21`).

### Throwing for business errors
**What happens:** A use case throws `new Error('platform_invalid')`.
**Why it's wrong:** Routes can't distinguish domain failures from bugs; problem+json mapping breaks.
**Do this instead:** Return `err({ kind: 'domain', error: { kind: 'platform_invalid', value } })` (see `apps/api/src/application/games/create-game.ts:104`).

### Forgetting per-user filtering
**What happens:** New repo method runs `db.select().from(games).where(eq(games.id, id))`.
**Why it's wrong:** IDOR leak across users.
**Do this instead:** Use `findByExternalId(userId, externalId)` or scope queries with `eq(gamesTable.userId, userId)` as the first predicate.

### Multi-aggregate writes outside `TransactionRunner.run`
**What happens:** Use case writes to `games` then `dictionary` without a transaction.
**Why it's wrong:** Crash between steps leaves inconsistent state.
**Do this instead:** Inject `TransactionRunner`, wrap writes: `await transactionRunner.run(async (tx) => { const txRepo = repo.withTx(tx); ... })` (see `apps/api/src/application/games/update-game.ts`, `apps/api/src/application/games/move-to-collection.ts`).

### Calling `fetch` directly on the client
**What happens:** A page imports `fetch` to call `/api/...`.
**Why it's wrong:** Loses cookies, problem+json parsing, idempotency-key plumbing, typed `ApiError`.
**Do this instead:** Route every call through `apps/client/src/lib/api-fetch.ts`, expose typed wrapper in `apps/client/src/lib/api.ts`, then a TanStack Query hook in `apps/client/src/lib/queries.ts`.

### Regex/sed-as-DRY-bandage
**What happens:** Same transform copy-pasted across files; later "fixed" with inline regex substitution.
**Why it's wrong:** Project rule (user memory): no inline regex hacks; if a change repeats >2× extract a helper.
**Do this instead:** Add a helper in `apps/client/src/lib/utils.ts` or a domain VO and reuse it.

## Error Handling

**Strategy:** Use cases return `Result<T, DiscriminatedError>`; routes map `kind` to RFC 7807 problem+json with stable `type` URIs: `/errors/validation`, `/errors/domain`, `/errors/optimistic-lock`, `/errors/payload-too-large`, `/errors/idempotency-key-invalid`, `/errors/idempotency-key-conflict`, `/errors/internal`. Error handler attached via `attachProblemJsonErrorHandler(app)` (`apps/api/src/routes/_problem-json.ts`).

**Patterns:**
- `Result.ok=false` carries `{ kind, ...payload }`; routes `switch` on `kind`.
- `OptimisticLockError` is the only exception used as control flow — caught at the route boundary → 409.
- Network errors on the client normalize to `ApiError` with `status=0`.
- Structured logger emits event names (e.g. `igdb.breaker.open`, `cleanup.orphans.completed`).

## Cross-Cutting Concerns

**Logging:** Structured JSON logger (`apps/api/src/infrastructure/logging/logger.ts`) with `logger.event(name, fields)` + `child(bindings)`; `requestContext()` (`apps/api/src/infrastructure/logging/request-context-middleware.ts`) attaches per-request logger with `requestId`, enriched with `userId` after `requireAuth`.

**Validation:** Zod at the application boundary only; domain enforces invariants in VO factories.

**Authentication:** better-auth email/password (min length 8, `autoSignIn`) + Drizzle adapter, rate limit 5/min on `/sign-in/email`, trusted origins from `CORS_ORIGIN`.

**Authorization:** `requireAuth` on every `/api/*`; `requireUploadPermission` additionally on `/api/upload/*`. Per-user scoping inside repositories.

**Idempotency:** Header-based, hashed (method + path + body), TTL `IDEMPOTENCY_TTL_HOURS`, swept hourly with orphan covers.

**Config:** Zod-parsed `env` object (`apps/api/src/infrastructure/config/env.ts`); fails fast at boot when required vars missing.
