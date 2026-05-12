import { err, ok } from '../shared/result';
import type { Result } from '../shared/result';
import {
  GAME_FORMATS,
  GAME_KINDS,
  GAME_STATUSES,
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

/**
 * Raw input accepted by the invariants validator. Both `NewGame.create` and
 * `GameUpdate.create` funnel through this gate. Fields that are exclusive to
 * one side (e.g. `NewGame.metadataRef`) are validated separately by that
 * caller after `GameInvariants.validate` returns `ok`.
 */
export type GameInvariantsInput = {
  kind: GameKind;
  userId: string;
  title: string;
  developer?: string | null;
  genre: string;
  releaseYear?: number;
  platform: GamePlatform;
  edition?: string;
  hoursPlayed: number | null;
  status: GameStatus | null;
  format: GameFormat;
  coverColor?: string;
  coverImage?: string;
  price?: number | null;
  purchasedAt?: string | null;
  notes?: string | null;
};

/**
 * Output of `GameInvariants.validate` — every VO has been constructed via its
 * smart constructor, every string trimmed, every cross-field invariant
 * enforced. Callers wrap this in their own aggregate type.
 */
export type ValidatedGameProps = {
  kind: GameKind;
  userId: string;
  title: string;
  developer: string | null;
  genre: string;
  releaseYear: ReleaseYear | null;
  platform: GamePlatform;
  edition: string | undefined;
  hoursPlayed: HoursPlayed | null;
  status: GameStatus | null;
  format: GameFormat;
  coverColor: string | undefined;
  coverImage: string | undefined;
  price: Price | null;
  purchasedAt: PurchasedAt | null;
  notes: string | null;
};

export const GameInvariants = {
  validate(input: GameInvariantsInput): Result<ValidatedGameProps, GameValidationError> {
    if (!input.userId || !input.userId.trim()) {
      return err({ kind: 'missing_user_id' });
    }

    const trimmedTitle = input.title?.trim() ?? '';
    if (!trimmedTitle) {
      return err({ kind: 'title_empty' });
    }

    if (!GAME_KINDS.includes(input.kind)) {
      return err({ kind: 'kind_invalid_state', reason: 'unknown_kind' });
    }

    const trimmedPlatform = input.platform?.trim() ?? '';
    if (!trimmedPlatform) {
      return err({ kind: 'platform_invalid', value: String(input.platform) });
    }

    if (!GAME_FORMATS.includes(input.format)) {
      return err({ kind: 'format_invalid', value: String(input.format) });
    }

    if (input.kind === 'wishlist') {
      if (input.status != null) {
        return err({ kind: 'kind_invalid_state', reason: 'wishlist_must_have_null_status' });
      }
      if (input.hoursPlayed != null) {
        return err({ kind: 'kind_invalid_state', reason: 'wishlist_must_have_null_hours_played' });
      }
      if (input.purchasedAt != null) {
        return err({ kind: 'kind_invalid_state', reason: 'wishlist_must_have_null_purchased_at' });
      }
    } else {
      if (input.status == null || !GAME_STATUSES.includes(input.status)) {
        return err({ kind: 'kind_invalid_state', reason: 'owned_must_have_status' });
      }
      if (input.hoursPlayed == null) {
        return err({ kind: 'kind_invalid_state', reason: 'owned_must_have_hours_played' });
      }
    }

    let releaseYear: ReleaseYear | null = null;
    if (input.releaseYear != null) {
      const r = ReleaseYear.create(input.releaseYear);
      if (!r.ok) return r;
      releaseYear = r.value;
    }

    let hoursPlayed: HoursPlayed | null = null;
    if (input.hoursPlayed != null) {
      const r = HoursPlayed.create(input.hoursPlayed);
      if (!r.ok) return r;
      hoursPlayed = r.value;
    }

    let price: Price | null = null;
    if (input.price != null) {
      const r = Price.create(input.price);
      if (!r.ok) return r;
      price = r.value;
    }

    let purchasedAt: PurchasedAt | null = null;
    if (input.purchasedAt != null) {
      const r = PurchasedAt.create(input.purchasedAt);
      if (!r.ok) return r;
      purchasedAt = r.value;
    }

    const developer = input.developer?.trim() || null;
    const genre = input.genre.trim();
    const edition = input.edition?.trim() || undefined;
    const coverColor = input.coverColor?.trim() || undefined;
    const coverImage = input.coverImage?.trim() || undefined;
    const notes = input.notes?.trim() || null;

    return ok({
      kind: input.kind,
      userId: input.userId.trim(),
      title: trimmedTitle,
      developer,
      genre,
      releaseYear,
      platform: trimmedPlatform,
      edition,
      hoursPlayed,
      status: input.status,
      format: input.format,
      coverColor,
      coverImage,
      price,
      purchasedAt,
      notes,
    });
  },
};
