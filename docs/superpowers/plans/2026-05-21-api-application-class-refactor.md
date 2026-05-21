# API Application Class Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the 226-line `apps/api/src/index.ts` + 274-line `apps/api/src/wiring.ts` module-side-effect composition with an `Application` class that owns lifecycle (start/stop/signal handlers), a centralized `Scheduler` for cron, and route factories that take explicit dependencies.

**Architecture:** Two phases. **Phase 1** introduces `Application` (consuming `wiring.ts` as-is), a `Scheduler` class, and migrates lifecycle (signals, drain, automigrations) into the class. `index.ts` shrinks to ~6 lines. **Phase 2** internalizes all composition into `Application` via private `build*()` sub-builders that return frozen bundles, rewrites routes as `createXRouter(deps)` factories, and deletes `wiring.ts`.

**Tech Stack:** Bun + Hono + Drizzle (`drizzle-orm/bun-sqlite`) + better-auth. Tests via `bun test`. Logger interface lives at `apps/api/src/infrastructure/logging/logger.ts` (`Logger.event(name, fields)`).

**Reference for sub-skills:**
- `apps/api/CLAUDE.md` / `ddd-enterprise-expert` skill — layering rules (route → use-case → repo, no inline DB calls in route handlers).
- `apps/api/src/__tests__/_fixtures/igdb-chain-fixture.ts` — current snapshot/restore semantics for `igdbChainHolder` under `bun test --randomize`.
- electrician reference repo path `/Users/kodari/Developer/electrician-offer-app/server` — `Application` pattern original.

**Working directory for all commands:** `/Users/kodari/projects/games`. All `bun test` / `bun dev` commands run from repo root (the `apps/api` test glob lives in the root config). Use `bun --filter @apex/api test` only when narrowing scope.

---

## File Structure (end-state after Phase 2)

```
apps/api/src/
  index.ts                                          ~6 lines bootstrap
  app.ts                                            class Application (~400 lines incl. sub-builders)
  infrastructure/
    lifecycle/
      scheduler.ts                                  class Scheduler + TaskResult type
      __tests__/scheduler.test.ts
  routes/
    games.ts                                        createGamesRouter(deps)
    export.ts                                       createExportRouter(deps)
    import.ts                                       createImportRouter(deps)
    me.ts                                           createMeRouter(deps)
    integrations.ts                                 createIntegrationsRouter (unchanged)
    upload.ts                                       createUploadRoute (unchanged)
    games-metadata.ts                               unchanged
    health.ts                                       unchanged
    middleware/…                                    unchanged
    _problem-json.ts / _make-dictionary-router.ts   unchanged
  __tests__/
    app.test.ts                                     (replaces wiring.test.ts)
    _fixtures/igdb-chain-fixture.ts                 useDisabledIgdbChain(holder)

DELETED in Phase 2:
  apps/api/src/wiring.ts
  apps/api/src/routes/platforms.ts
  apps/api/src/routes/genres.ts
  apps/api/src/routes/developers.ts
  apps/api/src/__tests__/wiring.test.ts
```

---

# PHASE 1 — shell + Scheduler + automigrations

`Application` is added, consuming `wiring.ts` imports as today. Cron loops move into a `Scheduler` class. `runMigrations()` + `verifyDatabase()` run on `start()`. `wiring.ts` and its top-level `await primeIgdbChainFromDb()` stay until Phase 2.

---

### Task 1: `TaskResult` type + `Scheduler` class

**Files:**
- Create: `apps/api/src/infrastructure/lifecycle/scheduler.ts`
- Create: `apps/api/src/infrastructure/lifecycle/__tests__/scheduler.test.ts`

The `Scheduler` owns the `setInterval` machinery currently scattered across `index.ts`. Tasks declare their own interval; the scheduler logs `cron.<name>.completed | skipped | failed`. Errors in one task never break the loop or affect other tasks.

- [ ] **Step 1: Write the failing scheduler tests**

```ts
// apps/api/src/infrastructure/lifecycle/__tests__/scheduler.test.ts
import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import type { LogFields, Logger } from '../../logging/logger';
import { Scheduler, type Task, type TaskResult } from '../scheduler';

interface RecordedEvent {
  readonly name: string;
  readonly fields: LogFields;
}

function makeLogger(): { logger: Logger; events: RecordedEvent[]; errors: RecordedEvent[] } {
  const events: RecordedEvent[] = [];
  const errors: RecordedEvent[] = [];
  const logger: Logger = {
    level: 'info',
    child: () => logger,
    event: (name, fields = {}) => events.push({ name, fields }),
    debug: () => {},
    info: () => {},
    warn: () => {},
    error: (fields) => errors.push({ name: String(fields.event ?? ''), fields }),
  };
  return { logger, events, errors };
}

function makeTask(
  name: string,
  intervalMs: number,
  run: () => Promise<TaskResult>,
): Task {
  return { name, intervalMs, run };
}

describe('Scheduler', () => {
  beforeEach(() => {
    mock.restore();
  });
  afterEach(() => {
    mock.restore();
  });

  it('start() registers intervals for each task and tick logs cron.<name>.completed', async () => {
    const { logger, events } = makeLogger();
    const ranA: number[] = [];
    const ranB: number[] = [];
    const tasks = [
      makeTask('a', 1000, async () => {
        ranA.push(1);
        return { status: 'completed', details: { x: 1 } };
      }),
      makeTask('b', 2000, async () => {
        ranB.push(1);
        return { status: 'completed' };
      }),
    ];
    const scheduler = new Scheduler({ logger, tasks });
    scheduler.start();

    // Manually invoke the private tick by reaching through readonly tasks.
    // The class exposes a `runForTest` accessor on test-only path; instead
    // here we drive setInterval via fake timers.
    await (scheduler as unknown as { tick: (t: Task) => Promise<void> }).tick(tasks[0]!);
    await (scheduler as unknown as { tick: (t: Task) => Promise<void> }).tick(tasks[1]!);

    expect(ranA).toHaveLength(1);
    expect(ranB).toHaveLength(1);
    expect(events.map((e) => e.name)).toEqual(['cron.a.completed', 'cron.b.completed']);
    expect(events[0]?.fields).toEqual({ x: 1 });
    expect(events[1]?.fields).toEqual({});

    scheduler.stop();
  });

  it('tick logs cron.<name>.skipped with the reason', async () => {
    const { logger, events } = makeLogger();
    const tasks = [
      makeTask('s', 1000, async () => ({ status: 'skipped', reason: 'lock_held' })),
    ];
    const scheduler = new Scheduler({ logger, tasks });
    scheduler.start();
    await (scheduler as unknown as { tick: (t: Task) => Promise<void> }).tick(tasks[0]!);
    scheduler.stop();
    expect(events).toEqual([
      { name: 'cron.s.skipped', fields: { reason: 'lock_held' } },
    ]);
  });

  it('throwing task is isolated; sibling task keeps ticking; failure is logged', async () => {
    const { logger, events, errors } = makeLogger();
    const tasks = [
      makeTask('broken', 1000, async () => {
        throw new Error('boom');
      }),
      makeTask('ok', 1000, async () => ({ status: 'completed' })),
    ];
    const scheduler = new Scheduler({ logger, tasks });
    scheduler.start();
    await (scheduler as unknown as { tick: (t: Task) => Promise<void> }).tick(tasks[0]!);
    await (scheduler as unknown as { tick: (t: Task) => Promise<void> }).tick(tasks[1]!);
    scheduler.stop();
    expect(errors.map((e) => e.name)).toEqual(['cron.broken.failed']);
    expect(events.map((e) => e.name)).toEqual(['cron.ok.completed']);
  });

  it('stop() clears all timers and logs scheduler.stopped', () => {
    const { logger, events } = makeLogger();
    const tasks = [makeTask('a', 1000, async () => ({ status: 'completed' }))];
    const scheduler = new Scheduler({ logger, tasks });
    scheduler.start();
    scheduler.stop();
    scheduler.stop(); // idempotent
    expect(events).toEqual([
      { name: 'scheduler.stopped', fields: { tasks: 1 } },
    ]);
  });

  it('start() after stop() throws', () => {
    const { logger } = makeLogger();
    const scheduler = new Scheduler({ logger, tasks: [] });
    scheduler.start();
    scheduler.stop();
    expect(() => scheduler.start()).toThrow(/cannot start after stop/);
  });

  it('start() twice is idempotent — no duplicate intervals', () => {
    const { logger } = makeLogger();
    const scheduler = new Scheduler({ logger, tasks: [] });
    scheduler.start();
    scheduler.start();
    scheduler.stop();
  });
});
```

- [ ] **Step 2: Run scheduler tests to verify they fail**

Run: `bun test apps/api/src/infrastructure/lifecycle/__tests__/scheduler.test.ts`
Expected: FAIL with "Cannot find module '../scheduler'"

- [ ] **Step 3: Implement Scheduler**

```ts
// apps/api/src/infrastructure/lifecycle/scheduler.ts
import type { LogFields, Logger } from '../logging/logger';

export type TaskResult =
  | { status: 'completed'; details?: LogFields }
  | { status: 'skipped'; reason: string };

export interface Task {
  readonly name: string;
  readonly intervalMs: number;
  readonly run: () => Promise<TaskResult>;
}

export interface SchedulerOptions {
  readonly logger: Logger;
  readonly tasks: readonly Task[];
}

function ensureError(value: unknown): Error {
  return value instanceof Error ? value : new Error(String(value));
}

export class Scheduler {
  private timers: NodeJS.Timeout[] = [];
  private started = false;
  private stopped = false;

  constructor(private readonly opts: SchedulerOptions) {}

  start(): void {
    if (this.stopped) {
      throw new Error('Scheduler: cannot start after stop');
    }
    if (this.started) return;
    this.started = true;
    for (const task of this.opts.tasks) {
      const timer = setInterval(() => {
        void this.tick(task);
      }, task.intervalMs);
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
      this.opts.logger.error({
        event: `cron.${task.name}.failed`,
        err: ensureError(err),
      });
    }
  }
}
```

- [ ] **Step 4: Run tests — should pass**

Run: `bun test apps/api/src/infrastructure/lifecycle/__tests__/scheduler.test.ts`
Expected: PASS all 6 tests

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/infrastructure/lifecycle/
git commit -m "feat(api): add Scheduler class with TaskResult contract"
```

---

### Task 2: Adapt `CleanupOrphans.run()` to return `TaskResult`

The existing `CleanupOrphans.run()` returns `CleanupOutcome` (`{status:'ran',...} | {status:'skipped', reason}`). Adapt so `.run(): Promise<TaskResult>` and emit `idempotency.cleanup.done` from inside the use-case when `idempotencyKeysDeleted > 0`. Today that event is emitted from `index.ts`; moving it inside means the `Scheduler` doesn't need use-case-specific knowledge.

**Files:**
- Modify: `apps/api/src/application/cover-storage/cleanup-orphans.ts`
- Modify: `apps/api/src/application/cover-storage/cleanup-orphans.test.ts`
- Modify: `apps/api/src/wiring.ts` (constructor signature change — pass logger)

- [ ] **Step 1: Update the existing test to assert the new return shape**

Open `apps/api/src/application/cover-storage/cleanup-orphans.test.ts` and replace the existing `status: 'ran' | 'skipped'` assertions with the new shape. Add a logger fake and assert `idempotency.cleanup.done` is emitted when `idempotencyKeysDeleted > 0`.

Add this fake to the file (or top of the existing describe):

```ts
import type { LogFields, Logger } from '../../infrastructure/logging/logger';

function makeFakeLogger(): { logger: Logger; events: Array<{ name: string; fields: LogFields }> } {
  const events: Array<{ name: string; fields: LogFields }> = [];
  const logger: Logger = {
    level: 'info',
    child: () => logger,
    event: (name, fields = {}) => events.push({ name, fields }),
    debug: () => {},
    info: () => {},
    warn: () => {},
    error: () => {},
  };
  return { logger, events };
}
```

Update each existing assertion that reads `result.status === 'ran'` to instead expect `{ status: 'completed', details: { listed, inDb, orphans, deleted, failed, idempotencyKeysDeleted } }`. Update `'no_storage'` and `'lock_held'` assertions to expect `{ status: 'skipped', reason: 'no_storage' | 'lock_held' }`. Add a new test:

```ts
it('emits idempotency.cleanup.done when idempotencyKeysDeleted > 0', async () => {
  const { logger, events } = makeFakeLogger();
  const idemp = new FakeIdempotencyRepo();
  idemp.toDelete = 3;
  const usecase = new CleanupOrphans(
    new FakeStorage([]),
    new FakeGameRepo([]),
    idemp,
    undefined,
    { idempotencyTtlMs: 10_000, now: () => 100_000, logger },
  );
  const result = await usecase.run();
  expect(result).toEqual({
    status: 'completed',
    details: {
      listed: 0,
      inDb: 0,
      orphans: 0,
      deleted: 0,
      failed: 0,
      idempotencyKeysDeleted: 3,
    },
  });
  expect(events).toEqual([{ name: 'idempotency.cleanup.done', fields: { deleted: 3 } }]);
});

it('does NOT emit idempotency.cleanup.done when idempotencyKeysDeleted === 0', async () => {
  const { logger, events } = makeFakeLogger();
  const idemp = new FakeIdempotencyRepo();
  idemp.toDelete = 0;
  const usecase = new CleanupOrphans(
    new FakeStorage([]),
    new FakeGameRepo([]),
    idemp,
    undefined,
    { idempotencyTtlMs: 10_000, now: () => 100_000, logger },
  );
  await usecase.run();
  expect(events).toEqual([]);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test apps/api/src/application/cover-storage/cleanup-orphans.test.ts`
Expected: FAIL — `result.status === 'ran'` no longer satisfied; new logger option not recognized.

- [ ] **Step 3: Modify `cleanup-orphans.ts`**

Change `CleanupOutcome` to import `TaskResult` from the scheduler module and use that shape. The `details` field carries the existing fields. Inject the logger via `CleanupOrphansOptions`.

```ts
// apps/api/src/application/cover-storage/cleanup-orphans.ts (replace bottom half)
import type { Logger } from '../../infrastructure/logging/logger';
import type { TaskResult } from '../../infrastructure/lifecycle/scheduler';
import type { GameRepository } from '../../domain/games/game-repository';
import type { IdempotencyKeyRepository } from '../idempotency/idempotency-key-repository';
import type { CoverStorage } from './cover-storage';

// (extractKey unchanged)

export interface CleanupRunResult {
  listed: number;
  inDb: number;
  orphans: number;
  deleted: number;
  failed: number;
  idempotencyKeysDeleted: number;
}

export interface CleanupOrphansOptions {
  readonly idempotencyTtlMs?: number;
  readonly now?: () => number;
  readonly logger?: Logger;
}

export interface CleanupLock {
  tryAcquire(name: string, ttlMs: number): Promise<boolean>;
  release(name: string): Promise<void>;
}

const LOCK_NAME = 'cleanup-orphans';
const LOCK_TTL_MS = 2 * 60 * 60 * 1000;
const DEFAULT_IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000;

export class CleanupOrphans {
  private readonly idempotencyTtlMs: number;
  private readonly now: () => number;
  private readonly logger: Logger | undefined;

  constructor(
    private readonly storage: CoverStorage | null,
    private readonly gameRepo: GameRepository,
    private readonly idempotencyRepo: IdempotencyKeyRepository,
    private readonly lock?: CleanupLock,
    options: CleanupOrphansOptions = {},
  ) {
    this.idempotencyTtlMs = options.idempotencyTtlMs ?? DEFAULT_IDEMPOTENCY_TTL_MS;
    this.now = options.now ?? (() => Date.now());
    this.logger = options.logger;
  }

  async run(): Promise<TaskResult> {
    if (!this.storage) {
      return { status: 'skipped', reason: 'no_storage' };
    }
    if (this.lock) {
      const acquired = await this.lock.tryAcquire(LOCK_NAME, LOCK_TTL_MS);
      if (!acquired) {
        return { status: 'skipped', reason: 'lock_held' };
      }
    }

    try {
      const result = await this.sweep(this.storage);
      if (result.idempotencyKeysDeleted > 0) {
        this.logger?.event('idempotency.cleanup.done', {
          deleted: result.idempotencyKeysDeleted,
        });
      }
      return {
        status: 'completed',
        details: {
          listed: result.listed,
          inDb: result.inDb,
          orphans: result.orphans,
          deleted: result.deleted,
          failed: result.failed,
          idempotencyKeysDeleted: result.idempotencyKeysDeleted,
        },
      };
    } finally {
      if (this.lock) {
        await this.lock.release(LOCK_NAME);
      }
    }
  }

  private async sweep(storage: CoverStorage): Promise<CleanupRunResult> {
    // (unchanged body)
  }
}
```

(Delete the old `CleanupOutcome` type — `TaskResult` replaces it. Confirm no other file imports `CleanupOutcome`; if any do, retype them to `TaskResult`. Use `rg "CleanupOutcome"` to verify.)

- [ ] **Step 4: Update `wiring.ts` construction to pass the logger**

```ts
// in apps/api/src/wiring.ts
export const cleanupOrphans = new CleanupOrphans(
  coverStorage,
  gameRepository,
  idempotencyKeyRepository,
  cronLock,
  {
    idempotencyTtlMs: env.IDEMPOTENCY_TTL_HOURS * 60 * 60 * 1000,
    logger: baseLogger,
  },
);
```

- [ ] **Step 5: Run tests — should pass**

Run: `bun test apps/api/src/application/cover-storage/cleanup-orphans.test.ts`
Expected: PASS all assertions including the two new emit / no-emit cases.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/application/cover-storage/cleanup-orphans.ts apps/api/src/application/cover-storage/cleanup-orphans.test.ts apps/api/src/wiring.ts
git commit -m "refactor(api): CleanupOrphans returns TaskResult; emits idempotency.cleanup.done inline"
```

---

### Task 3: Adapt `SweepRateLimitBuckets.run()` to return `TaskResult`

**Files:**
- Modify: `apps/api/src/application/rate-limit/sweep-rate-limit-buckets.ts`
- Modify: `apps/api/src/application/rate-limit/__tests__/*.test.ts` (whichever file covers it)

- [ ] **Step 1: Locate and read the existing test**

Run: `rg -l "SweepRateLimitBuckets" apps/api/src/application/rate-limit/__tests__/`

If the test asserts `expect(result).toEqual({ status: 'ran', deleted: N })`, update each such assertion to `expect(result).toEqual({ status: 'completed', details: { deleted: N } })`. Update the lock-held assertion to `{ status: 'skipped', reason: 'lock_held' }`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test apps/api/src/application/rate-limit/__tests__/`
Expected: FAIL — return shape mismatch.

- [ ] **Step 3: Update `SweepRateLimitBuckets.run()`**

```ts
// apps/api/src/application/rate-limit/sweep-rate-limit-buckets.ts
import { lt } from 'drizzle-orm';
import type { TaskResult } from '../../infrastructure/lifecycle/scheduler';
import type { db as defaultDb } from '../../infrastructure/db/client';
import { rateLimitBuckets } from '../../infrastructure/db/schema';

const WINDOW_MS = 60_000;
const LOCK_NAME = 'sweep-rate-limit-buckets';
const LOCK_TTL_MS = 5 * 60 * 1000;

export interface SweepLock {
  tryAcquire(name: string, ttlMs: number): Promise<boolean>;
  release(name: string): Promise<void>;
}

export interface SweepRateLimitBucketsDeps {
  readonly db: typeof defaultDb;
  readonly lock: SweepLock;
  readonly now: () => number;
}

export class SweepRateLimitBuckets {
  constructor(private readonly deps: SweepRateLimitBucketsDeps) {}

  async run(): Promise<TaskResult> {
    const acquired = await this.deps.lock.tryAcquire(LOCK_NAME, LOCK_TTL_MS);
    if (!acquired) return { status: 'skipped', reason: 'lock_held' };
    try {
      const cutoff = this.deps.now() - WINDOW_MS;
      const result = await this.deps.db
        .delete(rateLimitBuckets)
        .where(lt(rateLimitBuckets.windowStart, cutoff))
        .returning({ windowStart: rateLimitBuckets.windowStart });
      return { status: 'completed', details: { deleted: result.length } };
    } finally {
      await this.deps.lock.release(LOCK_NAME);
    }
  }
}
```

(Delete the `SweepOutcome` type. Verify no other module imports it: `rg "SweepOutcome"`.)

- [ ] **Step 4: Run tests — should pass**

Run: `bun test apps/api/src/application/rate-limit/__tests__/`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/application/rate-limit/
git commit -m "refactor(api): SweepRateLimitBuckets returns TaskResult"
```

---

### Task 4: Add `Application` class skeleton consuming `wiring.ts`

The class constructor wires nothing new yet — it imports the same singletons from `wiring.ts` as `index.ts` does today. The point is to introduce the lifecycle owner so `index.ts` can shrink in Task 7.

**Files:**
- Create: `apps/api/src/app.ts`

- [ ] **Step 1: Write the `Application` class skeleton**

```ts
// apps/api/src/app.ts
import { sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { migrate } from 'drizzle-orm/bun-sqlite/migrator';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { auth } from './infrastructure/auth/auth';
import { env } from './infrastructure/config/env';
import { db, sqlite } from './infrastructure/db/client';
import { baseLogger } from './infrastructure/logging/logger';
import { requestContext } from './infrastructure/logging/request-context-middleware';
import { Scheduler } from './infrastructure/lifecycle/scheduler';
import { attachProblemJsonErrorHandler } from './routes/_problem-json';
import { developers } from './routes/developers';
import { exportRoute } from './routes/export';
import { games } from './routes/games';
import { genres } from './routes/genres';
import { createHealthRouter } from './routes/health';
import { importRoute } from './routes/import';
import { createIntegrationsRouter } from './routes/integrations';
import { me } from './routes/me';
import { originGuard } from './routes/middleware/origin-guard';
import { type AuthVariables, requireAuth } from './routes/middleware/require-auth';
import { requireUploadPermission } from './routes/middleware/require-upload-permission';
import { platforms } from './routes/platforms';
import { createUploadRoute } from './routes/upload';
import {
  cleanupOrphans,
  clearIgdbIntegration,
  coverStorage,
  idempotencyKeyMiddleware,
  integrationCredentialsRepository,
  rateLimitMutations,
  saveIgdbIntegration,
  sweepRateLimitBuckets,
} from './wiring';

const ONE_HOUR_MS = 60 * 60 * 1000;
const FIVE_MINUTES_MS = 5 * 60 * 1000;

function ensureError(value: unknown): Error {
  return value instanceof Error ? value : new Error(String(value));
}

export class Application {
  private readonly hono = new Hono<{ Variables: AuthVariables }>();
  private bunServer: ReturnType<typeof Bun.serve> | null = null;
  private shuttingDown = false;
  private started = false;
  private readonly scheduler: Scheduler;

  constructor() {
    this.scheduler = new Scheduler({
      logger: baseLogger,
      tasks: [
        {
          name: 'cleanup.orphans',
          intervalMs: ONE_HOUR_MS,
          run: () => cleanupOrphans.run(),
        },
        {
          name: 'rate_limit.sweep',
          intervalMs: FIVE_MINUTES_MS,
          run: () => sweepRateLimitBuckets.run(),
        },
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

  async stop(signal: NodeJS.Signals | 'exception' = 'SIGTERM', exitCode = 0): Promise<void> {
    if (this.shuttingDown) return;
    this.shuttingDown = true;

    baseLogger.event('shutdown.start', { signal });
    this.scheduler.stop();

    await this.drainHttpServer();
    this.closeDatabase();

    baseLogger.event('shutdown.done', { signal });
    process.exit(exitCode);
  }

  private async runMigrations(): Promise<void> {
    const here = dirname(fileURLToPath(import.meta.url));
    const migrationsFolder = resolve(here, '../drizzle');
    try {
      migrate(db, { migrationsFolder });
      baseLogger.event('startup.migrations.applied', { folder: migrationsFolder });
    } catch (err) {
      baseLogger.error({ event: 'startup.migrations.failed', err: ensureError(err) });
      throw err;
    }
  }

  private async verifyDatabase(): Promise<void> {
    try {
      await db.run(sql`SELECT 1`);
    } catch (err) {
      baseLogger.error({ event: 'startup.db.unreachable', err: ensureError(err) });
      throw err;
    }
  }

  private registerMiddleware(): void {
    attachProblemJsonErrorHandler(this.hono);

    // Health probes BEFORE CORS so k8s probes never get rejected on origin checks.
    this.hono.route(
      '/health',
      createHealthRouter(async () => {
        await db.run(sql`SELECT 1`);
      }),
    );

    this.hono.use('*', requestContext());

    const corsAllowlist = new Set(env.CORS_ORIGIN);
    this.hono.use(
      '/api/*',
      cors({
        origin: (origin) => (corsAllowlist.has(origin) ? origin : null),
        credentials: true,
        allowHeaders: ['Content-Type'],
        allowMethods: ['POST', 'GET', 'OPTIONS', 'PUT', 'DELETE'],
        exposeHeaders: ['Content-Length'],
        maxAge: 600,
      }),
    );

    this.hono.use('/api/*', originGuard(corsAllowlist));
  }

  private registerRoutes(): void {
    this.hono.get('/', (c) => c.json({ name: 'apex-api', status: 'ok' }));

    this.hono.on(['POST', 'GET'], '/api/auth/*', (c) => auth.handler(c.req.raw));

    this.mountAuthed('/api/games', games);
    this.mountAuthed('/api/platforms', platforms);
    this.mountAuthed('/api/genres', genres);
    this.mountAuthed('/api/developers', developers);
    this.mountAuthed('/api/export', exportRoute);
    this.mountAuthed('/api/import', importRoute);
    this.mountAuthed('/api/me', me);

    this.hono.use('/api/integrations/*', requireAuth);
    this.hono.use('/api/integrations/*', rateLimitMutations);
    this.hono.route(
      '/api/integrations',
      createIntegrationsRouter({
        saveIgdbIntegration,
        clearIgdbIntegration,
        integrationCredentialsRepository,
        idempotencyKeyMiddleware,
      }),
    );

    this.hono.use('/api/upload/*', requireAuth);
    this.hono.use('/api/upload/*', requireUploadPermission);
    this.hono.use('/api/upload/*', rateLimitMutations);
    this.hono.route('/api/upload', createUploadRoute(coverStorage, idempotencyKeyMiddleware));
  }

  private mountAuthed(prefix: string, router: Hono<{ Variables: AuthVariables }>): void {
    this.hono.use(`${prefix}/*`, requireAuth);
    this.hono.use(`${prefix}/*`, rateLimitMutations);
    this.hono.route(prefix, router);
  }

  private async drainHttpServer(): Promise<void> {
    if (!this.bunServer) return;
    const server = this.bunServer;
    const drained = new Promise<'drained'>((resolve) => {
      void server.stop(false).then(() => resolve('drained'));
    });
    const timedOut = new Promise<'timeout'>((resolve) => {
      setTimeout(() => resolve('timeout'), env.SHUTDOWN_DRAIN_MS).unref();
    });
    const outcome = await Promise.race([drained, timedOut]);
    if (outcome === 'timeout') {
      baseLogger.event('shutdown.drain.timeout', { drainMs: env.SHUTDOWN_DRAIN_MS });
      await server.stop(true);
    } else {
      baseLogger.event('shutdown.drain.complete', {});
    }
  }

  private closeDatabase(): void {
    try {
      sqlite.close();
      baseLogger.event('shutdown.db.closed', {});
    } catch (err) {
      baseLogger.error({ event: 'shutdown.db.close_failed', err: ensureError(err) });
    }
  }

  private async cleanup(): Promise<void> {
    this.scheduler.stop();
    await this.drainHttpServer();
    this.closeDatabase();
  }

  private registerProcessHandlers(): void {
    process.on('SIGTERM', () => {
      void this.stop('SIGTERM', 0);
    });
    process.on('SIGINT', () => {
      void this.stop('SIGINT', 0);
    });
    process.on('uncaughtException', (err) => {
      baseLogger.error({ event: 'fatal.uncaughtException', err: ensureError(err) });
      void this.stop('exception', 1);
    });
    process.on('unhandledRejection', (reason) => {
      baseLogger.error({ event: 'fatal.unhandledRejection', err: ensureError(reason) });
      void this.stop('exception', 1);
    });
  }
}
```

- [ ] **Step 2: Typecheck the new file in isolation**

Run: `bun --filter @apex/api typecheck`
Expected: PASS — no type errors. (If any import path is wrong, fix and re-run.)

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/app.ts
git commit -m "feat(api): Application class skeleton consuming wiring.ts"
```

---

### Task 5: Shrink `index.ts` to 6-line bootstrap

**Files:**
- Modify: `apps/api/src/index.ts`

- [ ] **Step 1: Replace `index.ts` contents**

```ts
// apps/api/src/index.ts
import { Application } from './app';

const port = Number(process.env.PORT ?? 3001);
const app = new Application();
void app.start(port);
```

(That's 5 lines plus the comment. Should land at ≤10 per Phase 1 DoD.)

- [ ] **Step 2: Verify the existing test suite still passes**

Run: `bun test`
Expected: PASS — entire suite green. The wiring invariant tests still pass because all `new DrizzleX()` and `igdbChainHolder.swap()` calls still live in `wiring.ts`.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/index.ts
git commit -m "refactor(api): shrink index.ts to bootstrap; lifecycle owned by Application"
```

---

### Task 6: `app.test.ts` — Application smoke tests

**Files:**
- Create: `apps/api/src/__tests__/app.test.ts`

These tests exercise the lifecycle owner without booting the real HTTP server. They mock `Bun.serve` and `process.exit`, then assert that `start()` calls migrations → verifyDb → middleware → routes → scheduler.start → listen, and that `stop()` calls scheduler.stop → drain → db close.

- [ ] **Step 1: Write the failing test**

```ts
// apps/api/src/__tests__/app.test.ts
import { afterEach, beforeEach, describe, expect, it, mock, spyOn } from 'bun:test';
import { Application } from '../app';
import { baseLogger } from '../infrastructure/logging/logger';
import { useDisabledIgdbChain } from './_fixtures/igdb-chain-fixture';

useDisabledIgdbChain();

describe('Application lifecycle (BE-07)', () => {
  let exitSpy: ReturnType<typeof spyOn>;
  let serveSpy: ReturnType<typeof spyOn>;
  let events: string[];

  beforeEach(() => {
    events = [];
    spyOn(baseLogger, 'event').mockImplementation((name) => {
      events.push(name);
    });
    spyOn(baseLogger, 'error').mockImplementation((fields) => {
      events.push(`error:${String(fields.event ?? 'unknown')}`);
    });
    exitSpy = spyOn(process, 'exit').mockImplementation(((code?: number) => {
      throw new Error(`__exit_${code ?? 0}`);
    }) as never);
    serveSpy = spyOn(Bun, 'serve').mockImplementation(
      () => ({ stop: async () => undefined }) as ReturnType<typeof Bun.serve>,
    );
  });

  afterEach(() => {
    mock.restore();
  });

  it('start() runs migrations, verifyDb, registers routes, starts scheduler, then listens', async () => {
    const app = new Application();
    await app.start(0);
    expect(events).toContain('startup.migrations.applied');
    expect(events).toContain('api.listening');
    expect(serveSpy).toHaveBeenCalledTimes(1);
  });

  it('second start() logs application.start.duplicate and returns', async () => {
    const app = new Application();
    await app.start(0);
    events.length = 0;
    await app.start(0);
    expect(events).toEqual(['application.start.duplicate']);
    expect(serveSpy).toHaveBeenCalledTimes(1);
  });

  it('stop() stops scheduler, drains server, closes db, exits 0', async () => {
    const app = new Application();
    await app.start(0);
    let exited: number | null = null;
    exitSpy.mockImplementation(((code?: number) => {
      exited = code ?? 0;
      throw new Error('__exit');
    }) as never);
    try {
      await app.stop('SIGTERM', 0);
    } catch (e) {
      // process.exit replaced with throw above
    }
    expect(exited).toBe(0);
    expect(events).toContain('shutdown.start');
    expect(events).toContain('scheduler.stopped');
    expect(events).toContain('shutdown.done');
  });
});
```

- [ ] **Step 2: Run the test**

Run: `bun test apps/api/src/__tests__/app.test.ts`
Expected: PASS — lifecycle smoke checks succeed.

- [ ] **Step 3: Run the full suite to make sure nothing else broke**

Run: `bun test`
Expected: PASS — entire suite green.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/__tests__/app.test.ts
git commit -m "test(api): Application lifecycle smoke tests"
```

---

### Task 7: Phase 1 manual verification

- [ ] **Step 1: Run dev server**

Run: `bun --filter @apex/api dev`
Expected output sequence (within ~2s):
- `startup.migrations.applied`
- `api.listening` with `port`

- [ ] **Step 2: Hit health endpoint**

In a second terminal: `curl -i http://localhost:3001/health/live`
Expected: HTTP 200 with body `{"status":"ok"}`.

- [ ] **Step 3: Send SIGTERM**

Find the bun pid (`lsof -i :3001 | awk 'NR>1 {print $2}' | head -1`), then `kill -TERM <pid>`.
Expected log sequence:
- `shutdown.start { signal: 'SIGTERM' }`
- `scheduler.stopped { tasks: 2 }`
- `shutdown.drain.complete` (or `shutdown.drain.timeout` if drain exceeds `SHUTDOWN_DRAIN_MS`)
- `shutdown.db.closed`
- `shutdown.done`
- process exits 0

- [ ] **Step 4: Confirm Phase 1 DoD**

Run: `wc -l apps/api/src/index.ts`
Expected: ≤ 10 lines.

If everything passes, Phase 1 is complete. **DO NOT** proceed to Phase 2 in the same PR — Phase 1 is a standalone shippable refactor. Open a PR, get review, merge.

---

# PHASE 2 — routes-as-factories + delete `wiring.ts`

Sub-builders move into `Application`. Each builder returns a frozen bundle. `igdb.prime()` moves into `Application.start()` so `wiring.ts`'s top-level await disappears. Route files become `createXRouter(deps)` factories. `wiring.ts` is deleted. The `wiring.test.ts` invariant tests migrate to `app.test.ts` with `app.ts` as the new allowed location.

**Strategy:** Add builders to `Application` incrementally, keeping `wiring.ts` exports valid the whole time. Once all routes are factories and `Application` consumes private fields end-to-end, delete `wiring.ts` in one final task.

---

### Task 8: `buildPersistence()` — repos and transaction runner

**Files:**
- Modify: `apps/api/src/app.ts`

- [ ] **Step 1: Define the `Persistence` bundle interface and builder**

Add to `app.ts` (above the class):

```ts
import type { GameRepository } from './domain/games/game-repository';
import type { DictionaryRepository } from './domain/dictionary/dictionary-repository'; // adjust to actual path
import type { ImportRepository } from './application/import/import-repository'; // adjust to actual path
import type { IdempotencyKeyRepository } from './application/idempotency/idempotency-key-repository';
import type { TransactionRunner } from './application/shared/transaction-runner';
import type { DeveloperKind } from './domain/developers/developer';
import type { GenreKind } from './domain/genres/genre';
import type { PlatformKind } from './domain/platforms/platform';

import { DrizzleGameRepository } from './infrastructure/games/drizzle-game-repository';
import { makeDrizzleDictionaryRepository } from './infrastructure/dictionary/make-drizzle-dictionary-repository';
import { DrizzleImportRepository } from './infrastructure/import/drizzle-import-repository';
import { DrizzleIdempotencyKeyRepository } from './infrastructure/idempotency/drizzle-idempotency-key-repository';
import { DrizzleTransactionRunner } from './infrastructure/db/drizzle-transaction-runner';
import {
  DEVELOPER_DICTIONARY_KIND,
  developers as developersTable,
  // …same imports as wiring.ts
} from './infrastructure/db/schema';
// (port the imports verbatim from wiring.ts; verify paths exactly)

interface Persistence {
  readonly gameRepository: DrizzleGameRepository;
  readonly platformRepository: ReturnType<typeof makeDrizzleDictionaryRepository<PlatformKind>>;
  readonly genreRepository: ReturnType<typeof makeDrizzleDictionaryRepository<GenreKind>>;
  readonly developerRepository: ReturnType<typeof makeDrizzleDictionaryRepository<DeveloperKind>>;
  readonly importRepository: DrizzleImportRepository;
  readonly idempotencyKeyRepository: IdempotencyKeyRepository;
  readonly transactionRunner: TransactionRunner;
}
```

In the class body add a field and a private builder:

```ts
private readonly persistence: Persistence;
// in constructor (FIRST, before scheduler — scheduler doesn't depend on it yet):
this.persistence = this.buildPersistence();

private buildPersistence(): Persistence {
  return Object.freeze({
    gameRepository: new DrizzleGameRepository(),
    platformRepository: makeDrizzleDictionaryRepository<PlatformKind>({
      table: platformsTable,
      kind: PLATFORM_DICTIONARY_KIND,
    }),
    genreRepository: makeDrizzleDictionaryRepository<GenreKind>({
      table: genresTable,
      kind: GENRE_DICTIONARY_KIND,
    }),
    developerRepository: makeDrizzleDictionaryRepository<DeveloperKind>({
      table: developersTable,
      kind: DEVELOPER_DICTIONARY_KIND,
    }),
    importRepository: new DrizzleImportRepository(),
    idempotencyKeyRepository: new DrizzleIdempotencyKeyRepository(),
    transactionRunner: new DrizzleTransactionRunner(db),
  });
}
```

Note: The wiring invariant test (`wiring.test.ts`) currently asserts that `new DrizzleX(` only appears in `wiring.ts`. With Task 8 the constructions also appear in `app.ts`. **The invariant test will fail.** We update the allowed-locations regex in Task 17 below; until then this task creates a duplicated construction (Drizzle repos exist in both `wiring.ts` and `app.ts`). That is the cost of incremental migration. Sub-tasks that follow remove the wiring duplicates one at a time.

Because we can't safely have both `new DrizzleGameRepository()` calls running (each opens DB handles or holds module state? — verify by reading the class), we instead make `app.ts` borrow from `wiring.ts` during Phase 2: **the `buildPersistence` body in this task simply re-exports the wiring instances**, NOT new ones. We will swap to real constructions in Task 17 (the final task) after all routes are factories.

Revise the body:

```ts
private buildPersistence(): Persistence {
  // Phase 2 incremental: borrow from wiring.ts. Replaced by direct
  // constructions in the final cleanup task, when wiring.ts is deleted.
  return Object.freeze({
    gameRepository: wiringGameRepository,
    platformRepository: wiringPlatformRepository,
    genreRepository: wiringGenreRepository,
    developerRepository: wiringDeveloperRepository,
    importRepository: wiringImportRepository,
    idempotencyKeyRepository: wiringIdempotencyKeyRepository,
    transactionRunner: wiringTransactionRunner,
  });
}
```

With explicit aliased imports from wiring:

```ts
import {
  gameRepository as wiringGameRepository,
  platformRepository as wiringPlatformRepository,
  genreRepository as wiringGenreRepository,
  developerRepository as wiringDeveloperRepository,
  importRepository as wiringImportRepository,
  idempotencyKeyRepository as wiringIdempotencyKeyRepository,
  transactionRunner as wiringTransactionRunner,
} from './wiring';
```

This keeps the wiring invariant test green during the incremental migration. Tasks 9–14 do the same trick (borrow from wiring), and Task 17 finally swaps to direct constructions in `app.ts` AND deletes `wiring.ts` in one atomic commit.

- [ ] **Step 2: Run the full suite**

Run: `bun test`
Expected: PASS — `Application` still works (it just doesn't consume `this.persistence` yet, so no behavior change).

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/app.ts
git commit -m "refactor(api): Application.buildPersistence borrows from wiring (incremental)"
```

---

### Task 9: `buildCoverStorage()` and `buildHttpMiddleware()`

**Files:**
- Modify: `apps/api/src/app.ts`

- [ ] **Step 1: Add the bundles and builders**

In `app.ts`:

```ts
import type { CoverStorage } from './application/cover-storage/cover-storage';
import type { MiddlewareHandler } from 'hono';
import { coverStorage as wiringCoverStorage,
         coverStorageAvailable as wiringCoverStorageAvailable,
         idempotencyKeyMiddleware as wiringIdempotencyKeyMiddleware,
         rateLimitMutations as wiringRateLimitMutations,
} from './wiring';

interface CoverStorageBundle {
  readonly storage: CoverStorage | null;
  readonly available: boolean;
}

interface HttpMiddleware {
  readonly idempotencyKey: MiddlewareHandler<{ Variables: AuthVariables }>;
  readonly rateLimitMutations: MiddlewareHandler<{ Variables: AuthVariables }>;
}
```

```ts
private readonly coverStorageBundle: CoverStorageBundle;
private readonly httpMw: HttpMiddleware;

// constructor:
this.coverStorageBundle = this.buildCoverStorage();
this.httpMw = this.buildHttpMiddleware();

private buildCoverStorage(): CoverStorageBundle {
  return Object.freeze({
    storage: wiringCoverStorage,
    available: wiringCoverStorageAvailable,
  });
}

private buildHttpMiddleware(): HttpMiddleware {
  return Object.freeze({
    idempotencyKey: wiringIdempotencyKeyMiddleware,
    rateLimitMutations: wiringRateLimitMutations,
  });
}
```

(Same incremental "borrow from wiring" pattern as Task 8.)

- [ ] **Step 2: Run the full suite**

Run: `bun test`
Expected: PASS — no behavior change yet.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/app.ts
git commit -m "refactor(api): Application.buildCoverStorage / buildHttpMiddleware borrow from wiring"
```

---

### Task 10: `buildIgdbStack()` with `prime()` method (still borrowing)

**Files:**
- Modify: `apps/api/src/app.ts`

The IGDB stack bundle owns the chain holder plus the save/clear use-cases plus the credentials repo plus a `prime()` method. In this task we borrow all of them from wiring; the `prime()` method is a no-op because wiring still does the prime at module load.

- [ ] **Step 1: Add the bundle and builder**

```ts
import type { IgdbChainHolder } from './infrastructure/igdb/igdb-chain-holder';
import type { SaveIgdbIntegration } from './application/integrations/save-igdb-integration';
import type { ClearIgdbIntegration } from './application/integrations/clear-igdb-integration';
import type { IntegrationCredentialsRepository } from './domain/integrations/integration-credentials-repository';
import {
  igdbChainHolder as wiringIgdbChainHolder,
  saveIgdbIntegration as wiringSaveIgdbIntegration,
  clearIgdbIntegration as wiringClearIgdbIntegration,
  integrationCredentialsRepository as wiringIntegrationCredentialsRepository,
} from './wiring';

interface IgdbStack {
  readonly holder: IgdbChainHolder;
  readonly save: SaveIgdbIntegration;
  readonly clear: ClearIgdbIntegration;
  readonly credentialsRepo: IntegrationCredentialsRepository;
  readonly prime: () => Promise<void>;
}
```

```ts
private readonly igdb: IgdbStack;

// constructor:
this.igdb = this.buildIgdbStack();

private buildIgdbStack(): IgdbStack {
  return Object.freeze({
    holder: wiringIgdbChainHolder,
    save: wiringSaveIgdbIntegration,
    clear: wiringClearIgdbIntegration,
    credentialsRepo: wiringIntegrationCredentialsRepository,
    // Phase 2 incremental: wiring.ts still runs `await primeIgdbChainFromDb()`
    // at module load. Once `wiring.ts` is deleted (final task) this will become
    // the real prime function.
    prime: async () => { /* already primed by wiring.ts top-level await */ },
  });
}
```

- [ ] **Step 2: Run the full suite**

Run: `bun test`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/app.ts
git commit -m "refactor(api): Application.buildIgdbStack borrows from wiring (prime is no-op)"
```

---

### Task 11: `buildGameUseCases()`, `buildDictionaryStack()`, `buildDataIO()`, `buildCronStack()` — all borrowing

**Files:**
- Modify: `apps/api/src/app.ts`

These four builders fill out the remaining bundles. Each one borrows from wiring; we wire them up in `registerRoutes()` in the next tasks.

- [ ] **Step 1: Add all four bundles + builders**

Import the wiring symbols (`createGame`, `updateGame`, …, `genresRouter`, `developersRouter`, `platformsRouter`, `exportData`, `importData`, `cleanupOrphans`, `sweepRateLimitBuckets`, `cronLock`) with `wiring*` aliases. Define:

```ts
interface GameOps {
  readonly create: typeof wiringCreateGame;
  readonly update: typeof wiringUpdateGame;
  readonly delete: typeof wiringDeleteGame;
  readonly list: typeof wiringListGames;
  readonly get: typeof wiringGetGame;
  readonly moveToCollection: typeof wiringMoveToCollection;
}

interface DictionaryBundle<Kind extends string> {
  readonly useCases: { /* shape from makeDictionaryUseCases */ };
  readonly router: Hono<{ Variables: AuthVariables }>;
}

interface Dictionaries {
  readonly platforms: DictionaryBundle<PlatformKind>;
  readonly genres: DictionaryBundle<GenreKind>;
  readonly developers: DictionaryBundle<DeveloperKind>;
}

interface DataIO {
  readonly exportData: typeof wiringExportData;
  readonly importData: typeof wiringImportData;
}

interface CronBundle {
  readonly cleanupOrphans: typeof wiringCleanupOrphans;
  readonly sweepRateLimitBuckets: typeof wiringSweepRateLimitBuckets;
}
```

Add the private fields and assignments in the constructor in this order:

```ts
this.persistence       = this.buildPersistence();
this.coverStorageBundle = this.buildCoverStorage();
this.igdb              = this.buildIgdbStack();
this.gameOps           = this.buildGameUseCases();
this.dictionaries      = this.buildDictionaryStack();
this.dataIO            = this.buildDataIO();
this.cron              = this.buildCronStack();
this.httpMw            = this.buildHttpMiddleware();
this.scheduler         = new Scheduler({
  logger: baseLogger,
  tasks: [
    { name: 'cleanup.orphans',  intervalMs: ONE_HOUR_MS,     run: () => this.cron.cleanupOrphans.run() },
    { name: 'rate_limit.sweep', intervalMs: FIVE_MINUTES_MS, run: () => this.cron.sweepRateLimitBuckets.run() },
  ],
});
```

Each builder body returns `Object.freeze({ … })` with wiring-aliased entries (same incremental "borrow" pattern as Task 8).

- [ ] **Step 2: Run the full suite**

Run: `bun test`
Expected: PASS — scheduler now goes through `this.cron`, but the underlying use-cases are still the wiring singletons, so behavior is unchanged.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/app.ts
git commit -m "refactor(api): all Application sub-builders defined (still borrowing from wiring)"
```

---

### Task 12: Convert `routes/games.ts` to `createGamesRouter(deps)` factory

This is the largest route file. Its deps: all 6 game use-cases, the `igdbChainHolder`, and the `idempotencyKeyMiddleware`. The factory takes a single `deps` object.

**Files:**
- Modify: `apps/api/src/routes/games.ts`
- Modify: `apps/api/src/app.ts` (mount via factory)

- [ ] **Step 1: Refactor `routes/games.ts` to export a factory**

Replace the wiring imports with a `createGamesRouter` function. Inside, hoist `idempotencyKeyMiddleware`, `igdbChainHolder`, and the use-cases to closures over `deps`:

```ts
// apps/api/src/routes/games.ts (TOP, replacing the `import { … } from '../wiring'`)
import { Hono } from 'hono';
import type { MiddlewareHandler } from 'hono';
import type { Game } from '../domain/games/game';
import type { CreateGame } from '../application/games/create-game';
import type { UpdateGame } from '../application/games/update-game';
import type { DeleteGame } from '../application/games/delete-game';
import type { ListGames } from '../application/games/list-games';
import type { GetGame } from '../application/games/get-game';
import type { MoveToCollection } from '../application/games/move-to-collection';
import type { IgdbChainHolder } from '../infrastructure/igdb/igdb-chain-holder';
import {
  domainProblem,
  internalProblem,
  optimisticLockProblem,
  payloadTooLargeProblem,
  zodIssuesToProblemJson,
} from './_problem-json';
import { createGamesMetadataRouter } from './games-metadata';
import type { AuthVariables } from './middleware/require-auth';

export interface GamesRouterDeps {
  readonly create: CreateGame;
  readonly update: UpdateGame;
  readonly delete: DeleteGame;
  readonly list: ListGames;
  readonly get: GetGame;
  readonly moveToCollection: MoveToCollection;
  readonly igdbChainHolder: IgdbChainHolder;
  readonly idempotencyKey: MiddlewareHandler<{ Variables: AuthVariables }>;
}

// (toGameResponse and ARRAY_PARAM_LIMIT unchanged — keep them at module scope)

export function createGamesRouter(deps: GamesRouterDeps): Hono<{ Variables: AuthVariables }> {
  const games = new Hono<{ Variables: AuthVariables }>();

  // Every handler body that previously referenced `listGames`, `createGame`,
  // `updateGame`, `deleteGame`, `getGame`, `moveToCollection`, `igdbChainHolder`,
  // or `idempotencyKeyMiddleware` now uses `deps.list`, `deps.create`, etc.
  // (Reproduce each handler verbatim; only the symbol references change.)

  games.get('/', async (c) => { /* uses deps.list */ });
  games.post('/', deps.idempotencyKey, async (c) => { /* uses deps.create */ });
  games.post('/:externalId/move-to-collection', deps.idempotencyKey, async (c) => {
    /* uses deps.moveToCollection */
  });
  games.route('/metadata', createGamesMetadataRouter({ chainHolder: deps.igdbChainHolder }));
  games.patch('/:externalId/metadata', async (c) => { /* uses deps.igdbChainHolder.get() */ });
  games.get('/:externalId', async (c) => { /* uses deps.get */ });
  games.put('/:externalId', async (c) => { /* uses deps.update */ });
  games.delete('/:externalId', async (c) => { /* uses deps.delete */ });

  return games;
}
```

(Important: the engineer reproduces the handler bodies verbatim from the existing `games.ts`. Only the closure-bound symbols change. Don't try to "shorten" any handler — copy-paste, then s/listGames/deps.list/, etc.)

- [ ] **Step 2: Update `app.ts` to mount via the factory**

In `app.ts`, the `mountAuthed('/api/games', games)` call breaks because `games` is no longer exported. Replace it with:

```ts
import { createGamesRouter } from './routes/games';
// (remove `import { games } from './routes/games';`)

// inside registerRoutes(), the `/api/games` block becomes:
this.hono.use('/api/games/*', requireAuth);
this.hono.use('/api/games/*', this.httpMw.rateLimitMutations);
this.hono.route(
  '/api/games',
  createGamesRouter({
    create: this.gameOps.create,
    update: this.gameOps.update,
    delete: this.gameOps.delete,
    list: this.gameOps.list,
    get: this.gameOps.get,
    moveToCollection: this.gameOps.moveToCollection,
    igdbChainHolder: this.igdb.holder,
    idempotencyKey: this.httpMw.idempotencyKey,
  }),
);
```

- [ ] **Step 3: Run the games test files to verify**

Run: `bun test apps/api/src/routes/games.test.ts apps/api/src/routes/games.idor.test.ts`
Expected: PASS. The tests construct their own `Hono` instances and mount `games`; the games tests likely import the legacy named export. Two options:
  1. Keep a named export `games` that calls `createGamesRouter` with default wiring deps — BAD: re-introduces the wiring coupling we're trying to remove.
  2. Refactor the tests to call `createGamesRouter` with explicit deps (preferred).

Pick option 2. Update `games.test.ts` / `games.idor.test.ts` (and `wiring.test.ts`, which also imports `games`) to call `createGamesRouter` with test fakes or the real wiring deps. For each test file:

```ts
// at top of test file, replacing `import { games } from '../routes/games'`:
import { createGamesRouter } from '../routes/games';
import {
  createGame, updateGame, deleteGame, listGames, getGame, moveToCollection,
  igdbChainHolder, idempotencyKeyMiddleware,
} from '../wiring';

const games = createGamesRouter({
  create: createGame, update: updateGame, delete: deleteGame,
  list: listGames, get: getGame, moveToCollection,
  igdbChainHolder, idempotencyKey: idempotencyKeyMiddleware,
});
```

(In `wiring.test.ts`, same change. We'll delete `wiring.test.ts` entirely in Task 17 — but for now, keep it green.)

- [ ] **Step 4: Run the full suite**

Run: `bun test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/routes/games.ts apps/api/src/routes/games.test.ts apps/api/src/routes/games.idor.test.ts apps/api/src/__tests__/wiring.test.ts apps/api/src/app.ts
git commit -m "refactor(api): routes/games.ts becomes createGamesRouter(deps) factory"
```

---

### Task 13: Convert `routes/export.ts`, `routes/import.ts`, `routes/me.ts` to factories

Same pattern as Task 12, but each route is smaller.

**Files:**
- Modify: `apps/api/src/routes/export.ts`, `routes/import.ts`, `routes/me.ts`
- Modify: `apps/api/src/app.ts`

- [ ] **Step 1: `routes/export.ts`**

```ts
// apps/api/src/routes/export.ts
import { Hono } from 'hono';
import type { ExportData } from '../application/export/export-data';
import type { AuthVariables } from './middleware/require-auth';

export interface ExportRouterDeps {
  readonly exportData: ExportData;
}

export function createExportRouter(deps: ExportRouterDeps): Hono<{ Variables: AuthVariables }> {
  const route = new Hono<{ Variables: AuthVariables }>();
  route.get('/', async (c) => {
    const userId = c.get('user').id;
    const snapshot = await deps.exportData.execute(userId);
    const date = snapshot.exportedAt.slice(0, 10);
    c.header('Content-Type', 'application/json; charset=utf-8');
    c.header('Content-Disposition', `attachment; filename="apex-export-${date}.json"`);
    return c.body(JSON.stringify(snapshot, null, 2));
  });
  return route;
}
```

- [ ] **Step 2: `routes/import.ts`**

```ts
// apps/api/src/routes/import.ts
import { Hono } from 'hono';
import type { MiddlewareHandler } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { z } from 'zod';
import type { ImportData } from '../application/import/import-data';
import type { AuthVariables } from './middleware/require-auth';

const BodySchema = z.object({
  mode: z.enum(['merge', 'replace']),
  snapshot: z.unknown(),
});

export interface ImportRouterDeps {
  readonly importData: ImportData;
  readonly idempotencyKey: MiddlewareHandler<{ Variables: AuthVariables }>;
}

export function createImportRouter(deps: ImportRouterDeps): Hono<{ Variables: AuthVariables }> {
  const route = new Hono<{ Variables: AuthVariables }>();
  route.post(
    '/',
    bodyLimit({
      maxSize: 5 * 1024 * 1024,
      onError: (c) => c.json({ error: 'payload_too_large' }, 413),
    }),
    deps.idempotencyKey,
    async (c) => {
      const userId = c.get('user').id;
      const body = await c.req.json().catch(() => null);
      const parsed = BodySchema.safeParse(body);
      if (!parsed.success) {
        return c.json({ error: 'invalid_body', issues: parsed.error.issues }, 400);
      }
      const rawJson = JSON.stringify(parsed.data.snapshot);
      const result = await deps.importData.execute(userId, rawJson, parsed.data.mode);
      if (!result.ok) {
        return c.json({ error: result.error.kind, detail: result.error }, 400);
      }
      return c.json(result.value);
    },
  );
  return route;
}
```

- [ ] **Step 3: `routes/me.ts`**

```ts
// apps/api/src/routes/me.ts
import { Hono } from 'hono';
import { isUploadAllowed } from '../infrastructure/cover-storage/upload-allowlist';
import type { AuthVariables } from './middleware/require-auth';

export interface MeRouterDeps {
  readonly coverStorageAvailable: boolean;
}

export function createMeRouter(deps: MeRouterDeps): Hono<{ Variables: AuthVariables }> {
  const route = new Hono<{ Variables: AuthVariables }>();
  route.get('/permissions', (c) => {
    const email = c.get('user').email;
    return c.json({
      canUploadCovers: deps.coverStorageAvailable && isUploadAllowed(email),
    });
  });
  return route;
}
```

- [ ] **Step 4: Update `app.ts` mounts**

In `registerRoutes()`:

```ts
import { createExportRouter } from './routes/export';
import { createImportRouter } from './routes/import';
import { createMeRouter } from './routes/me';
// (remove `exportRoute`, `importRoute`, `me` imports)

// Replace each mountAuthed call:
this.hono.use('/api/export/*', requireAuth);
this.hono.use('/api/export/*', this.httpMw.rateLimitMutations);
this.hono.route('/api/export', createExportRouter({ exportData: this.dataIO.exportData }));

this.hono.use('/api/import/*', requireAuth);
this.hono.use('/api/import/*', this.httpMw.rateLimitMutations);
this.hono.route('/api/import', createImportRouter({
  importData: this.dataIO.importData,
  idempotencyKey: this.httpMw.idempotencyKey,
}));

this.hono.use('/api/me/*', requireAuth);
this.hono.use('/api/me/*', this.httpMw.rateLimitMutations);
this.hono.route('/api/me', createMeRouter({
  coverStorageAvailable: this.coverStorageBundle.available,
}));
```

- [ ] **Step 5: Run the full suite**

Run: `bun test`
Expected: PASS — if any test imports `me`, `exportRoute`, or `importRoute` directly, update those imports the same way as in Task 12 Step 3 (use the factory + wiring deps).

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/routes/export.ts apps/api/src/routes/import.ts apps/api/src/routes/me.ts apps/api/src/app.ts
git commit -m "refactor(api): export/import/me routes become factories"
```

---

### Task 14: Delete `routes/platforms.ts`, `routes/genres.ts`, `routes/developers.ts`; mount dictionaries directly

These three files are pure re-exports from `wiring.ts` (`export { genresRouter as genres } from '../wiring'`). Once `app.ts` constructs them via `buildDictionaryStack`, the re-export files have no purpose.

**Files:**
- Delete: `apps/api/src/routes/platforms.ts`, `routes/genres.ts`, `routes/developers.ts`
- Modify: `apps/api/src/app.ts`

- [ ] **Step 1: Update `app.ts` mounts to use `this.dictionaries.X.router`**

In `registerRoutes()`:

```ts
// (remove imports of `platforms`, `genres`, `developers`)
this.hono.use('/api/platforms/*', requireAuth);
this.hono.use('/api/platforms/*', this.httpMw.rateLimitMutations);
this.hono.route('/api/platforms', this.dictionaries.platforms.router);

this.hono.use('/api/genres/*', requireAuth);
this.hono.use('/api/genres/*', this.httpMw.rateLimitMutations);
this.hono.route('/api/genres', this.dictionaries.genres.router);

this.hono.use('/api/developers/*', requireAuth);
this.hono.use('/api/developers/*', this.httpMw.rateLimitMutations);
this.hono.route('/api/developers', this.dictionaries.developers.router);
```

- [ ] **Step 2: Delete the re-export files**

```bash
rm apps/api/src/routes/platforms.ts apps/api/src/routes/genres.ts apps/api/src/routes/developers.ts
```

- [ ] **Step 3: Find any remaining references**

Run: `rg "from '../routes/(platforms|genres|developers)'" apps/api/src/`
Expected: no hits. If any test imports them, refactor the test to use `wiring.platformsRouter` / `wiring.genresRouter` / `wiring.developersRouter` directly, OR to construct an `Application` and reach through `dictionaries.X.router` if appropriate.

- [ ] **Step 4: Run the full suite**

Run: `bun test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/routes/ apps/api/src/app.ts
git commit -m "refactor(api): drop pure-reexport dictionary route files; mount from dictionaries.X.router"
```

---

### Task 15: Move `primeIgdbChainFromDb` into `Application.start()`

The top-level `await primeIgdbChainFromDb()` in `wiring.ts` is the last remaining top-level await. Move its body into `buildIgdbStack().prime` and call `await this.igdb.prime()` from `start()`.

**Files:**
- Modify: `apps/api/src/wiring.ts` (remove top-level await; export the function)
- Modify: `apps/api/src/app.ts` (call `igdb.prime()` in start)

- [ ] **Step 1: In `wiring.ts`, export `primeIgdbChainFromDb` and remove the top-level await**

```ts
// apps/api/src/wiring.ts (near the bottom)
// REMOVE the line: `await primeIgdbChainFromDb();`
// CHANGE the function from `async function primeIgdbChainFromDb()` to:
export async function primeIgdbChainFromDb(): Promise<void> {
  // (body unchanged)
}
```

- [ ] **Step 2: In `app.ts`, wire the prime call**

```ts
import { primeIgdbChainFromDb as wiringPrime } from './wiring';

private buildIgdbStack(): IgdbStack {
  return Object.freeze({
    // (other fields unchanged)
    prime: () => wiringPrime(),
  });
}
```

And in `start()`, after `verifyDatabase()`:

```ts
await this.runMigrations();
await this.verifyDatabase();
try {
  await this.igdb.prime();
} catch (err) {
  baseLogger.event('igdb.prime.failed', {
    reason: err instanceof Error ? err.message : String(err),
  });
  // Do NOT rethrow — chain stays unconfigured, routes return 503.
}
this.registerMiddleware();
// …
```

- [ ] **Step 3: Run the full suite**

Run: `bun test`
Expected: PASS — and now there are no top-level awaits in `apps/api/src/`.

- [ ] **Step 4: Verify the invariant**

Run: `rg "^await " apps/api/src/`
Expected: no hits.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/wiring.ts apps/api/src/app.ts
git commit -m "refactor(api): igdb prime moves from wiring.ts top-level into Application.start()"
```

---

### Task 16: `Application.buildForTesting` + holder-parameterized fixture

**Files:**
- Modify: `apps/api/src/app.ts` (add static `buildForTesting`)
- Modify: `apps/api/src/__tests__/_fixtures/igdb-chain-fixture.ts` (accept holder param)

The fixture currently imports `igdbChainHolder` from `'../../wiring'`. When `wiring.ts` is deleted (next task), that import dies. To keep `bun test --randomize` correctness — snapshot+restore the SAME `IgdbChainHolder` instance — the fixture takes the holder as a parameter and the test passes it in.

- [ ] **Step 1: Add `buildForTesting` to `Application`**

```ts
export interface ApplicationTestOverrides {
  readonly igdb?: { readonly holder?: IgdbChainHolder };
  // (extend later as needed)
}

static buildForTesting(_overrides: ApplicationTestOverrides = {}): Application {
  const app = new Application();
  // Phase 2 incremental: overrides are a hook for future tests; today
  // the only thing tests need is the chain holder, which is reachable via
  // `app.igdbHolderForTesting()`. Full override injection lands when
  // wiring.ts is deleted and builders construct everything from scratch.
  return app;
}

igdbHolderForTesting(): IgdbChainHolder {
  return this.igdb.holder;
}

honoForTesting(): Hono<{ Variables: AuthVariables }> {
  return this.hono;
}
```

- [ ] **Step 2: Update the fixture to accept the holder via parameter**

```ts
// apps/api/src/__tests__/_fixtures/igdb-chain-fixture.ts
import { afterAll, beforeAll } from 'bun:test';
import type { IgdbChain, IgdbChainHolder } from '../../infrastructure/igdb/igdb-chain-holder';

type ChainSnapshot = IgdbChain | null;

export function useDisabledIgdbChain(holder: IgdbChainHolder): void {
  let snapshot: ChainSnapshot = null;
  beforeAll(() => {
    snapshot = holder.get();
    holder.swap(null);
  });
  afterAll(() => {
    holder.__setChainForTest(snapshot);
  });
}

export function usePrimedIgdbChain(
  holder: IgdbChainHolder,
  creds: { clientId: string; clientSecret: string },
): void {
  let snapshot: ChainSnapshot = null;
  beforeAll(() => {
    snapshot = holder.get();
    holder.swap(creds);
  });
  afterAll(() => {
    holder.__setChainForTest(snapshot);
  });
}
```

- [ ] **Step 3: Update every fixture caller**

Run: `rg -l "useDisabledIgdbChain|usePrimedIgdbChain" apps/api/src/`

For each hit, locate the call site and update:

```ts
// BEFORE:
useDisabledIgdbChain();

// AFTER:
import { Application } from '../../app';
const __testApp = Application.buildForTesting();
useDisabledIgdbChain(__testApp.igdbHolderForTesting());
```

Or, where the test already has access to the wiring `igdbChainHolder` import directly (e.g. `wiring.test.ts`), pass that instead. This is a per-file mechanical change; resist the temptation to refactor further while doing it.

- [ ] **Step 4: Run the full suite**

Run: `bun test`
Expected: PASS — fixture snapshot+restore works with parameter passing, and `bun test --randomize` still produces deterministic results.

Run: `bun test --randomize` 5 times. Expected: all 5 runs PASS (no order-dependent failures).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/app.ts apps/api/src/__tests__/
git commit -m "test(api): Application.buildForTesting + holder-parameterized IGDB fixture"
```

---

### Task 17: Delete `wiring.ts`; inline real constructions into `Application` builders

This is the final task. Each builder's body switches from "borrow from wiring" to "construct directly". `wiring.ts` deletes. `wiring.test.ts` renames/moves to `app.test.ts` and its invariant tests update to allow `app.ts` as the construction site.

**Files:**
- Modify: `apps/api/src/app.ts` (replace all `wiringX` borrows with real constructions; port the IGDB prime body)
- Delete: `apps/api/src/wiring.ts`
- Delete: `apps/api/src/__tests__/wiring.test.ts`
- Modify: `apps/api/src/__tests__/app.test.ts` (absorb the invariant tests with allowed location = `app.ts`)
- Modify: Any test file still importing from `'../wiring'`

- [ ] **Step 1: Port the IGDB prime body into `buildIgdbStack`**

Replace the borrowed `prime: () => wiringPrime()` with the real implementation. Add the `firstUserIdOrNull` helper as a private method on `Application` (it queries the auth user table).

```ts
import { user as authUser } from './infrastructure/db/auth-schema';

private async firstUserIdOrNull(): Promise<string> {
  const [row] = await db.select({ id: authUser.id }).from(authUser).limit(1);
  return row?.id ?? '';
}

private buildIgdbStack(): IgdbStack {
  const metadataCacheRepository = new MetadataCacheRepository();
  const igdbTokenStorage = new DrizzleIgdbTokenStorage();
  const integrationCipher = new Aes256GcmCipher();
  const credentialsRepo = new DrizzleIntegrationCredentialsRepository();
  const holder = new IgdbChainHolder({
    logger: baseLogger,
    tokenStorage: igdbTokenStorage,
    metadataCacheRepository,
    gameRepository: this.persistence.gameRepository,
    transactionRunner: this.persistence.transactionRunner,
    isCoverHostAllowed,
    timeoutMs: env.IGDB_TIMEOUT_MS,
    cacheTtlDays: env.IGDB_CACHE_TTL_DAYS,
  });
  const verifier = new TwitchIgdbCredentialsVerifier({
    fetch,
    timeoutMs: env.IGDB_TIMEOUT_MS,
    logger: baseLogger,
  });
  const save = new SaveIgdbIntegration({
    repo: credentialsRepo,
    cipher: integrationCipher,
    verifier,
    chainHolder: holder,
    now: () => new Date(),
    uuid: () => crypto.randomUUID(),
  });
  const clear = new ClearIgdbIntegration({
    repo: credentialsRepo,
    tokenStorage: igdbTokenStorage,
    chainHolder: holder,
    transactionRunner: this.persistence.transactionRunner,
  });
  const prime = async (): Promise<void> => {
    const stored = await credentialsRepo.findByUserAndKind(
      await this.firstUserIdOrNull(),
      'igdb',
    );
    if (stored === null) {
      baseLogger.event('igdb.disabled', {
        reason: 'no integration_credentials row for IGDB; metadata feature disabled',
      });
      return;
    }
    if (!stored.enabled) {
      baseLogger.event('igdb.disabled', {
        reason: 'integration_credentials row exists but is disabled',
      });
      return;
    }
    const decryptResult = integrationCipher.decrypt(stored.clientSecretCiphertext);
    if (!decryptResult.ok) {
      baseLogger.event('igdb.disabled', {
        reason: `failed to decrypt stored IGDB client secret: ${decryptResult.error.kind}`,
      });
      return;
    }
    holder.swap({
      clientId: stored.clientId.value,
      clientSecret: decryptResult.value,
    });
  };
  return Object.freeze({
    holder,
    save,
    clear,
    credentialsRepo,
    prime,
  });
}
```

- [ ] **Step 2: Port persistence, cover storage, dictionaries, data IO, cron, http middleware**

Each builder body switches from `wiringX` aliases to direct construction. Verbatim ports of the `wiring.ts` logic. The order of construction inside each builder doesn't matter; only the relative order across builders does (persistence → cover → igdb → gameOps → dictionaries → dataIO → cron → httpMw, which the constructor already enforces).

For `buildHttpMiddleware`:

```ts
private buildHttpMiddleware(): HttpMiddleware {
  return Object.freeze({
    idempotencyKey: idempotencyKeyMiddlewareFactory({
      repo: this.persistence.idempotencyKeyRepository,
    }),
    rateLimitMutations: mutationRateLimit({ db, now: () => Date.now() }),
  });
}
```

For `buildCronStack`:

```ts
private buildCronStack(): CronBundle {
  const cronOwner = `${process.env.HOSTNAME ?? 'local'}-${process.pid}-${crypto.randomUUID().slice(0, 8)}`;
  const cronLock = new CronLock({ db, owner: cronOwner });
  return Object.freeze({
    cleanupOrphans: new CleanupOrphans(
      this.coverStorageBundle.storage,
      this.persistence.gameRepository,
      this.persistence.idempotencyKeyRepository,
      cronLock,
      {
        idempotencyTtlMs: env.IDEMPOTENCY_TTL_HOURS * 60 * 60 * 1000,
        logger: baseLogger,
      },
    ),
    sweepRateLimitBuckets: new SweepRateLimitBuckets({
      db,
      lock: cronLock,
      now: () => Date.now(),
    }),
  });
}
```

For `buildGameUseCases`:

```ts
private buildGameUseCases(): GameOps {
  const p = this.persistence;
  return Object.freeze({
    create: new CreateGame(p.gameRepository, p.platformRepository),
    update: new UpdateGame(p.gameRepository, p.platformRepository, p.transactionRunner),
    delete: new DeleteGame(p.gameRepository, p.transactionRunner),
    list: new ListGames(p.gameRepository),
    get: new GetGame(p.gameRepository),
    moveToCollection: new MoveToCollection(p.gameRepository, p.transactionRunner),
  });
}
```

For `buildDictionaryStack`: port the three `makeDictionaryUseCases` calls + `makeDictionaryRouter` calls from `wiring.ts` verbatim. Return `Object.freeze({ platforms: { useCases, router }, genres: …, developers: … })`.

For `buildDataIO`:

```ts
private buildDataIO(): DataIO {
  return Object.freeze({
    exportData: new ExportData(this.persistence.gameRepository, this.persistence.platformRepository),
    importData: new ImportData(
      this.persistence.gameRepository,
      this.persistence.platformRepository,
      this.persistence.importRepository,
    ),
  });
}
```

For `buildPersistence`:

```ts
private buildPersistence(): Persistence {
  return Object.freeze({
    gameRepository: new DrizzleGameRepository(),
    platformRepository: makeDrizzleDictionaryRepository<PlatformKind>({
      table: platformsTable, kind: PLATFORM_DICTIONARY_KIND,
    }),
    genreRepository: makeDrizzleDictionaryRepository<GenreKind>({
      table: genresTable, kind: GENRE_DICTIONARY_KIND,
    }),
    developerRepository: makeDrizzleDictionaryRepository<DeveloperKind>({
      table: developersTable, kind: DEVELOPER_DICTIONARY_KIND,
    }),
    importRepository: new DrizzleImportRepository(),
    idempotencyKeyRepository: new DrizzleIdempotencyKeyRepository(),
    transactionRunner: new DrizzleTransactionRunner(db),
  });
}
```

For `buildCoverStorage`:

```ts
private buildCoverStorage(): CoverStorageBundle {
  const token = env.UPLOADTHING_TOKEN;
  const available = token.length > 0;
  return Object.freeze({
    storage: available ? new UploadThingCoverStorage(token) : null,
    available,
  });
}
```

Delete all `wiringX` aliased imports from `app.ts`.

- [ ] **Step 3: Delete `wiring.ts`**

```bash
rm apps/api/src/wiring.ts
```

- [ ] **Step 4: Update any test that still imports from `../wiring`**

Run: `rg "from '../wiring'|from '../../wiring'|from './wiring'" apps/api/src/`
Expected: 0 hits. If any remain, refactor: instantiate an `Application` (via `Application.buildForTesting()`) and reach through `app.igdbHolderForTesting()` / `app.honoForTesting()`. For unit tests of use-cases, instantiate the use-case directly with fakes (these tests should NOT be reaching through wiring anyway — they're integration tests masquerading as unit tests).

- [ ] **Step 5: Rename `wiring.test.ts` → keep as `app.test.ts` or merge**

If `app.test.ts` (from Task 6) doesn't already contain the invariant tests, port them now. Update the allowed-location regexes:
- `new (DrizzleGameRepository|DrizzleTransactionRunner|IgdbChainHolder)\\(` → exclude `**/app.ts` instead of `**/wiring.ts`
- `igdbChainHolder\\.swap\\(` → exclude `**/app.ts` instead of `**/wiring.ts`

Then delete `wiring.test.ts`:

```bash
rm apps/api/src/__tests__/wiring.test.ts
```

The two 503 smoke tests (`GET /api/games/metadata/candidates` → 503 and `PATCH /api/games/:externalId/metadata` → 503) move into `app.test.ts`. They construct an `Application` via `Application.buildForTesting()`, install the `useDisabledIgdbChain(app.igdbHolderForTesting())` fixture, and exercise `app.honoForTesting().request(...)`.

- [ ] **Step 6: Verify the invariants**

Run: `rg "from '../wiring'|from '../../wiring'|from './wiring'" apps/api/src/`
Expected: 0 hits.

Run: `rg "^await " apps/api/src/`
Expected: 0 hits.

Run: `ls apps/api/src/wiring.ts apps/api/src/__tests__/wiring.test.ts apps/api/src/routes/platforms.ts apps/api/src/routes/genres.ts apps/api/src/routes/developers.ts 2>&1`
Expected: each file reports "No such file or directory".

- [ ] **Step 7: Run the full suite + typecheck**

Run: `bun test && bun --filter @apex/api typecheck`
Expected: PASS

Run: `bun test --randomize` 5 times. Expected: 5/5 PASS.

- [ ] **Step 8: Phase 2 manual verification**

Run: `bun --filter @apex/api dev`
Expected log sequence:
- `startup.migrations.applied`
- `igdb.disabled { reason: 'no integration_credentials row for IGDB; metadata feature disabled' }` (or `igdb.prime.failed` if your local DB has corrupt state)
- `api.listening`

Manual smoke checks against `http://localhost:3001`:
- `curl /health/live` → 200
- Sign in via the frontend (`apps/web` `bun dev` in another terminal); list games → 200, create game → 201, update game → 200, delete game → 200
- Dictionary CRUD on `/api/platforms`, `/api/genres`, `/api/developers` works
- `POST /api/integrations/igdb` save → 200; `GET /api/integrations/igdb` → 200; clear → 200
- `POST /api/upload/cover` works if `UPLOADTHING_TOKEN` set, otherwise returns 503 with feature-disabled body

Send SIGTERM; verify the same shutdown log sequence as Phase 1.

- [ ] **Step 9: Commit**

```bash
git add apps/api/src/app.ts apps/api/src/__tests__/
git rm apps/api/src/wiring.ts apps/api/src/__tests__/wiring.test.ts
git commit -m "refactor(api): delete wiring.ts; Application owns full composition"
```

---

## Phase 2 DoD checklist

Before opening the Phase 2 PR, verify every item:

- [ ] No `from '../wiring'` / `from './wiring'` / `from '../../wiring'` import anywhere in `apps/api/src` (`rg` returns 0 hits)
- [ ] No top-level `await` anywhere in `apps/api/src` (`rg "^await "` returns 0 hits)
- [ ] `apps/api/src/wiring.ts` does not exist
- [ ] `apps/api/src/routes/platforms.ts`, `routes/genres.ts`, `routes/developers.ts` do not exist
- [ ] `apps/api/src/__tests__/wiring.test.ts` does not exist (its invariants migrated to `app.test.ts`)
- [ ] `bun test` passes
- [ ] `bun --filter @apex/api typecheck` passes
- [ ] `bun test --randomize` passes 5 consecutive runs
- [ ] `bun dev` boots and responds to `/health/live`
- [ ] Manual smoke checks (games CRUD, dict CRUD, integrations, upload) all pass against the running dev server
- [ ] SIGTERM produces the documented shutdown log sequence with bounded drain

---

## Out of scope (explicit)

These were listed in the spec as out of scope and must NOT be tackled in this plan:
- Replacing `baseLogger` with pino-style structured logging
- Stripe billing / nodemailer / PDF (electrician-only features)
- Switching from `better-sqlite3` to Postgres
- Frontend (`apps/web`) changes — except a smoke check that the existing frontend continues to talk to the refactored API

If any of these become tempting during execution, stop and ask the user.
