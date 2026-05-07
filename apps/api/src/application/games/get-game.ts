import type { Game } from '../../domain/games/game';
import type { GameRepository } from '../../domain/games/game-repository';
import { err, ok } from '../../domain/shared/result';
import type { Result } from '../../domain/shared/result';

export type GetGameError = { kind: 'not_found' };

export class GetGame {
  constructor(private readonly repo: GameRepository) {}

  async execute(externalId: string, userId: string): Promise<Result<Game, GetGameError>> {
    const game = await this.repo.findByExternalId(userId, externalId);
    if (!game) return err({ kind: 'not_found' });
    return ok(game);
  }
}
