import { EnrichGameMetadata } from '../../application/games/enrich-game-metadata';
import { SearchGameMetadata } from '../../application/games/search-game-metadata';
import type { TransactionRunner } from '../../application/shared/transaction-runner';
import type { IsCoverHostAllowed } from '../../domain/games/cover-image-url';
import type { GameRepository } from '../../domain/games/game-repository';
import type { Logger } from '../logging/logger';
import { CachingGameMetadataProvider } from '../metadata/caching-game-metadata-provider';
import type { MetadataCacheRepository } from '../metadata/metadata-cache-repository';
import { TokenBucketRateLimiter } from '../metadata/rate-limiter';
import { CircuitBreaker } from './circuit-breaker';
import { IgdbGameMetadataProvider } from './igdb-game-metadata-provider';
import { IgdbHttpClient } from './igdb-http-client';
import type { IgdbTokenStorage } from './igdb-token-store';
import { IgdbTokenStore } from './igdb-token-store';

/**
 * Composed runtime view of the IGDB integration. When the integration is
 * configured (credentials present in DB), the chain holds both use-cases the
 * HTTP routes need. When unconfigured, the holder returns `null` and the
 * routes return 503.
 */
export interface IgdbChain {
  readonly searchGameMetadata: SearchGameMetadata;
  readonly enrichGameMetadata: EnrichGameMetadata;
}

export interface IgdbChainHolderDeps {
  readonly logger: Logger;
  readonly tokenStorage: IgdbTokenStorage;
  readonly metadataCacheRepository: MetadataCacheRepository;
  readonly gameRepository: GameRepository;
  readonly transactionRunner: TransactionRunner;
  readonly isCoverHostAllowed: IsCoverHostAllowed;
  readonly timeoutMs: number;
  readonly cacheTtlDays: number;
}

/**
 * Mutable holder for the IGDB chain so the integration can be reconfigured at
 * runtime without restarting the process. The IGDB credentials live in the
 * `integration_credentials` table; saving or clearing them through the
 * `SaveIgdbIntegration` / `ClearIgdbIntegration` use-cases calls
 * `swap(creds | null)` on this holder.
 *
 * `swap(null)` tears down the chain AND resets the circuit breaker so a
 * subsequent `swap(creds)` starts with a clean failure window — old failures
 * attributed to revoked credentials never bleed into the new account.
 *
 * `swap(creds)` always rebuilds the breaker, rate limiter and token store.
 * Sharing them across credentials would let stale failure counts or queued
 * requests bound to the old creds reach the new chain.
 *
 * In-flight requests that already captured the previous chain reference
 * finish using it — those resolve with the old creds. New requests see the
 * new value of `get()`.
 */
export class IgdbChainHolder {
  private chain: IgdbChain | null = null;
  private breaker: CircuitBreaker | null = null;

  constructor(private readonly deps: IgdbChainHolderDeps) {}

  get(): IgdbChain | null {
    return this.chain;
  }

  isConfigured(): boolean {
    return this.chain !== null;
  }

  swap(creds: { clientId: string; clientSecret: string } | null): void {
    if (creds === null) {
      if (this.breaker !== null) {
        this.breaker.reset();
      }
      this.breaker = null;
      this.chain = null;
      this.deps.logger.event('igdb.chain.cleared', {});
      return;
    }
    this.chain = this.build(creds);
    this.deps.logger.event('igdb.chain.configured', {});
  }

  private build(creds: { clientId: string; clientSecret: string }): IgdbChain {
    const { logger } = this.deps;
    const breaker = new CircuitBreaker({
      failureThreshold: 5,
      windowMs: 60_000,
      halfOpenAfterMs: 30_000,
      onStateChange: (next, prev) =>
        logger.event(next === 'open' ? 'igdb.breaker.open' : 'igdb.breaker.close', {
          host: 'api.igdb.com',
          from: prev,
          to: next,
        }),
    });
    this.breaker = breaker;

    const tokenStore = new IgdbTokenStore({
      storage: this.deps.tokenStorage,
      clientId: creds.clientId,
      clientSecret: creds.clientSecret,
    });
    const rateLimiter = new TokenBucketRateLimiter({
      capacity: 4,
      refillIntervalMs: 250,
    });
    const httpClient = new IgdbHttpClient({
      baseUrl: 'https://api.igdb.com/v4',
      clientId: creds.clientId,
      tokenStore,
      rateLimiter,
      breaker,
      timeoutMs: this.deps.timeoutMs,
    });
    const cachingProvider = new CachingGameMetadataProvider({
      inner: new IgdbGameMetadataProvider({ httpClient }),
      cacheRepo: this.deps.metadataCacheRepository,
      providerName: 'igdb',
      positiveTtlDays: this.deps.cacheTtlDays,
      negativeTtlDays: 1,
    });
    const searchGameMetadata = new SearchGameMetadata(
      cachingProvider,
      this.deps.metadataCacheRepository,
    );
    const enrichGameMetadata = new EnrichGameMetadata(
      this.deps.gameRepository,
      this.deps.transactionRunner,
      this.deps.metadataCacheRepository,
      this.deps.isCoverHostAllowed,
    );
    return { searchGameMetadata, enrichGameMetadata };
  }
}
