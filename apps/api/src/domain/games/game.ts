import { ok } from '../shared/result';
import type { Result } from '../shared/result';
import { CoverImageUrl, type CoverImageUrlError, type IsCoverHostAllowed } from './cover-image-url';
import { ExternalMetadataRef } from './external-metadata-ref';
import { GameUpdate } from './game-update';
import {
  type GameFormat,
  type GameKind,
  type GamePlatform,
  type GameStatus,
  type GameValidationError,
  HoursPlayed,
  Price,
  PurchasedAt,
  ReleaseYear,
} from './game-value-objects';

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
    private readonly _updatedAt: Date,
    private readonly _metadataRef: ExternalMetadataRef | null,
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
    metadataProvider?: string | null;
    metadataProviderId?: string | null;
    metadataMatchedAt?: string | null;
    updatedAt?: Date | null;
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
      row.updatedAt ?? new Date(0),
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
  get updatedAt(): Date {
    return this._updatedAt;
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
    opts: { isCoverHostAllowed: IsCoverHostAllowed },
  ): Result<Game, GameValidationError | CoverImageUrlError> {
    let nextCoverImage = this._coverImage;
    if (snapshot.coverImageUrl !== null) {
      const coverResult = CoverImageUrl.create(snapshot.coverImageUrl, {
        isHostAllowed: opts.isCoverHostAllowed,
      });
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
        this._updatedAt,
        ref,
      ),
    );
  }

  /**
   * Transition this wishlist game into an owned one. Returns a `GameUpdate`
   * carrying the new state (`kind='owned'`, `status='Backlog'`,
   * `hoursPlayed=0`, `purchasedAt=null`); the repository persists it.
   * Throws if the aggregate is already owned — moving an already-owned game
   * is a programmer error, not a domain validation failure.
   */
  moveToCollection(): GameUpdate {
    if (this._kind === 'owned') {
      throw new Error(`Game ${this._externalId} is already owned`);
    }
    return GameUpdate.fromTrusted({
      kind: 'owned',
      userId: this._userId,
      title: this._title,
      developer: this._developer,
      genre: this._genre,
      releaseYear: this._releaseYear,
      platform: this._platform,
      edition: this._edition,
      hoursPlayed: HoursPlayed.fromTrusted(0),
      status: 'Backlog',
      format: this._format,
      coverColor: this._coverColor,
      coverImage: this._coverImage,
      price: this._price,
      purchasedAt: null,
      notes: this._notes,
    });
  }
}
