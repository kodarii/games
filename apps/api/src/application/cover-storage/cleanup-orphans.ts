import type { GameRepository } from '../../domain/games/game-repository';
import type { IdempotencyKeyRepository } from '../idempotency/idempotency-key-repository';
import type { CoverStorage } from './cover-storage';

function extractKey(url: string): string {
  try {
    const segs = new URL(url).pathname.split('/').filter(Boolean);
    return segs[segs.length - 1] ?? url;
  } catch {
    return url;
  }
}

export interface CleanupRunResult {
  listed: number;
  inDb: number;
  orphans: number;
  deleted: number;
  failed: number;
  idempotencyKeysDeleted: number;
}

export interface CleanupOrphansOptions {
  /**
   * TTL for cached idempotency-key rows. Rows whose `created_at` is older
   * than `Date.now() - idempotencyTtlMs` are pruned each run. Defaults to
   * 24 hours.
   */
  readonly idempotencyTtlMs?: number;
  readonly now?: () => number;
}

export type CleanupOutcome =
  | ({ status: 'ran' } & CleanupRunResult)
  | { status: 'skipped'; reason: 'lock_held' | 'no_storage' };

/**
 * Port for a distributed advisory lock — kept narrow so the application
 * layer never imports infrastructure (`CronLock` lives in
 * `infrastructure/cron/cron-lock.ts` and satisfies this shape).
 */
export interface CleanupLock {
  tryAcquire(name: string, ttlMs: number): Promise<boolean>;
  release(name: string): Promise<void>;
}

const LOCK_NAME = 'cleanup-orphans';
const LOCK_TTL_MS = 2 * 60 * 60 * 1000;
const DEFAULT_IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000;

export class CleanupOrphans {
  private readonly idempotencyTtlMs: number;
  private readonly now: () => number;

  constructor(
    private readonly storage: CoverStorage | null,
    private readonly gameRepo: GameRepository,
    private readonly idempotencyRepo: IdempotencyKeyRepository,
    private readonly lock?: CleanupLock,
    options: CleanupOrphansOptions = {},
  ) {
    this.idempotencyTtlMs = options.idempotencyTtlMs ?? DEFAULT_IDEMPOTENCY_TTL_MS;
    this.now = options.now ?? (() => Date.now());
  }

  /**
   * Runs an orphan-cover sweep guarded by an optional cross-instance lock.
   * When no lock is configured (tests, single-process dev) the body always
   * executes. When no cover storage is configured the sweep is skipped — no
   * orphan covers exist to clean up.
   */
  async run(): Promise<CleanupOutcome> {
    if (!this.storage) {
      return { status: 'skipped', reason: 'no_storage' };
    }
    if (this.lock) {
      const acquired = await this.lock.tryAcquire(LOCK_NAME, LOCK_TTL_MS);
      if (!acquired) {
        return { status: 'skipped', reason: 'lock_held' };
      }
    }

    try {
      const result = await this.sweep(this.storage);
      return { status: 'ran', ...result };
    } finally {
      if (this.lock) {
        await this.lock.release(LOCK_NAME);
      }
    }
  }

  private async sweep(storage: CoverStorage): Promise<CleanupRunResult> {
    const [oldUrls, dbUrls] = await Promise.all([
      storage.listOlderThan(24),
      this.gameRepo.findAllCoverImages(),
    ]);
    const dbKeys = new Set(dbUrls.map(extractKey));
    const orphans = oldUrls.filter((u) => !dbKeys.has(extractKey(u)));

    let deleted = 0;
    let failed = 0;
    for (const url of orphans) {
      try {
        await storage.delete(url);
        deleted++;
      } catch {
        failed++;
      }
    }

    // Idempotency-key cache TTL pruning. Independent of cover-orphan logic,
    // but grouped here so a single lock-acquire/cron run handles both.
    const olderThan = this.now() - this.idempotencyTtlMs;
    const idempotencyKeysDeleted = await this.idempotencyRepo.deleteOlderThan(olderThan);

    return {
      listed: oldUrls.length,
      inDb: dbUrls.length,
      orphans: orphans.length,
      deleted,
      failed,
      idempotencyKeysDeleted,
    };
  }
}
