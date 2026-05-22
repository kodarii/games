import { afterAll, beforeAll } from 'bun:test';
import type { IntegrationTokenStorage } from '../../domain/integrations/integration-token-storage';
import type {
  IgdbPerUserResources,
  IgdbUserResources,
} from '../../infrastructure/igdb/igdb-per-user-resources';
import { IgdbTokenStore } from '../../infrastructure/igdb/igdb-token-store';
import { TokenBucketRateLimiter } from '../../infrastructure/metadata/rate-limiter';

/**
 * Build a self-contained `IgdbUserResources` value with in-memory token
 * storage so the fixture is independent of the live DB.
 */
export function makeStandaloneResources(opts: {
  userId: string;
  clientId: string;
  clientSecret: string;
}): IgdbUserResources {
  const tokens = new Map<string, unknown>();
  const key = (u: string, k: string) => `${u}:${k}`;
  const storage: IntegrationTokenStorage = {
    async read(u, k) {
      return (tokens.get(key(u, k)) ?? null) as never;
    },
    async write(u, k, r) {
      tokens.set(key(u, k), r);
    },
    async clear(u, k) {
      tokens.delete(key(u, k));
    },
    withTx() {
      return storage;
    },
  };
  return {
    clientId: opts.clientId,
    tokenStore: new IgdbTokenStore({
      storage,
      userId: opts.userId,
      clientId: opts.clientId,
      clientSecret: opts.clientSecret,
    }),
    rateLimiter: new TokenBucketRateLimiter({ capacity: 4, refillIntervalMs: 250 }),
  };
}

/**
 * Per-file fixture that pins a specific user's resources for the file's
 * lifetime. Snapshot+restore by calling `__seedForTest(userId, null)` on
 * `afterAll`.
 *
 * The resources cache is passed in (rather than imported from `app.ts`) so
 * the fixture stays portable across composition-root changes.
 */
export function usePrimedIgdbResources(
  cache: IgdbPerUserResources,
  userId: string,
  creds: { clientId: string; clientSecret: string },
): void {
  beforeAll(() => {
    cache.__seedForTest(userId, makeStandaloneResources({ userId, ...creds }));
  });
  afterAll(() => {
    cache.__seedForTest(userId, null);
  });
}

/**
 * Per-file fixture that pins a specific user to "not configured" by clearing
 * the cache and the inflight map. Use when a test file wants the route to
 * return 503 deterministically.
 */
export function useDisabledIgdbResources(cache: IgdbPerUserResources, userId: string): void {
  beforeAll(() => {
    cache.__seedForTest(userId, null);
    cache.invalidate(userId);
  });
  afterAll(() => {
    cache.__seedForTest(userId, null);
    cache.invalidate(userId);
  });
}
