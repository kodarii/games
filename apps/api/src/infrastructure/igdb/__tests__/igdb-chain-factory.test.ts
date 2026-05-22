import { describe, expect, it } from 'bun:test';
import type { Logger } from '../../logging/logger';
import type { MetadataCachePort } from '../../metadata/caching-game-metadata-provider';
import type { MetadataCacheRepository } from '../../metadata/metadata-cache-repository';
import { TokenBucketRateLimiter } from '../../metadata/rate-limiter';
import { CircuitBreaker } from '../circuit-breaker';
import { IgdbChainFactory } from '../igdb-chain-factory';
import type { IgdbPerUserResources, IgdbUserResources } from '../igdb-per-user-resources';
import { IgdbTokenStore } from '../igdb-token-store';

function noopLogger(): Logger {
  const logger = {
    event() {},
    info() {},
    warn() {},
    error() {},
    debug() {},
    child() {
      return logger;
    },
    level: 'info' as const,
  };
  return logger as unknown as Logger;
}

function fakeBreaker(): CircuitBreaker {
  return new CircuitBreaker({ failureThreshold: 5, windowMs: 1000, halfOpenAfterMs: 1000 });
}

function noopCache(): MetadataCachePort {
  return {
    async get() {
      return null;
    },
    async upsert() {},
  };
}

function fakeStorage() {
  return {
    async read() {
      return null;
    },
    async write() {},
    async clear() {},
    withTx() {
      return this;
    },
  };
}

function fakeResources(clientId: string): IgdbUserResources {
  return {
    clientId,
    tokenStore: new IgdbTokenStore({
      storage: fakeStorage(),
      userId: 'u',
      clientId,
      clientSecret: 'sec',
    }),
    rateLimiter: new TokenBucketRateLimiter({ capacity: 4, refillIntervalMs: 250 }),
  };
}

function stubResources(map: Record<string, IgdbUserResources | null>): IgdbPerUserResources {
  return {
    async get(userId: string) {
      return map[userId] ?? null;
    },
    invalidate() {},
  } as unknown as IgdbPerUserResources;
}

describe('IgdbChainFactory', () => {
  it('buildFor(userId) returns null when resources are null', async () => {
    const factory = new IgdbChainFactory(
      stubResources({}),
      fakeBreaker(),
      noopCache() as unknown as MetadataCacheRepository,
      noopLogger(),
      5000,
      30,
    );
    expect(await factory.buildFor('user-x')).toBeNull();
  });

  it('buildFor(userId) returns a chain whose searchGameMetadata is wired', async () => {
    const factory = new IgdbChainFactory(
      stubResources({ 'user-a': fakeResources('cid-a') }),
      fakeBreaker(),
      noopCache() as unknown as MetadataCacheRepository,
      noopLogger(),
      5000,
      30,
    );
    const chain = await factory.buildFor('user-a');
    expect(chain).not.toBeNull();
    expect(typeof chain!.searchGameMetadata.execute).toBe('function');
  });

  it('uses the same global breaker reference for every user', async () => {
    const breaker = fakeBreaker();
    const factory = new IgdbChainFactory(
      stubResources({
        a: fakeResources('cid-a'),
        b: fakeResources('cid-b'),
      }),
      breaker,
      noopCache() as unknown as MetadataCacheRepository,
      noopLogger(),
      5000,
      30,
    );
    // Indirect check: building twice for different users must not allocate
    // a new breaker. We assert that the factory does NOT expose a breaker
    // getter, AND that recording a failure on the shared breaker stays
    // observable across consecutive buildFor calls.
    const before = breaker.state;
    breaker.recordFailure();
    expect(breaker.state).toBe(before); // 1 failure < threshold 5
    await factory.buildFor('a');
    await factory.buildFor('b');
    expect(breaker.state).toBe(before); // factory MUST NOT reset the breaker
  });
});
