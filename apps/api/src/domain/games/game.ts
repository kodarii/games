import { err, ok } from '../shared/result';
import type { Result } from '../shared/result';

export type GamePlatform = 'PS3' | 'PS4' | 'PS5' | 'PC' | 'Xbox' | 'Switch';
export type GameStatus = 'Playing' | 'Completed' | 'Backlog' | 'Dropped' | 'Wishlist';

export const GAME_PLATFORMS = ['PS3', 'PS4', 'PS5', 'PC', 'Xbox', 'Switch'] as const;
export const GAME_STATUSES = ['Playing', 'Completed', 'Backlog', 'Dropped', 'Wishlist'] as const;

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

export type NewGame = Omit<Game, 'id'>;
export type GameUpdate = NewGame;

export type GameValidationError =
  | { kind: 'title_empty' }
  | { kind: 'developer_empty' }
  | { kind: 'release_year_out_of_range'; value: number }
  | { kind: 'hours_played_negative'; value: number };

export function createNewGame(input: unknown): Result<NewGame, GameValidationError> {
  const data = input as Record<string, unknown>;

  const title = String(data.title ?? '').trim();
  if (!title) {
    return err({ kind: 'title_empty' });
  }

  const developer = String(data.developer ?? '').trim();
  if (!developer) {
    return err({ kind: 'developer_empty' });
  }

  const releaseYear = Number(data.releaseYear) || 0;
  if (releaseYear < 1970 || releaseYear > 2100) {
    return err({ kind: 'release_year_out_of_range', value: releaseYear });
  }

  const hoursPlayed = Number(data.hoursPlayed) || 0;
  if (hoursPlayed < 0) {
    return err({ kind: 'hours_played_negative', value: hoursPlayed });
  }

  const platform = String(data.platform) as GamePlatform;
  if (!GAME_PLATFORMS.includes(platform)) {
    return err({ kind: 'title_empty' });
  }

  const status: GameStatus = (String(data.status) as GameStatus) || 'Backlog';
  if (!GAME_STATUSES.includes(status)) {
    return err({ kind: 'title_empty' });
  }

  const genre = String(data.genre ?? '').trim() || '';
  const edition = String(data.edition ?? '').trim() || undefined;

  return ok({
    title,
    developer,
    genre,
    releaseYear,
    platform,
    edition,
    hoursPlayed,
    status,
  });
}

export function createGameUpdate(input: unknown): Result<GameUpdate, GameValidationError> {
  return createNewGame(input);
}
