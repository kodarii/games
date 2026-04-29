import type { GameRepository } from '../../domain/games/game-repository';
import type { PlatformRepository } from '../../domain/platforms/platform-repository';
import { toSnapshot, type ExportSnapshot } from './export-snapshot';

export class ExportData {
  constructor(
    private readonly gameRepo: GameRepository,
    private readonly platformRepo: PlatformRepository,
  ) {}

  async execute(userId: string, now: Date = new Date()): Promise<ExportSnapshot> {
    const [games, platforms] = await Promise.all([
      this.gameRepo.listAll(userId),
      this.platformRepo.list(userId),
    ]);
    return toSnapshot(games, platforms, now);
  }
}
