import { err, ok } from '../shared/result';
import type { Result } from '../shared/result';

export type GamePlatform = string;
export type GameStatus = 'Playing' | 'Completed' | 'Backlog' | 'Dropped';
export type GameFormat = 'physical' | 'digital';
export type GameKind = 'owned' | 'wishlist';

export const GAME_STATUSES = ['Playing', 'Completed', 'Backlog', 'Dropped'] as const;
export const GAME_FORMATS = ['physical', 'digital'] as const;
export const GAME_KINDS = ['owned', 'wishlist'] as const;

export type GameValidationError =
  | { kind: 'missing_user_id' }
  | { kind: 'title_empty' }
  | { kind: 'developer_empty' }
  | { kind: 'release_year_out_of_range'; value: number }
  | { kind: 'hours_played_negative'; value: number }
  | { kind: 'platform_invalid'; value: string }
  | { kind: 'status_invalid'; value: string }
  | { kind: 'format_invalid'; value: string }
  | { kind: 'price_negative'; value: number }
  | { kind: 'price_too_large'; value: number }
  | { kind: 'price_not_integer'; value: number }
  | { kind: 'purchased_at_invalid_format'; value: string }
  | { kind: 'purchased_at_invalid_date'; value: string }
  | { kind: 'purchased_at_in_future' }
  | { kind: 'kind_invalid_state'; reason: string };

export class ReleaseYear {
  private constructor(public readonly value: number) {}

  static create(raw: number): Result<ReleaseYear, GameValidationError> {
    if (raw < 1970 || raw > 2100) {
      return err({ kind: 'release_year_out_of_range', value: raw });
    }
    return ok(new ReleaseYear(raw));
  }

  /** Trusted: only from `Game.fromPersistence` where the value was validated at write-time. */
  static fromTrusted(value: number): ReleaseYear {
    return new ReleaseYear(value);
  }
}

export class HoursPlayed {
  private constructor(public readonly value: number) {}

  static create(raw: number): Result<HoursPlayed, GameValidationError> {
    if (raw < 0) {
      return err({ kind: 'hours_played_negative', value: raw });
    }
    return ok(new HoursPlayed(raw));
  }

  /** Trusted: only from `Game.fromPersistence` (or `Game.moveToCollection`) — value already validated. */
  static fromTrusted(value: number): HoursPlayed {
    return new HoursPlayed(value);
  }
}

export class Price {
  private constructor(public readonly value: number) {}

  static create(raw: number): Result<Price, GameValidationError> {
    if (!Number.isInteger(raw)) {
      return err({ kind: 'price_not_integer', value: raw });
    }
    if (raw < 0) {
      return err({ kind: 'price_negative', value: raw });
    }
    if (raw >= 100_000_000) {
      return err({ kind: 'price_too_large', value: raw });
    }
    return ok(new Price(raw));
  }

  /** Trusted: only from `Game.fromPersistence` where the value was validated at write-time. */
  static fromTrusted(value: number): Price {
    return new Price(value);
  }
}

const PURCHASED_AT_REGEX = /^\d{4}-\d{2}-\d{2}$/;

function isoToday(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

export class PurchasedAt {
  private constructor(public readonly value: string) {}

  static create(raw: string, today: string = isoToday()): Result<PurchasedAt, GameValidationError> {
    if (!PURCHASED_AT_REGEX.test(raw)) {
      return err({ kind: 'purchased_at_invalid_format', value: raw });
    }
    const parsed = new Date(raw);
    if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== raw) {
      return err({ kind: 'purchased_at_invalid_date', value: raw });
    }
    if (raw > today) {
      return err({ kind: 'purchased_at_in_future' });
    }
    return ok(new PurchasedAt(raw));
  }

  /** Trusted: only from `Game.fromPersistence` where the value was validated at write-time. */
  static fromTrusted(value: string): PurchasedAt {
    return new PurchasedAt(value);
  }
}
