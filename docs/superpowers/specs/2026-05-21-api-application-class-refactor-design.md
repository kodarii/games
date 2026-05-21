# API Application class refactor — design

**Date:** 2026-05-21
**Target:** `apps/api/`
**Reference:** `/Users/kodari/Developer/electrician-offer-app/server` — adopt its `Application` lifecycle pattern.

## Problem

Today `apps/api/src/index.ts` is 226 lines that mix Hono setup, CORS, auth handler mount, 8× route mounts, two top-level `setInterval` cron loops, and graceful-shutdown handlers. `apps/api/src/wiring.ts` is 274 lines of module-level singletons (`export const createGame = new CreateGame(...)`) plus a top-level `await primeIgdbChainFromDb()`. There is no single place that owns startup sequence or lifecycle.

Pain points:

- No explicit startup sequence — migrations, DB ping, integration prime, listen are scattered across module side-effects.
- Two `setInterval` calls at module scope manage cron — no centralized scheduler, no clean stop.
- `wiring.ts` exports module-level singletons, instantiated at import time — harder to test, harder to control order.
- Route files re-export from wiring (`export { genresRouter as genres } from '../wiring'`) — hidden coupling.
- Graceful-shutdown logic lives in the same file as HTTP setup; signal handlers are not centralized.

## Goal

Adopt the `Application` class pattern from electrician-offer-app:

- `index.ts` shrinks to ~6 lines: `new Application(); void app.start(port)`.
- All composition (repos, use-cases, middleware, cron, prime functions) lives in `app.ts` as private fields organized via `build*()` sub-builders.
- Lifecycle (start/stop/signal handlers) is owned by the class.
- Cron is a `Scheduler` class with `start()/stop()`, no top-level `setInterval`.
- Routes are factories (`createXRouter(deps)`) — no module-level singletons consumed.
- `wiring.ts` is deleted.

## Target architecture

```
apps/api/src/
  index.ts                          ~6 lines
  app.ts                            class Application
  infrastructure/
    lifecycle/
      scheduler.ts                  class Scheduler
      __tests__/scheduler.test.ts
  routes/
    games.ts                        createGamesRouter(deps)
    platforms.ts                    createPlatformsRouter(deps)
    genres.ts                       createGenresRouter(deps)
    developers.ts                   createDevelopersRouter(deps)
    export.ts                       createExportRouter(deps)
    import.ts                       createImportRouter(deps)
    me.ts                           createMeRouter(deps)
    integrations.ts                 (already a factory — no change)
    upload.ts                       (already a factory — no change)
  __tests__/
    app.test.ts                     (replaces wiring.test.ts)
    _fixtures/igdb-chain-fixture.ts (accepts holder via parameter)
```

### `Application` class

```ts
// app.ts (sketch)
export class Application {
  private readonly hono = new Hono<{ Variables: AuthVariables }>();
  private bunServer: ReturnType<typeof Bun.serve> | null = null;
  private shuttingDown = false;
  private started = false;

  private readonly persistence: Persistence;
  private readonly coverStorage: CoverStorage | null;
  private readonly igdb: IgdbStack;
  private readonly gameOps: GameOps;
  private readonly dictionaries: Dictionaries;
  private readonly dataIO: DataIO;
  private readonly cron: CronBundle;
  private readonly httpMw: HttpMiddleware;
  private readonly scheduler: Scheduler;
  private readonly auth = auth; // imported singleton from infrastructure/auth/auth.ts

  constructor() {
    this.persistence  = this.buildPersistence();
    this.coverStorage = this.buildCoverStorage();
    this.igdb         = this.buildIgdbStack(this.persistence);
    this.gameOps      = this.buildGameUseCases(this.persistence);
    this.dictionaries = this.buildDictionaryStack(this.persistence);
    this.dataIO       = this.buildDataIO(this.persistence);
    this.cron         = this.buildCronStack(this.persistence, this.coverStorage);
    this.httpMw       = this.buildHttpMiddleware(this.persistence);
    this.scheduler    = new Scheduler({
      logger: baseLogger,
      tasks: [
        { name: 'cleanup.orphans',   intervalMs: ONE_HOUR_MS,    run: () => this.cron.cleanupOrphans.run() },
        { name: 'rate_limit.sweep',  intervalMs: FIVE_MINUTES_MS, run: () => this.cron.sweepRateLimitBuckets.run() },
      ],
    });
    this.registerProcessHandlers();
  }

  async start(port: number): Promise<void> {
    if (this.started) {
      baseLogger.event('application.start.duplicate', {});
      return;
    }
    this.started = true;
    try {
      await this.runMigrations();
      await this.verifyDatabase();
      await this.igdb.prime();
      this.registerMiddleware();
      this.registerRoutes();
      this.scheduler.start();
      this.bunServer = Bun.serve({ port, fetch: this.hono.fetch });
      baseLogger.event('api.listening', { port, url: `http://localhost:${port}` });
    } catch (err) {
      baseLogger.error({ event: 'startup.failed', err: ensureError(err) });
      await this.cleanup();
      process.exit(1);
    }
  }

  async stop(signal: NodeJS.Signals | 'exception' = 'SIGTERM', exitCode = 0): Promise<void> { /* drain + cleanup */ }
}
```

### Sub-builders — return bundles, not classes

Each `build*()` method is a private method (~10–30 lines) that returns a frozen object of related dependencies. The returned types are local interfaces declared at the top of `app.ts` (or extracted to `infrastructure/lifecycle/types.ts` if they grow).

| Builder | Returns |
|---|---|
| `buildPersistence()` | `{ gameRepository, platformRepository, genreRepository, developerRepository, importRepository, idempotencyKeyRepository, transactionRunner }` |
| `buildCoverStorage()` | `CoverStorage \| null` (`null` when `env.UPLOADTHING_TOKEN` is empty) |
| `buildIgdbStack(p)` | `{ holder, save, clear, credentialsRepo, prime: () => Promise<void> }` |
| `buildGameUseCases(p)` | `{ create, update, delete: del, list, get, moveToCollection }` |
| `buildDictionaryStack(p)` | `{ platforms: DictionaryBundle, genres: DictionaryBundle, developers: DictionaryBundle }` where `DictionaryBundle = { useCases, router }` |
| `buildDataIO(p)` | `{ exportData, importData }` |
| `buildCronStack(p, cover)` | `{ cronLock, cleanupOrphans, sweepRateLimitBuckets }` |
| `buildHttpMiddleware(p)` | `{ idempotencyKey, rateLimitMutations }` |

Each returned bundle is `Object.freeze`-d so consumers cannot mutate it.

### `Scheduler` class

```ts
type TaskResult =
  | { status: 'completed'; details?: Record<string, unknown> }
  | { status: 'skipped'; reason: string };

type Task = {
  readonly name: string;
  readonly intervalMs: number;
  readonly run: () => Promise<TaskResult>;
};

class Scheduler {
  private timers: NodeJS.Timeout[] = [];
  private started = false;
  private stopped = false;

  constructor(private readonly opts: { logger: Logger; tasks: readonly Task[] }) {}

  start(): void {
    if (this.stopped) throw new Error('Scheduler: cannot start after stop');
    if (this.started) return;
    this.started = true;
    for (const task of this.opts.tasks) {
      const timer = setInterval(() => this.tick(task), task.intervalMs);
      this.timers.push(timer);
    }
  }

  stop(): void {
    if (this.stopped) return;
    this.stopped = true;
    for (const t of this.timers) clearInterval(t);
    this.timers = [];
    this.opts.logger.event('scheduler.stopped', { tasks: this.opts.tasks.length });
  }

  private async tick(task: Task): Promise<void> {
    try {
      const result = await task.run();
      if (result.status === 'skipped') {
        this.opts.logger.event(`cron.${task.name}.skipped`, { reason: result.reason });
      } else {
        this.opts.logger.event(`cron.${task.name}.completed`, result.details ?? {});
      }
    } catch (err) {
      this.opts.logger.error({ event: `cron.${task.name}.failed`, err: ensureError(err) });
    }
  }
}
```

Each cron use-case (`CleanupOrphans`, `SweepRateLimitBuckets`) is adapted so `.run()` returns `TaskResult` instead of its current shape. Details that today are logged inline (`listed`, `inDb`, `orphans`, `deleted`, `failed`, `idempotencyKeysDeleted`) move into `details` and are emitted by the scheduler. The `idempotency.cleanup.done` event continues to be emitted but from inside `CleanupOrphans.run()` when `idempotencyKeysDeleted > 0` (so callers don't need that knowledge).

### `Application.start()` — sequence

1. `runMigrations()` — `migrate(db, { migrationsFolder: 'drizzle' })` via `drizzle-orm/bun-sqlite/migrator`. Empty folder logs warn but doesn't fail. Throw fails startup.
2. `verifyDatabase()` — `await db.run(sql\`SELECT 1\`)`. Throw fails startup.
3. `igdb.prime()` — reads `integration_credentials` row for first user, decrypts secret, `chainHolder.swap(...)`. **Errors here do NOT fail startup** — chain stays unconfigured, routes return 503 (preserves current behavior).
4. `registerMiddleware()` — `attachProblemJsonErrorHandler` first, then health route (no CORS), then `requestContext`, then CORS, then `originGuard`. Order is fixed and documented in code.
5. `registerRoutes()` — mounts `/api/auth/*`, then each `/api/X/*` prefix with `requireAuth` + `rateLimitMutations` (+ `requireUploadPermission` for upload), then `app.route('/api/X', createXRouter(deps))`.
6. `scheduler.start()` — registers both cron tasks.
7. `Bun.serve({ port, fetch })`.
8. Log `api.listening`.

### `Application.stop()` — sequence

1. Idempotent guard via `shuttingDown` flag.
2. Log `shutdown.start { signal }`.
3. `scheduler.stop()`.
4. Race `server.stop(false)` (graceful drain) against `setTimeout(env.SHUTDOWN_DRAIN_MS).unref()`.
5. On timeout: log `shutdown.drain.timeout`, `server.stop(true)` to force.
6. On graceful drain: log `shutdown.drain.complete`.
7. `sqlite.close()`. Log success or `shutdown.db.close_failed`.
8. Log `shutdown.done { signal }`. `process.exit(exitCode)`.

### Signal & process handlers (`registerProcessHandlers`)

- `SIGTERM` → `void this.stop('SIGTERM', 0)`
- `SIGINT`  → `void this.stop('SIGINT', 0)`
- `uncaughtException(err)` → log fatal, `void this.stop('exception', 1)` — **new** vs today
- `unhandledRejection(reason)` → log fatal, `void this.stop('exception', 1)` — **new** vs today

## Routes — factory pattern (Phase 2)

Every route file exports a `createXRouter(deps)` function. Deps are explicit: only what the route uses.

| File | Signature |
|---|---|
| `routes/games.ts` | `createGamesRouter({ create, update, delete: del, list, get, moveToCollection, igdbChainHolder, idempotencyKey })` |
| `routes/platforms.ts` | **deleted** — `buildDictionaryStack` already returns `dictionaries.platforms.router` built via `makeDictionaryRouter`; `registerRoutes()` mounts it directly. |
| `routes/genres.ts` | **deleted** — same reason. |
| `routes/developers.ts` | **deleted** — same reason. |
| `routes/export.ts` | `createExportRouter({ exportData })` |
| `routes/import.ts` | `createImportRouter({ importData, idempotencyKey })` |
| `routes/me.ts` | `createMeRouter({ coverStorageAvailable })` |
| `routes/integrations.ts` | unchanged — already `createIntegrationsRouter` |
| `routes/upload.ts` | unchanged — already `createUploadRoute` |

All `export { ... as X } from '../wiring'` re-exports are deleted.

## Error handling

| Situation | Behavior |
|---|---|
| `runMigrations()` fail | log `startup.migrations.failed { err }`, `cleanup()`, `process.exit(1)` |
| `verifyDatabase()` fail | log `startup.db.unreachable { err }`, exit 1 |
| `igdb.prime()` fail | log `igdb.prime.failed { reason }`, **do NOT exit** — chain stays unconfigured, routes 503 |
| Scheduler task throw | log `cron.<name>.failed { err }`, next ticks continue, other tasks isolated |
| `Bun.serve()` throw (port in use) | log `startup.listen.failed`, exit 1 |
| Drain timeout reached | log `shutdown.drain.timeout`, `server.stop(true)` force-close, exit 0 |
| `sqlite.close()` throw | log `shutdown.db.close_failed`, continue shutdown, exit 0 |
| `uncaughtException` / `unhandledRejection` | log fatal, `stop('exception', 1)` |
| Second `start()` call | log `application.start.duplicate`, no-op return |

## Testing

### Phase 1 tests

- `__tests__/app.test.ts` — new. Smoke tests for `Application`:
  - `start()` calls migrations → verifyDb → primeIgdb → middleware → routes → scheduler.start → listen (assert via mock spies)
  - `start()` with migration failure logs `startup.failed` and exits 1 (mock `process.exit`)
  - `stop()` calls `scheduler.stop()`, `server.stop(false)`, `sqlite.close()`, with drain race timeout
  - Second `start()` is no-op + logs `application.start.duplicate`
  - `uncaughtException` triggers `stop('exception', 1)`
- `infrastructure/lifecycle/__tests__/scheduler.test.ts` — new:
  - Throwing task is isolated; other tasks keep ticking
  - `stop()` clears all timers
  - `start()` after `stop()` throws
  - Logs `cron.<name>.completed/.skipped/.failed` with correct shape
- `wiring.test.ts` — unchanged in Phase 1. wiring.ts still exists.

### Phase 2 tests

- `wiring.test.ts` → `app.test.ts` rename + extension. Invariant tests migrate:
  - Allowed location for `new (DrizzleGameRepository|DrizzleTransactionRunner|IgdbChainHolder)\(`: `wiring.ts` → `app.ts`.
  - Allowed location for `igdbChainHolder.swap(...)`: `wiring.ts` → `app.ts` (plus `_fixtures/` as today).
- `Application.buildForTesting(overrides?)` — static method that constructs the full stack with optional builder overrides (e.g. inject a test `IgdbChainHolder`). Returns a built `Application` plus a `honoForTesting()` accessor.
- `_fixtures/igdb-chain-fixture.ts` — `useDisabledIgdbChain(holder: IgdbChainHolder)` accepts the holder via parameter. Snapshot+restore semantics identical to today.
- Existing route-level tests (smoke 503 cases) consume `Application.buildForTesting({ igdb: { holder: disabledHolder } })`.

## Phasing

### Phase 1 — shell + Scheduler + automigrations

- New `app.ts` with `Application` class. **Consumes** `wiring.ts` imports (does not yet absorb them).
- New `infrastructure/lifecycle/scheduler.ts` with `Scheduler` class.
- `index.ts` shrinks to ~6 lines.
- `runMigrations()` + `verifyDatabase()` run on `start()`.
- Process handlers (incl. `uncaughtException`/`unhandledRejection`) registered in constructor.
- Cron use-cases (`CleanupOrphans`, `SweepRateLimitBuckets`) adapted to return `TaskResult`.
- `wiring.ts` **stays**, top-level `await primeIgdbChainFromDb()` **stays**.

**DoD:**
- `index.ts` ≤ 10 lines
- `bun test` green
- `bun dev` boots, `curl /health` 200, `kill -TERM <pid>` produces clean `shutdown.*` log sequence with bounded drain
- Diff touches: `index.ts`, `app.ts` (new), `infrastructure/lifecycle/scheduler.ts` (new), `infrastructure/lifecycle/__tests__/scheduler.test.ts` (new), `__tests__/app.test.ts` (new), `application/cover-storage/cleanup-orphans.ts` (return type adapt), `application/rate-limit/sweep-rate-limit-buckets.ts` (return type adapt)

### Phase 2 — routes-as-factories + delete `wiring.ts`

- Sub-builders implemented in `app.ts`. `Application` builds all dependencies internally.
- `igdb.prime()` moves from top-level `wiring.ts` await into `Application.start()`.
- 4 route files (`games`, `export`, `import`, `me`) rewritten as `createXRouter(deps)` factories.
- 3 route files (`platforms`, `genres`, `developers`) deleted — pure re-exports replaced by direct mounts from `dictionaries.X.router`.
- `wiring.ts` deleted.
- `wiring.test.ts` → `app.test.ts` rename. Invariant tests updated (allowed location: `app.ts`).
- `_fixtures/igdb-chain-fixture.ts` accepts `holder` via parameter.

**DoD:**
- No `from '../wiring'` import anywhere in `apps/api/src`
- No top-level `await` anywhere in `apps/api/src`
- `routes/platforms.ts`, `routes/genres.ts`, `routes/developers.ts` deleted (dictionary routers come from `dictionaries.X.router`)
- `bun test` green, including invariant tests with `app.ts` as the allowed location
- `bun dev` boots; manual smoke: list games, create/update/delete game, dictionary CRUD, integrations save/clear, upload

## Risks and mitigations

| Risk | Mitigation |
|---|---|
| `drizzle-orm/bun-sqlite/migrator` API in v0.45 differs from what's documented for newer versions | Verified in Phase 1 implementation; fallback to running `drizzle-kit migrate` via a child process from `runMigrations()` if the migrator import is missing. |
| Test parallelism + `bun test --randomize` + shared `IgdbChainHolder` instance | `buildForTesting()` returns a **fresh** `Application` per test (no shared singleton); fixture parameter takes the holder explicitly, so file-level snapshot/restore stays correct. |
| Cron task adapter changes break event logs that ops depends on | Event names (`cleanup.orphans.completed`, `idempotency.cleanup.done`, `rate_limit.sweep.completed`, etc.) preserved 1:1 by emitting them from inside the use-case or via `details` passthrough. |
| `uncaughtException`/`unhandledRejection` handlers were absent before — new ones might mask bugs by exiting on first reject | Handlers log fatal **with full error** before calling `stop(1)`. Same behavior electrician uses. |
| Phase 2 PR is large (~8 route files + tests + wiring delete) | Acceptable trade — alternative was a tmp shim which both reviewers rejected. PR will be split by route file in commits within the PR for review readability. |

## Out of scope

- Adding pino-style structured logger (games has `baseLogger.event()` already — different shape, fine as-is).
- Stripe billing / nodemailer / PDF — electrician features that don't apply here.
- Switching from `better-sqlite3` to Postgres.
- Frontend changes.

## Open questions resolved during brainstorming

- Scope: full DI in class, absorb `wiring.ts`.
- Routes: factories (`createXRouter(deps)`).
- Migrations: auto-run on `start()`.
- Rollout: 2 phases (Phase 3 collapsed into Phase 2).
- Builder shape: sub-builder methods returning frozen bundles, not a flat constructor.
- `Scheduler` API: tasks passed via constructor.
- Second `start()`: idempotent no-op + warn log.
