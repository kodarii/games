import type { Genre } from '../../domain/genres/genre';
import type { GenreRepository } from '../../domain/genres/genre-repository';
import type { GameRepository } from '../../domain/games/game-repository';
import { err, ok } from '../../domain/shared/result';
import type { Result } from '../../domain/shared/result';

export type DeleteGenreError = { kind: 'not_found' } | { kind: 'in_use' };

export class DeleteGenre {
  constructor(
    private readonly repo: GenreRepository,
    private readonly gameRepo: GameRepository,
  ) {}

  async execute(id: number, userId: string): Promise<Result<Genre, DeleteGenreError>> {
    const existing = await this.repo.findById(id);
    if (!existing || existing.userId !== userId) return err({ kind: 'not_found' });

    const inUse = await this.gameRepo.countByGenre(userId, existing.name);
    if (inUse > 0) return err({ kind: 'in_use' });

    const deleted = await this.repo.delete(id);
    if (!deleted) return err({ kind: 'not_found' });

    return ok(deleted);
  }
}
