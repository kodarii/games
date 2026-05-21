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
import { createExportRouter } from './routes/export';
import { createGamesRouter } from './routes/games';
import { genres } from './routes/genres';
import { createHealthRouter } from './routes/health';
import { createImportRouter } from './routes/import';
import { createIntegrationsRouter } from './routes/integrations';
import { createMeRouter } from './routes/me';
import { originGuard } from './routes/middleware/origin-guard';
import { type AuthVariables, requireAuth } from './routes/middleware/require-auth';
import { requireUploadPermission } from './routes/middleware/require-upload-permission';
import { platforms } from './routes/platforms';
import { createUploadRoute } from './routes/upload';
import {
  clearIgdbIntegration,
  coverStorage,
  idempotencyKeyMiddleware,
  integrationCredentialsRepository,
  rateLimitMutations,
  saveIgdbIntegration,
} from './wiring';
import {
  gameRepository as wiringGameRepository,
  platformRepository as wiringPlatformRepository,
  genreRepository as wiringGenreRepository,
  developerRepository as wiringDeveloperRepository,
  importRepository as wiringImportRepository,
  idempotencyKeyRepository as wiringIdempotencyKeyRepository,
  transactionRunner as wiringTransactionRunner,
  coverStorage as wiringCoverStorage,
  coverStorageAvailable as wiringCoverStorageAvailable,
  idempotencyKeyMiddleware as wiringIdempotencyKeyMiddleware,
  rateLimitMutations as wiringRateLimitMutations,
  igdbChainHolder as wiringIgdbChainHolder,
  saveIgdbIntegration as wiringSaveIgdbIntegration,
  clearIgdbIntegration as wiringClearIgdbIntegration,
  integrationCredentialsRepository as wiringIntegrationCredentialsRepository,
  createGame as wiringCreateGame,
  updateGame as wiringUpdateGame,
  deleteGame as wiringDeleteGame,
  listGames as wiringListGames,
  getGame as wiringGetGame,
  moveToCollection as wiringMoveToCollection,
  genresRouter as wiringGenresRouter,
  developersRouter as wiringDevelopersRouter,
  platformsRouter as wiringPlatformsRouter,
  exportData as wiringExportData,
  importData as wiringImportData,
  cleanupOrphans as wiringCleanupOrphans,
  sweepRateLimitBuckets as wiringSweepRateLimitBuckets,
} from './wiring';

const ONE_HOUR_MS = 60 * 60 * 1000;
const FIVE_MINUTES_MS = 5 * 60 * 1000;

function ensureError(value: unknown): Error {
  return value instanceof Error ? value : new Error(String(value));
}

interface Persistence {
  readonly gameRepository: typeof wiringGameRepository;
  readonly platformRepository: typeof wiringPlatformRepository;
  readonly genreRepository: typeof wiringGenreRepository;
  readonly developerRepository: typeof wiringDeveloperRepository;
  readonly importRepository: typeof wiringImportRepository;
  readonly idempotencyKeyRepository: typeof wiringIdempotencyKeyRepository;
  readonly transactionRunner: typeof wiringTransactionRunner;
}

interface CoverStorageBundle {
  readonly storage: typeof wiringCoverStorage;
  readonly available: typeof wiringCoverStorageAvailable;
}

interface HttpMiddleware {
  readonly idempotencyKey: typeof wiringIdempotencyKeyMiddleware;
  readonly rateLimitMutations: typeof wiringRateLimitMutations;
}

interface IgdbStack {
  readonly holder: typeof wiringIgdbChainHolder;
  readonly save: typeof wiringSaveIgdbIntegration;
  readonly clear: typeof wiringClearIgdbIntegration;
  readonly credentialsRepo: typeof wiringIntegrationCredentialsRepository;
  readonly prime: () => Promise<void>;
}

interface GameOps {
  readonly create: typeof wiringCreateGame;
  readonly update: typeof wiringUpdateGame;
  readonly delete: typeof wiringDeleteGame;
  readonly list: typeof wiringListGames;
  readonly get: typeof wiringGetGame;
  readonly moveToCollection: typeof wiringMoveToCollection;
}

interface Dictionaries {
  readonly platforms: { readonly router: typeof wiringPlatformsRouter };
  readonly genres: { readonly router: typeof wiringGenresRouter };
  readonly developers: { readonly router: typeof wiringDevelopersRouter };
}

interface DataIO {
  readonly exportData: typeof wiringExportData;
  readonly importData: typeof wiringImportData;
}

interface CronBundle {
  readonly cleanupOrphans: typeof wiringCleanupOrphans;
  readonly sweepRateLimitBuckets: typeof wiringSweepRateLimitBuckets;
}

export class Application {
  private readonly hono = new Hono<{ Variables: AuthVariables }>();
  private bunServer: ReturnType<typeof Bun.serve> | null = null;
  private shuttingDown = false;
  private started = false;
  private readonly persistence: Persistence;
  private readonly coverStorageBundle: CoverStorageBundle;
  private readonly httpMw: HttpMiddleware;
  private readonly igdb: IgdbStack;
  private readonly gameOps: GameOps;
  private readonly dictionaries: Dictionaries;
  private readonly dataIO: DataIO;
  private readonly cron: CronBundle;
  private readonly scheduler: Scheduler;

  constructor() {
    this.persistence = this.buildPersistence();
    this.coverStorageBundle = this.buildCoverStorage();
    this.httpMw = this.buildHttpMiddleware();
    this.igdb = this.buildIgdbStack();
    this.gameOps      = this.buildGameUseCases();
    this.dictionaries = this.buildDictionaryStack();
    this.dataIO       = this.buildDataIO();
    this.cron         = this.buildCronStack();
    this.scheduler = new Scheduler({
      logger: baseLogger,
      tasks: [
        {
          name: 'cleanup.orphans',
          intervalMs: ONE_HOUR_MS,
          run: () => this.cron.cleanupOrphans.run(),
        },
        {
          name: 'rate_limit.sweep',
          intervalMs: FIVE_MINUTES_MS,
          run: () => this.cron.sweepRateLimitBuckets.run(),
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
    this.mountAuthed('/api/platforms', platforms);
    this.mountAuthed('/api/genres', genres);
    this.mountAuthed('/api/developers', developers);

    this.hono.use('/api/export/*', requireAuth);
    this.hono.use('/api/export/*', this.httpMw.rateLimitMutations);
    this.hono.route('/api/export', createExportRouter({ exportData: this.dataIO.exportData }));

    this.hono.use('/api/import/*', requireAuth);
    this.hono.use('/api/import/*', this.httpMw.rateLimitMutations);
    this.hono.route(
      '/api/import',
      createImportRouter({
        importData: this.dataIO.importData,
        idempotencyKey: this.httpMw.idempotencyKey,
      }),
    );

    this.hono.use('/api/me/*', requireAuth);
    this.hono.use('/api/me/*', this.httpMw.rateLimitMutations);
    this.hono.route(
      '/api/me',
      createMeRouter({ coverStorageAvailable: this.coverStorageBundle.available }),
    );

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

  private buildPersistence(): Persistence {
    // Phase 2 incremental: borrow from wiring.ts. Replaced by direct
    // constructions in the final cleanup task when wiring.ts is deleted.
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

  private buildIgdbStack(): IgdbStack {
    return Object.freeze({
      holder: wiringIgdbChainHolder,
      save: wiringSaveIgdbIntegration,
      clear: wiringClearIgdbIntegration,
      credentialsRepo: wiringIntegrationCredentialsRepository,
      // Phase 2 incremental: wiring.ts still runs `await primeIgdbChainFromDb()`
      // at module load. Task 15 swaps this no-op for the real prime function.
      prime: async () => {
        /* already primed by wiring.ts top-level await */
      },
    });
  }

  private buildGameUseCases(): GameOps {
    return Object.freeze({
      create: wiringCreateGame,
      update: wiringUpdateGame,
      delete: wiringDeleteGame,
      list: wiringListGames,
      get: wiringGetGame,
      moveToCollection: wiringMoveToCollection,
    });
  }

  private buildDictionaryStack(): Dictionaries {
    return Object.freeze({
      platforms: Object.freeze({ router: wiringPlatformsRouter }),
      genres: Object.freeze({ router: wiringGenresRouter }),
      developers: Object.freeze({ router: wiringDevelopersRouter }),
    });
  }

  private buildDataIO(): DataIO {
    return Object.freeze({
      exportData: wiringExportData,
      importData: wiringImportData,
    });
  }

  private buildCronStack(): CronBundle {
    return Object.freeze({
      cleanupOrphans: wiringCleanupOrphans,
      sweepRateLimitBuckets: wiringSweepRateLimitBuckets,
    });
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
