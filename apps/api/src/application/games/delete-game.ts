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

  async execute(id: number, userId: string): Promise<Result<Game, DeleteGameError>> {
    const existing = await this.repo.findById(id);

    if (!existing || existing.userId !== userId) {
      return err({ kind: 'not_found' });
    }

    const deleted = await this.repo.delete(id);

    if (!deleted) {
      return err({ kind: 'not_found' });
    }

    if (existing.coverImage) {
      void this.coverStorage.delete(existing.coverImage).catch((deleteErr) => {
        console.warn('[delete-game] cover cleanup failed', { id, url: existing.coverImage, deleteErr });
      });
    }

    return ok(deleted);
  }
}
