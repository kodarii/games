import type { RateLimitBucketRepository } from '../../domain/rate-limit/rate-limit-bucket-repository';
import type { TaskResult } from '../../infrastructure/lifecycle/scheduler';

const WINDOW_MS = 60_000;
const LOCK_NAME = 'sweep-rate-limit-buckets';
const LOCK_TTL_MS = 5 * 60 * 1000;

export interface SweepLock {
  tryAcquire(name: string, ttlMs: number): Promise<boolean>;
  release(name: string): Promise<void>;
}

export interface SweepRateLimitBucketsDeps {
  readonly repo: RateLimitBucketRepository;
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
      const deleted = await this.deps.repo.deleteOlderThan(cutoff);
      return { status: 'completed', details: { deleted } };
    } finally {
      await this.deps.lock.release(LOCK_NAME);
    }
  }
}
