import { SearchGameMetadata } from '../../application/games/search-game-metadata';
import type { Logger } from '../logging/logger';
import { CachingGameMetadataProvider } from '../metadata/caching-game-metadata-provider';
import type { MetadataCacheRepository } from '../metadata/metadata-cache-repository';
import type { CircuitBreaker } from './circuit-breaker';
import { IgdbGameMetadataProvider } from './igdb-game-metadata-provider';
import { IgdbHttpClient } from './igdb-http-client';
import type { IgdbPerUserResources } from './igdb-per-user-resources';

/**
 * Narrow runtime view returned by `buildFor(userId)`. Holds only the use cases
 * that need a per-user `httpClient` — `EnrichGameMetadata` is built once in
 * `app.ts` (it never calls IGDB; only reads `metadata_cache` + `games`).
 */
export interface IgdbChain {
  readonly searchGameMetadata: SearchGameMetadata;
}

/**
 * Per-request DI assembly. `buildFor(userId)` is intentionally a factory of
 * ready-to-call use cases. Hiding the per-user resources behind a use-case
 * constructor would either (a) force the use case to grow infra construction
 * logic, or (b) duplicate the resolver on every route call site.
 *
 * `isConfiguredFor` is NOT exposed. "Is IGDB configured for this user?" is a
 * domain question answered by `GetIgdbIntegrationStatus`. Adding the same
 * query to the factory would create two paths returning the same answer.
 */
export class IgdbChainFactory {
  constructor(
    private readonly resources: Pick<IgdbPerUserResources, 'get'>,
    private readonly breaker: CircuitBreaker,
    private readonly metadataCacheRepository: MetadataCacheRepository,
    private readonly logger: Logger,
    private readonly timeoutMs: number,
    private readonly cacheTtlDays: number,
  ) {}

  async buildFor(userId: string): Promise<IgdbChain | null> {
    const resources = await this.resources.get(userId);
    if (resources === null) return null;

    const httpClient = new IgdbHttpClient({
      baseUrl: 'https://api.igdb.com/v4',
      clientId: resources.clientId,
      tokenStore: resources.tokenStore,
      rateLimiter: resources.rateLimiter,
      breaker: this.breaker,
      timeoutMs: this.timeoutMs,
    });
    const cachingProvider = new CachingGameMetadataProvider({
      inner: new IgdbGameMetadataProvider({ httpClient }),
      cacheRepo: this.metadataCacheRepository,
      providerName: 'igdb',
      positiveTtlDays: this.cacheTtlDays,
      negativeTtlDays: 1,
    });
    const searchGameMetadata = new SearchGameMetadata(
      cachingProvider,
      this.metadataCacheRepository,
      this.logger,
    );
    return { searchGameMetadata };
  }
}
