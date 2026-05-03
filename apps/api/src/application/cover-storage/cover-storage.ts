export interface CoverStorage {
  upload(file: File): Promise<{ url: string }>;
  /** Idempotent — never throws on missing. */
  delete(url: string): Promise<void>;
  /** List URLs of files older than `olderThanHours` hours. Used by orphan cron. */
  listOlderThan(olderThanHours: number): Promise<string[]>;
}
