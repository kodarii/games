import type { Game, GameUpdate, NewGame } from './game';

export interface ListGamesQuery {
  search?: string;
  page: number;
  perPage: number;
  sort?: 'title' | 'genre' | 'platform' | 'status' | 'releaseYear' | 'hoursPlayed';
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
}
