import { describe, expect, it } from 'bun:test';
import type { ProviderName } from '../../../domain/games/external-metadata-ref';
import type {
  GameMetadataCandidate,
  GameMetadataProvider,
  GameMetadataProviderError,
  GameMetadataSearchHit,
  GameMetadataSearchQuery,
} from '../../../domain/games/game-metadata-provider';
import { err, ok } from '../../../domain/shared/result';
import type { Result } from '../../../domain/shared/result';
import { CachingGameMetadataProvider } from '../caching-game-metadata-provider';
import type { CachedMetadataLookup } from '../metadata-cache-repository';

const PROVIDER = 'igdb';
const POSITIVE_TTL_DAYS = 30;
const NEGATIVE_TTL_DAYS = 1;
const DAY_MS = 24 * 60 * 60 * 1000;

function makeCandidate(over: Partial<GameMetadataCandidate> = {}): GameMetadataCandidate {
  return {
    providerName: 'igdb' as ProviderName,
    providerId: 'p-1',
    title: 'Resident Evil 4',
    developer: 'Capcom',
    releaseYear: 2005,
    coverImageUrl: 'https://images.igdb.com/igdb/image/upload/t_cover_big/abc.jpg',
    platformNames: ['PS2'],
    ...over,
  };
}

class FakeCacheRepo {
  private readonly rows: Map<string, CachedMetadataLookup> = new Map();
  reads = 0;
  writes = 0;

  async get(provider: string, cacheKey: string): Promise<CachedMetadataLookup | null> {
    this.reads += 1;
    const row = this.rows.get(`${provider}:${cacheKey}`);
    return row ?? null;
  }

  async upsert(
    provider: string,
    cacheKey: string,
    candidates: readonly GameMetadataCandidate[],
    fetchedAt: Date,
  ): Promise<void> {
    this.writes += 1;
    this.rows.set(`${provider}:${cacheKey}`, { candidates: [...candidates], fetchedAt });
  }

  seed(cacheKey: string, candidates: GameMetadataCandidate[], fetchedAt: Date): void {
    this.rows.set(`${PROVIDER}:${cacheKey}`, { candidates, fetchedAt });
  }

  size(): number {
    return this.rows.size;
  }
}

class FakeProvider implements GameMetadataProvider {
  calls = 0;
  constructor(
    private readonly fixed:
      | { kind: 'ok'; candidates: readonly GameMetadataCandidate[] }
      | { kind: 'err'; error: GameMetadataProviderError },
  ) {}

  async search(
    _query: GameMetadataSearchQuery,
  ): Promise<Result<GameMetadataSearchHit, GameMetadataProviderError>> {
    this.calls += 1;
    if (this.fixed.kind === 'err') return err(this.fixed.error);
    return ok({ candidates: this.fixed.candidates, fetchedAt: new Date() });
  }
}

function makeDecorator(opts: {
  inner: GameMetadataProvider;
  cache: FakeCacheRepo;
  now?: () => Date;
}): CachingGameMetadataProvider {
  return new CachingGameMetadataProvider({
    inner: opts.inner,
    cacheRepo: opts.cache,
    providerName: PROVIDER,
    positiveTtlDays: POSITIVE_TTL_DAYS,
    negativeTtlDays: NEGATIVE_TTL_DAYS,
    now: opts.now ?? (() => new Date('2026-05-11T12:00:00.000Z')),
  });
}

describe('CachingGameMetadataProvider', () => {
  it('cache miss + provider success writes through and returns ok', async () => {
    const candidates = [makeCandidate()];
    const inner = new FakeProvider({ kind: 'ok', candidates });
    const cache = new FakeCacheRepo();
    const decorator = makeDecorator({ inner, cache });

    const result = await decorator.search({ title: 'Resident Evil 4', platform: 'PS2' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.candidates).toEqual(candidates);
    expect(cache.writes).toBe(1);
    expect(inner.calls).toBe(1);
  });

  it('cache hit fresh (within positive TTL) skips inner', async () => {
    const candidates = [makeCandidate()];
    const inner = new FakeProvider({ kind: 'ok', candidates: [] });
    const cache = new FakeCacheRepo();
    const now = new Date('2026-05-11T12:00:00.000Z');
    // Seed at the EXACT same normalized key the decorator will compute.
    const decorator = makeDecorator({ inner, cache, now: () => now });
    const key = decorator.buildCacheKeyForTest('Resident Evil 4', 'PS2');
    cache.seed(key, candidates, new Date(now.getTime() - 1 * DAY_MS));

    const result = await decorator.search({ title: 'Resident Evil 4', platform: 'PS2' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.candidates).toEqual(candidates);
    expect(inner.calls).toBe(0);
    expect(cache.writes).toBe(0);
  });

  it('cache hit fresh negative (empty, within 24h) skips inner', async () => {
    const inner = new FakeProvider({ kind: 'ok', candidates: [makeCandidate()] });
    const cache = new FakeCacheRepo();
    const now = new Date('2026-05-11T12:00:00.000Z');
    const decorator = makeDecorator({ inner, cache, now: () => now });
    const key = decorator.buildCacheKeyForTest('Obscure', 'PS2');
    cache.seed(key, [], new Date(now.getTime() - 6 * 60 * 60 * 1000)); // 6h old

    const result = await decorator.search({ title: 'Obscure', platform: 'PS2' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.candidates).toEqual([]);
    expect(inner.calls).toBe(0);
  });

  it('cache hit stale negative (>24h) calls inner and refreshes', async () => {
    const candidates = [makeCandidate()];
    const inner = new FakeProvider({ kind: 'ok', candidates });
    const cache = new FakeCacheRepo();
    const now = new Date('2026-05-11T12:00:00.000Z');
    const decorator = makeDecorator({ inner, cache, now: () => now });
    const key = decorator.buildCacheKeyForTest('Late Bloomer', 'PS2');
    cache.seed(key, [], new Date(now.getTime() - 2 * DAY_MS));

    const result = await decorator.search({ title: 'Late Bloomer', platform: 'PS2' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.candidates).toEqual(candidates);
    expect(inner.calls).toBe(1);
    expect(cache.writes).toBe(1);
  });

  it('cache hit stale positive (>positive TTL) calls inner and refreshes', async () => {
    const fresh = [makeCandidate({ providerId: 'fresh' })];
    const stale = [makeCandidate({ providerId: 'stale' })];
    const inner = new FakeProvider({ kind: 'ok', candidates: fresh });
    const cache = new FakeCacheRepo();
    const now = new Date('2026-05-11T12:00:00.000Z');
    const decorator = makeDecorator({ inner, cache, now: () => now });
    const key = decorator.buildCacheKeyForTest('Aged Title', 'PS2');
    cache.seed(key, stale, new Date(now.getTime() - 60 * DAY_MS));

    const result = await decorator.search({ title: 'Aged Title', platform: 'PS2' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.candidates).toEqual(fresh);
    expect(inner.calls).toBe(1);
  });

  it('cache miss + provider err(unavailable) propagates the error', async () => {
    const inner = new FakeProvider({ kind: 'err', error: { kind: 'unavailable' } });
    const cache = new FakeCacheRepo();
    const decorator = makeDecorator({ inner, cache });

    const result = await decorator.search({ title: 'Anything', platform: 'PS2' });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe('unavailable');
    expect(cache.writes).toBe(0);
  });

  it('platform_unsupported propagates without caching', async () => {
    const inner = new FakeProvider({ kind: 'err', error: { kind: 'platform_unsupported' } });
    const cache = new FakeCacheRepo();
    const decorator = makeDecorator({ inner, cache });

    const result = await decorator.search({ title: 'Anything', platform: 'RetroConsole' });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe('platform_unsupported');
    expect(cache.writes).toBe(0);
  });

  it('different platforms produce different cache keys', async () => {
    const inner = new FakeProvider({ kind: 'ok', candidates: [makeCandidate()] });
    const cache = new FakeCacheRepo();
    const decorator = makeDecorator({ inner, cache });

    await decorator.search({ title: 'Same Title', platform: 'PS2' });
    await decorator.search({ title: 'Same Title', platform: 'PS5' });
    expect(cache.size()).toBe(2);
    expect(inner.calls).toBe(2);
  });

  it('cache write failure is non-fatal and live candidates still returned', async () => {
    const candidates = [makeCandidate()];
    const inner = new FakeProvider({ kind: 'ok', candidates });
    const failingCache = {
      async get() {
        return null;
      },
      async upsert() {
        throw new Error('disk full');
      },
    };
    const decorator = new CachingGameMetadataProvider({
      inner,
      cacheRepo: failingCache,
      providerName: PROVIDER,
      positiveTtlDays: POSITIVE_TTL_DAYS,
      negativeTtlDays: NEGATIVE_TTL_DAYS,
    });

    const result = await decorator.search({ title: 'X', platform: 'PS2' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.candidates).toEqual(candidates);
  });
});
