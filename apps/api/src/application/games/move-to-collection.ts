import type { Game } from '../../domain/games/game';
import { type GameRepository, OptimisticLockError } from '../../domain/games/game-repository';
import { type Result, err, ok } from '../../domain/shared/result';
import type { TransactionRunner } from '../shared/transaction-runner';

export type MoveToCollectionError =
  | { kind: 'not_found' }
  | { kind: 'already_owned' }
  | { kind: 'conflict' };

export class MoveToCollection {
  constructor(
    private readonly repo: GameRepository,
    private readonly tx: TransactionRunner,
  ) {}

  async execute(externalId: string, userId: string): Promise<Result<Game, MoveToCollectionError>> {
    type TxResult = { ok: true; updated: Game } | { ok: false; error: MoveToCollectionError };
    let outcome: TxResult;
    try {
      outcome = await this.tx.run<TxResult>(async (tx) => {
        const repo = this.repo.withTx(tx);
        const existing = await repo.findByExternalId(userId, externalId);
        if (!existing) return { ok: false, error: { kind: 'not_found' } };
        if (existing.kind === 'owned') return { ok: false, error: { kind: 'already_owned' } };

        const updateData = existing.moveToCollection();
        const updated = await repo.update(userId, externalId, updateData, existing.updatedAt);
        if (!updated) return { ok: false, error: { kind: 'not_found' } };
        return { ok: true, updated };
      });
    } catch (e) {
      if (e instanceof OptimisticLockError) return err({ kind: 'conflict' });
      throw e;
    }
    if (!outcome.ok) return err(outcome.error);
    return ok(outcome.updated);
  }
}
