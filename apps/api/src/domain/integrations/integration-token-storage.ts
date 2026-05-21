import type { IntegrationKind } from './integration-value-objects';

/**
 * Persistence port for an external integration's cached OAuth token.
 *
 * Scoped per user: `(userId, kind)` is the row identity. The adapter against
 * `integration_oauth_token` enforces this via a composite primary key.
 *
 * `withTx(tx)` returns a copy bound to a transaction handle so application
 * code can delete the token atomically with the credentials row.
 */
export interface StoredIntegrationToken {
  readonly accessToken: string;
  readonly expiresAt: Date;
  readonly obtainedAt: Date;
}

export interface IntegrationTokenStorage {
  read(userId: string, kind: IntegrationKind): Promise<StoredIntegrationToken | null>;
  write(userId: string, kind: IntegrationKind, record: StoredIntegrationToken): Promise<void>;
  clear(userId: string, kind: IntegrationKind): Promise<void>;
  withTx(tx: unknown): IntegrationTokenStorage;
}
