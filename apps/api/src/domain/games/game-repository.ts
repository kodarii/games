import type { Game, GameUpdate, NewGame } from './game';

export interface ListGamesQuery {
  userId: string;
  search?: string;
  page: number;
  perPage: number;
  sort?: 'title' | 'genre' | 'platform' | 'format' | 'status' | 'releaseYear' | 'hoursPlayed';
  dir: 'asc' | 'desc';
}

export interface ListGamesResult {
  items: Game[];
  total: number;
}

export interface GameRepository {
  list(query: ListGamesQuery): Promise<ListGamesResult>;
  findById(id: number): Promise<Game | null>;
  create(game: NewGame): Promise<Game>;
  update(id: number, game: GameUpdate): Promise<Game | null>;
  delete(id: number): Promise<Game | null>;
  countByPlatform(userId: string, platformName: string): Promise<number>;
}
