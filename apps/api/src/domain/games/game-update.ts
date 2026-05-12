import { ok } from '../shared/result';
import type { Result } from '../shared/result';
import {
  GameInvariants,
  type GameInvariantsInput,
  type ValidatedGameProps,
} from './game-invariants';
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
 * Input contract for `GameUpdate.create`. Identical to the invariants input
 * (no `externalId`, no `metadataRef` — both are immutable post-creation).
 */
export type GameUpdateProps = GameInvariantsInput;

export class GameUpdate {
  constructor(private readonly props: ValidatedGameProps) {}

  static create(props: GameUpdateProps): Result<GameUpdate, GameValidationError> {
    const validated = GameInvariants.validate(props);
    if (!validated.ok) return validated;
    return ok(new GameUpdate(validated.value));
  }

  /**
   * Trusted constructor used by domain transitions (e.g. `Game.moveToCollection`)
   * where the source data has already been validated. Do NOT call from
   * application/infrastructure code with user input.
   */
  static fromTrusted(props: ValidatedGameProps): GameUpdate {
    return new GameUpdate(props);
  }

  get kind(): GameKind {
    return this.props.kind;
  }
  get userId() {
    return this.props.userId;
  }
  get title() {
    return this.props.title;
  }
  get developer(): string | null {
    return this.props.developer;
  }
  get genre() {
    return this.props.genre;
  }
  get releaseYear(): ReleaseYear | null {
    return this.props.releaseYear;
  }
  get platform(): GamePlatform {
    return this.props.platform;
  }
  get edition(): string | undefined {
    return this.props.edition;
  }
  get hoursPlayed(): HoursPlayed | null {
    return this.props.hoursPlayed;
  }
  get status(): GameStatus | null {
    return this.props.status;
  }
  get format(): GameFormat {
    return this.props.format;
  }
  get coverColor(): string | undefined {
    return this.props.coverColor;
  }
  get coverImage(): string | undefined {
    return this.props.coverImage;
  }
  get price(): Price | null {
    return this.props.price;
  }
  get purchasedAt(): PurchasedAt | null {
    return this.props.purchasedAt;
  }
  get notes(): string | null {
    return this.props.notes;
  }
}
