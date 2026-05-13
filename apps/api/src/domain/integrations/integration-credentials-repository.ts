import type { IntegrationCredentials } from './integration-credentials';
import type { IntegrationKind } from './integration-value-objects';

/**
 * Port for persisting `IntegrationCredentials` aggregates. Every method is
 * scoped to a single user — there is no "find all" by design so IDOR leaks
 * cannot accidentally be introduced by a future caller.
 */
export interface IntegrationCredentialsRepository {
  findByUserAndKind(userId: string, kind: IntegrationKind): Promise<IntegrationCredentials | null>;
  /** Upsert: writes or replaces the row keyed on `(user_id, integration)`. */
  save(creds: IntegrationCredentials): Promise<void>;
  delete(userId: string, kind: IntegrationKind): Promise<void>;
  /** Bind the repo to a transaction handle for atomic multi-step writes. */
  withTx(tx: unknown): IntegrationCredentialsRepository;
}
