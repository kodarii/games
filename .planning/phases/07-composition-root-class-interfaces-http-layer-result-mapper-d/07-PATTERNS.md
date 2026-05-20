# Phase 7: Composition root + interfaces/http + result mapper + domain events — Pattern Map

**Mapped:** 2026-05-20
**Files analyzed:** 33 created/moved + 7 modified
**Analogs found:** 36 / 40 (4 NEW scaffolds with reference-repo template only)

## File Classification

### New files (created in Phase 7)

| New File | Role | Data Flow | Closest Analog | Match Quality |
|----------|------|-----------|----------------|---------------|
| `apps/api/src/application.ts` | composition-root | lifecycle | `/Users/kodari/Developer/electrician-offer-app/server/src/app.ts` | role-match (Apex stack differs: Bun.serve, bun:sqlite, per-user) |
| `apps/api/src/infrastructure/db/run-migrations.ts` | infrastructure-helper | idempotent boot | `apps/api/src/infrastructure/db/client.ts:24-28` | exact (extract existing side-effect into named fn) |
| `apps/api/src/__tests__/_fixtures/migrations-setup.ts` | test-fixture | preload | `apps/api/src/__tests__/_fixtures/igdb-chain-fixture.ts` | role-match |
| `apps/api/src/domain/shared/aggregate-root.ts` | aggregate-base | in-memory buffer | `/Users/kodari/Developer/electrician-offer-app/server/src/domain/shared/aggregate-root.ts` | exact (copy template + Apex naming) |
| `apps/api/src/domain/shared/domain-event.ts` | domain-port | contract | `/Users/kodari/Developer/electrician-offer-app/server/src/domain/shared/domain-event.ts` | role-match (Apex adds `userId`) |
| `apps/api/src/domain/shared/event-bus.ts` | domain-port | pub-sub | `/Users/kodari/Developer/electrician-offer-app/server/src/domain/shared/event-bus.ts` + `apps/api/src/domain/games/game-repository.ts` | exact |
| `apps/api/src/domain/games/events/game-deleted.event.ts` | domain-event | event-driven | `/Users/kodari/Developer/electrician-offer-app/server/src/domain/billing/events/subscription-activated.event.ts` (templated below) | role-match |
| `apps/api/src/domain/games/events/game-metadata-applied.event.ts` | domain-event | event-driven | (same) | role-match |
| `apps/api/src/infrastructure/events/in-process-event-bus.ts` | infrastructure-adapter | pub-sub | `/Users/kodari/Developer/electrician-offer-app/server/src/infrastructure/events/in-process-event-bus.ts` | exact (rename logger import) |
| `apps/api/src/application/events/game-deleted-cover-cleanup.handler.ts` | application-event-handler | event-driven | `apps/api/src/application/cover-storage/cleanup-orphans.ts` + reference `SubscriptionActivatedHandler` | role-match (handler pattern from electrician, storage call from cleanup-orphans) |
| `apps/api/src/application/events/game-metadata-applied-log.handler.ts` | application-event-handler | event-driven | reference electrician `subscription-*-handler` + `apps/api/src/infrastructure/logging/logger.ts` usage | role-match |
| `apps/api/src/interfaces/http/_shared/problem-json.ts` | interface-shared-helper | request-response | `apps/api/src/routes/_problem-json.ts` | exact (direct move, drop leading `_`) |
| `apps/api/src/interfaces/http/_shared/make-dictionary-router.ts` | interface-shared-helper | factory | `apps/api/src/routes/_make-dictionary-router.ts` | exact (direct move) |
| `apps/api/src/interfaces/http/_shared/result-to-response.ts` | interface-shared-helper | mapper | `apps/api/src/routes/integrations.ts:75-127` (`saveErrorToHttp`) | role-match (generalize the switch pattern) |
| `apps/api/src/interfaces/http/middleware/require-auth.ts` | interface-middleware | request-response | `apps/api/src/routes/middleware/require-auth.ts` | exact (move) |
| `apps/api/src/interfaces/http/middleware/idempotency-key.ts` | interface-middleware | request-response | `apps/api/src/routes/middleware/idempotency-key.ts` | exact (move) |
| `apps/api/src/interfaces/http/middleware/mutation-rate-limit.ts` | interface-middleware | request-response | `apps/api/src/routes/middleware/mutation-rate-limit.ts` | exact (move) |
| `apps/api/src/interfaces/http/middleware/origin-guard.ts` | interface-middleware | request-response | `apps/api/src/routes/middleware/origin-guard.ts` | exact (move) |
| `apps/api/src/interfaces/http/middleware/require-upload-permission.ts` | interface-middleware | request-response | `apps/api/src/routes/middleware/require-upload-permission.ts` | exact (move) |
| `apps/api/src/interfaces/http/games/games-router.ts` | interface-router | CRUD | `apps/api/src/routes/games.ts` | exact (move + refactor with `resultToResponse`) |
| `apps/api/src/interfaces/http/games/games-metadata-router.ts` | interface-router | CRUD | `apps/api/src/routes/games-metadata.ts` | exact (move, already factory-shaped) |
| `apps/api/src/interfaces/http/platforms/platforms-router.ts` | interface-router | factory wrapper | `apps/api/src/routes/platforms.ts` (re-export) | role-match (thin factory wrapper) |
| `apps/api/src/interfaces/http/genres/genres-router.ts` | interface-router | factory wrapper | `apps/api/src/routes/genres.ts` | role-match |
| `apps/api/src/interfaces/http/developers/developers-router.ts` | interface-router | factory wrapper | `apps/api/src/routes/developers.ts` | role-match |
| `apps/api/src/interfaces/http/integrations/integrations-router.ts` | interface-router | CRUD | `apps/api/src/routes/integrations.ts` | exact (move + adopt `resultToResponse`) |
| `apps/api/src/interfaces/http/upload/upload-router.ts` | interface-router | file-I/O | `apps/api/src/routes/upload.ts` | exact (move, factory) |
| `apps/api/src/interfaces/http/import/import-router.ts` | interface-router | batch | `apps/api/src/routes/import.ts` | exact (move) |
| `apps/api/src/interfaces/http/export/export-router.ts` | interface-router | batch | `apps/api/src/routes/export.ts` | exact (move) |
| `apps/api/src/interfaces/http/me/me-router.ts` | interface-router | read | `apps/api/src/routes/me.ts` | exact (move) |
| `apps/api/src/interfaces/http/health/health-router.ts` | interface-router | probe | `apps/api/src/routes/health.ts` | exact (move, already factory) |
| `apps/api/src/__tests__/application.test.ts` | test | smoke + grep-asserts | `apps/api/src/__tests__/wiring.test.ts` | exact (rename + extend) |
| `apps/api/src/domain/shared/__tests__/aggregate-root.test.ts` | test | unit | `apps/api/src/domain/games/__tests__/game.test.ts` | role-match |
| `apps/api/src/infrastructure/events/__tests__/in-process-event-bus.test.ts` | test | unit | `apps/api/src/infrastructure/igdb/__tests__/igdb-chain-holder.test.ts` (singleton + behaviour) | role-match |
| `apps/api/src/application/__tests__/event-flow.test.ts` | test | integration | `apps/api/src/application/games/__tests__/enrich-game-metadata.test.ts` | role-match |

### Modified files (in place)

| Modified File | Reason |
|----------------|--------|
| `apps/api/src/domain/games/game.ts` | `extends AggregateRoot`; add `delete()` method raising `GameDeleted`; in `applyMetadata`, the **new** Game instance raises `GameMetadataApplied` |
| `apps/api/src/application/games/delete-game.ts` | After `tx.run` commit: load event-bearing instance; `await eventBus.publishAll(deleted.pullDomainEvents())` wrapped in try/catch + log.error (NEVER propagate). Update TSDoc |
| `apps/api/src/application/games/enrich-game-metadata.ts` | After `tx.run` commit: `await eventBus.publishAll(outcome.saved.pullDomainEvents())` wrapped same way |
| `apps/api/src/index.ts` | Reduces to `await new Application().start(Number(process.env.PORT ?? 3001))` |
| `apps/api/src/wiring.ts` | DELETED in Wave 5 — all state moves to `Application` fields |
| `apps/api/src/infrastructure/db/client.ts` | DELETE side-effect block `client.ts:24-28`; export `MIGRATIONS_DIR` for `run-migrations.ts` to use |
| `apps/api/src/application/cover-storage/cleanup-orphans.ts` | Update TSDoc: it is now a **fallback** for (a) pre-event deletes, (b) SIGTERM races between commit and `storage.delete()`, (c) bypassed-event paths |

## Pattern Assignments

### `apps/api/src/application.ts` (composition-root, lifecycle)

**Analog A (structure, lifecycle):** `/Users/kodari/Developer/electrician-offer-app/server/src/app.ts:64-118`
**Analog B (state inventory, Apex semantics):** `apps/api/src/wiring.ts:58-274` + `apps/api/src/index.ts:34-226`

**Reference structure to COPY (electrician-offer-app/server/src/app.ts:64-118):**

```typescript
export class Application {
  private readonly hono = new Hono();
  private readonly orgSettings = new DrizzleOrganizationSettingsRepository(db);
  // ... ~30 readonly fields ...
  private readonly eventBus = new InProcessEventBus();
  private server: Server | null = null;
  private shuttingDown = false;

  constructor() {
    this.registerProcessHandlers();
  }

  async start(port: number): Promise<void> {
    try {
      await this.runMigrations();
      // ... primeIgdbChainFromDb in Apex ...
      this.registerMiddleware();
      this.registerRoutes();
      // ... startCrons in Apex ...
      this.server = serve({ fetch: this.hono.fetch, port }) as Server;
    } catch (err) {
      // ... cleanup + exit(1) ...
    }
  }
```

**Apex adaptations (MUST apply):**

1. **Bun.serve, not @hono/node-server.** Replace `serve({...})` with `Bun.serve({ port, fetch: this.hono.fetch })`. Capture return: `private server: ReturnType<typeof Bun.serve> | null = null` — matches existing `apps/api/src/index.ts:117`.
2. **AuthVariables generic on Hono.** Apex uses `new Hono<{ Variables: AuthVariables }>()` (see `apps/api/src/routes/games.ts:65`). The composition root Hono instance carries the same generic.
3. **Per-user, not per-org.** Drop `orgSettings`, `quotes`, `users`, billing fields — Apex has none of that. State to port from `wiring.ts:58-274` is enumerated in RESEARCH §4.
4. **`primeIgdbChainFromDb()` is Apex-specific async boot** — currently `wiring.ts:196` top-level await; in `Application` becomes private method called AFTER `await this.runMigrations()` and BEFORE `Bun.serve` (RESEARCH R6).
5. **Crons run via setInterval handles stored on `this`** — `private cleanupTimer: ReturnType<typeof setInterval> | null = null` etc.; `cleanup()` `clearInterval`s them.
6. **`cleanup()` calls `sqlite.close()` from `infrastructure/db/client.ts`** — Apex uses `bun:sqlite` (`apps/api/src/index.ts:208`), NOT pg pool. Wrap in try/catch + log per existing pattern.
7. **No `export default`** (CLAUDE.md). `export class Application` only.
8. **`SHUTDOWN_DRAIN_MS` drain race** — Apex bounds `server.stop(false)` with `Promise.race` + `env.SHUTDOWN_DRAIN_MS` timeout. Preserve exactly per `apps/api/src/index.ts:191-205`.

**Apex `index.ts` after refactor (target shape):**

```typescript
import { Application } from './application';

const port = Number(process.env.PORT ?? 3001);
await new Application().start(port);
```

**Existing graceful-shutdown code to PORT VERBATIM into `Application.stop()`:**

`apps/api/src/index.ts:180-219`:

```typescript
async function shutdown(signal: NodeJS.Signals): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  baseLogger.event('shutdown.start', { signal });
  clearInterval(cleanupTimer);
  clearInterval(rateLimitSweepTimer);
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
  }
  try { sqlite.close(); } catch (err) { /* log */ }
  process.exit(0);
}
```

**Pitfalls:**

- DO NOT create a barrel `index.ts` in `interfaces/http/` (CLAUDE.md).
- DO NOT inline `originGuard`, `cors`, `attachProblemJsonErrorHandler` ordering changes — current order in `index.ts:36-68` is load-bearing (health before CORS; CORS before originGuard before requireAuth). Preserve.
- DO NOT `await primeIgdbChainFromDb` before `runMigrations()` — table `integration_credentials` does not exist yet.
- `Application.constructor()` MUST NOT do I/O — only field assignment + `registerProcessHandlers()` (matches reference). Tests must be able to `new Application()` without DB hit (only fields set).

---

### `apps/api/src/infrastructure/db/run-migrations.ts` (infrastructure-helper, idempotent boot)

**Analog:** `apps/api/src/infrastructure/db/client.ts:24-28`

**Existing side-effect to EXTRACT:**

```typescript
const g = globalThis as unknown as { __apexDbMigrated?: boolean };
if (process.env.NODE_ENV !== 'production' && !g.__apexDbMigrated) {
  migrate(db, { migrationsFolder: MIGRATIONS_DIR });
  g.__apexDbMigrated = true;
}
```

**Target shape:**

```typescript
import { migrate } from 'drizzle-orm/bun-sqlite/migrator';
import { db, MIGRATIONS_DIR } from './client';

export async function runMigrations(): Promise<void> {
  const g = globalThis as unknown as { __apexDbMigrated?: boolean };
  if (g.__apexDbMigrated) return;
  migrate(db, { migrationsFolder: MIGRATIONS_DIR });
  g.__apexDbMigrated = true;
}
```

**Constraints:**

- Idempotent via `globalThis.__apexDbMigrated` (PRESERVE — re-import semantics must not rerun migrations; AR-01 success criterion 1 pins this).
- Drop the `NODE_ENV !== 'production'` guard: the `Application.runMigrations()` path is **the** production entry now (Apex moves migrations to deploy script per Phase 5 BE-01, but until then `Application.start` is the safe runner).
- `MIGRATIONS_DIR` must be exported from `db/client.ts` (currently module-private — make `export`).

---

### `apps/api/src/__tests__/_fixtures/migrations-setup.ts` (test-fixture, preload)

**Analog:** `apps/api/src/__tests__/_fixtures/igdb-chain-fixture.ts` (structure of preload-style fixtures)

**Target shape:**

```typescript
import { runMigrations } from '../../infrastructure/db/run-migrations';

await runMigrations();
```

**Wiring:** add to `apps/api/bunfig.toml` `[test] preload = ['./src/__tests__/_fixtures/migrations-setup.ts']`. RESEARCH R1 + R10 confirm semantics; A4 flags need to verify per-workspace bunfig.

---

### `apps/api/src/domain/shared/aggregate-root.ts` (aggregate-base)

**Analog (template — COPY VERBATIM):** `/Users/kodari/Developer/electrician-offer-app/server/src/domain/shared/aggregate-root.ts`

```typescript
import type { DomainEvent } from './domain-event';

/**
 * Base class for aggregate roots that raise domain events.
 * Events are collected in memory during the lifetime of a request,
 * then dispatched by the use case after persisting the aggregate.
 *
 * Apex note: `Game.applyMetadata` raises on the NEW immutable instance so
 * the public aggregate API stays immutable. `Game.delete()` raises on the
 * loaded instance — acceptable because that instance is GC'd right after
 * `pullDomainEvents()` is called by the use-case.
 */
export abstract class AggregateRoot {
  private _domainEvents: DomainEvent[] = [];

  protected raise(event: DomainEvent): void {
    this._domainEvents.push(event);
  }

  /** Returns collected events and clears the internal buffer. */
  pullDomainEvents(): DomainEvent[] {
    const events = [...this._domainEvents];
    this._domainEvents = [];
    return events;
  }
}
```

**Quote convention adjustment:** Apex uses single quotes (`biome.json`); reference uses double. Convert.

---

### `apps/api/src/domain/shared/domain-event.ts` (domain-port, contract)

**Analog:** `/Users/kodari/Developer/electrician-offer-app/server/src/domain/shared/domain-event.ts`

**Apex shape (NOTE the per-user invariant addition — RESEARCH §7 Q1):**

```typescript
export interface DomainEvent {
  readonly eventName: string;
  readonly aggregateId: string;
  readonly userId: string;
  readonly occurredAt: Date;
}
```

**Pitfall:** DO NOT add `organizationId` field (would clone electrician multi-tenancy model — CLAUDE.md forbids; Phase 6 invariant audit pins per-user).

---

### `apps/api/src/domain/shared/event-bus.ts` (domain-port, pub-sub)

**Analog A (template):** `/Users/kodari/Developer/electrician-offer-app/server/src/domain/shared/event-bus.ts`
**Analog B (Apex port style):** `apps/api/src/domain/games/game-repository.ts:49-98` (interface in domain, adapter in infrastructure)

**Target shape:**

```typescript
import type { DomainEvent } from './domain-event';

export interface EventBus {
  publish<T extends DomainEvent>(event: T): Promise<void>;
  publishAll(events: DomainEvent[]): Promise<void>;
  subscribe<T extends DomainEvent>(eventName: string, handler: (event: T) => Promise<void>): void;
}
```

---

### `apps/api/src/domain/games/events/game-deleted.event.ts` (domain-event)

**No close analog in Apex — copy structural template from reference + adapt to Apex `userId`.**

**Target shape:**

```typescript
import type { DomainEvent } from '../../shared/domain-event';

export class GameDeletedEvent implements DomainEvent {
  readonly eventName = 'game.deleted' as const;
  readonly occurredAt: Date;

  constructor(
    readonly aggregateId: string, // = Game.externalId
    readonly userId: string,
    readonly coverImageUrl: string | null,
  ) {
    this.occurredAt = new Date();
  }
}
```

**Pitfalls:**

- `aggregateId` is `externalId` (string), NOT internal `id` (number) — handlers must not need DB row id.
- `coverImageUrl: string | null` — handler must tolerate null (game without cover).

---

### `apps/api/src/domain/games/events/game-metadata-applied.event.ts` (domain-event)

**Target shape:**

```typescript
import type { DomainEvent } from '../../shared/domain-event';
import type { ExternalMetadataRef } from '../external-metadata-ref';

export class GameMetadataAppliedEvent implements DomainEvent {
  readonly eventName = 'game.metadata.applied' as const;
  readonly occurredAt: Date;

  constructor(
    readonly aggregateId: string,
    readonly userId: string,
    readonly metadataRef: ExternalMetadataRef,
  ) {
    this.occurredAt = new Date();
  }
}
```

---

### `apps/api/src/infrastructure/events/in-process-event-bus.ts` (infrastructure-adapter)

**Analog (template — COPY VERBATIM, then adapt logger import):** `/Users/kodari/Developer/electrician-offer-app/server/src/infrastructure/events/in-process-event-bus.ts`

```typescript
import type { Logger } from '../logging/logger';
import type { DomainEvent } from '../../domain/shared/domain-event';
import type { EventBus } from '../../domain/shared/event-bus';

type Handler = (event: DomainEvent) => Promise<void>;

export class InProcessEventBus implements EventBus {
  private readonly handlers = new Map<string, Handler[]>();

  constructor(private readonly logger: Logger) {}

  subscribe<T extends DomainEvent>(
    eventName: string,
    handler: (event: T) => Promise<void>,
  ): void {
    const existing = this.handlers.get(eventName) ?? [];
    this.handlers.set(eventName, [...existing, handler as Handler]);
  }

  async publish<T extends DomainEvent>(event: T): Promise<void> {
    const eventHandlers = this.handlers.get(event.eventName) ?? [];
    await Promise.all(
      eventHandlers.map((h) =>
        h(event).catch((err) => {
          this.logger.error({
            event: 'event_bus.handler_error',
            err: err instanceof Error ? err : new Error(String(err)),
          });
          throw err;
        }),
      ),
    );
  }

  async publishAll(events: DomainEvent[]): Promise<void> {
    for (const event of events) await this.publish(event);
  }
}
```

**Apex adaptations:**

- Inject `Logger` (Apex's structured logger from `infrastructure/logging/logger.ts`), NOT pino-style module singleton from reference.
- Apex logger signature: `logger.error({ event, err })`. See `apps/api/src/routes/_problem-json.ts:81-85` for exact shape:
  ```typescript
  ctxLogger.error({
    event: 'http.unhandled',
    err: err instanceof Error ? err : new Error(String(err)),
  });
  ```
- Fail-fast behaviour is preserved — handler throw propagates after log. `delete-game.ts` and `enrich-game-metadata.ts` use-cases must wrap `publishAll(...)` in try/catch + log + swallow (RESEARCH R4).

---

### `apps/api/src/application/events/game-deleted-cover-cleanup.handler.ts` (application-event-handler)

**Analog A (cover storage usage):** `apps/api/src/application/cover-storage/cleanup-orphans.ts:51-91` (constructor with `storage: CoverStorage | null` + `storage.delete(url)` call site)
**Analog B (handler structural shape):** `/Users/kodari/Developer/electrician-offer-app/server/src/application/plan/handlers/subscription-activated.handler.ts` (single `handle(event)` method, constructor-injected deps)

**Target shape:**

```typescript
import type { CoverStorage } from '../cover-storage/cover-storage';
import type { GameDeletedEvent } from '../../domain/games/events/game-deleted.event';
import type { Logger } from '../../infrastructure/logging/logger';

export class GameDeletedCoverCleanupHandler {
  constructor(
    private readonly storage: CoverStorage | null,
    private readonly logger: Logger,
  ) {}

  async handle(event: GameDeletedEvent): Promise<void> {
    if (this.storage === null) {
      // No UploadThing — cover never existed in remote storage; nothing to do.
      return;
    }
    if (event.coverImageUrl === null) {
      return;
    }
    try {
      await this.storage.delete(event.coverImageUrl);
      this.logger.event('game.deleted.cover_cleanup', {
        aggregateId: event.aggregateId,
        userId: event.userId,
      });
    } catch (err) {
      // Cron is the fallback — log + swallow so use-case stays green.
      this.logger.error({
        event: 'game.deleted.cover_cleanup_failed',
        err: err instanceof Error ? err : new Error(String(err)),
      });
    }
  }
}
```

**Constraints:**

- MUST swallow errors (cron is fallback; user 200 must not regress to 500 if UploadThing flakes — RESEARCH R4).
- MUST NOT log raw URL at info level — it's a UploadThing URL; use `event` log channel which is structured.
- Same `CoverStorage` instance is shared with `CleanupOrphans` (`Application` field; RESEARCH §6 + Open Q3).

---

### `apps/api/src/application/events/game-metadata-applied-log.handler.ts` (application-event-handler)

**Analog:** reference `subscription-*-handler.ts` minimal handler + Apex `Logger.event({...})` calls in `apps/api/src/routes/games.ts:230-234`.

**Target shape:**

```typescript
import type { GameMetadataAppliedEvent } from '../../domain/games/events/game-metadata-applied.event';
import type { Logger } from '../../infrastructure/logging/logger';

export class GameMetadataAppliedLogHandler {
  constructor(private readonly logger: Logger) {}

  async handle(event: GameMetadataAppliedEvent): Promise<void> {
    this.logger.event('game.metadata.applied', {
      aggregateId: event.aggregateId,
      userId: event.userId,
      providerName: event.metadataRef.providerName,
      providerId: event.metadataRef.providerId,
    });
  }
}
```

**Why a class for a log line?** Phase 7 success criterion #6 explicitly says "Placeholder — pokazuje że event bus przepływa userId z agregatu do handlera; przyszłe handlery dostają darmowy hook." Class shape lets future handlers (e.g. analytics, webhooks) plug in without changing the call site.

---

### `apps/api/src/interfaces/http/_shared/problem-json.ts` (interface-shared-helper)

**Analog:** `apps/api/src/routes/_problem-json.ts:1-87` — **direct move**

**Change:** filename drops leading `_` (folder name `_shared` already signals "shared"); update internal logger import path (`../../infrastructure/logging/logger`).

**Pitfall:** PRESERVE the `biome-ignore lint/suspicious/noExplicitAny` directives WITH RATIONALES (lines 67, 72). CLAUDE.md mandates rationale on every `noExplicitAny` ignore.

---

### `apps/api/src/interfaces/http/_shared/make-dictionary-router.ts` (interface-shared-helper)

**Analog:** `apps/api/src/routes/_make-dictionary-router.ts:1-61` — **direct move**

**Change:** update three imports (`problem-json`, `require-auth`, and the application-layer dictionary types path stays the same — domain/application import depth is `../../../`).

---

### `apps/api/src/interfaces/http/_shared/result-to-response.ts` (interface-shared-helper, mapper)

**Analog A (structural inspiration):** `apps/api/src/routes/integrations.ts:75-127` (`saveErrorToHttp(error): { status, body }` — explicit switch returning typed status + RFC 7807 body)

**Analog B (problem builders to reuse):** `apps/api/src/routes/_problem-json.ts:14-61` (`zodIssuesToProblemJson`, `domainProblem`, `optimisticLockProblem`, `internalProblem`)

**Existing pattern in Apex routes (target to REPLACE) — `apps/api/src/routes/games.ts:131-137`:**

```typescript
if (!result.ok) {
  const e = result.error;
  if (e.kind === 'invalid_input') return c.json(zodIssuesToProblemJson(e.issues), 400);
  if (e.kind === 'domain') return c.json(domainProblem(e.error), 400);
  return c.json(internalProblem('unknown error'), 500);
}
return c.json(toGameResponse(result.value), 201);
```

**Target shape (hybrid mapper — RESEARCH §7 Q4):**

```typescript
import type { Context } from 'hono';
import type { Result } from '../../../domain/shared/result';
import { internalProblem } from './problem-json';

type ContentfulStatusCode = 200 | 201 | 400 | 401 | 403 | 404 | 409 | 413 | 422 | 429 | 500 | 503 | 504;

export type StatusOrHandler<E, C extends Context> =
  | ContentfulStatusCode
  | ((err: E, c: C) => Response);

/**
 * Thin mapper: success → onSuccess; failure → mapper[error.kind].
 * Keeps `Result<T, E>` everywhere — does NOT replace the discriminated-union
 * error contract. RFC 7807 problem+json bodies are produced via the
 * `problem-json.ts` builders in custom handlers when shape is non-trivial.
 */
// biome-ignore lint/suspicious/noExplicitAny: Hono generics vary per app instance.
export function resultToResponse<T, E extends { kind: string }, C extends Context<any, any, any>>(
  c: C,
  result: Result<T, E>,
  mapper: { [K in E['kind']]: StatusOrHandler<Extract<E, { kind: K }>, C> },
  onSuccess: (value: T, c: C) => Response,
): Response {
  if (result.ok) return onSuccess(result.value, c);
  const handler = mapper[result.error.kind as E['kind']];
  if (handler === undefined) return c.json(internalProblem('unknown error'), 500);
  if (typeof handler === 'number') {
    return c.json({ error: result.error.kind }, handler);
  }
  // biome-ignore lint/suspicious/noExplicitAny: discriminant narrowing across union.
  return (handler as any)(result.error, c);
}
```

**Constraints:**

- DO NOT change the `Result<T, E>` contract (CLAUDE.md: Result over throw — refactor must keep it).
- DO NOT swallow `OptimisticLockError` — it's the only exception used as control flow at the route boundary; it's already caught inside use-cases (`apps/api/src/application/games/delete-game.ts:35-40`) and translated to `{ kind: 'conflict' }` — keep that.
- Status fallback when `error.kind` is not in mapper → `internalProblem('unknown error')` 500 (matches existing fallthrough `apps/api/src/routes/games.ts:135`).

**Pitfalls:**

- Hono generics: must use `Context<any, any, any>` with biome-ignore + rationale (existing precedent in `_problem-json.ts:67-69`).
- Discriminant narrowing on union: TS won't narrow `handler` across `mapper[kind]` lookup without the explicit cast. Document with biome-ignore.

---

### `apps/api/src/interfaces/http/middleware/require-auth.ts` (interface-middleware)

**Analog:** `apps/api/src/routes/middleware/require-auth.ts:1-23` — **direct move**

**Change:** update infrastructure import path: `../../infrastructure/auth/auth` and `../../infrastructure/logging/logger` (depth `../../` from `interfaces/http/middleware/`).

---

### `apps/api/src/interfaces/http/middleware/idempotency-key.ts`, `mutation-rate-limit.ts`, `origin-guard.ts`, `require-upload-permission.ts` (interface-middleware)

**Analogs:** `apps/api/src/routes/middleware/{idempotency-key,mutation-rate-limit,origin-guard,require-upload-permission}.ts` — **direct moves**

**Change:** import path updates only. NO behavioural changes.

---

### `apps/api/src/interfaces/http/games/games-router.ts` (interface-router, CRUD)

**Analog (current state):** `apps/api/src/routes/games.ts:1-272`

**Imports pattern (current — `apps/api/src/routes/games.ts:1-21`):**

```typescript
import { Hono } from 'hono';
import type { Game } from '../domain/games/game';
import {
  createGame, deleteGame, getGame, idempotencyKeyMiddleware,
  igdbChainHolder, listGames, moveToCollection, updateGame,
} from '../wiring';
import {
  domainProblem, internalProblem, optimisticLockProblem,
  payloadTooLargeProblem, zodIssuesToProblemJson,
} from './_problem-json';
import { createGamesMetadataRouter } from './games-metadata';
import type { AuthVariables } from './middleware/require-auth';
```

**Target imports pattern:**

```typescript
import { Hono } from 'hono';
import type { Game } from '../../../domain/games/game';
import { domainProblem, internalProblem, optimisticLockProblem, payloadTooLargeProblem, zodIssuesToProblemJson } from '../_shared/problem-json';
import { resultToResponse } from '../_shared/result-to-response';
import type { AuthVariables } from '../middleware/require-auth';
import { createGamesMetadataRouter } from './games-metadata-router';
// NOTE: dependencies now injected via factory — no '../wiring' import.

export interface GamesRouterDeps {
  readonly createGame: CreateGame;
  readonly updateGame: UpdateGame;
  readonly deleteGame: DeleteGame;
  readonly listGames: ListGames;
  readonly getGame: GetGame;
  readonly moveToCollection: MoveToCollection;
  readonly idempotencyKeyMiddleware: MiddlewareHandler<{ Variables: AuthVariables }>;
  readonly igdbChainHolder: IgdbChainHolder;
}

export function createGamesRouter(deps: GamesRouterDeps): Hono<{ Variables: AuthVariables }> {
  const games = new Hono<{ Variables: AuthVariables }>();
  // ... handlers using `deps.createGame.execute(...)` instead of bare `createGame.execute(...)`
}
```

**Switch from module imports to factory:** matches existing `createIntegrationsRouter` (`apps/api/src/routes/integrations.ts:131-...`) and `createGamesMetadataRouter` (`apps/api/src/routes/games-metadata.ts`). Composition root `Application.registerRoutes()` calls factory with injected deps.

**Refactor `if (!result.ok)` chain to `resultToResponse` — example for POST `/`:**

Current `apps/api/src/routes/games.ts:127-138`:

```typescript
games.post('/', idempotencyKeyMiddleware, async (c) => {
  const userId = c.get('user').id;
  const body = await c.req.json();
  const result = await createGame.execute(body, userId);
  if (!result.ok) {
    const e = result.error;
    if (e.kind === 'invalid_input') return c.json(zodIssuesToProblemJson(e.issues), 400);
    if (e.kind === 'domain') return c.json(domainProblem(e.error), 400);
    return c.json(internalProblem('unknown error'), 500);
  }
  return c.json(toGameResponse(result.value), 201);
});
```

Target:

```typescript
games.post('/', deps.idempotencyKeyMiddleware, async (c) => {
  const userId = c.get('user').id;
  const body = await c.req.json();
  const result = await deps.createGame.execute(body, userId);
  return resultToResponse(c, result, {
    invalid_input: (e, c) => c.json(zodIssuesToProblemJson(e.issues), 400),
    domain: (e, c) => c.json(domainProblem(e.error), 400),
  }, (game, c) => c.json(toGameResponse(game), 201));
});
```

**Mapper for PATCH `/:externalId/metadata` (the dense one — current at routes/games.ts:180-225):**

```typescript
const mapper = {
  not_found: (_e, c) => {
    c.get('logger').warn({ event: 'security.idor_attempt', externalId, route: PATCH_METADATA_ROUTE });
    return c.json({ error: 'not found' }, 404);
  },
  invalid_input: (e, c) => c.json(zodIssuesToProblemJson(e.issues), 400),
  domain: (e, c) => c.json(domainProblem(e.error), 400),
  conflict: 409, // delegated to default `{ error: 'conflict' }` body
  snapshot_mismatch: (e, c) => {
    /* preserve existing security.snapshot_mismatch log + custom body w/ fields */
  },
  cache_miss: (e, c) => c.json({ type: '/errors/cache-miss', /* ... */ }, 409),
};
```

**Constraints:**

- PRESERVE the IDOR side-channel log on `not_found` (`apps/api/src/routes/games.ts:183-187`) — `games.idor.test.ts` pins this and AR-07 mandates green IDOR.
- PRESERVE route ordering: `/metadata` sub-router MUST mount BEFORE `/:externalId` (comment + ordering at `games.ts:153-156`).
- PRESERVE `c.get('logger').event(...)` structured logs (e.g. `games.list`, `igdb.enrich` at `games.ts:115`, `230`).

**Pitfalls:**

- No `console.*` — request-scoped logger only (CLAUDE.md).
- `idempotencyKeyMiddleware` is injected, NOT imported from `../wiring`.
- Hono kebab-case test filename: `games-router.test.ts` (currently `games.test.ts` — rename per A3).

---

### `apps/api/src/interfaces/http/games/games-metadata-router.ts` (interface-router)

**Analog:** `apps/api/src/routes/games-metadata.ts` — already factory-shaped `createGamesMetadataRouter({ chainHolder })`. **Direct move.**

**Change:** rename file `games-metadata.ts` → `games-metadata-router.ts`; update imports (`../_shared/problem-json`, `../middleware/require-auth`). Adopt `resultToResponse` for the GET `/candidates` (`invalid_input` mapping).

---

### `apps/api/src/interfaces/http/platforms/platforms-router.ts` (interface-router, factory wrapper)

**Analog:** RESEARCH §7 Q6 recommended thin factory wrapper for symmetry.

**Target shape:**

```typescript
import type { DictionaryUseCases } from '../../../application/dictionary/make-dictionary-use-cases';
import type { PlatformKind } from '../../../domain/platforms/platform';
import { makeDictionaryRouter } from '../_shared/make-dictionary-router';

export function createPlatformsRouter(useCases: DictionaryUseCases<PlatformKind>) {
  return makeDictionaryRouter({ useCases });
}
```

**Same pattern for genres / developers.** Replaces the current `routes/{platforms,genres,developers}.ts` re-export from `wiring`.

---

### `apps/api/src/interfaces/http/integrations/integrations-router.ts` (interface-router)

**Analog:** `apps/api/src/routes/integrations.ts:131-...` (already factory: `createIntegrationsRouter(deps)`)

**Refactor opportunity:** the `saveErrorToHttp(error: SaveIgdbIntegrationError)` switch (`routes/integrations.ts:75-127`) is the **single largest beneficiary** of `resultToResponse`. Convert each `case` into a mapper entry. PRESERVE the typed status union (`400 | 409 | 422 | 503 | 504`) and the custom RFC 7807 bodies (they carry `reason`, `upstreamStatus` etc. — these are NOT static; use function handlers, not status numbers).

---

### `apps/api/src/interfaces/http/upload/upload-router.ts`, `import/import-router.ts`, `export/export-router.ts`, `me/me-router.ts`, `health/health-router.ts` (interface-routers)

**Analogs:** `routes/{upload,import,export,me,health}.ts` — direct moves. Factory functions stay factories; module-level `export const` stays the same shape but with updated imports.

---

### `apps/api/src/__tests__/application.test.ts` (test, smoke + grep-asserts)

**Analog:** `apps/api/src/__tests__/wiring.test.ts:1-60`

**Existing tests to PRESERVE (rename only):** the rg-based scans for forbidden patterns (`new DrizzleX()` in routes, `igdbChainHolder.swap(` outside fixtures). They were Phase 6 invariants — AR-07 requires no regression.

**New cases to ADD:**

- `Application.constructor()` runs without side-effects (no DB hit) — assert by counting `db.run` mock invocations.
- `Application.start(port)` calls `runMigrations` BEFORE `primeIgdbChainFromDb` BEFORE `Bun.serve`.
- Re-importing `db/client.ts` twice does NOT rerun migrations (assert `globalThis.__apexDbMigrated === true` after first call; second call no-ops).
- `rg "from .*routes/"` returns 0 hits across `apps/api/src/` (Wave 5 invariant).
- `rg "from .*'\\./application'"` returns only `index.ts` + own tests (R5 mitigation).

---

### `apps/api/src/application/__tests__/event-flow.test.ts` (test, integration)

**Analog:** `apps/api/src/application/games/__tests__/enrich-game-metadata.test.ts` (structural shape: spy use-case execution + repo mock + assert downstream interaction)

**Required cases (Phase 7 success criterion 7):**

1. `Game.delete()` flow: build Game with cover URL → call `DeleteGame.execute()` with mock `EventBus` and mock `CoverStorage` → assert `eventBus.publishAll` called with `[GameDeletedEvent { coverImageUrl: 'https://...' }]` AFTER `repo.delete` → assert `GameDeletedCoverCleanupHandler.handle` called → assert `coverStorage.delete` called with that URL.
2. `Game.applyMetadata` flow: similar, but assert `GameMetadataAppliedLogHandler.handle` called → assert `logger.event` invoked with `'game.metadata.applied'`.
3. Per-user IDOR: build two Games for two different `userId` — assert event handler for user A NEVER receives event for user B (event.userId is the only scope; no global state).

---

## Pattern Assignments — MODIFIED files

### `apps/api/src/domain/games/game.ts` — extends AggregateRoot

**Current shape (`apps/api/src/domain/games/game.ts:18-40`):**

```typescript
export class Game {
  private constructor(
    private readonly _id: number,
    private readonly _externalId: string,
    // ...
  ) {}
```

**Target:**

```typescript
import { AggregateRoot } from '../shared/aggregate-root';
import { GameDeletedEvent } from './events/game-deleted.event';
import { GameMetadataAppliedEvent } from './events/game-metadata-applied.event';

export class Game extends AggregateRoot {
  private constructor(
    private readonly _id: number,
    private readonly _externalId: string,
    // ...
  ) {
    super();
  }

  /**
   * Raises `GameDeleted` on the loaded instance. This is the ONLY mutating
   * domain method on `Game` — accepted because the instance is GC'd right
   * after the use-case calls `pullDomainEvents()`. Public API stays
   * immutable everywhere else (applyMetadata returns a new instance).
   */
  delete(): void {
    this.raise(new GameDeletedEvent(this._externalId, this._userId, this._coverImage ?? null));
  }
```

**`applyMetadata` change (raise on NEW instance — RESEARCH §7 Q2 recommendation):**

In existing `applyMetadata` body, where the new `Game` instance is constructed and returned via `ok(next)`:

```typescript
// BEFORE return ok(next):
next.raise(new GameMetadataAppliedEvent(next._externalId, next._userId, ref));
return ok(next);
```

**Constraints:**

- DO NOT remove `private constructor` (CLAUDE.md domain rule).
- DO NOT make `_domainEvents` accessible externally — only `protected raise()` and `pullDomainEvents()` (inherited from `AggregateRoot`).
- `Game.delete()` raises event but does NOT touch DB — the existing repo.delete call in `delete-game.ts` is unchanged.

---

### `apps/api/src/application/games/delete-game.ts` — publishAll after commit

**Current (`apps/api/src/application/games/delete-game.ts:26-45`):**

```typescript
async execute(externalId: string, userId: string): Promise<Result<Game, DeleteGameError>> {
  let deleted: Game | null;
  try {
    deleted = await this.tx.run<Game | null>(async (tx) => {
      const repo = this.repo.withTx(tx);
      const existing = await repo.findByExternalId(userId, externalId);
      if (!existing) return null;
      return repo.delete(userId, externalId, existing.updatedAt);
    });
  } catch (e) {
    if (e instanceof OptimisticLockError) return err({ kind: 'conflict' });
    throw e;
  }
  if (!deleted) return err({ kind: 'not_found' });
  return ok(deleted);
}
```

**Target — surgical addition (AFTER `if (!deleted) return err(...)`, BEFORE `return ok(deleted)`):**

```typescript
  if (!deleted) return err({ kind: 'not_found' });

  // Raise on the loaded instance so the event carries the (now-deleted) cover URL.
  // `pullDomainEvents()` must be called on the SAME instance that ran `delete()`.
  deleted.delete();
  try {
    await this.eventBus.publishAll(deleted.pullDomainEvents());
  } catch (err) {
    this.logger.error({
      event: 'delete_game.event_dispatch_failed',
      err: err instanceof Error ? err : new Error(String(err)),
    });
    // Swallow — DB commit succeeded; user gets 200. Cron orphan-cleanup
    // is the fallback for the cover file.
  }

  return ok(deleted);
}
```

**Constructor change — add `eventBus` + `logger` deps:**

```typescript
constructor(
  private readonly repo: GameRepository,
  private readonly tx: TransactionRunner,
  private readonly eventBus: EventBus,
  private readonly logger: Logger,
) {}
```

**Constraints:**

- `eventBus.publishAll(...)` MUST be AFTER `tx.run(...)` (after commit) — RESEARCH §7 Q3.
- MUST be wrapped in try/catch + log + swallow — RESEARCH R4 (cover cleanup has cron fallback; 500 regression unacceptable).
- TSDoc at top of file MUST be updated per RESEARCH §6: cron is now fallback for (a) pre-event deletes, (b) SIGTERM races, (c) bypassed paths.

---

### `apps/api/src/application/games/enrich-game-metadata.ts` — publishAll after commit

**Current (`apps/api/src/application/games/enrich-game-metadata.ts:150-157`):**

```typescript
} catch (e) {
  if (e instanceof OptimisticLockError) return err({ kind: 'conflict' });
  throw e;
}

if (!outcome.ok) return err(outcome.error);
return ok(outcome.saved);
```

**Target:**

```typescript
if (!outcome.ok) return err(outcome.error);

try {
  await this.eventBus.publishAll(outcome.saved.pullDomainEvents());
} catch (err) {
  this.logger.error({
    event: 'enrich_game_metadata.event_dispatch_failed',
    err: err instanceof Error ? err : new Error(String(err)),
  });
}

return ok(outcome.saved);
```

**Constructor change:** add `eventBus: EventBus` and `logger: Logger`.

**Constraints:** SAME as `delete-game.ts` — after-commit publish + swallow.

---

### `apps/api/src/index.ts` — collapse to one-liner

**Target:**

```typescript
import { Application } from './application';

const port = Number(process.env.PORT ?? 3001);
await new Application().start(port);
```

**Constraints:** no other top-level statements; signal handlers register inside `Application.constructor()`.

---

### `apps/api/src/infrastructure/db/client.ts` — remove migrate side-effect

**Current (`apps/api/src/infrastructure/db/client.ts:1-30`):**

```typescript
import { migrate } from 'drizzle-orm/bun-sqlite/migrator';
// ...
const sqlite = new Database(DB_PATH);
sqlite.exec('PRAGMA journal_mode = WAL;');
export const db = drizzle({ client: sqlite, schema: { ...gameSchema, ...authSchema } });

const g = globalThis as unknown as { __apexDbMigrated?: boolean };
if (process.env.NODE_ENV !== 'production' && !g.__apexDbMigrated) {
  migrate(db, { migrationsFolder: MIGRATIONS_DIR });
  g.__apexDbMigrated = true;
}

export { sqlite };
```

**Target:**

```typescript
// drop `migrate` import
const sqlite = new Database(DB_PATH);
sqlite.exec('PRAGMA journal_mode = WAL;');
export const db = drizzle({ client: sqlite, schema: { ...gameSchema, ...authSchema } });

export { sqlite, MIGRATIONS_DIR }; // MIGRATIONS_DIR newly exported for run-migrations.ts
```

**Constraints:**

- The `__apexDbMigrated` flag MOVES to `run-migrations.ts` (idempotency preserved across re-imports).
- All tests must boot via the new `_fixtures/migrations-setup.ts` preload (R1).

---

### `apps/api/src/application/cover-storage/cleanup-orphans.ts` — TSDoc update only

**Required change:** prepend cron-fallback rationale to the class TSDoc (`cleanup-orphans.ts:37-46`):

```typescript
/**
 * Cron-based orphan cover cleanup.
 *
 * NOTE (Phase 7): primary cover cleanup is now performed via the
 * `GameDeleted` domain event, dispatched after the use-case transaction
 * commits. This cron remains as a fallback for:
 *   (a) deletes from pre-Phase-7 deploys that never raised the event,
 *   (b) SIGTERM races between commit and the storage DELETE call,
 *   (c) any future code path that bypasses the event bus.
 * Single source of truth = NONE; the cron is best-effort cleanup.
 */
```

**No behavioural change.**

---

## Shared Patterns

### Authentication / Per-user scoping

**Source:** `apps/api/src/routes/middleware/require-auth.ts:12-23`
**Apply to:** All `interfaces/http/<aggregate>/<aggregate>-router.ts` (mounted via `app.use('/api/<aggregate>/*', requireAuth)` in `Application.registerMiddleware()`)

```typescript
export const requireAuth: MiddlewareHandler<{ Variables: AuthVariables }> = async (c, next) => {
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session) return c.json({ error: 'unauthorized' }, 401);
  c.set('user', session.user);
  c.set('session', session.session);
  c.set('logger', c.get('logger').child({ userId: session.user.id }));
  await next();
};
```

**Per-user usage in routes (`apps/api/src/routes/games.ts:128`):**

```typescript
const userId = c.get('user').id;
const result = await deps.createGame.execute(body, userId);
```

**Invariant:** every use-case `execute(input, userId)` signature MUST have `userId` as last param — repos enforce `eq(table.userId, userId)`. Event handlers receive `userId` from `event.userId` (never global state — RESEARCH §7 Q1).

---

### Error handling (Result + try/catch optimistic lock)

**Source:** `apps/api/src/application/games/delete-game.ts:26-44`
**Apply to:** All use-cases that mutate (delete-game, enrich-game-metadata, future event-raising use-cases).

```typescript
try {
  deleted = await this.tx.run<Game | null>(async (tx) => { /* ... */ });
} catch (e) {
  if (e instanceof OptimisticLockError) return err({ kind: 'conflict' });
  throw e;
}
```

**Plus (Phase 7 addition):** event publish swallow pattern:

```typescript
try { await this.eventBus.publishAll(aggregate.pullDomainEvents()); }
catch (err) { this.logger.error({ event: '<use_case>.event_dispatch_failed', err: ... }); }
```

---

### Logger usage

**Source:** `apps/api/src/routes/_problem-json.ts:80-85`
**Apply to:** all event handlers + use-cases

```typescript
this.logger.error({
  event: 'channel.name',
  err: err instanceof Error ? err : new Error(String(err)),
});
// or
this.logger.event('channel.name', { /* structured payload */ });
```

**Constraint:** NEVER `console.*` (CLAUDE.md). Request-scoped logger from `c.get('logger')` (Hono) or constructor-injected `Logger` (use-cases / handlers).

---

### Hono router factory pattern

**Source:** `apps/api/src/routes/integrations.ts:131` (`createIntegrationsRouter(deps)`)
**Apply to:** All `interfaces/http/<aggregate>/<aggregate>-router.ts` going forward (REPLACES module-level `export const games = new Hono(...)` style).

```typescript
export interface XxxRouterDeps {
  readonly useCase: SomeUseCase;
  readonly idempotencyKeyMiddleware: MiddlewareHandler<{ Variables: AuthVariables }>;
}

export function createXxxRouter(deps: XxxRouterDeps): Hono<{ Variables: AuthVariables }> {
  const r = new Hono<{ Variables: AuthVariables }>();
  r.post('/', deps.idempotencyKeyMiddleware, async (c) => { /* uses deps.useCase */ });
  return r;
}
```

**Composition root invocation pattern (`Application.registerRoutes()`):**

```typescript
this.hono.route('/api/games', createGamesRouter({
  createGame: this.createGame,
  // ...
  idempotencyKeyMiddleware: this.idempotencyKeyMiddleware,
  igdbChainHolder: this.igdbChainHolder,
}));
```

---

### Test fixture pattern (per-process preload)

**Source:** `apps/api/src/__tests__/_fixtures/igdb-chain-fixture.ts` (per-file `useDisabledIgdbChain()`)
**Apply to:** new `_fixtures/migrations-setup.ts` (per-process preload via `bunfig.toml`)

Difference: igdb fixture is opt-in per file; migrations preload is global to the test process (R10).

---

## No Analog Found

Files with truly novel scaffolds (template ONLY from reference repo, no Apex precedent):

| File | Role | Reason |
|------|------|--------|
| `apps/api/src/domain/shared/aggregate-root.ts` | aggregate-base | First aggregate base in Apex; copy reference electrician verbatim per CLAUDE.md naming. |
| `apps/api/src/domain/shared/domain-event.ts` | domain-port | First domain event contract. |
| `apps/api/src/domain/shared/event-bus.ts` | domain-port | First domain event port (existing `game-repository.ts` provides shape precedent for "port in domain"). |
| `apps/api/src/domain/games/events/game-deleted.event.ts` | domain-event | First concrete domain event. |
| `apps/api/src/domain/games/events/game-metadata-applied.event.ts` | domain-event | First concrete domain event. |
| `apps/api/src/infrastructure/events/in-process-event-bus.ts` | infrastructure-adapter | First event adapter; copy reference verbatim, swap logger import. |

These six files: planner MUST use the verbatim shapes provided above (sourced from `/Users/kodari/Developer/electrician-offer-app/server/src/domain/shared/*.ts` and reference `subscription-*.event.ts`).

---

## Metadata

**Analog search scope:**
- `/Users/kodari/projects/games/apps/api/src/wiring.ts`
- `/Users/kodari/projects/games/apps/api/src/index.ts`
- `/Users/kodari/projects/games/apps/api/src/routes/**`
- `/Users/kodari/projects/games/apps/api/src/application/**`
- `/Users/kodari/projects/games/apps/api/src/domain/**`
- `/Users/kodari/projects/games/apps/api/src/infrastructure/**`
- `/Users/kodari/projects/games/apps/api/src/__tests__/**`
- Reference repo: `/Users/kodari/Developer/electrician-offer-app/server/src/{app.ts, domain/shared/, infrastructure/events/}`

**Files scanned:** ~50

**Pattern extraction date:** 2026-05-20

## PATTERN MAPPING COMPLETE
