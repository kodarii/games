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
