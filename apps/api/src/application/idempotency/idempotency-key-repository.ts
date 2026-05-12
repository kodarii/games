/**
 * Stored idempotency record. `responseBody` is the raw JSON body that was sent
 * to the client on the original 2xx response — middleware replays it verbatim.
 *
 * `requestHash` is a deterministic hash of the request payload (method, path,
 * body). Replay with the same key + different body returns 409 per Stripe.
 */
export interface IdempotencyRecord {
  readonly key: string;
  readonly userId: string;
  readonly requestHash: string;
  readonly status: number;
  readonly responseBody: string;
  readonly createdAt: number;
}

/**
 * Application-layer port for the idempotency-key cache. The middleware
 * depends on this interface — never on Drizzle — so the cache can be swapped
 * (Redis, in-memory test fake) without touching the request pipeline.
 *
 * Contract:
 *   - `find` returns the stored record or `null`; never throws on a miss.
 *   - `save` is best-effort insert; if a concurrent request already saved the
 *     same `(key, userId)`, the second call must NOT overwrite — implementers
 *     swallow the unique-constraint conflict so duplicate writes are no-ops.
 *   - `deleteOlderThan` removes rows whose `createdAt < olderThanMs` and
 *     returns the deletion count for cron logging.
 */
export interface IdempotencyKeyRepository {
  find(key: string, userId: string): Promise<IdempotencyRecord | null>;
  save(record: IdempotencyRecord): Promise<void>;
  deleteOlderThan(olderThanMs: number): Promise<number>;
}
