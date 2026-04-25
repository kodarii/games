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

export const GAME_SORT_FIELDS = [
  'title',
  'genre',
  'platform',
  'status',
  'releaseYear',
  'hoursPlayed',
] as const;
export type GameSortField = (typeof GAME_SORT_FIELDS)[number];
export type SortDir = 'asc' | 'desc';

export interface GamesResponse {
  items: Game[];
  page: number;
  perPage: number;
  total: number;
  hasMore: boolean;
}
