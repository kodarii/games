import { CleanupOrphans } from './application/cover-storage/cleanup-orphans';
import type { CoverStorage } from './application/cover-storage/cover-storage';
import { makeDictionaryUseCases } from './application/dictionary/make-dictionary-use-cases';
import { ExportData } from './application/export/export-data';
import { CreateGame } from './application/games/create-game';
import { DeleteGame } from './application/games/delete-game';
import { EnrichGameMetadata } from './application/games/enrich-game-metadata';
import { GetGame } from './application/games/get-game';
import { ListGames } from './application/games/list-games';
import { MoveToCollection } from './application/games/move-to-collection';
import { SearchGameMetadata } from './application/games/search-game-metadata';
import { UpdateGame } from './application/games/update-game';
import type { IdempotencyKeyRepository } from './application/idempotency/idempotency-key-repository';
import { ImportData } from './application/import/import-data';
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
import { isCoverHostAllowed } from './infrastructure/config/cover-hosts';
import { env } from './infrastructure/config/env';
import { UploadThingCoverStorage } from './infrastructure/cover-storage/uploadthing-cover-storage';
import { CronLock } from './infrastructure/cron/cron-lock';
import { db } from './infrastructure/db/client';
import { DrizzleTransactionRunner } from './infrastructure/db/drizzle-transaction-runner';
import {
  developers as developersTable,
  genres as genresTable,
  platforms as platformsTable,
} from './infrastructure/db/schema';
import { makeDrizzleDictionaryRepository } from './infrastructure/dictionary/make-drizzle-dictionary-repository';
import { DrizzleGameRepository } from './infrastructure/games/drizzle-game-repository';
import { DrizzleIdempotencyKeyRepository } from './infrastructure/idempotency/drizzle-idempotency-key-repository';
import { CircuitBreaker } from './infrastructure/igdb/circuit-breaker';
import { DrizzleIgdbTokenStorage } from './infrastructure/igdb/drizzle-igdb-token-storage';
import { IgdbGameMetadataProvider } from './infrastructure/igdb/igdb-game-metadata-provider';
import { IgdbHttpClient } from './infrastructure/igdb/igdb-http-client';
import { IgdbTokenStore } from './infrastructure/igdb/igdb-token-store';
import { DrizzleImportRepository } from './infrastructure/import/drizzle-import-repository';
import { baseLogger } from './infrastructure/logging/logger';
import { CachingGameMetadataProvider } from './infrastructure/metadata/caching-game-metadata-provider';
import { MetadataCacheRepository } from './infrastructure/metadata/metadata-cache-repository';
import { TokenBucketRateLimiter } from './infrastructure/metadata/rate-limiter';
import { makeDictionaryRouter } from './routes/_make-dictionary-router';
import { idempotencyKey as idempotencyKeyMiddlewareFactory } from './routes/middleware/idempotency-key';

const uploadThingToken = env.UPLOADTHING_TOKEN;
export const coverStorageAvailable = uploadThingToken.length > 0;

export const coverStorage: CoverStorage | null = coverStorageAvailable
  ? new UploadThingCoverStorage(uploadThingToken)
  : null;

export const gameRepository = new DrizzleGameRepository();
export const platformRepository = makeDrizzleDictionaryRepository<PlatformKind>({
  table: platformsTable,
  kind: PLATFORM_DICTIONARY_KIND,
});
export const genreRepository = makeDrizzleDictionaryRepository<GenreKind>({
  table: genresTable,
  kind: GENRE_DICTIONARY_KIND,
});
export const developerRepository = makeDrizzleDictionaryRepository<DeveloperKind>({
  table: developersTable,
  kind: DEVELOPER_DICTIONARY_KIND,
});
export const importRepository = new DrizzleImportRepository();
export const idempotencyKeyRepository: IdempotencyKeyRepository =
  new DrizzleIdempotencyKeyRepository();
export const transactionRunner = new DrizzleTransactionRunner(db);

export const createGame = new CreateGame(gameRepository, platformRepository);
export const updateGame = new UpdateGame(gameRepository, platformRepository, transactionRunner);
export const deleteGame = new DeleteGame(gameRepository, transactionRunner);
export const listGames = new ListGames(gameRepository);
export const getGame = new GetGame(gameRepository);
export const moveToCollection = new MoveToCollection(gameRepository, transactionRunner);

// --- Dictionary use-cases + routers ---------------------------------------
// One factory call per dictionary kind. Adding a new dictionary is ~10 lines:
// schema table + this block + a thin route file that re-exports the router.

const genreUseCases = makeDictionaryUseCases<GenreKind>({
  repo: genreRepository,
  withCounterTx: (tx) => {
    const txGameRepo = gameRepository.withTx(tx);
    return (userId, name) => txGameRepo.countByGenre(userId, name);
  },
  transactionRunner,
  kind: GENRE_DICTIONARY_KIND,
  maxNameLength: GENRE_NAME_MAX_LENGTH,
});

const developerUseCases = makeDictionaryUseCases<DeveloperKind>({
  repo: developerRepository,
  withCounterTx: (tx) => {
    const txGameRepo = gameRepository.withTx(tx);
    return (userId, name) => txGameRepo.countByDeveloper(userId, name);
  },
  transactionRunner,
  kind: DEVELOPER_DICTIONARY_KIND,
  maxNameLength: DEVELOPER_NAME_MAX_LENGTH,
});

const platformUseCases = makeDictionaryUseCases<PlatformKind>({
  repo: platformRepository,
  withCounterTx: (tx) => {
    const txGameRepo = gameRepository.withTx(tx);
    return (userId, name) => txGameRepo.countByPlatform(userId, name);
  },
  transactionRunner,
  kind: PLATFORM_DICTIONARY_KIND,
  maxNameLength: PLATFORM_NAME_MAX_LENGTH,
});

export const listGenres = genreUseCases.list;
export const createGenre = genreUseCases.create;
export const deleteGenre = genreUseCases.delete;

export const listDevelopers = developerUseCases.list;
export const createDeveloper = developerUseCases.create;
export const deleteDeveloper = developerUseCases.delete;

export const listPlatforms = platformUseCases.list;
export const createPlatform = platformUseCases.create;
export const deletePlatform = platformUseCases.delete;

export const genresRouter = makeDictionaryRouter({ useCases: genreUseCases });
export const developersRouter = makeDictionaryRouter({ useCases: developerUseCases });
export const platformsRouter = makeDictionaryRouter({ useCases: platformUseCases });

export const exportData = new ExportData(gameRepository, platformRepository);
export const importData = new ImportData(gameRepository, platformRepository, importRepository);

// --- IGDB metadata chain --------------------------------------------------
// tokenStore → http client → adapter → caching decorator → use cases.
// Each layer is process-singleton — circuit breaker / rate-limiter / token
// store hold state that must be shared across all requests in this process.

const igdbBreaker = new CircuitBreaker({
  failureThreshold: 5,
  windowMs: 60_000,
  halfOpenAfterMs: 30_000,
  onStateChange: (next, prev) =>
    baseLogger.event(next === 'open' ? 'igdb.breaker.open' : 'igdb.breaker.close', {
      host: 'api.igdb.com',
      from: prev,
      to: next,
    }),
});

const igdbTokenStorage = new DrizzleIgdbTokenStorage();
const igdbTokenStore = new IgdbTokenStore({
  storage: igdbTokenStorage,
  clientId: env.IGDB_CLIENT_ID,
  clientSecret: env.IGDB_CLIENT_SECRET,
});

const igdbRateLimiter = new TokenBucketRateLimiter({
  capacity: 4,
  refillIntervalMs: 250,
});

const igdbHttpClient = new IgdbHttpClient({
  baseUrl: 'https://api.igdb.com/v4',
  clientId: env.IGDB_CLIENT_ID,
  tokenStore: igdbTokenStore,
  rateLimiter: igdbRateLimiter,
  breaker: igdbBreaker,
  timeoutMs: env.IGDB_TIMEOUT_MS,
});

export const igdbConfigured: boolean =
  env.IGDB_CLIENT_ID.length > 0 && env.IGDB_CLIENT_SECRET.length > 0;

const igdbRawProvider = new IgdbGameMetadataProvider({ httpClient: igdbHttpClient });
const metadataCacheRepository = new MetadataCacheRepository();
const cachingProvider = new CachingGameMetadataProvider({
  inner: igdbRawProvider,
  cacheRepo: metadataCacheRepository,
  providerName: 'igdb',
  positiveTtlDays: env.IGDB_CACHE_TTL_DAYS,
  negativeTtlDays: 1,
});

export const searchGameMetadata = new SearchGameMetadata(cachingProvider, metadataCacheRepository);
export const enrichGameMetadata = new EnrichGameMetadata(
  gameRepository,
  transactionRunner,
  metadataCacheRepository,
  isCoverHostAllowed,
);

// --- Cron + lifecycle -----------------------------------------------------
// Owner identifies this process in cron_locks rows. We salt with hostname,
// pid, and a short random tag so two pods on the same host still get unique
// owners across restarts.
const cronOwner = `${process.env.HOSTNAME ?? 'local'}-${process.pid}-${crypto.randomUUID().slice(0, 8)}`;
export const cronLock = new CronLock({ db, owner: cronOwner });

// Single shared idempotency middleware instance for all mutating routes.
// Built once at wiring time — middleware identity is stable and Hono caches
// the compiled handler array by reference.
export const idempotencyKeyMiddleware = idempotencyKeyMiddlewareFactory({
  repo: idempotencyKeyRepository,
});

export const cleanupOrphans = new CleanupOrphans(
  coverStorage,
  gameRepository,
  idempotencyKeyRepository,
  cronLock,
  { idempotencyTtlMs: env.IDEMPOTENCY_TTL_HOURS * 60 * 60 * 1000 },
);
