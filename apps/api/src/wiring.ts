import type { CoverStorage } from './application/cover-storage/cover-storage';
import { CreateGame } from './application/games/create-game';
import { DeleteGame } from './application/games/delete-game';
import { EnrichGameMetadata } from './application/games/enrich-game-metadata';
import { GetGame } from './application/games/get-game';
import { ListGames } from './application/games/list-games';
import { MoveToCollection } from './application/games/move-to-collection';
import { SearchGameMetadata } from './application/games/search-game-metadata';
import { UpdateGame } from './application/games/update-game';
import { env } from './infrastructure/config/env';
import { UploadThingCoverStorage } from './infrastructure/cover-storage/uploadthing-cover-storage';
import { DrizzleGameRepository } from './infrastructure/games/drizzle-game-repository';
import { CircuitBreaker } from './infrastructure/igdb/circuit-breaker';
import { DrizzleIgdbTokenStorage } from './infrastructure/igdb/drizzle-igdb-token-storage';
import { IgdbGameMetadataProvider } from './infrastructure/igdb/igdb-game-metadata-provider';
import { IgdbHttpClient } from './infrastructure/igdb/igdb-http-client';
import { IgdbTokenStore } from './infrastructure/igdb/igdb-token-store';
import { CachingGameMetadataProvider } from './infrastructure/metadata/caching-game-metadata-provider';
import { MetadataCacheRepository } from './infrastructure/metadata/metadata-cache-repository';
import { TokenBucketRateLimiter } from './infrastructure/metadata/rate-limiter';
import { DrizzlePlatformRepository } from './infrastructure/platforms/drizzle-platform-repository';

const uploadThingToken = env.UPLOADTHING_TOKEN;
export const coverStorageAvailable = uploadThingToken.length > 0;

class NullCoverStorage implements CoverStorage {
  async upload(_file: File): Promise<{ url: string }> {
    throw new Error('Cover storage is not configured');
  }
  async delete(_url: string): Promise<void> {}
  async listOlderThan(_olderThanHours: number): Promise<string[]> {
    return [];
  }
}

export const coverStorage: CoverStorage = coverStorageAvailable
  ? new UploadThingCoverStorage(uploadThingToken)
  : new NullCoverStorage();

export const gameRepository = new DrizzleGameRepository();
export const platformRepository = new DrizzlePlatformRepository();

export const createGame = new CreateGame(gameRepository, platformRepository);
export const updateGame = new UpdateGame(gameRepository, platformRepository, coverStorage);
export const deleteGame = new DeleteGame(gameRepository, coverStorage);
export const listGames = new ListGames(gameRepository);
export const getGame = new GetGame(gameRepository);
export const moveToCollection = new MoveToCollection(gameRepository);

// --- IGDB metadata chain --------------------------------------------------
// tokenStore → http client → adapter → caching decorator → use cases.
// Each layer is process-singleton — circuit breaker / rate-limiter / token
// store hold state that must be shared across all requests in this process.

const igdbBreaker = new CircuitBreaker({
  failureThreshold: 5,
  windowMs: 60_000,
  halfOpenAfterMs: 30_000,
  onStateChange: (next, prev) =>
    console.log(
      JSON.stringify({
        event: next === 'open' ? 'igdb.breaker.open' : 'igdb.breaker.close',
        host: 'api.igdb.com',
        from: prev,
        to: next,
      }),
    ),
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
export const enrichGameMetadata = new EnrichGameMetadata(gameRepository);
