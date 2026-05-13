import type { IntegrationCredentialsRepository } from '../../domain/integrations/integration-credentials-repository';
import type { IntegrationKind } from '../../domain/integrations/integration-value-objects';
import { ok } from '../../domain/shared/result';
import type { Result } from '../../domain/shared/result';
import type { IgdbTokenStorage } from '../../infrastructure/igdb/igdb-token-store';
import type { TransactionRunner } from '../shared/transaction-runner';
import type { IgdbChainSwapper } from './save-igdb-integration';

const IGDB_KIND: IntegrationKind = 'igdb';

export interface ClearIgdbIntegrationDeps {
  readonly repo: IntegrationCredentialsRepository;
  readonly tokenStorage: IgdbTokenStorage;
  readonly chainHolder: IgdbChainSwapper;
  readonly transactionRunner: TransactionRunner;
}

/**
 * Disconnects the IGDB integration for the given user.
 *
 * Atomic: deletes the `integration_credentials` row AND the cached Twitch
 * OAuth token (`igdb_oauth_token`) in a single transaction. If either delete
 * fails, the transaction rolls back and the runtime chain is left untouched —
 * the next request still sees the previous configured state.
 *
 * After commit, `chainHolder.swap(null)` tears down the in-process chain.
 * The holder additionally resets its own circuit breaker, so a subsequent
 * `swap(creds)` (e.g. user reconnects) starts with a clean failure window.
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
      await txStorage.clear();
    });
    this.deps.chainHolder.swap(null);
    return ok(undefined);
  }
}
