import { describe, expect, it } from 'bun:test';
import type { RateLimitBucketRepository } from '../../../domain/rate-limit/rate-limit-bucket-repository';
import { SweepRateLimitBuckets } from '../sweep-rate-limit-buckets';

const WINDOW_MS = 60_000;

class FakeRepo implements RateLimitBucketRepository {
  public deleteCalls: number[] = [];
  constructor(private readonly toDelete: number) {}
  async increment(): Promise<number> {
    return 0;
  }
  async deleteOlderThan(cutoffMs: number): Promise<number> {
    this.deleteCalls.push(cutoffMs);
    return this.toDelete;
  }
}

describe('SweepRateLimitBuckets', () => {
  it('deletes buckets older than (now - WINDOW_MS) and returns the count', async () => {
    const now = 5 * WINDOW_MS;
    const repo = new FakeRepo(2);
    const lock = { tryAcquire: async () => true, release: async () => {} };
    const sweep = new SweepRateLimitBuckets({ repo, lock, now: () => now });
    const result = await sweep.run();
    expect(result).toEqual({ status: 'completed', details: { deleted: 2 } });
    expect(repo.deleteCalls).toEqual([now - WINDOW_MS]);
  });

  it('reports skipped when the lock cannot be acquired', async () => {
    const repo = new FakeRepo(0);
    const lock = { tryAcquire: async () => false, release: async () => {} };
    const sweep = new SweepRateLimitBuckets({ repo, lock, now: () => Date.now() });
    const result = await sweep.run();
    expect(result).toEqual({ status: 'skipped', reason: 'lock_held' });
    expect(repo.deleteCalls).toEqual([]);
  });

  it('releases the lock even when deleteOlderThan throws', async () => {
    const repo: RateLimitBucketRepository = {
      async increment() {
        return 0;
      },
      async deleteOlderThan() {
        throw new Error('boom');
      },
    };
    let released = false;
    const lock = {
      tryAcquire: async () => true,
      release: async () => {
        released = true;
      },
    };
    const sweep = new SweepRateLimitBuckets({ repo, lock, now: () => Date.now() });
    await expect(sweep.run()).rejects.toThrow('boom');
    expect(released).toBe(true);
  });
});
