import { and, eq } from 'drizzle-orm';
import type { GameMetadataCandidate } from '../../domain/games/game-metadata-provider';
import { db as defaultDb } from '../db/client';
import { metadataCache } from '../db/schema';

type DB = typeof defaultDb;

export interface CachedMetadataLookup {
  readonly candidates: readonly GameMetadataCandidate[];
  readonly fetchedAt: Date;
}

/**
 * Vendor-neutral cache for game metadata search results.
 *
 * The cache key is computed by the caching decorator — this repository only
 * persists `(provider, cacheKey) → (candidatesJson, fetchedAt)` rows.
 *
 * Stored shape is plain JSON of the vendor-neutral `GameMetadataCandidate`
 * DTO. We deserialize back into the same readonly shape on read; the schema
 * is locked in PHASE 2 so the JSON shape is stable.
 */
export class MetadataCacheRepository {
  constructor(private readonly db: DB = defaultDb) {}

  async get(provider: string, cacheKey: string): Promise<CachedMetadataLookup | null> {
    const [row] = await this.db
      .select()
      .from(metadataCache)
      .where(and(eq(metadataCache.provider, provider), eq(metadataCache.cacheKey, cacheKey)))
      .limit(1);
    if (!row) return null;
    const parsed = JSON.parse(row.candidatesJson) as GameMetadataCandidate[];
    return { candidates: parsed, fetchedAt: row.fetchedAt };
  }

  async upsert(
    provider: string,
    cacheKey: string,
    candidates: readonly GameMetadataCandidate[],
    fetchedAt: Date = new Date(),
  ): Promise<void> {
    const candidatesJson = JSON.stringify(candidates);
    await this.db
      .insert(metadataCache)
      .values({
        provider,
        cacheKey,
        candidatesJson,
        fetchedAt,
      })
      .onConflictDoUpdate({
        target: [metadataCache.provider, metadataCache.cacheKey],
        set: { candidatesJson, fetchedAt },
      });
  }
}
