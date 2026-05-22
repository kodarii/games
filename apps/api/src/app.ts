import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sql } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/bun-sqlite/migrator';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { CleanupOrphans } from './application/cover-storage/cleanup-orphans';
import type { CoverStorage } from './application/cover-storage/cover-storage';
import { makeDictionaryUseCases } from './application/dictionary/make-dictionary-use-cases';
import { ExportData } from './application/export/export-data';
import { CreateGame } from './application/games/create-game';
import { DeleteGame } from './application/games/delete-game';
import { GetGame } from './application/games/get-game';
import { ListGames } from './application/games/list-games';
import { MoveToCollection } from './application/games/move-to-collection';
import { UpdateGame } from './application/games/update-game';
import type { IdempotencyKeyRepository } from './application/idempotency/idempotency-key-repository';
import { ImportData } from './application/import/import-data';
import { ClearIgdbIntegration } from './application/integrations/clear-igdb-integration';
import { GetIgdbIntegrationStatus } from './application/integrations/get-igdb-integration-status';
import { SaveIgdbIntegration } from './application/integrations/save-igdb-integration';
import { SweepRateLimitBuckets } from './application/rate-limit/sweep-rate-limit-buckets';
import {
  DEVELOPER_DICTIONARY_KIND,
  DEVELOPER_NAME_MAX_LENGTH,
  type DeveloperKind,
} from './domain/developers/developer';
import {
  GENRE_DICTIONARY_KIND,
  GENRE_NAME_MAX_LENGTH,
  type GenreKind,
} from './domain/genres/genre';
import {
  PLATFORM_DICTIONARY_KIND,
  PLATFORM_NAME_MAX_LENGTH,
  type PlatformKind,
} from './domain/platforms/platform';
import { auth } from './infrastructure/auth/auth';
import { isCoverHostAllowed } from './infrastructure/config/cover-hosts';
import { env } from './infrastructure/config/env';
import { UploadThingCoverStorage } from './infrastructure/cover-storage/uploadthing-cover-storage';
import { CronLock } from './infrastructure/cron/cron-lock';
import { user as authUser } from './infrastructure/db/auth-schema';
import { db, sqlite } from './infrastructure/db/client';
import { DrizzleTransactionRunner } from './infrastructure/db/drizzle-transaction-runner';
import {
  developers as developersTable,
  genres as genresTable,
  platforms as platformsTable,
} from './infrastructure/db/schema';
import { makeDrizzleDictionaryRepository } from './infrastructure/dictionary/make-drizzle-dictionary-repository';
import { DrizzleGameRepository } from './infrastructure/games/drizzle-game-repository';
import { DrizzleIdempotencyKeyRepository } from './infrastructure/idempotency/drizzle-idempotency-key-repository';
import { IgdbChainHolder } from './infrastructure/igdb/igdb-chain-holder';
import { DrizzleImportRepository } from './infrastructure/import/drizzle-import-repository';
import { Aes256GcmCipher } from './infrastructure/integrations/aes-256-gcm-cipher';
import { DrizzleIntegrationCredentialsRepository } from './infrastructure/integrations/drizzle-integration-credentials-repository';
import { DrizzleIntegrationOauthTokenStorage } from './infrastructure/integrations/drizzle-integration-oauth-token-storage';
import { TwitchIgdbCredentialsVerifier } from './infrastructure/integrations/twitch-igdb-credentials-verifier';
import { Scheduler } from './infrastructure/lifecycle/scheduler';
import { baseLogger } from './infrastructure/logging/logger';
import { requestContext } from './infrastructure/logging/request-context-middleware';
import { MetadataCacheRepository } from './infrastructure/metadata/metadata-cache-repository';
import { DrizzleRateLimitBucketRepository } from './infrastructure/rate-limit/drizzle-rate-limit-bucket-repository';
import { mutationRateLimit } from './infrastructure/rate-limit/mutation-rate-limit-middleware';
import { makeDictionaryRouter } from './routes/_make-dictionary-router';
import { attachProblemJsonErrorHandler } from './routes/_problem-json';
import { createExportRouter } from './routes/export';
import { createGamesRouter } from './routes/games';
import { createHealthRouter } from './routes/health';
import { createImportRouter } from './routes/import';
import { createIntegrationsRouter } from './routes/integrations';
import { createMeRouter } from './routes/me';
import { idempotencyKey as idempotencyKeyMiddlewareFactory } from './routes/middleware/idempotency-key';
import { originGuard } from './routes/middleware/origin-guard';
import { type AuthVariables, requireAuth } from './routes/middleware/require-auth';
import { requireUploadPermission } from './routes/middleware/require-upload-permission';
import { createUploadRoute } from './routes/upload';

const ONE_HOUR_MS = 60 * 60 * 1000;
const FIVE_MINUTES_MS = 5 * 60 * 1000;

function ensureError(value: unknown): Error {
  return value instanceof Error ? value : new Error(String(value));
}

interface Persistence {
  readonly gameRepository: DrizzleGameRepository;
  readonly platformRepository: ReturnType<typeof makeDrizzleDictionaryRepository<PlatformKind>>;
  readonly genreRepository: ReturnType<typeof makeDrizzleDictionaryRepository<GenreKind>>;
  readonly developerRepository: ReturnType<typeof makeDrizzleDictionaryRepository<DeveloperKind>>;
  readonly importRepository: DrizzleImportRepository;
  readonly idempotencyKeyRepository: IdempotencyKeyRepository;
  readonly transactionRunner: DrizzleTransactionRunner;
}

interface CoverStorageBundle {
  readonly storage: CoverStorage | null;
  readonly available: boolean;
}

interface HttpMiddleware {
  readonly idempotencyKey: ReturnType<typeof idempotencyKeyMiddlewareFactory>;
  readonly rateLimitMutations: ReturnType<typeof mutationRateLimit>;
}

interface IgdbStack {
  readonly holder: IgdbChainHolder;
  readonly save: SaveIgdbIntegration;
  readonly clear: ClearIgdbIntegration;
  readonly getStatus: GetIgdbIntegrationStatus;
  readonly credentialsRepo: DrizzleIntegrationCredentialsRepository;
  readonly prime: () => Promise<void>;
}

interface GameOps {
  readonly create: CreateGame;
  readonly update: UpdateGame;
  readonly delete: DeleteGame;
  readonly list: ListGames;
  readonly get: GetGame;
  readonly moveToCollection: MoveToCollection;
}

interface Dictionaries {
  readonly platforms: {
    readonly router: ReturnType<typeof makeDictionaryRouter>;
  };
  readonly genres: { readonly router: ReturnType<typeof makeDictionaryRouter> };
  readonly developers: {
    readonly router: ReturnType<typeof makeDictionaryRouter>;
  };
}

interface DataIO {
  readonly exportData: ExportData;
  readonly importData: ImportData;
}

interface CronBundle {
  readonly cleanupOrphans: CleanupOrphans;
  readonly sweepRateLimitBuckets: SweepRateLimitBuckets;
}

export interface ApplicationTestOverrides {
  readonly igdb?: { readonly holder?: IgdbChainHolder };
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
    this.gameOps = this.buildGameUseCases();
    this.dictionaries = this.buildDictionaryStack();
    this.dataIO = this.buildDataIO();
    this.cron = this.buildCronStack();
    this.scheduler = this.buildScheduler();
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
      try {
        await this.igdb.prime();
      } catch (err) {
        baseLogger.event('igdb.prime.failed', {
          reason: err instanceof Error ? err.message : String(err),
        });
        // Do NOT rethrow — chain stays unconfigured, routes return 503.
      }
      this.registerMiddleware();
      this.registerRoutes();
      this.scheduler.start();
      this.bunServer = Bun.serve({ port, fetch: this.hono.fetch });
      baseLogger.event('api.listening', {
        port,
        url: `http://localhost:${port}`,
      });
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
      baseLogger.event('startup.migrations.applied', {
        folder: migrationsFolder,
      });
    } catch (err) {
      baseLogger.error({
        event: 'startup.migrations.failed',
        err: ensureError(err),
      });
      throw err;
    }
  }

  private async verifyDatabase(): Promise<void> {
    try {
      await db.run(sql`SELECT 1`);
    } catch (err) {
      baseLogger.error({
        event: 'startup.db.unreachable',
        err: ensureError(err),
      });
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
    this.hono.use('/api/platforms/*', requireAuth);
    this.hono.use('/api/platforms/*', this.httpMw.rateLimitMutations);
    this.hono.route('/api/platforms', this.dictionaries.platforms.router);

    this.hono.use('/api/genres/*', requireAuth);
    this.hono.use('/api/genres/*', this.httpMw.rateLimitMutations);
    this.hono.route('/api/genres', this.dictionaries.genres.router);

    this.hono.use('/api/developers/*', requireAuth);
    this.hono.use('/api/developers/*', this.httpMw.rateLimitMutations);
    this.hono.route('/api/developers', this.dictionaries.developers.router);

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
      createMeRouter({
        coverStorageAvailable: this.coverStorageBundle.available,
      }),
    );

    this.hono.use('/api/integrations/*', requireAuth);
    this.hono.use('/api/integrations/*', this.httpMw.rateLimitMutations);
    this.hono.route(
      '/api/integrations',
      createIntegrationsRouter({
        saveIgdbIntegration: this.igdb.save,
        clearIgdbIntegration: this.igdb.clear,
        getIgdbIntegrationStatus: this.igdb.getStatus,
        idempotencyKeyMiddleware: this.httpMw.idempotencyKey,
      }),
    );

    this.hono.use('/api/upload/*', requireAuth);
    this.hono.use('/api/upload/*', requireUploadPermission);
    this.hono.use('/api/upload/*', this.httpMw.rateLimitMutations);
    this.hono.route(
      '/api/upload',
      createUploadRoute(this.coverStorageBundle.storage, this.httpMw.idempotencyKey),
    );
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
      baseLogger.event('shutdown.drain.timeout', {
        drainMs: env.SHUTDOWN_DRAIN_MS,
      });
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
      baseLogger.error({
        event: 'shutdown.db.close_failed',
        err: ensureError(err),
      });
    }
  }

  private async cleanup(): Promise<void> {
    this.scheduler.stop();
    await this.drainHttpServer();
    this.closeDatabase();
  }

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

  private buildCoverStorage(): CoverStorageBundle {
    const token = env.UPLOADTHING_TOKEN;
    const available = token.length > 0;
    return Object.freeze({
      storage: available ? new UploadThingCoverStorage(token) : null,
      available,
    });
  }

  private buildHttpMiddleware(): HttpMiddleware {
    // Both call sites construct their own DrizzleRateLimitBucketRepository
    // because the adapter is stateless (single `db` field, no cache). Folding
    // the repo into `Persistence` would centralize this, but ripples through
    // the Persistence shape — defer until the next persistence refactor.
    const rateLimitRepo = new DrizzleRateLimitBucketRepository(db);
    return Object.freeze({
      idempotencyKey: idempotencyKeyMiddlewareFactory({
        repo: this.persistence.idempotencyKeyRepository,
      }),
      rateLimitMutations: mutationRateLimit({ repo: rateLimitRepo, now: () => Date.now() }),
    });
  }

  private async firstUserIdOrNull(): Promise<string> {
    const [row] = await db.select({ id: authUser.id }).from(authUser).limit(1);
    return row?.id ?? '';
  }

  private buildIgdbStack(): IgdbStack {
    const metadataCacheRepository = new MetadataCacheRepository();
    const igdbTokenStorage = new DrizzleIntegrationOauthTokenStorage();
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
    // Transient adapter: the use cases now talk to the per-user resource cache
    // via `invalidate(userId)`. The chain-holder is still wired up by `prime()`
    // below and is removed entirely in a follow-up task. Until then, drop the
    // chain on invalidate so the runtime state stays in sync with the row.
    const resourceCache = {
      invalidate(userId: string): void {
        holder.swap(userId, null);
      },
    };
    const save = new SaveIgdbIntegration({
      repo: credentialsRepo,
      cipher: integrationCipher,
      verifier,
      resourceCache,
      now: () => new Date(),
      uuid: () => crypto.randomUUID(),
    });
    const clear = new ClearIgdbIntegration({
      repo: credentialsRepo,
      tokenStorage: igdbTokenStorage,
      resourceCache,
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
      holder.swap(stored.userId, {
        clientId: stored.clientId.value,
        clientSecret: decryptResult.value,
      });
    };
    const getStatus = new GetIgdbIntegrationStatus(credentialsRepo);
    return Object.freeze({ holder, save, clear, getStatus, credentialsRepo, prime });
  }

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

  private buildDictionaryStack(): Dictionaries {
    const p = this.persistence;
    const genreUseCases = makeDictionaryUseCases<GenreKind>({
      repo: p.genreRepository,
      withCounterTx: (tx) => {
        const txGameRepo = p.gameRepository.withTx(tx);
        return (userId, name) => txGameRepo.countByGenre(userId, name);
      },
      transactionRunner: p.transactionRunner,
      kind: GENRE_DICTIONARY_KIND,
      maxNameLength: GENRE_NAME_MAX_LENGTH,
    });
    const developerUseCases = makeDictionaryUseCases<DeveloperKind>({
      repo: p.developerRepository,
      withCounterTx: (tx) => {
        const txGameRepo = p.gameRepository.withTx(tx);
        return (userId, name) => txGameRepo.countByDeveloper(userId, name);
      },
      transactionRunner: p.transactionRunner,
      kind: DEVELOPER_DICTIONARY_KIND,
      maxNameLength: DEVELOPER_NAME_MAX_LENGTH,
    });
    const platformUseCases = makeDictionaryUseCases<PlatformKind>({
      repo: p.platformRepository,
      withCounterTx: (tx) => {
        const txGameRepo = p.gameRepository.withTx(tx);
        return (userId, name) => txGameRepo.countByPlatform(userId, name);
      },
      transactionRunner: p.transactionRunner,
      kind: PLATFORM_DICTIONARY_KIND,
      maxNameLength: PLATFORM_NAME_MAX_LENGTH,
    });
    return Object.freeze({
      platforms: Object.freeze({
        router: makeDictionaryRouter({
          useCases: platformUseCases,
          idempotencyKey: this.httpMw.idempotencyKey,
        }),
      }),
      genres: Object.freeze({
        router: makeDictionaryRouter({
          useCases: genreUseCases,
          idempotencyKey: this.httpMw.idempotencyKey,
        }),
      }),
      developers: Object.freeze({
        router: makeDictionaryRouter({
          useCases: developerUseCases,
          idempotencyKey: this.httpMw.idempotencyKey,
        }),
      }),
    });
  }

  private buildDataIO(): DataIO {
    const p = this.persistence;
    return Object.freeze({
      exportData: new ExportData(p.gameRepository, p.platformRepository),
      importData: new ImportData(p.gameRepository, p.platformRepository, p.importRepository),
    });
  }

  private buildScheduler(): Scheduler {
    return new Scheduler({
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
  }

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
        repo: new DrizzleRateLimitBucketRepository(db),
        lock: cronLock,
        now: () => Date.now(),
      }),
    });
  }

  static buildForTesting(_overrides: ApplicationTestOverrides = {}): Application {
    const app = new Application();
    return app;
  }

  igdbHolderForTesting(): IgdbChainHolder {
    return this.igdb.holder;
  }

  honoForTesting(): Hono<{ Variables: AuthVariables }> {
    return this.hono;
  }

  gameOpsForTesting(): GameOps {
    return this.gameOps;
  }

  httpMwForTesting(): HttpMiddleware {
    return this.httpMw;
  }

  coverStorageForTesting(): CoverStorageBundle {
    return this.coverStorageBundle;
  }

  dictionariesForTesting(): Dictionaries {
    return this.dictionaries;
  }

  private registerProcessHandlers(): void {
    process.on('SIGTERM', () => {
      void this.stop('SIGTERM', 0);
    });
    process.on('SIGINT', () => {
      void this.stop('SIGINT', 0);
    });
    process.on('uncaughtException', (err) => {
      baseLogger.error({
        event: 'fatal.uncaughtException',
        err: ensureError(err),
      });
      void this.stop('exception', 1);
    });
    process.on('unhandledRejection', (reason) => {
      baseLogger.error({
        event: 'fatal.unhandledRejection',
        err: ensureError(reason),
      });
      void this.stop('exception', 1);
    });
  }
}
