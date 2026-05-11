import { err, ok } from '../shared/result';
import type { Result } from '../shared/result';
import { CoverImageUrl, type CoverImageUrlError } from './cover-image-url';
import { ExternalMetadataRef } from './external-metadata-ref';

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
  metadataRef?: { providerName: 'igdb'; providerId: string };
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
    private readonly _metadataRef: ExternalMetadataRef | null = null,
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

    let metadataRef: ExternalMetadataRef | null = null;
    if (props.metadataRef != null) {
      const refResult = ExternalMetadataRef.create({
        providerName: props.metadataRef.providerName,
        providerId: props.metadataRef.providerId,
        matchedAt: new Date(),
      });
      if (!refResult.ok) {
        return err({ kind: 'kind_invalid_state', reason: 'metadata_ref_invalid' });
      }
      metadataRef = refResult.value;
    }

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
        metadataRef,
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
  get metadataRef(): ExternalMetadataRef | null {
    return this._metadataRef;
  }
}

export class GameUpdate {
  private constructor(
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

  private static _build(
    kind: GameKind,
    userId: string,
    title: string,
    developer: string | null,
    genre: string,
    releaseYear: ReleaseYear | null,
    platform: GamePlatform,
    edition: string | undefined,
    hoursPlayed: HoursPlayed | null,
    status: GameStatus | null,
    format: GameFormat,
    coverColor: string | undefined,
    coverImage: string | undefined,
    price: Price | null,
    purchasedAt: PurchasedAt | null,
    notes: string | null,
  ): GameUpdate {
    return new GameUpdate(
      kind,
      userId,
      title,
      developer,
      genre,
      releaseYear,
      platform,
      edition,
      hoursPlayed,
      status,
      format,
      coverColor,
      coverImage,
      price,
      purchasedAt,
      notes,
    );
  }

  static create(props: GameProps): Result<GameUpdate, GameValidationError> {
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
      if (!releaseYearResult.ok) return releaseYearResult;
      releaseYear = releaseYearResult.value;
    }

    let hoursPlayed: HoursPlayed | null = null;
    if (props.hoursPlayed != null) {
      const hoursPlayedResult = HoursPlayed.create(props.hoursPlayed);
      if (!hoursPlayedResult.ok) return hoursPlayedResult;
      hoursPlayed = hoursPlayedResult.value;
    }

    let price: Price | null = null;
    if (props.price != null) {
      const priceResult = Price.create(props.price);
      if (!priceResult.ok) return priceResult;
      price = priceResult.value;
    }

    let purchasedAt: PurchasedAt | null = null;
    if (props.purchasedAt != null) {
      const purchasedAtResult = PurchasedAt.create(props.purchasedAt);
      if (!purchasedAtResult.ok) return purchasedAtResult;
      purchasedAt = purchasedAtResult.value;
    }

    const developer = props.developer?.trim() || null;
    const genre = props.genre.trim();
    const edition = props.edition?.trim() || undefined;
    const coverColor = props.coverColor?.trim() || undefined;
    const coverImage = props.coverImage?.trim() || undefined;
    const notes = props.notes?.trim() || null;

    return ok(
      GameUpdate._build(
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

  static fromGame(game: Game): GameUpdate {
    return GameUpdate._build(
      game.kind,
      game.userId,
      game.title,
      game.developer,
      game.genre,
      game.releaseYear,
      game.platform,
      game.edition,
      game.hoursPlayed,
      game.status,
      game.format,
      game.coverColor,
      game.coverImage,
      game.price,
      game.purchasedAt,
      game.notes,
    );
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
}

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
    private readonly _metadataRef: ExternalMetadataRef | null = null,
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
    metadataProvider?: 'igdb' | null;
    metadataProviderId?: string | null;
    metadataMatchedAt?: string | null;
  }): Game {
    if (!row.externalId) {
      throw new Error(`Game row ${row.id} has null externalId — run backfill first`);
    }
    const metadataRef =
      row.metadataProvider != null &&
      row.metadataProviderId != null &&
      row.metadataMatchedAt != null
        ? ExternalMetadataRef.fromTrusted({
            providerName: row.metadataProvider,
            providerId: row.metadataProviderId,
            matchedAt: new Date(row.metadataMatchedAt),
          })
        : null;
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
      metadataRef,
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
  get metadataRef(): ExternalMetadataRef | null {
    return this._metadataRef;
  }

  applyMetadata(
    snapshot: {
      coverImageUrl: string | null;
      releaseYear: number | null;
      developer: string | null;
    },
    ref: ExternalMetadataRef,
  ): Result<Game, GameValidationError | CoverImageUrlError> {
    let nextCoverImage = this._coverImage;
    if (snapshot.coverImageUrl !== null) {
      const coverResult = CoverImageUrl.create(snapshot.coverImageUrl);
      if (!coverResult.ok) return coverResult;
      nextCoverImage = coverResult.value.value;
    }

    let nextReleaseYear = this._releaseYear;
    if (snapshot.releaseYear !== null) {
      const releaseYearResult = ReleaseYear.create(snapshot.releaseYear);
      if (!releaseYearResult.ok) return releaseYearResult;
      nextReleaseYear = releaseYearResult.value;
    }

    const nextDeveloper = snapshot.developer ?? this._developer;

    return ok(
      new Game(
        this._id,
        this._externalId,
        this._kind,
        this._userId,
        this._title,
        nextDeveloper,
        this._genre,
        nextReleaseYear,
        this._platform,
        this._edition,
        this._hoursPlayed,
        this._status,
        this._format,
        this._coverColor,
        nextCoverImage,
        this._price,
        this._purchasedAt,
        this._notes,
        ref,
      ),
    );
  }

  toOwned(): Game {
    return Game.fromPersistence({
      id: this._id,
      externalId: this._externalId,
      kind: 'owned',
      userId: this._userId,
      title: this._title,
      developer: this._developer,
      genre: this._genre,
      releaseYear: this._releaseYear?.value ?? null,
      platform: this._platform,
      edition: this._edition ?? null,
      hoursPlayed: 0,
      status: 'Backlog',
      format: this._format,
      coverColor: this._coverColor ?? null,
      coverImage: this._coverImage ?? null,
      price: this._price?.value ?? null,
      purchasedAt: null,
      notes: this._notes,
      metadataProvider: this._metadataRef?.providerName ?? null,
      metadataProviderId: this._metadataRef?.providerId ?? null,
      metadataMatchedAt: this._metadataRef?.matchedAt.toISOString() ?? null,
    });
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
      metadataRef: this._metadataRef
        ? {
            providerName: this._metadataRef.providerName,
            providerId: this._metadataRef.providerId,
            matchedAt: this._metadataRef.matchedAt.toISOString(),
          }
        : null,
    };
  }
}
