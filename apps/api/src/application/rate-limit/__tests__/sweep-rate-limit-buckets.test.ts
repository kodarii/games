import { afterAll, beforeEach, describe, expect, it } from 'bun:test';
import { eq } from 'drizzle-orm';
import { db } from '../../../infrastructure/db/client';
import { rateLimitBuckets } from '../../../infrastructure/db/schema';
import { SweepRateLimitBuckets } from '../sweep-rate-limit-buckets';

const USER = `test-sweep-${crypto.randomUUID()}`;
const WINDOW_MS = 60_000;

async function clear() {
  await db.delete(rateLimitBuckets).where(eq(rateLimitBuckets.userId, USER));
}

beforeEach(clear);
afterAll(clear);

describe('SweepRateLimitBuckets', () => {
  it('deletes buckets older than the previous window and keeps current + previous', async () => {
    const now = 5 * WINDOW_MS; // window aligned
    await db.insert(rateLimitBuckets).values([
      { userId: USER, windowStart: now, count: 1 },
      { userId: USER, windowStart: now - WINDOW_MS, count: 1 },
      { userId: USER, windowStart: now - 2 * WINDOW_MS, count: 1 },
      { userId: USER, windowStart: now - 10 * WINDOW_MS, count: 1 },
    ]);

    const lock = { tryAcquire: async () => true, release: async () => {} };
    const sweep = new SweepRateLimitBuckets({ db, lock, now: () => now });
    const result = await sweep.run();
    expect(result).toEqual({ status: 'completed', details: { deleted: 2 } });

    const remaining = await db
      .select()
      .from(rateLimitBuckets)
      .where(eq(rateLimitBuckets.userId, USER));
    expect(remaining.map((r) => r.windowStart).sort()).toEqual([now - WINDOW_MS, now]);
  });

  it('reports skipped when the lock cannot be acquired', async () => {
    const lock = { tryAcquire: async () => false, release: async () => {} };
    const sweep = new SweepRateLimitBuckets({ db, lock, now: () => Date.now() });
    const result = await sweep.run();
    expect(result).toEqual({ status: 'skipped', reason: 'lock_held' });
  });
});
