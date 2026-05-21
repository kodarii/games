import { EnrichGameMetadata } from '../../application/games/enrich-game-metadata';
import { SearchGameMetadata } from '../../application/games/search-game-metadata';
import type { TransactionRunner } from '../../application/shared/transaction-runner';
import type { IsCoverHostAllowed } from '../../domain/games/cover-image-url';
import type { GameRepository } from '../../domain/games/game-repository';
import type { IntegrationTokenStorage } from '../../domain/integrations/integration-token-storage';
import type { Logger } from '../logging/logger';
import { CachingGameMetadataProvider } from '../metadata/caching-game-metadata-provider';
import type { MetadataCacheRepository } from '../metadata/metadata-cache-repository';
import { TokenBucketRateLimiter } from '../metadata/rate-limiter';
import { CircuitBreaker } from './circuit-breaker';
import { IgdbGameMetadataProvider } from './igdb-game-metadata-provider';
import { IgdbHttpClient } from './igdb-http-client';
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
  readonly tokenStorage: IntegrationTokenStorage;
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

  /**
   * TEST-ONLY. Sets the internal chain reference WITHOUT rebuilding sub-components.
   *
   * Production code MUST use `swap(creds | null)`, which deliberately rebuilds
   * the CircuitBreaker / TokenStore / RateLimiter on every transition (see
   * class TSDoc — sharing stale failure counts or queued requests across
   * credentials is a correctness bug).
   *
   * This method exists solely so test fixtures (`apps/api/src/__tests__/_fixtures/igdb-chain-fixture.ts`)
   * can snapshot+restore the EXACT prior chain instance around a file's
   * beforeAll/afterAll lifecycle. `bun test` runs all files in a single
   * process with a shared ESM module cache, so this singleton is shared;
   * with `bun test --randomize` enabled file order is non-deterministic
   * and we need an identity-preserving restore, not a rebuilt equivalent.
   *
   * The leading `__` is a convention marker: anything starting with `__`
   * in this codebase is test-infrastructure-only. CI greps for
   * `__setChainForTest` outside `_fixtures/**` and fails the build
   * (wiring.test.ts Test 4 enforces this).
   */
  __setChainForTest(chain: IgdbChain | null): void {
    this.chain = chain;
    // Intentionally NOT touching `this.breaker` — its lifecycle is tied to
    // the chain we're restoring. If the snapshot's chain was null, breaker
    // was null too; if non-null, it was the breaker built when that chain
    // was built. Either way the holder ends up in the same observable state.
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
      this.deps.logger,
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
