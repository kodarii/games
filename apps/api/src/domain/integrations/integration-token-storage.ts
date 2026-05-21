/**
 * Persistence port for an external integration's cached OAuth token.
 *
 * Single-row semantics — implementations store at most one record per
 * integration (IGDB today; Steam/RAWG/etc. will follow). The
 * `(userId, kind)` partitioning lives in the adapter; the port stays neutral
 * because rotating-token providers may share a single global row.
 *
 * `withTx(tx)` returns a copy bound to a transaction handle so application
 * code can delete the token atomically with the credentials row.
 *
 * BREAKING-CHANGE WATCH: if multi-tenant IGDB credentials land
 * (Application.firstUserIdOrNull is currently single-tenant), `read/write/clear`
 * will gain a `userId` parameter. Treat the current shape as deliberately
 * minimal under that assumption.
 */
export interface StoredIntegrationToken {
  readonly accessToken: string;
  readonly expiresAt: Date;
  readonly obtainedAt: Date;
}

export interface IntegrationTokenStorage {
  read(): Promise<StoredIntegrationToken | null>;
  write(record: StoredIntegrationToken): Promise<void>;
  clear(): Promise<void>;
  withTx(tx: unknown): IntegrationTokenStorage;
}
