import type { Game } from '../../domain/games/game';
import { type GameRepository, OptimisticLockError } from '../../domain/games/game-repository';
import { err, ok } from '../../domain/shared/result';
import type { Result } from '../../domain/shared/result';
import type { TransactionRunner } from '../shared/transaction-runner';

export type DeleteGameError = { kind: 'not_found' } | { kind: 'conflict' };

/**
 * Deletes a game row inside a transaction with optimistic locking.
 *
 * NOTE: cover-image cleanup is intentionally NOT performed here. A pre-commit
 * delete races the transaction (rollback ⇒ live row with no file); a
 * post-commit `void storage.delete()` races a SIGTERM between commit and the
 * remote DELETE (file orphaned, no DB pointer). The single source of truth
 * for cleanup is the hourly `CleanupOrphans` cron, which sweeps any storage
 * file older than the safety window whose URL no longer appears in the
 * `games.cover_image` allowlist.
 */
export class DeleteGame {
  constructor(
    private readonly repo: GameRepository,
    private readonly tx: TransactionRunner,
  ) {}

  async execute(externalId: string, userId: string): Promise<Result<Game, DeleteGameError>> {
    let deleted: Game | null;
    try {
      deleted = await this.tx.run<Game | null>(async (tx) => {
        const repo = this.repo.withTx(tx);
        const existing = await repo.findByExternalId(userId, externalId);
        if (!existing) return null;
        return repo.delete(userId, externalId, existing.updatedAt);
      });
    } catch (e) {
      if (e instanceof OptimisticLockError) {
        return err({ kind: 'conflict' });
      }
      throw e;
    }

    if (!deleted) return err({ kind: 'not_found' });
    return ok(deleted);
  }
}
