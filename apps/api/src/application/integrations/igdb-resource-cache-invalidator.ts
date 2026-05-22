/**
 * Application-layer port consumed by Save/Clear IGDB integration use cases to
 * tell the infrastructure cache (`IgdbPerUserResources`) that the credentials
 * row backing this user has changed.
 *
 * Narrow on purpose — use cases must not see the full per-user resources
 * surface; they only know "the credentials I just persisted are now the source
 * of truth, discard whatever you had cached".
 *
 * Implemented by `IgdbPerUserResources` in infrastructure.
 */
export interface IgdbResourceCacheInvalidator {
  invalidate(userId: string): void;
}
