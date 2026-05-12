import type { Game, GameFormat, GameKind, GamePlatform, GameStatus } from '../types';
import type { UpdateGameInput } from './api';
import { coverColorFor } from './avatar';
import { groszeToZl, zlToGrosze } from './money';

/**
 * Form-level representation of a {@link Game}: every editable field is a
 * string (so inputs can be controlled trivially) plus a small number of
 * structured fields (`coverImage`, `status`, `format`) whose shape is
 * dictated by the backend contract.
 *
 * This type is intentionally flat — it mirrors what the user sees on the
 * edit form, not the domain shape.
 */
export interface GameDraft {
  title: string;
  developer: string;
  genre: string;
  releaseYear: string;
  platform: string;
  edition: string;
  hoursPlayed: string;
  status: GameStatus | null;
  format: GameFormat;
  coverColor: string;
  coverImage: string | null;
  priceZl: string;
  purchasedAt: string;
  notes: string;
}

export function gameToDraft(game: Game): GameDraft {
  return {
    title: game.title,
    developer: game.developer ?? '',
    genre: game.genre,
    releaseYear: game.releaseYear != null ? String(game.releaseYear) : '',
    platform: game.platform,
    edition: game.edition ?? '',
    hoursPlayed: game.hoursPlayed != null ? String(game.hoursPlayed) : '',
    status: game.status,
    format: game.format,
    coverColor: coverColorFor(game),
    coverImage: game.coverImage ?? null,
    priceZl: game.price != null ? groszeToZl(game.price) : '',
    purchasedAt: game.purchasedAt ?? '',
    notes: game.notes ?? '',
  };
}

export interface DraftToPayloadOptions {
  kind: GameKind;
}

/**
 * Builds the wire payload sent to `PUT /api/games/:id`. Decisions:
 * - Strings are trimmed at the boundary; empty optional strings become
 *   `undefined`.
 * - Empty numeric strings (`releaseYear`, `hoursPlayed`) collapse — release
 *   year becomes `undefined` (omit), hours played defaults to `0` for owned
 *   games (matches existing UX where blank counts as zero).
 * - Empty `priceZl`, `purchasedAt`, `notes` map to `null` so the backend
 *   clears the previous value rather than silently keeping it.
 * - Wishlist games omit `hoursPlayed`, `status`, and `purchasedAt` entirely.
 */
export function draftToPayload(draft: GameDraft, opts: DraftToPayloadOptions): UpdateGameInput {
  const isWishlist = opts.kind === 'wishlist';
  const trimmedDeveloper = draft.developer.trim();
  const trimmedEdition = draft.edition.trim();
  const trimmedPrice = draft.priceZl.trim();
  const trimmedNotes = draft.notes.trim();

  return {
    kind: opts.kind,
    title: draft.title.trim(),
    developer: trimmedDeveloper.length > 0 ? trimmedDeveloper : undefined,
    genre: draft.genre.trim(),
    releaseYear: draft.releaseYear ? Number(draft.releaseYear) : undefined,
    platform: draft.platform as GamePlatform,
    edition: trimmedEdition.length > 0 ? trimmedEdition : undefined,
    hoursPlayed: isWishlist ? undefined : Number(draft.hoursPlayed) || 0,
    status: isWishlist ? undefined : (draft.status ?? undefined),
    format: draft.format,
    coverColor: draft.coverColor,
    coverImage: draft.coverImage,
    price: trimmedPrice.length > 0 ? (zlToGrosze(trimmedPrice) ?? null) : null,
    purchasedAt: isWishlist ? undefined : draft.purchasedAt || null,
    notes: trimmedNotes.length > 0 ? trimmedNotes : null,
  };
}

export type DraftErrors = Partial<Record<keyof GameDraft, string>>;

export function validateDraft(draft: GameDraft): DraftErrors {
  const errors: DraftErrors = {};
  if (!draft.title.trim()) errors.title = 'Title is required';
  if (!draft.platform) errors.platform = 'Platform is required';
  return errors;
}
