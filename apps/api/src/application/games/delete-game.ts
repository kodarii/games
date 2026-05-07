import type { Game } from '../../domain/games/game';
import type { GameRepository } from '../../domain/games/game-repository';
import { err, ok } from '../../domain/shared/result';
import type { Result } from '../../domain/shared/result';
import type { CoverStorage } from '../cover-storage/cover-storage';

export type DeleteGameError = { kind: 'not_found' };

export class DeleteGame {
  constructor(
    private readonly repo: GameRepository,
    private readonly coverStorage: CoverStorage,
  ) {}

  async execute(externalId: string, userId: string): Promise<Result<Game, DeleteGameError>> {
    const deleted = await this.repo.delete(userId, externalId);
    if (!deleted) return err({ kind: 'not_found' });

    if (deleted.coverImage) {
      void this.coverStorage.delete(deleted.coverImage).catch((deleteErr) => {
        console.warn('[delete-game] cover cleanup failed', { externalId, deleteErr });
      });
    }

    return ok(deleted);
  }
}
