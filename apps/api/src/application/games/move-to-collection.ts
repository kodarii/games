import type { Game } from '../../domain/games/game';
import { GameUpdate } from '../../domain/games/game';
import type { GameRepository } from '../../domain/games/game-repository';
import { err, ok, type Result } from '../../domain/shared/result';

export type MoveToCollectionError =
  | { kind: 'not_found' }
  | { kind: 'already_owned' };

export class MoveToCollection {
  constructor(private readonly repo: GameRepository) {}

  async execute(externalId: string, userId: string): Promise<Result<Game, MoveToCollectionError>> {
    const existing = await this.repo.findByExternalId(userId, externalId);
    if (!existing) return err({ kind: 'not_found' });
    if (existing.kind === 'owned') return err({ kind: 'already_owned' });

    const movedGame = existing.toOwned();
    const updateData = GameUpdate.fromGame(movedGame);
    const updated = await this.repo.update(userId, externalId, updateData);
    if (!updated) return err({ kind: 'not_found' });
    return ok(updated);
  }
}
