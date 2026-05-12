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
import type { CachedMetadataLookup } from '../../../infrastructure/metadata/metadata-cache-repository';
import { SearchGameMetadata } from '../search-game-metadata';

function makeCandidate(over: Partial<GameMetadataCandidate> = {}): GameMetadataCandidate {
  return {
    providerName: 'igdb' as ProviderName,
    providerId: '1',
    title: 'Game',
    developer: null,
    releaseYear: null,
    coverImageUrl: null,
    platformNames: [],
    ...over,
  };
}

class FakeCacheRepo {
  private readonly rows: Map<string, CachedMetadataLookup> = new Map();

  async get(_provider: string, cacheKey: string): Promise<CachedMetadataLookup | null> {
    return this.rows.get(cacheKey) ?? null;
  }

  seed(cacheKey: string, lookup: CachedMetadataLookup): void {
    this.rows.set(cacheKey, lookup);
  }
}

class FakeCachingProvider implements GameMetadataProvider {
  constructor(
    private readonly result:
      | { kind: 'ok'; candidates: readonly GameMetadataCandidate[] }
      | { kind: 'err'; error: GameMetadataProviderError },
    readonly providerName = 'igdb',
  ) {}

  buildCacheKey(_title: string, platform: string): string {
    return `fake-key:${platform}`;
  }

  async search(
    _query: GameMetadataSearchQuery,
  ): Promise<Result<GameMetadataSearchHit, GameMetadataProviderError>> {
    if (this.result.kind === 'err') return err(this.result.error);
    return ok({ candidates: this.result.candidates, fetchedAt: new Date() });
  }
}

describe('SearchGameMetadata', () => {
  it('happy path returns candidates with degraded=false', async () => {
    const candidates = [makeCandidate({ providerId: 'a' }), makeCandidate({ providerId: 'b' })];
    const provider = new FakeCachingProvider({ kind: 'ok', candidates });
    const cache = new FakeCacheRepo();
    const usecase = new SearchGameMetadata(provider, cache);

    const result = await usecase.execute({ title: 'X', platform: 'PS2' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.degraded).toBe(false);
    expect(result.value.candidates).toEqual(candidates);
    expect(result.value.reason).toBeUndefined();
    expect(result.value.staleAt).toBeUndefined();
  });

  it('empty result is not degraded (no reason)', async () => {
    const provider = new FakeCachingProvider({ kind: 'ok', candidates: [] });
    const cache = new FakeCacheRepo();
    const usecase = new SearchGameMetadata(provider, cache);

    const result = await usecase.execute({ title: 'Obscure', platform: 'PS2' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.degraded).toBe(false);
    expect(result.value.candidates).toEqual([]);
    expect(result.value.reason).toBeUndefined();
  });

  it('unavailable + cache miss → degraded with reason provider_down', async () => {
    const provider = new FakeCachingProvider({ kind: 'err', error: { kind: 'unavailable' } });
    const cache = new FakeCacheRepo();
    const usecase = new SearchGameMetadata(provider, cache);

    const result = await usecase.execute({ title: 'X', platform: 'PS2' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.degraded).toBe(true);
    expect(result.value.reason).toBe('provider_down');
    expect(result.value.candidates).toEqual([]);
    expect(result.value.staleAt).toBeUndefined();
  });

  it('unavailable + stale cache hit → stale candidates with staleAt, degraded=false', async () => {
    const stale = [makeCandidate({ providerId: 'stale-1' })];
    const provider = new FakeCachingProvider({ kind: 'err', error: { kind: 'unavailable' } });
    const cache = new FakeCacheRepo();
    const fetchedAt = new Date('2025-01-01T00:00:00.000Z');
    cache.seed('fake-key:PS2', { candidates: stale, fetchedAt });
    const usecase = new SearchGameMetadata(provider, cache);

    const result = await usecase.execute({ title: 'X', platform: 'PS2' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.degraded).toBe(false);
    expect(result.value.candidates).toEqual(stale);
    expect(result.value.staleAt).toBe(fetchedAt.toISOString());
    expect(result.value.reason).toBeUndefined();
  });

  it('rate_limited + cache miss → degraded with reason rate_limited', async () => {
    const provider = new FakeCachingProvider({ kind: 'err', error: { kind: 'rate_limited' } });
    const cache = new FakeCacheRepo();
    const usecase = new SearchGameMetadata(provider, cache);

    const result = await usecase.execute({ title: 'X', platform: 'PS2' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.degraded).toBe(true);
    expect(result.value.reason).toBe('rate_limited');
  });

  it('rate_limited + cache hit → stale with staleAt', async () => {
    const provider = new FakeCachingProvider({ kind: 'err', error: { kind: 'rate_limited' } });
    const cache = new FakeCacheRepo();
    const fetchedAt = new Date('2025-02-02T00:00:00.000Z');
    cache.seed('fake-key:PS2', { candidates: [makeCandidate()], fetchedAt });
    const usecase = new SearchGameMetadata(provider, cache);

    const result = await usecase.execute({ title: 'X', platform: 'PS2' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.degraded).toBe(false);
    expect(result.value.staleAt).toBe(fetchedAt.toISOString());
  });

  it('platform_unsupported → degraded with reason platform_unsupported', async () => {
    const provider = new FakeCachingProvider({
      kind: 'err',
      error: { kind: 'platform_unsupported' },
    });
    const cache = new FakeCacheRepo();
    const usecase = new SearchGameMetadata(provider, cache);

    const result = await usecase.execute({ title: 'X', platform: 'Unknown' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.degraded).toBe(true);
    expect(result.value.reason).toBe('platform_unsupported');
  });

  it('invalid_response + cache miss → degraded provider_down', async () => {
    const provider = new FakeCachingProvider({ kind: 'err', error: { kind: 'invalid_response' } });
    const cache = new FakeCacheRepo();
    const usecase = new SearchGameMetadata(provider, cache);

    const result = await usecase.execute({ title: 'X', platform: 'PS2' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.degraded).toBe(true);
    expect(result.value.reason).toBe('provider_down');
  });

  it('empty title fails Zod with invalid_input', async () => {
    const provider = new FakeCachingProvider({ kind: 'ok', candidates: [] });
    const cache = new FakeCacheRepo();
    const usecase = new SearchGameMetadata(provider, cache);

    const result = await usecase.execute({ title: '', platform: 'PS2' });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe('invalid_input');
  });

  it('empty platform fails Zod with invalid_input', async () => {
    const provider = new FakeCachingProvider({ kind: 'ok', candidates: [] });
    const cache = new FakeCacheRepo();
    const usecase = new SearchGameMetadata(provider, cache);

    const result = await usecase.execute({ title: 'X', platform: '' });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe('invalid_input');
  });
});
