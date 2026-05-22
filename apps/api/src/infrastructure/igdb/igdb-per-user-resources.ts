import type { IgdbResourceCacheInvalidator } from '../../application/integrations/igdb-resource-cache-invalidator';
import type { IntegrationCipher } from '../../domain/integrations/integration-cipher';
import type { IntegrationCredentialsRepository } from '../../domain/integrations/integration-credentials-repository';
import type { IntegrationTokenStorage } from '../../domain/integrations/integration-token-storage';
import type { Logger } from '../logging/logger';
import { TokenBucketRateLimiter } from '../metadata/rate-limiter';
import { IgdbTokenStore } from './igdb-token-store';

const IGDB = 'igdb' as const;

export interface IgdbUserResources {
  readonly clientId: string;
  readonly tokenStore: IgdbTokenStore;
  readonly rateLimiter: TokenBucketRateLimiter;
}

/**
 * Lazy per-user cache of the stateful IGDB sub-components that must be bound
 * to a single `clientId`/`clientSecret` set: a Twitch token store and a
 * client-side rate limiter. The global circuit breaker is NOT here — it
 * protects the upstream service across all users.
 *
 * `get(userId)` is single-flighted per `userId` via an `inflight` map so two
 * concurrent first-requests for the same user share one DB lookup, one
 * decrypt, and one `IgdbTokenStore` instance. Without this, both callers
 * would each construct their own `IgdbTokenStore`, each holding its own
 * `inflightRefresh` lock — defeating the single-flight guarantee inside the
 * token store.
 *
 * Resources cache plaintext `clientSecret` in memory inside the token store
 * for the lifetime of the cache entry. Encryption-at-rest is preserved in
 * `integration_credentials`; in-memory plaintext is unavoidable because
 * Twitch OAuth requires the raw secret. `invalidate(userId)` drops it;
 * process restart clears all entries.
 *
 * No TTL / LRU — hobby scale (<100 users). Revisit when the cardinality
 * matters.
 */
export class IgdbPerUserResources implements IgdbResourceCacheInvalidator {
  private readonly cache = new Map<string, IgdbUserResources>();
  private readonly inflight = new Map<string, Promise<IgdbUserResources | null>>();

  constructor(
    private readonly credsRepo: IntegrationCredentialsRepository,
    private readonly cipher: IntegrationCipher,
    private readonly tokenStorage: IntegrationTokenStorage,
    private readonly logger: Logger,
  ) {}

  async get(userId: string): Promise<IgdbUserResources | null> {
    const cached = this.cache.get(userId);
    if (cached !== undefined) return cached;

    const inflight = this.inflight.get(userId);
    if (inflight !== undefined) return inflight;

    // Race: if `invalidate(userId)` runs while a build is in flight, the
    // build's result is stale (its source row may have been swapped). We
    // tag the in-flight promise with its own identity and only commit to
    // the cache if `this.inflight.get(userId)` still points at us — if
    // `invalidate` cleared the slot (or a newer build replaced it), we
    // drop the result silently instead of reviving a stale entry.
    let buildPromise: Promise<IgdbUserResources | null>;
    buildPromise = this.build(userId)
      .then((resources) => {
        if (resources !== null && this.inflight.get(userId) === buildPromise) {
          this.cache.set(userId, resources);
        }
        return resources;
      })
      .finally(() => {
        if (this.inflight.get(userId) === buildPromise) {
          this.inflight.delete(userId);
        }
      });
    this.inflight.set(userId, buildPromise);
    return buildPromise;
  }

  invalidate(userId: string): void {
    this.cache.delete(userId);
    // Any in-flight build for this user is now stale (its source row may
    // have been swapped under it). Drop the reference so the next caller
    // starts a fresh build.
    this.inflight.delete(userId);
  }

  /**
   * TEST-ONLY. Seeds the cache with a hand-built `IgdbUserResources` record so
   * fixtures can pin a specific (clientId, tokenStore, rateLimiter) without
   * hitting the DB / cipher path.
   *
   * The leading `__` is a project-wide convention marker: anything starting
   * with `__` is test-infrastructure-only. CI greps for `__seedForTest`
   * outside `_fixtures/**` and fails the build (wiring test enforces this —
   * see `apps/api/src/__tests__/app.test.ts`).
   */
  __seedForTest(userId: string, resources: IgdbUserResources | null): void {
    if (resources === null) {
      this.cache.delete(userId);
      return;
    }
    this.cache.set(userId, resources);
  }

  private async build(userId: string): Promise<IgdbUserResources | null> {
    const row = await this.credsRepo.findByUserAndKind(userId, IGDB);
    if (row === null || !row.enabled) return null;

    const decrypted = this.cipher.decrypt(row.clientSecretCiphertext);
    if (!decrypted.ok) {
      this.logger.event('igdb.resources.decrypt_failed', {
        userId,
        reason: decrypted.error.kind,
      });
      return null;
    }

    const tokenStore = new IgdbTokenStore({
      storage: this.tokenStorage,
      userId,
      clientId: row.clientId.value,
      clientSecret: decrypted.value,
    });
    const rateLimiter = new TokenBucketRateLimiter({
      capacity: 4,
      refillIntervalMs: 250,
    });
    const resources: IgdbUserResources = {
      clientId: row.clientId.value,
      tokenStore,
      rateLimiter,
    };
    return resources;
  }
}
