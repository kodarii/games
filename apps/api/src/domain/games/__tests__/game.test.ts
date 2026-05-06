import { describe, expect, it } from 'bun:test';
import {
  Game,
  type GameProps,
  HoursPlayed,
  NewGame,
  Price,
  PurchasedAt,
  ReleaseYear,
} from '../game';

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

import type { GameFormat, GameKind, GamePlatform, GameStatus } from '../game';

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
    const json = game.toJSON();
    expect(json).toEqual({
      id: 1,
      externalId: 'test-uuid-1',
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
      coverColor: undefined,
      coverImage: null,
      price: null,
      purchasedAt: null,
      notes: null,
    });
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
    expect(game.toJSON().releaseYear).toBeNull();
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
    const json = game.toJSON();
    expect(json.kind).toBe('wishlist');
    expect(json.status).toBeNull();
    expect(json.hoursPlayed).toBeNull();
    expect(json.developer).toBeNull();
  });
});

describe('Game.toJSON serialization', () => {
  it('serializes releaseYear and hoursPlayed as numbers', () => {
    const game = Game.fromPersistence(validRow);
    const json = game.toJSON();
    expect(typeof json.releaseYear).toBe('number');
    expect(typeof json.hoursPlayed).toBe('number');
    expect(JSON.parse(JSON.stringify(game))).toEqual(json);
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
    const json = game.toJSON();
    expect(json.price).toBeNull();
    expect(json.purchasedAt).toBeNull();
  });

  it('maps non-null price and purchasedAt', () => {
    const row = { ...validRow, price: 12999, purchasedAt: '2024-06-15' };
    const game = Game.fromPersistence(row);
    const json = game.toJSON();
    expect(json.price).toBe(12999);
    expect(json.purchasedAt).toBe('2024-06-15');
  });
});
