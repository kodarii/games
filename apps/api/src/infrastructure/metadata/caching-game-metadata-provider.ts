import { createHash } from 'node:crypto';
import type {
  GameMetadataCandidate,
  GameMetadataProvider,
  GameMetadataProviderError,
  GameMetadataSearchHit,
  GameMetadataSearchQuery,
} from '../../domain/games/game-metadata-provider';
import { err, ok } from '../../domain/shared/result';
import type { Result } from '../../domain/shared/result';
import { normalizeTitle } from './normalize-title';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Narrow shape of the cache repository so tests can inject a fake without
 * pulling Drizzle.
 */
export interface MetadataCachePort {
  get(
    provider: string,
    cacheKey: string,
  ): Promise<{ candidates: readonly GameMetadataCandidate[]; fetchedAt: Date } | null>;
  upsert(
    provider: string,
    cacheKey: string,
    candidates: readonly GameMetadataCandidate[],
    fetchedAt: Date,
  ): Promise<void>;
}

export interface CachingGameMetadataProviderOptions {
  readonly inner: GameMetadataProvider;
  readonly cacheRepo: MetadataCachePort;
  readonly providerName: string;
  readonly positiveTtlDays: number;
  readonly negativeTtlDays: number;
  readonly now?: () => Date;
}

/**
 * Vendor-neutral caching decorator around any `GameMetadataProvider`.
 *
 * Cache key: `sha256(providerName + ':' + normalizedTitle + ':' + rawPlatformName)`.
 * Platform-id mapping stays in the underlying adapter — the cache key uses
 * the raw human-readable platform name so the cache is decoupled from any
 * vendor-specific id table.
 *
 * TTL:
 *  - positive results (non-empty candidates): `positiveTtlDays`
 *  - negative results (empty candidates): `negativeTtlDays` (typically 1)
 *
 * On cache miss + inner success → write through and return ok.
 * On cache hit fresh → skip inner.
 * On cache hit stale → call inner; if inner succeeds refresh + return new.
 * On cache miss + inner error → propagate error (use case handles stale fallback).
 * On cache hit stale + inner error → propagate error (use case handles stale fallback by re-reading cache).
 *
 * The decorator exposes `providerName` so a higher-level handler (use case)
 * can read the same cache row for stale-while-error fallback without
 * recomputing the key.
 */
export class CachingGameMetadataProvider implements GameMetadataProvider {
  readonly providerName: string;
  private readonly inner: GameMetadataProvider;
  private readonly cacheRepo: MetadataCachePort;
  private readonly positiveTtlMs: number;
  private readonly negativeTtlMs: number;
  private readonly now: () => Date;

  constructor(opts: CachingGameMetadataProviderOptions) {
    this.inner = opts.inner;
    this.cacheRepo = opts.cacheRepo;
    this.providerName = opts.providerName;
    this.positiveTtlMs = opts.positiveTtlDays * DAY_MS;
    this.negativeTtlMs = opts.negativeTtlDays * DAY_MS;
    this.now = opts.now ?? (() => new Date());
  }

  buildCacheKey(title: string, platform: string): string {
    const normalized = normalizeTitle(title);
    const payload = `${this.providerName}:${normalized}:${platform}`;
    return createHash('sha256').update(payload).digest('hex');
  }

  /** Exposed for tests so they can seed the cache under the same key. */
  buildCacheKeyForTest(title: string, platform: string): string {
    return this.buildCacheKey(title, platform);
  }

  async search(
    query: GameMetadataSearchQuery,
  ): Promise<Result<GameMetadataSearchHit, GameMetadataProviderError>> {
    const cacheKey = this.buildCacheKey(query.title, query.platform);
    const cached = await this.cacheRepo.get(this.providerName, cacheKey);
    const nowDate = this.now();

    if (cached !== null && this.isFresh(cached.candidates, cached.fetchedAt, nowDate)) {
      return ok({ candidates: cached.candidates, fetchedAt: cached.fetchedAt });
    }

    const innerResult = await this.inner.search(query);
    if (!innerResult.ok) {
      return innerResult;
    }

    const fetchedAt = innerResult.value.fetchedAt;
    try {
      await this.cacheRepo.upsert(
        this.providerName,
        cacheKey,
        innerResult.value.candidates,
        fetchedAt,
      );
    } catch (cacheError) {
      // Non-fatal: serve live candidates even if cache write fails.
      const message = cacheError instanceof Error ? cacheError.message : 'unknown';
      console.log(
        JSON.stringify({
          event: 'igdb.cache.write_failed',
          cacheKey,
          err: message,
        }),
      );
    }
    return innerResult;
  }

  private isFresh(
    candidates: readonly GameMetadataCandidate[],
    fetchedAt: Date,
    now: Date,
  ): boolean {
    const age = now.getTime() - fetchedAt.getTime();
    const ttl = candidates.length === 0 ? this.negativeTtlMs : this.positiveTtlMs;
    return age < ttl;
  }
}
