import { describe, expect, it } from 'bun:test';
import { Game } from '../game';
import { GameUpdate } from '../game-update';
import { HoursPlayed, Price, PurchasedAt, ReleaseYear } from '../game-value-objects';
import { NewGame, type NewGameProps } from '../new-game';

type GameProps = NewGameProps;

const validRow = {
  id: 1,
  externalId: 'test-uuid-1',
  kind: 'owned' as const,
  userId: 'user-123',
  title: 'Elden Ring',
  developer: 'FromSoftware',
  genre: 'ARPG',
  releaseYear: 2022,
  platform: 'PS5' as const,
  edition: 'Standard',
  hoursPlayed: 120,
  status: 'Completed' as const,
  format: 'digital' as const,
};

const validProps = (): GameProps => ({
  kind: 'owned',
  userId: 'user-123',
  title: 'Elden Ring',
  developer: 'FromSoftware',
  genre: 'ARPG',
  releaseYear: 2022,
  platform: 'PS5',
  edition: 'Standard',
  hoursPlayed: 120,
  status: 'Completed',
  format: 'digital',
});

const wishlistProps = (): GameProps => ({
  kind: 'wishlist',
  userId: 'user-123',
  title: 'Hollow Knight: Silksong',
  developer: 'Team Cherry',
  genre: 'Metroidvania',
  platform: 'PC',
  status: null,
  hoursPlayed: null,
  format: 'digital',
});

describe('ReleaseYear', () => {
  it('creates valid year 2022', () => {
    const result = ReleaseYear.create(2022);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.value).toBe(2022);
    }
  });

  it('returns error for year 1969', () => {
    const result = ReleaseYear.create(1969);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe('release_year_out_of_range');
      const e = result.error as { kind: string; value: number };
      expect(e.value).toBe(1969);
    }
  });

  it('returns error for year 2101', () => {
    const result = ReleaseYear.create(2101);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe('release_year_out_of_range');
    }
  });

  it('creates valid boundary year 1970', () => {
    const result = ReleaseYear.create(1970);
    expect(result.ok).toBe(true);
  });

  it('creates valid boundary year 2100', () => {
    const result = ReleaseYear.create(2100);
    expect(result.ok).toBe(true);
  });
});

describe('HoursPlayed', () => {
  it('creates hoursPlayed 0', () => {
    const result = HoursPlayed.create(0);
    expect(result.ok).toBe(true);
  });

  it('creates hoursPlayed 120', () => {
    const result = HoursPlayed.create(120);
    expect(result.ok).toBe(true);
  });

  it('returns error for negative hoursPlayed', () => {
    const result = HoursPlayed.create(-1);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe('hours_played_negative');
      const e = result.error as { kind: string; value: number };
      expect(e.value).toBe(-1);
    }
  });
});

import type { GameFormat, GameKind, GamePlatform, GameStatus } from '../game-value-objects';

describe('NewGame.create', () => {
  it('happy path', () => {
    const result = NewGame.create(validProps());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.kind).toBe('owned');
      expect(result.value.title).toBe('Elden Ring');
      expect(result.value.releaseYear?.value).toBe(2022);
      expect(result.value.hoursPlayed?.value).toBe(120);
    }
  });

  it('returns error for empty title', () => {
    const result = NewGame.create({ ...validProps(), title: '' });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe('title_empty');
    }
  });

  it('returns error for whitespace title', () => {
    const result = NewGame.create({ ...validProps(), title: '   ' });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe('title_empty');
    }
  });

  it('normalizes empty developer to null', () => {
    const result = NewGame.create({ ...validProps(), developer: '' });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.developer).toBeNull();
    }
  });

  it('returns error for empty platform', () => {
    const result = NewGame.create({ ...validProps(), platform: '' });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe('platform_invalid');
    }
  });

  it('returns error for invalid status on owned game', () => {
    const invalidStatus = 'Pending' as unknown as GameStatus;
    const result = NewGame.create({ ...validProps(), status: invalidStatus });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe('kind_invalid_state');
      const e = result.error as { kind: string; reason: string };
      expect(e.reason).toBe('owned_must_have_status');
    }
  });

  it('accepts format physical', () => {
    const result = NewGame.create({ ...validProps(), format: 'physical' });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.format).toBe('physical');
    }
  });

  it('accepts format digital', () => {
    const result = NewGame.create({ ...validProps(), format: 'digital' });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.format).toBe('digital');
    }
  });

  it('returns error for invalid format', () => {
    const invalidFormat = 'cartridge' as unknown as GameFormat;
    const result = NewGame.create({ ...validProps(), format: invalidFormat });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe('format_invalid');
      const e = result.error as { kind: string; value: string };
      expect(e.value).toBe('cartridge');
    }
  });

  it('returns error for invalid releaseYear', () => {
    const result = NewGame.create({ ...validProps(), releaseYear: 1900 });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe('release_year_out_of_range');
    }
  });

  it('returns error for negative hoursPlayed', () => {
    const result = NewGame.create({ ...validProps(), hoursPlayed: -5 });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe('hours_played_negative');
    }
  });

  it('creates with undefined edition', () => {
    const { edition: _edition, ...propsWithoutEdition } = validProps();
    const result = NewGame.create(propsWithoutEdition as GameProps);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.edition).toBeUndefined();
    }
  });

  it('returns error when userId is missing', () => {
    const { userId: _userId, ...propsWithoutUserId } = validProps();
    const result = NewGame.create(propsWithoutUserId as GameProps);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe('missing_user_id');
    }
  });

  it('returns error when userId is empty string', () => {
    const result = NewGame.create({ ...validProps(), userId: '' });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe('missing_user_id');
    }
  });

  it('creates NewGame without releaseYear', () => {
    const props = { ...validProps(), releaseYear: undefined };
    const result = NewGame.create(props);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.releaseYear).toBeNull();
    }
  });

  it('exposes userId on created NewGame', () => {
    const result = NewGame.create(validProps());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.userId).toBe('user-123');
    }
  });

  // kind invariant tests
  it('creates owned game with Backlog status', () => {
    const result = NewGame.create({ ...validProps(), status: 'Backlog', hoursPlayed: 0 });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.kind).toBe('owned');
    }
  });

  it('creates wishlist game with null status and hoursPlayed', () => {
    const result = NewGame.create(wishlistProps());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.kind).toBe('wishlist');
      expect(result.value.status).toBeNull();
      expect(result.value.hoursPlayed).toBeNull();
    }
  });

  it('rejects wishlist with non-null status', () => {
    const result = NewGame.create({ ...wishlistProps(), status: 'Backlog' as any });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe('kind_invalid_state');
      const e = result.error as { kind: string; reason: string };
      expect(e.reason).toBe('wishlist_must_have_null_status');
    }
  });

  it('rejects wishlist with non-null hoursPlayed', () => {
    const result = NewGame.create({ ...wishlistProps(), hoursPlayed: 5 as any });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe('kind_invalid_state');
      const e = result.error as { kind: string; reason: string };
      expect(e.reason).toBe('wishlist_must_have_null_hours_played');
    }
  });

  it('rejects wishlist with non-null purchasedAt', () => {
    const result = NewGame.create({ ...wishlistProps(), purchasedAt: '2024-01-01' });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe('kind_invalid_state');
      const e = result.error as { kind: string; reason: string };
      expect(e.reason).toBe('wishlist_must_have_null_purchased_at');
    }
  });

  it('rejects owned with null status', () => {
    const result = NewGame.create({ ...validProps(), status: undefined as any });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe('kind_invalid_state');
      const e = result.error as { kind: string; reason: string };
      expect(e.reason).toBe('owned_must_have_status');
    }
  });

  it('rejects owned with null hoursPlayed', () => {
    const result = NewGame.create({ ...validProps(), hoursPlayed: null as any });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe('kind_invalid_state');
      const e = result.error as { kind: string; reason: string };
      expect(e.reason).toBe('owned_must_have_hours_played');
    }
  });

  it('allows null developer on owned game', () => {
    const result = NewGame.create({ ...validProps(), developer: null as any });
    expect(result.ok).toBe(true);
  });

  it('allows null developer on wishlist game', () => {
    const result = NewGame.create({ ...wishlistProps(), developer: null as any });
    expect(result.ok).toBe(true);
  });
});

describe('Game.fromPersistence', () => {
  it('restores from valid row', () => {
    const game = Game.fromPersistence(validRow);
    expect(game.id).toBe(1);
    expect(game.externalId).toBe('test-uuid-1');
    expect(game.kind).toBe('owned');
    expect(game.userId).toBe('user-123');
    expect(game.title).toBe('Elden Ring');
    expect(game.developer).toBe('FromSoftware');
    expect(game.genre).toBe('ARPG');
    expect(game.releaseYear?.value).toBe(2022);
    expect(game.platform).toBe('PS5');
    expect(game.edition).toBe('Standard');
    expect(game.hoursPlayed?.value).toBe(120);
    expect(game.status).toBe('Completed');
    expect(game.format).toBe('digital');
    expect(game.coverColor).toBeUndefined();
    expect(game.coverImage).toBeUndefined();
    expect(game.price).toBeNull();
    expect(game.purchasedAt).toBeNull();
    expect(game.notes).toBeNull();
    expect(game.metadataRef).toBeNull();
    expect(game.updatedAt).toBeInstanceOf(Date);
  });

  it('maps null edition to undefined', () => {
    const rowWithNullEdition = { ...validRow, edition: null };
    const game = Game.fromPersistence(rowWithNullEdition);
    expect(game.edition).toBeUndefined();
  });

  it('creates Game from persistence with null releaseYear', () => {
    const row = { ...validRow, releaseYear: null };
    const game = Game.fromPersistence(row);
    expect(game.releaseYear).toBeNull();
  });

  it('exposes userId from persistence row', () => {
    const game = Game.fromPersistence(validRow);
    expect(game.userId).toBe('user-123');
  });

  it('restores wishlist row with null status, hoursPlayed, developer', () => {
    const row = {
      ...validRow,
      kind: 'wishlist' as const,
      status: null,
      hoursPlayed: null,
      developer: null,
    };
    const game = Game.fromPersistence(row);
    expect(game.kind).toBe('wishlist');
    expect(game.status).toBeNull();
    expect(game.hoursPlayed).toBeNull();
    expect(game.developer).toBeNull();
  });
});

describe('Price', () => {
  it('creates valid price 12999 grosze', () => {
    const result = Price.create(12999);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.value).toBe(12999);
    }
  });

  it('creates valid price 0 (free game)', () => {
    const result = Price.create(0);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.value).toBe(0);
    }
  });

  it('returns error for negative price', () => {
    const result = Price.create(-1);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe('price_negative');
      const e = result.error as { kind: string; value: number };
      expect(e.value).toBe(-1);
    }
  });

  it('returns error for too large price', () => {
    const result = Price.create(100_000_000);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe('price_too_large');
      const e = result.error as { kind: string; value: number };
      expect(e.value).toBe(100_000_000);
    }
  });

  it('returns error for non-integer price', () => {
    const result = Price.create(12.5);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe('price_not_integer');
      const e = result.error as { kind: string; value: number };
      expect(e.value).toBe(12.5);
    }
  });
});

describe('PurchasedAt', () => {
  it('creates valid past date', () => {
    const result = PurchasedAt.create('2024-06-15', '2026-05-03');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.value).toBe('2024-06-15');
    }
  });

  it('returns error for slash format', () => {
    const result = PurchasedAt.create('2024/06/15', '2026-05-03');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe('purchased_at_invalid_format');
      const e = result.error as { kind: string; value: string };
      expect(e.value).toBe('2024/06/15');
    }
  });

  it('returns error for short format', () => {
    const result = PurchasedAt.create('24-6-15', '2026-05-03');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe('purchased_at_invalid_format');
    }
  });

  it('returns error for non-existent date', () => {
    const result = PurchasedAt.create('2026-02-30', '2026-05-03');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe('purchased_at_invalid_date');
      const e = result.error as { kind: string; value: string };
      expect(e.value).toBe('2026-02-30');
    }
  });

  it('accepts today (raw === today)', () => {
    const result = PurchasedAt.create('2026-05-03', '2026-05-03');
    expect(result.ok).toBe(true);
  });

  it('returns error for date one day in future', () => {
    const result = PurchasedAt.create('2026-05-04', '2026-05-03');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe('purchased_at_in_future');
    }
  });
});

describe('NewGame.create with price and purchasedAt', () => {
  it('accepts both price and purchasedAt', () => {
    const result = NewGame.create({
      ...validProps(),
      price: 5999,
      purchasedAt: '2024-01-01',
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.price?.value).toBe(5999);
      expect(result.value.purchasedAt?.value).toBe('2024-01-01');
    }
  });

  it('defaults to null when fields not provided', () => {
    const result = NewGame.create(validProps());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.price).toBeNull();
      expect(result.value.purchasedAt).toBeNull();
    }
  });

  it('returns error for negative price', () => {
    const result = NewGame.create({ ...validProps(), price: -1 });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe('price_negative');
    }
  });

  it('returns error for purchasedAt in the future', () => {
    const result = NewGame.create({ ...validProps(), purchasedAt: '2099-01-01' });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe('purchased_at_in_future');
    }
  });
});

describe('Game.fromPersistence with price and purchasedAt', () => {
  it('maps null price and purchasedAt', () => {
    const row = { ...validRow, price: null, purchasedAt: null };
    const game = Game.fromPersistence(row);
    expect(game.price).toBeNull();
    expect(game.purchasedAt).toBeNull();
  });

  it('maps non-null price and purchasedAt', () => {
    const row = { ...validRow, price: 12999, purchasedAt: '2024-06-15' };
    const game = Game.fromPersistence(row);
    expect(game.price?.value).toBe(12999);
    expect(game.purchasedAt?.value).toBe('2024-06-15');
  });
});

describe('GameUpdate.create', () => {
  it('happy path — owned game, no externalId', () => {
    const result = GameUpdate.create(validProps());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.kind).toBe('owned');
      expect(result.value.title).toBe('Elden Ring');
      // @ts-expect-error externalId must not exist on GameUpdate
      expect(result.value.externalId).toBeUndefined();
    }
  });

  it('returns error for empty title', () => {
    const result = GameUpdate.create({ ...validProps(), title: '' });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe('title_empty');
    }
  });

  it('returns error for empty platform', () => {
    const result = GameUpdate.create({ ...validProps(), platform: '' });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe('platform_invalid');
    }
  });

  it('creates wishlist game', () => {
    const result = GameUpdate.create(wishlistProps());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.kind).toBe('wishlist');
    }
  });

  it('rejects wishlist with non-null status', () => {
    const result = GameUpdate.create({ ...wishlistProps(), status: 'Backlog' as any });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe('kind_invalid_state');
    }
  });
});

describe('Game.moveToCollection', () => {
  it('returns a GameUpdate with kind=owned, status=Backlog, hoursPlayed=0', () => {
    const wishlistRow = {
      ...validRow,
      kind: 'wishlist' as const,
      status: null,
      hoursPlayed: null,
    };
    const wishlistGame = Game.fromPersistence(wishlistRow);
    const update = wishlistGame.moveToCollection();
    expect(update.kind).toBe('owned');
    expect(update.status).toBe('Backlog');
    expect(update.hoursPlayed?.value).toBe(0);
  });

  it('preserves userId, title, developer, genre, platform, format from the source game', () => {
    const wishlistRow = {
      ...validRow,
      kind: 'wishlist' as const,
      status: null,
      hoursPlayed: null,
    };
    const wishlistGame = Game.fromPersistence(wishlistRow);
    const update = wishlistGame.moveToCollection();
    expect(update.userId).toBe(wishlistGame.userId);
    expect(update.title).toBe(wishlistGame.title);
    expect(update.developer).toBe(wishlistGame.developer);
    expect(update.genre).toBe(wishlistGame.genre);
    expect(update.platform).toBe(wishlistGame.platform);
    expect(update.format).toBe(wishlistGame.format);
  });

  it('sets purchasedAt to null', () => {
    const wishlistRow = {
      ...validRow,
      kind: 'wishlist' as const,
      status: null,
      hoursPlayed: null,
    };
    const wishlistGame = Game.fromPersistence(wishlistRow);
    const update = wishlistGame.moveToCollection();
    expect(update.purchasedAt).toBeNull();
  });

  it('throws when called on an already-owned game (programmer error)', () => {
    const ownedGame = Game.fromPersistence(validRow);
    expect(() => ownedGame.moveToCollection()).toThrow(/already owned/);
  });
});
