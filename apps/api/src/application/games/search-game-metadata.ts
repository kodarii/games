import { z } from 'zod';
import type {
  GameMetadataCandidate,
  GameMetadataProviderError,
} from '../../domain/games/game-metadata-provider';
import { err, ok } from '../../domain/shared/result';
import type { Result } from '../../domain/shared/result';

const inputSchema = z.object({
  title: z.string().trim().min(1),
  platform: z.string().trim().min(1),
});

export type SearchGameMetadataInput = z.infer<typeof inputSchema>;

export type SearchGameMetadataDegradedReason =
  | 'provider_down'
  | 'platform_unsupported'
  | 'rate_limited';

export interface SearchGameMetadataResponse {
  readonly candidates: readonly GameMetadataCandidate[];
  readonly degraded: boolean;
  readonly reason?: SearchGameMetadataDegradedReason;
  readonly staleAt?: string;
}

export type SearchGameMetadataError = { kind: 'invalid_input'; issues: z.ZodIssue[] };

/**
 * Vendor-neutral port the caching provider exposes. We need both a
 * `search` call and an ability to compute the same cache key the decorator
 * uses, so the use case can read the cache directly when implementing the
 * stale-while-error fallback.
 */
export interface SearchableMetadataProvider {
  readonly providerName: string;
  search(query: {
    title: string;
    platform: string;
  }): Promise<
    Result<
      { candidates: readonly GameMetadataCandidate[]; fetchedAt: Date },
      GameMetadataProviderError
    >
  >;
  buildCacheKey(title: string, platform: string): string;
}

/** Narrow read-side of the cache the use case needs for stale fallback. */
export interface MetadataCacheReader {
  get(
    provider: string,
    cacheKey: string,
  ): Promise<{ candidates: readonly GameMetadataCandidate[]; fetchedAt: Date } | null>;
}

function mapErrorToReason(error: GameMetadataProviderError): SearchGameMetadataDegradedReason {
  switch (error.kind) {
    case 'platform_unsupported':
      return 'platform_unsupported';
    case 'rate_limited':
      return 'rate_limited';
    case 'unavailable':
    case 'invalid_response':
      return 'provider_down';
  }
}

export class SearchGameMetadata {
  constructor(
    private readonly provider: SearchableMetadataProvider,
    private readonly cache: MetadataCacheReader,
  ) {}

  async execute(
    input: unknown,
  ): Promise<Result<SearchGameMetadataResponse, SearchGameMetadataError>> {
    const parsed = inputSchema.safeParse(input);
    if (!parsed.success) {
      return err({ kind: 'invalid_input', issues: parsed.error.issues });
    }
    const { title, platform } = parsed.data;

    const searchResult = await this.provider.search({ title, platform });

    if (searchResult.ok) {
      return ok({
        candidates: searchResult.value.candidates,
        degraded: false,
      });
    }

    // Provider failure path. For unavailable / rate_limited / invalid_response
    // try to serve the last cached row even if past TTL (stale-while-error).
    // platform_unsupported is NOT a transient failure — no cache fallback.
    if (searchResult.error.kind !== 'platform_unsupported') {
      const cacheKey = this.provider.buildCacheKey(title, platform);
      const cached = await this.cache.get(this.provider.providerName, cacheKey);
      if (cached !== null) {
        console.log(
          JSON.stringify({
            event: 'igdb.search.stale_served',
            cacheKey,
            staleAt: cached.fetchedAt.toISOString(),
          }),
        );
        return ok({
          candidates: cached.candidates,
          degraded: false,
          staleAt: cached.fetchedAt.toISOString(),
        });
      }
    }

    return ok({
      candidates: [],
      degraded: true,
      reason: mapErrorToReason(searchResult.error),
    });
  }
}
