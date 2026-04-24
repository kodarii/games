import { err, ok } from '../shared/result';
import type { Result } from '../shared/result';

export type GamePlatform = 'PS3' | 'PS4' | 'PS5' | 'PC' | 'Xbox' | 'Switch';
export type GameStatus = 'Playing' | 'Completed' | 'Backlog' | 'Dropped' | 'Wishlist';

export const GAME_PLATFORMS = ['PS3', 'PS4', 'PS5', 'PC', 'Xbox', 'Switch'] as const;
export const GAME_STATUSES = ['Playing', 'Completed', 'Backlog', 'Dropped', 'Wishlist'] as const;

export type GameValidationError =
  | { kind: 'title_empty' }
  | { kind: 'developer_empty' }
  | { kind: 'release_year_out_of_range'; value: number }
  | { kind: 'hours_played_negative'; value: number }
  | { kind: 'platform_invalid'; value: string }
  | { kind: 'status_invalid'; value: string };

export type GameProps = {
  title: string;
  developer: string;
  genre: string;
  releaseYear: number;
  platform: GamePlatform;
  edition?: string;
  hoursPlayed: number;
  status: GameStatus;
};

export class ReleaseYear {
  private constructor(public readonly value: number) {}

  static create(raw: number): Result<ReleaseYear, GameValidationError> {
    if (raw < 1970 || raw > 2100) {
      return err({ kind: 'release_year_out_of_range', value: raw });
    }
    return ok(new ReleaseYear(raw));
  }

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

  static fromTrusted(value: number): HoursPlayed {
    return new HoursPlayed(value);
  }
}

export class NewGame {
  private constructor(
    private readonly _title: string,
    private readonly _developer: string,
    private readonly _genre: string,
    private readonly _releaseYear: ReleaseYear,
    private readonly _platform: GamePlatform,
    private readonly _edition: string | undefined,
    private readonly _hoursPlayed: HoursPlayed,
    private readonly _status: GameStatus,
  ) {}

  static create(props: GameProps): Result<NewGame, GameValidationError> {
    const trimmedTitle = props.title.trim();
    if (!trimmedTitle) {
      return err({ kind: 'title_empty' });
    }

    const trimmedDeveloper = props.developer.trim();
    if (!trimmedDeveloper) {
      return err({ kind: 'developer_empty' });
    }

    if (!GAME_PLATFORMS.includes(props.platform)) {
      return err({ kind: 'platform_invalid', value: String(props.platform) });
    }

    if (!GAME_STATUSES.includes(props.status)) {
      return err({ kind: 'status_invalid', value: String(props.status) });
    }

    const releaseYearResult = ReleaseYear.create(props.releaseYear);
    if (!releaseYearResult.ok) {
      return releaseYearResult;
    }

    const hoursPlayedResult = HoursPlayed.create(props.hoursPlayed);
    if (!hoursPlayedResult.ok) {
      return hoursPlayedResult;
    }

    const genre = props.genre.trim();
    const edition = props.edition?.trim() || undefined;

    return ok(
      new NewGame(
        trimmedTitle,
        trimmedDeveloper,
        genre,
        releaseYearResult.value,
        props.platform,
        edition,
        hoursPlayedResult.value,
        props.status,
      ),
    );
  }

  get title() {
    return this._title;
  }
  get developer() {
    return this._developer;
  }
  get genre() {
    return this._genre;
  }
  get releaseYear(): ReleaseYear {
    return this._releaseYear;
  }
  get platform(): GamePlatform {
    return this._platform;
  }
  get edition(): string | undefined {
    return this._edition;
  }
  get hoursPlayed(): HoursPlayed {
    return this._hoursPlayed;
  }
  get status(): GameStatus {
    return this._status;
  }
}

export type GameUpdate = NewGame;

export class Game {
  private constructor(
    private readonly _id: number,
    private readonly _title: string,
    private readonly _developer: string,
    private readonly _genre: string,
    private readonly _releaseYear: ReleaseYear,
    private readonly _platform: GamePlatform,
    private readonly _edition: string | undefined,
    private readonly _hoursPlayed: HoursPlayed,
    private readonly _status: GameStatus,
  ) {}

  static fromPersistence(row: {
    id: number;
    title: string;
    developer: string;
    genre: string;
    releaseYear: number;
    platform: GamePlatform;
    edition: string | null;
    hoursPlayed: number;
    status: GameStatus;
  }): Game {
    return new Game(
      row.id,
      row.title,
      row.developer,
      row.genre,
      ReleaseYear.fromTrusted(row.releaseYear),
      row.platform,
      row.edition ?? undefined,
      HoursPlayed.fromTrusted(row.hoursPlayed),
      row.status,
    );
  }

  get id() {
    return this._id;
  }
  get title() {
    return this._title;
  }
  get developer() {
    return this._developer;
  }
  get genre() {
    return this._genre;
  }
  get releaseYear(): ReleaseYear {
    return this._releaseYear;
  }
  get platform(): GamePlatform {
    return this._platform;
  }
  get edition(): string | undefined {
    return this._edition;
  }
  get hoursPlayed(): HoursPlayed {
    return this._hoursPlayed;
  }
  get status(): GameStatus {
    return this._status;
  }

  toJSON() {
    return {
      id: this._id,
      title: this._title,
      developer: this._developer,
      genre: this._genre,
      releaseYear: this._releaseYear.value,
      platform: this._platform,
      edition: this._edition,
      hoursPlayed: this._hoursPlayed.value,
      status: this._status,
    };
  }
}
