import type { Genre, NewGenre } from './genre';

export interface GenreRepository {
  list(userId: string): Promise<Genre[]>;
  findById(id: number): Promise<Genre | null>;
  findByName(userId: string, name: string): Promise<Genre | null>;
  create(genre: NewGenre): Promise<Genre>;
  delete(id: number): Promise<Genre | null>;
}
