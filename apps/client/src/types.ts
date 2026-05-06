export type GameStatus = 'Playing' | 'Completed' | 'Backlog' | 'Dropped';
export type GameKind = 'owned' | 'wishlist';
export type GamePlatform = string;
export const GAME_FORMATS = ['physical', 'digital'] as const;
export type GameFormat = (typeof GAME_FORMATS)[number];

export interface Game {
  id: number;
  externalId: string;
  kind: GameKind;
  title: string;
  developer: string | null;
  genre: string;
  releaseYear: number | null;
  platform: GamePlatform;
  edition?: string;
  hoursPlayed: number | null;
  status: GameStatus | null;
  format: GameFormat;
  coverColor?: string | null;
  coverImage?: string | null;
  price: number | null;
  purchasedAt: string | null;
  notes?: string | null;
}

export const GAME_SORT_FIELDS = [
  'title',
  'genre',
  'platform',
  'format',
  'status',
  'releaseYear',
  'hoursPlayed',
] as const;
export type GameSortField = (typeof GAME_SORT_FIELDS)[number];
export type SortDir = 'asc' | 'desc';

export interface Platform {
  id: number;
  userId: string;
  name: string;
}

export interface GamesResponse {
  items: Game[];
  page: number;
  perPage: number;
  total: number;
  hasMore: boolean;
}
