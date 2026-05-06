import type { Genre } from '../../domain/genres/genre';
import type { GenreRepository } from '../../domain/genres/genre-repository';

export class ListGenres {
  constructor(private readonly repo: GenreRepository) {}
  async execute(userId: string): Promise<Genre[]> {
    return this.repo.list(userId);
  }
}
