import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { eq, inArray } from 'drizzle-orm';
import { db } from '../../db/client';
import { rateLimitBuckets } from '../../db/schema';
import { DrizzleRateLimitBucketRepository } from '../drizzle-rate-limit-bucket-repository';

const USER_A = `test-rl-repo-a-${crypto.randomUUID()}`;
const USER_B = `test-rl-repo-b-${crypto.randomUUID()}`;

async function clear() {
  await db.delete(rateLimitBuckets).where(inArray(rateLimitBuckets.userId, [USER_A, USER_B]));
}

beforeEach(clear);
afterEach(clear);

describe('DrizzleRateLimitBucketRepository', () => {
  const repo = new DrizzleRateLimitBucketRepository(db);

  it('increment returns 1 on first call for (userId, windowStart)', async () => {
    const count = await repo.increment(USER_A, 1_000_000);
    expect(count).toBe(1);
  });

  it('increment returns post-increment count on subsequent calls in same window', async () => {
    await repo.increment(USER_A, 1_000_000);
    await repo.increment(USER_A, 1_000_000);
    const count = await repo.increment(USER_A, 1_000_000);
    expect(count).toBe(3);
  });

  it('increment for different users in same window does not interfere', async () => {
    await repo.increment(USER_A, 1_000_000);
    const countB = await repo.increment(USER_B, 1_000_000);
    expect(countB).toBe(1);
  });

  it('deleteOlderThan removes only rows with windowStart < cutoff and returns count', async () => {
    await repo.increment(USER_A, 1_000);
    await repo.increment(USER_A, 2_000);
    await repo.increment(USER_A, 3_000);
    const deleted = await repo.deleteOlderThan(2_500);
    expect(deleted).toBe(2);
    const remaining = await db
      .select()
      .from(rateLimitBuckets)
      .where(eq(rateLimitBuckets.userId, USER_A));
    expect(remaining.map((r) => r.windowStart)).toEqual([3_000]);
  });
});
