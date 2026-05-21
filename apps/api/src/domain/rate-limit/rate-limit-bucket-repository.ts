/**
 * Per-user fixed-window rate limit counter store.
 *
 * `increment(userId, windowStart)` atomically inserts a row with count=1 or
 * increments the existing counter for `(userId, windowStart)`, returning the
 * post-increment count. Implementations MUST be safe under concurrent writers
 * within a window (SQLite WAL gives this via UPSERT).
 *
 * `deleteOlderThan(cutoffMs)` removes counter rows whose `windowStart < cutoffMs`.
 * Used by the cron sweep job. Returns the deletion count for logging.
 */
export interface RateLimitBucketRepository {
  increment(userId: string, windowStart: number): Promise<number>;
  deleteOlderThan(cutoffMs: number): Promise<number>;
}
