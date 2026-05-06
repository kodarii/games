import type { Developer } from '../../domain/developers/developer';
import type { DeveloperRepository } from '../../domain/developers/developer-repository';
import type { GameRepository } from '../../domain/games/game-repository';
import { err, ok } from '../../domain/shared/result';
import type { Result } from '../../domain/shared/result';

export type DeleteDeveloperError = { kind: 'not_found' } | { kind: 'in_use' };

export class DeleteDeveloper {
  constructor(
    private readonly repo: DeveloperRepository,
    private readonly gameRepo: GameRepository,
  ) {}

  async execute(id: number, userId: string): Promise<Result<Developer, DeleteDeveloperError>> {
    const existing = await this.repo.findById(id);
    if (!existing || existing.userId !== userId) return err({ kind: 'not_found' });

    const inUse = await this.gameRepo.countByDeveloper(userId, existing.name);
    if (inUse > 0) return err({ kind: 'in_use' });

    const deleted = await this.repo.delete(id);
    if (!deleted) return err({ kind: 'not_found' });

    return ok(deleted);
  }
}
