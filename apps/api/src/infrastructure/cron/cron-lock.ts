import { and, eq, sql } from 'drizzle-orm';
import { db as defaultDb } from '../db/client';
import { cronLocks } from '../db/schema';

type DB = typeof defaultDb;

export interface CronLockOptions {
  readonly db?: DB;
  readonly owner: string;
  /** Returns the current time as a unix epoch in milliseconds. */
  readonly now?: () => number;
}

/**
 * SQLite-backed distributed advisory lock for cron jobs.
 *
 * Uses an INSERT … ON CONFLICT(name) DO UPDATE … WHERE locked_until < :now
 * pattern: the UPDATE only fires if the existing lock is expired, otherwise
 * the conflict is a no-op. After the upsert we read back the row and check
 * whether `owner` matches us — if it does, we hold the lock.
 *
 * Two instances racing on the same `name` are serialized by SQLite's BEGIN
 * IMMEDIATE (Drizzle issues the INSERT inside an implicit write transaction):
 * exactly one of them ends up as the `owner` of the row.
 */
export class CronLock {
  private readonly db: DB;
  private readonly owner: string;
  private readonly now: () => number;

  constructor(opts: CronLockOptions) {
    this.db = opts.db ?? defaultDb;
    this.owner = opts.owner;
    this.now = opts.now ?? (() => Date.now());
  }

  /**
   * Attempt to acquire `name` for `ttlMs`. Returns `true` if this caller
   * now owns the lock, `false` if another live owner holds it.
   */
  async tryAcquire(name: string, ttlMs: number): Promise<boolean> {
    const nowMs = this.now();
    const lockedUntil = nowMs + ttlMs;

    await this.db
      .insert(cronLocks)
      .values({ name, lockedUntil, owner: this.owner })
      .onConflictDoUpdate({
        target: cronLocks.name,
        set: { lockedUntil, owner: this.owner },
        setWhere: sql`${cronLocks.lockedUntil} < ${nowMs}`,
      });

    const [row] = await this.db
      .select({ owner: cronLocks.owner, lockedUntil: cronLocks.lockedUntil })
      .from(cronLocks)
      .where(eq(cronLocks.name, name))
      .limit(1);

    if (!row) return false;
    return row.owner === this.owner && row.lockedUntil >= nowMs;
  }

  /**
   * Release the lock if (and only if) this caller still holds it. Safe to
   * call from a `finally` block even when `tryAcquire` returned `false`.
   */
  async release(name: string): Promise<void> {
    await this.db
      .delete(cronLocks)
      .where(and(eq(cronLocks.name, name), eq(cronLocks.owner, this.owner)));
  }
}
