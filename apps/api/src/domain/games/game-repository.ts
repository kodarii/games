import type { Game, GameKind, GameUpdate, NewGame } from './game';

export interface ListGamesQuery {
  userId: string;
  search?: string;
  kind?: GameKind;
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
  listAll(userId: string): Promise<Game[]>;
  findById(id: number): Promise<Game | null>;
  findByExternalId(userId: string, externalId: string): Promise<Game | null>;
  create(game: NewGame): Promise<Game>;
  update(id: number, game: GameUpdate): Promise<Game | null>;
  delete(id: number): Promise<Game | null>;
  countByPlatform(userId: string, platformName: string): Promise<number>;
  countByGenre(userId: string, genre: string): Promise<number>;
  countByDeveloper(userId: string, developer: string): Promise<number>;
  /**
   * Used by orphan-cleanup cron — returns all non-null cover URLs across all users.
   */
  findAllCoverImages(): Promise<string[]>;
}
