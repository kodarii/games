import { and, eq, lt } from 'drizzle-orm';
import type {
  IdempotencyKeyRepository,
  IdempotencyRecord,
} from '../../application/idempotency/idempotency-key-repository';
import { db as defaultDb } from '../db/client';
import { idempotencyKeys } from '../db/schema';

type DB = typeof defaultDb;

/**
 * Drizzle adapter for the idempotency cache.
 *
 * `save` uses INSERT … ON CONFLICT DO NOTHING so a parallel duplicate request
 * that loses the race does not clobber the winner's response. The middleware
 * re-reads the row from cache on the next request and serves whatever the
 * first writer stored.
 */
export class DrizzleIdempotencyKeyRepository implements IdempotencyKeyRepository {
  constructor(private readonly db: DB = defaultDb) {}

  async find(key: string, userId: string): Promise<IdempotencyRecord | null> {
    const [row] = await this.db
      .select()
      .from(idempotencyKeys)
      .where(and(eq(idempotencyKeys.key, key), eq(idempotencyKeys.userId, userId)))
      .limit(1);
    if (!row) return null;
    return {
      key: row.key,
      userId: row.userId,
      requestHash: row.requestHash,
      status: row.status,
      responseBody: row.responseBody,
      createdAt: row.createdAt,
    };
  }

  async save(record: IdempotencyRecord): Promise<void> {
    await this.db
      .insert(idempotencyKeys)
      .values({
        key: record.key,
        userId: record.userId,
        requestHash: record.requestHash,
        status: record.status,
        responseBody: record.responseBody,
        createdAt: record.createdAt,
      })
      .onConflictDoNothing();
  }

  async deleteOlderThan(olderThanMs: number): Promise<number> {
    const result = await this.db
      .delete(idempotencyKeys)
      .where(lt(idempotencyKeys.createdAt, olderThanMs))
      .returning({ key: idempotencyKeys.key });
    return result.length;
  }
}
