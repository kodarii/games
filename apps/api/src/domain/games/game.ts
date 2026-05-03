import { err, ok } from '../shared/result';
import type { Result } from '../shared/result';

export type GamePlatform = string;
export type GameStatus = 'Playing' | 'Completed' | 'Backlog' | 'Dropped' | 'Wishlist';
export type GameFormat = 'physical' | 'digital';

export const GAME_STATUSES = ['Playing', 'Completed', 'Backlog', 'Dropped', 'Wishlist'] as const;
export const GAME_FORMATS = ['physical', 'digital'] as const;

export type GameValidationError =
  | { kind: 'missing_user_id' }
  | { kind: 'title_empty' }
  | { kind: 'developer_empty' }
  | { kind: 'release_year_out_of_range'; value: number }
  | { kind: 'hours_played_negative'; value: number }
  | { kind: 'platform_invalid'; value: string }
  | { kind: 'status_invalid'; value: string }
  | { kind: 'format_invalid'; value: string };

export type GameProps = {
  userId: string;
  title: string;
  developer: string;
  genre: string;
  releaseYear?: number;
  platform: GamePlatform;
  edition?: string;
  hoursPlayed: number;
  status: GameStatus;
  format: GameFormat;
  coverColor?: string;
  coverImage?: string;
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
    private readonly _externalId: string,
    private readonly _userId: string,
    private readonly _title: string,
    private readonly _developer: string,
    private readonly _genre: string,
    private readonly _releaseYear: ReleaseYear | null,
    private readonly _platform: GamePlatform,
    private readonly _edition: string | undefined,
    private readonly _hoursPlayed: HoursPlayed,
    private readonly _status: GameStatus,
    private readonly _format: GameFormat,
    private readonly _coverColor: string | undefined,
    private readonly _coverImage: string | undefined,
  ) {}

  static create(
    props: GameProps,
    idGenerator: () => string = () => crypto.randomUUID(),
  ): Result<NewGame, GameValidationError> {
    if (!props.userId || !props.userId.trim()) {
      return err({ kind: 'missing_user_id' });
    }

    const trimmedTitle = props.title.trim();
    if (!trimmedTitle) {
      return err({ kind: 'title_empty' });
    }

    const trimmedDeveloper = props.developer.trim();
    if (!trimmedDeveloper) {
      return err({ kind: 'developer_empty' });
    }

    const trimmedPlatform = props.platform?.trim();
    if (!trimmedPlatform) {
      return err({ kind: 'platform_invalid', value: String(props.platform) });
    }

    if (!GAME_STATUSES.includes(props.status)) {
      return err({ kind: 'status_invalid', value: String(props.status) });
    }

    if (!GAME_FORMATS.includes(props.format)) {
      return err({ kind: 'format_invalid', value: String(props.format) });
    }

    let releaseYear: ReleaseYear | null = null;
    if (props.releaseYear != null) {
      const releaseYearResult = ReleaseYear.create(props.releaseYear);
      if (!releaseYearResult.ok) {
        return releaseYearResult;
      }
      releaseYear = releaseYearResult.value;
    }

    const hoursPlayedResult = HoursPlayed.create(props.hoursPlayed);
    if (!hoursPlayedResult.ok) {
      return hoursPlayedResult;
    }

    const genre = props.genre.trim();
    const edition = props.edition?.trim() || undefined;
    const coverColor = props.coverColor?.trim() || undefined;
    const coverImage = props.coverImage?.trim() || undefined;
    const externalId = idGenerator();

    return ok(
      new NewGame(
        externalId,
        props.userId.trim(),
        trimmedTitle,
        trimmedDeveloper,
        genre,
        releaseYear,
        trimmedPlatform,
        edition,
        hoursPlayedResult.value,
        props.status,
        props.format,
        coverColor,
        coverImage,
      ),
    );
  }

  get externalId(): string {
    return this._externalId;
  }
  get userId() {
    return this._userId;
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
  get releaseYear(): ReleaseYear | null {
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
  get format(): GameFormat {
    return this._format;
  }
  get coverColor(): string | undefined {
    return this._coverColor;
  }
  get coverImage(): string | undefined {
    return this._coverImage;
  }
}

export type GameUpdate = NewGame;

export class Game {
  private constructor(
    private readonly _id: number,
    private readonly _externalId: string,
    private readonly _userId: string,
    private readonly _title: string,
    private readonly _developer: string,
    private readonly _genre: string,
    private readonly _releaseYear: ReleaseYear | null,
    private readonly _platform: GamePlatform,
    private readonly _edition: string | undefined,
    private readonly _hoursPlayed: HoursPlayed,
    private readonly _status: GameStatus,
    private readonly _format: GameFormat,
    private readonly _coverColor: string | undefined,
    private readonly _coverImage: string | undefined,
  ) {}

  static fromPersistence(row: {
    id: number;
    externalId: string;
    userId: string;
    title: string;
    developer: string;
    genre: string;
    releaseYear: number | null;
    platform: GamePlatform;
    edition: string | null;
    hoursPlayed: number;
    status: GameStatus;
    format: GameFormat;
    coverColor?: string | null;
    coverImage?: string | null;
  }): Game {
    if (!row.externalId) {
      throw new Error(`Game row ${row.id} has null externalId — run backfill first`);
    }
    return new Game(
      row.id,
      row.externalId,
      row.userId,
      row.title,
      row.developer,
      row.genre,
      row.releaseYear != null ? ReleaseYear.fromTrusted(row.releaseYear) : null,
      row.platform,
      row.edition ?? undefined,
      HoursPlayed.fromTrusted(row.hoursPlayed),
      row.status,
      row.format,
      row.coverColor ?? undefined,
      row.coverImage ?? undefined,
    );
  }

  get id() {
    return this._id;
  }
  get externalId(): string {
    return this._externalId;
  }
  get userId() {
    return this._userId;
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
  get releaseYear(): ReleaseYear | null {
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
  get format(): GameFormat {
    return this._format;
  }
  get coverColor(): string | undefined {
    return this._coverColor;
  }
  get coverImage(): string | undefined {
    return this._coverImage;
  }

  toJSON() {
    return {
      id: this._id,
      externalId: this._externalId,
      userId: this._userId,
      title: this._title,
      developer: this._developer,
      genre: this._genre,
      releaseYear: this._releaseYear?.value ?? null,
      platform: this._platform,
      edition: this._edition,
      hoursPlayed: this._hoursPlayed.value,
      status: this._status,
      format: this._format,
      coverColor: this._coverColor,
      coverImage: this._coverImage ?? null,
    };
  }
}
