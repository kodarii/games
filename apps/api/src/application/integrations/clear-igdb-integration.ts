import type { IntegrationCredentialsRepository } from '../../domain/integrations/integration-credentials-repository';
import type { IntegrationTokenStorage } from '../../domain/integrations/integration-token-storage';
import type { IntegrationKind } from '../../domain/integrations/integration-value-objects';
import { ok } from '../../domain/shared/result';
import type { Result } from '../../domain/shared/result';
import type { TransactionRunner } from '../shared/transaction-runner';
import type { IgdbResourceCacheInvalidator } from './igdb-resource-cache-invalidator';

const IGDB_KIND: IntegrationKind = 'igdb';

export interface ClearIgdbIntegrationDeps {
  readonly repo: IntegrationCredentialsRepository;
  readonly tokenStorage: IntegrationTokenStorage;
  readonly resourceCache: IgdbResourceCacheInvalidator;
  readonly transactionRunner: TransactionRunner;
}

/**
 * Disconnects the IGDB integration for the given user.
 *
 * Atomic: deletes the `integration_credentials` row AND the cached Twitch
 * OAuth token (`igdb_oauth_token`) in a single transaction. If either delete
 * fails, the transaction rolls back and the per-user resource cache is left
 * untouched — the next request still sees the previous configured state.
 *
 * After commit, `resourceCache.invalidate(userId)` drops the cached per-user
 * resources so the next request reflects the cleared credentials.
 *
 * No business failure mode exists: a missing row is a no-op (idempotent
 * clear). Infrastructure exceptions propagate.
 */
export class ClearIgdbIntegration {
  constructor(private readonly deps: ClearIgdbIntegrationDeps) {}

  async execute(userId: string): Promise<Result<void, never>> {
    await this.deps.transactionRunner.run(async (tx) => {
      const txRepo = this.deps.repo.withTx(tx);
      const txStorage = this.deps.tokenStorage.withTx(tx);
      await txRepo.delete(userId, IGDB_KIND);
      await txStorage.clear(userId, IGDB_KIND);
    });
    this.deps.resourceCache.invalidate(userId);
    return ok(undefined);
  }
}
