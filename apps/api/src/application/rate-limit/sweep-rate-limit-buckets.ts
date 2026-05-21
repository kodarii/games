import { lt } from 'drizzle-orm';
import type { TaskResult } from '../../infrastructure/lifecycle/scheduler';
import type { db as defaultDb } from '../../infrastructure/db/client';
import { rateLimitBuckets } from '../../infrastructure/db/schema';

const WINDOW_MS = 60_000;
const LOCK_NAME = 'sweep-rate-limit-buckets';
const LOCK_TTL_MS = 5 * 60 * 1000;

export interface SweepLock {
  tryAcquire(name: string, ttlMs: number): Promise<boolean>;
  release(name: string): Promise<void>;
}

export interface SweepRateLimitBucketsDeps {
  readonly db: typeof defaultDb;
  readonly lock: SweepLock;
  readonly now: () => number;
}

/**
 * Periodic cleanup of expired rate-limit buckets.
 *
 * Keeps the current window plus the previous one (so a request that started
 * just before the boundary cannot find its row missing). Deletes everything
 * older. Cron-locked via the shared `CronLock`.
 */
export class SweepRateLimitBuckets {
  constructor(private readonly deps: SweepRateLimitBucketsDeps) {}

  async run(): Promise<TaskResult> {
    const acquired = await this.deps.lock.tryAcquire(LOCK_NAME, LOCK_TTL_MS);
    if (!acquired) return { status: 'skipped', reason: 'lock_held' };
    try {
      const cutoff = this.deps.now() - WINDOW_MS;
      const result = await this.deps.db
        .delete(rateLimitBuckets)
        .where(lt(rateLimitBuckets.windowStart, cutoff))
        .returning({ windowStart: rateLimitBuckets.windowStart });
      return { status: 'completed', details: { deleted: result.length } };
    } finally {
      await this.deps.lock.release(LOCK_NAME);
    }
  }
}
