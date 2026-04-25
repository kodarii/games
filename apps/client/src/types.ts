export type GameStatus = 'Playing' | 'Completed' | 'Backlog' | 'Dropped' | 'Wishlist';
export type GamePlatform = 'PS3' | 'PS4' | 'PS5' | 'PC' | 'Xbox' | 'Switch';

export interface Game {
  id: number;
  title: string;
  developer: string;
  genre: string;
  releaseYear: number;
  platform: GamePlatform;
  edition?: string;
  hoursPlayed: number;
  status: GameStatus;
}

export type GameSortField =
  | 'title'
  | 'genre'
  | 'platform'
  | 'status'
  | 'releaseYear'
  | 'hoursPlayed';
export type SortDir = 'asc' | 'desc';

export interface GamesResponse {
  items: Game[];
  page: number;
  perPage: number;
  total: number;
  hasMore: boolean;
}
