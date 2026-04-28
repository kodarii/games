import type { Platform } from '../../domain/platforms/platform';
import type { GameRepository } from '../../domain/games/game-repository';
import type { PlatformRepository } from '../../domain/platforms/platform-repository';
import { err, ok } from '../../domain/shared/result';
import type { Result } from '../../domain/shared/result';

export type DeletePlatformError = { kind: 'not_found' } | { kind: 'in_use' };

export class DeletePlatform {
  constructor(
    private readonly repo: PlatformRepository,
    private readonly gameRepo: GameRepository,
  ) {}

  async execute(id: number, userId: string): Promise<Result<Platform, DeletePlatformError>> {
    const existing = await this.repo.findById(id);
    if (!existing || existing.userId !== userId) {
      return err({ kind: 'not_found' });
    }

    const inUse = await this.gameRepo.countByPlatform(userId, existing.name);
    if (inUse > 0) {
      return err({ kind: 'in_use' });
    }

    const deleted = await this.repo.delete(id);
    if (!deleted) {
      return err({ kind: 'not_found' });
    }

    return ok(deleted);
  }
}
