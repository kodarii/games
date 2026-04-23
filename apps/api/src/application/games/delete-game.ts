import type { Game } from '../../domain/games/game';
import type { GameRepository } from '../../domain/games/game-repository';
import { err, ok } from '../../domain/shared/result';
import type { Result } from '../../domain/shared/result';

export type DeleteGameError = { kind: 'not_found' };

export class DeleteGame {
  constructor(private readonly repo: GameRepository) {}

  async execute(id: number): Promise<Result<Game, DeleteGameError>> {
    const deleted = await this.repo.delete(id);

    if (!deleted) {
      return err({ kind: 'not_found' });
    }

    return ok(deleted);
  }
}
