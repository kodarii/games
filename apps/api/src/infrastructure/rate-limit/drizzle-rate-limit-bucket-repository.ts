import { lt, sql } from 'drizzle-orm';
import type { RateLimitBucketRepository } from '../../domain/rate-limit/rate-limit-bucket-repository';
import type { db as defaultDb } from '../db/client';
import { rateLimitBuckets } from '../db/schema';

export class DrizzleRateLimitBucketRepository implements RateLimitBucketRepository {
  constructor(private readonly db: typeof defaultDb) {}

  async increment(userId: string, windowStart: number): Promise<number> {
    const result = await this.db
      .insert(rateLimitBuckets)
      .values({ userId, windowStart, count: 1 })
      .onConflictDoUpdate({
        target: [rateLimitBuckets.userId, rateLimitBuckets.windowStart],
        set: { count: sql`${rateLimitBuckets.count} + 1` },
      })
      .returning({ count: rateLimitBuckets.count });
    return result[0]?.count ?? 0;
  }

  async deleteOlderThan(cutoffMs: number): Promise<number> {
    const result = await this.db
      .delete(rateLimitBuckets)
      .where(lt(rateLimitBuckets.windowStart, cutoffMs))
      .returning({ windowStart: rateLimitBuckets.windowStart });
    return result.length;
  }
}
