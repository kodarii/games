import { err, ok } from '../shared/result';
import type { Result } from '../shared/result';
import { ExternalMetadataRef } from './external-metadata-ref';
import { GameInvariants, type GameInvariantsInput } from './game-invariants';
import type {
  GameFormat,
  GameKind,
  GamePlatform,
  GameStatus,
  GameValidationError,
  HoursPlayed,
  Price,
  PurchasedAt,
  ReleaseYear,
} from './game-value-objects';

/**
 * Input contract for `NewGame.create`. `metadataRef` is optional and only
 * meaningful at creation — `GameUpdate` cannot carry it.
 */
export type NewGameProps = GameInvariantsInput & {
  metadataRef?: { providerName: string; providerId: string };
};

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
    private readonly _metadataRef: ExternalMetadataRef | null,
  ) {}

  static create(
    props: NewGameProps,
    idGenerator: () => string = () => crypto.randomUUID(),
  ): Result<NewGame, GameValidationError> {
    const validated = GameInvariants.validate(props);
    if (!validated.ok) return validated;
    const v = validated.value;

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
        idGenerator(),
        v.kind,
        v.userId,
        v.title,
        v.developer,
        v.genre,
        v.releaseYear,
        v.platform,
        v.edition,
        v.hoursPlayed,
        v.status,
        v.format,
        v.coverColor,
        v.coverImage,
        v.price,
        v.purchasedAt,
        v.notes,
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
