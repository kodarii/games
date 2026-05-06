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

export type GameProps = {
  kind: GameKind;
  userId: string;
  title: string;
  developer: string | null;
  genre: string;
  releaseYear?: number;
  platform: GamePlatform;
  edition?: string;
  hoursPlayed: number | null;
  status: GameStatus | null;
  format: GameFormat;
  coverColor?: string;
  coverImage?: string;
  price?: number;
  purchasedAt?: string | null;
  notes?: string | null;
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

  static create(
    raw: string,
    today: string = isoToday(),
  ): Result<PurchasedAt, GameValidationError> {
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

  static fromTrusted(value: string): PurchasedAt {
    return new PurchasedAt(value);
  }
}

export class NewGame {
  private constructor(
    private readonly _externalId: string,
    private readonly _kind: GameKind,
    private readonly _userId: string,
    private readonly _title: string,
    private readonly _developer: string | null,
    private readonly _genre: string,
    private readonly _releaseYear: ReleaseYear | null,
    private readonly _platform: GamePlatform,
    private readonly _edition: string | undefined,
    private readonly _hoursPlayed: HoursPlayed | null,
    private readonly _status: GameStatus | null,
    private readonly _format: GameFormat,
    private readonly _coverColor: string | undefined,
    private readonly _coverImage: string | undefined,
    private readonly _price: Price | null,
    private readonly _purchasedAt: PurchasedAt | null,
    private readonly _notes: string | null,
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

    if (!GAME_KINDS.includes(props.kind as GameKind)) {
      return err({ kind: 'kind_invalid_state', reason: 'unknown_kind' });
    }

    const trimmedPlatform = props.platform?.trim();
    if (!trimmedPlatform) {
      return err({ kind: 'platform_invalid', value: String(props.platform) });
    }

    if (!GAME_FORMATS.includes(props.format)) {
      return err({ kind: 'format_invalid', value: String(props.format) });
    }

    if (props.kind === 'wishlist') {
      if (props.status != null) {
        return err({ kind: 'kind_invalid_state', reason: 'wishlist_must_have_null_status' });
      }
      if (props.hoursPlayed != null) {
        return err({ kind: 'kind_invalid_state', reason: 'wishlist_must_have_null_hours_played' });
      }
      if (props.purchasedAt != null) {
        return err({ kind: 'kind_invalid_state', reason: 'wishlist_must_have_null_purchased_at' });
      }
    } else {
      if (props.status == null || !GAME_STATUSES.includes(props.status)) {
        return err({ kind: 'kind_invalid_state', reason: 'owned_must_have_status' });
      }
      if (props.hoursPlayed == null) {
        return err({ kind: 'kind_invalid_state', reason: 'owned_must_have_hours_played' });
      }
    }

    let releaseYear: ReleaseYear | null = null;
    if (props.releaseYear != null) {
      const releaseYearResult = ReleaseYear.create(props.releaseYear);
      if (!releaseYearResult.ok) {
        return releaseYearResult;
      }
      releaseYear = releaseYearResult.value;
    }

    let hoursPlayed: HoursPlayed | null = null;
    if (props.hoursPlayed != null) {
      const hoursPlayedResult = HoursPlayed.create(props.hoursPlayed);
      if (!hoursPlayedResult.ok) {
        return hoursPlayedResult;
      }
      hoursPlayed = hoursPlayedResult.value;
    }

    let price: Price | null = null;
    if (props.price != null) {
      const priceResult = Price.create(props.price);
      if (!priceResult.ok) {
        return priceResult;
      }
      price = priceResult.value;
    }

    let purchasedAt: PurchasedAt | null = null;
    if (props.purchasedAt != null) {
      const purchasedAtResult = PurchasedAt.create(props.purchasedAt);
      if (!purchasedAtResult.ok) {
        return purchasedAtResult;
      }
      purchasedAt = purchasedAtResult.value;
    }

    const developer = props.developer?.trim() || null;
    const genre = props.genre.trim();
    const edition = props.edition?.trim() || undefined;
    const coverColor = props.coverColor?.trim() || undefined;
    const coverImage = props.coverImage?.trim() || undefined;
    const externalId = idGenerator();

    const notes = props.notes?.trim() || null;

    return ok(
      new NewGame(
        externalId,
        props.kind,
        props.userId.trim(),
        trimmedTitle,
        developer,
        genre,
        releaseYear,
        trimmedPlatform,
        edition,
        hoursPlayed,
        props.status,
        props.format,
        coverColor,
        coverImage,
        price,
        purchasedAt,
        notes,
      ),
    );
  }

  get kind(): GameKind {
    return this._kind;
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
  get developer(): string | null {
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
  get hoursPlayed(): HoursPlayed | null {
    return this._hoursPlayed;
  }
  get status(): GameStatus | null {
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
  get price(): Price | null {
    return this._price;
  }
  get purchasedAt(): PurchasedAt | null {
    return this._purchasedAt;
  }
  get notes(): string | null {
    return this._notes;
  }
}

export type GameUpdate = NewGame;

export class Game {
  private constructor(
    private readonly _id: number,
    private readonly _externalId: string,
    private readonly _kind: GameKind,
    private readonly _userId: string,
    private readonly _title: string,
    private readonly _developer: string | null,
    private readonly _genre: string,
    private readonly _releaseYear: ReleaseYear | null,
    private readonly _platform: GamePlatform,
    private readonly _edition: string | undefined,
    private readonly _hoursPlayed: HoursPlayed | null,
    private readonly _status: GameStatus | null,
    private readonly _format: GameFormat,
    private readonly _coverColor: string | undefined,
    private readonly _coverImage: string | undefined,
    private readonly _price: Price | null,
    private readonly _purchasedAt: PurchasedAt | null,
    private readonly _notes: string | null,
  ) {}

  static fromPersistence(row: {
    id: number;
    externalId: string;
    kind: GameKind;
    userId: string;
    title: string;
    developer: string | null;
    genre: string;
    releaseYear: number | null;
    platform: GamePlatform;
    edition: string | null;
    hoursPlayed: number | null;
    status: GameStatus | null;
    format: GameFormat;
    coverColor?: string | null;
    coverImage?: string | null;
    price?: number | null;
    purchasedAt?: string | null;
    notes?: string | null;
  }): Game {
    if (!row.externalId) {
      throw new Error(`Game row ${row.id} has null externalId — run backfill first`);
    }
    return new Game(
      row.id,
      row.externalId,
      row.kind,
      row.userId,
      row.title,
      row.developer ?? null,
      row.genre,
      row.releaseYear != null ? ReleaseYear.fromTrusted(row.releaseYear) : null,
      row.platform,
      row.edition ?? undefined,
      row.hoursPlayed != null ? HoursPlayed.fromTrusted(row.hoursPlayed) : null,
      row.status ?? null,
      row.format,
      row.coverColor ?? undefined,
      row.coverImage ?? undefined,
      row.price != null ? Price.fromTrusted(row.price) : null,
      row.purchasedAt != null ? PurchasedAt.fromTrusted(row.purchasedAt) : null,
      row.notes ?? null,
    );
  }

  get id() {
    return this._id;
  }
  get externalId(): string {
    return this._externalId;
  }
  get kind(): GameKind {
    return this._kind;
  }
  get userId() {
    return this._userId;
  }
  get title() {
    return this._title;
  }
  get developer(): string | null {
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
  get hoursPlayed(): HoursPlayed | null {
    return this._hoursPlayed;
  }
  get status(): GameStatus | null {
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
  get price(): Price | null {
    return this._price;
  }
  get purchasedAt(): PurchasedAt | null {
    return this._purchasedAt;
  }
  get notes(): string | null {
    return this._notes;
  }

  toJSON() {
    return {
      id: this._id,
      externalId: this._externalId,
      kind: this._kind,
      userId: this._userId,
      title: this._title,
      developer: this._developer,
      genre: this._genre,
      releaseYear: this._releaseYear?.value ?? null,
      platform: this._platform,
      edition: this._edition,
      hoursPlayed: this._hoursPlayed?.value ?? null,
      status: this._status,
      format: this._format,
      coverColor: this._coverColor,
      coverImage: this._coverImage ?? null,
      price: this._price?.value ?? null,
      purchasedAt: this._purchasedAt?.value ?? null,
      notes: this._notes,
    };
  }
}
