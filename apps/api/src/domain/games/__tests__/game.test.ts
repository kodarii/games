import { describe, expect, it } from 'bun:test';
import { Game, type GameProps, HoursPlayed, NewGame, ReleaseYear } from '../game';

const validRow = {
  id: 1,
  externalId: 'test-uuid-1',
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

import type { GameFormat, GamePlatform, GameStatus } from '../game';

describe('NewGame.create', () => {
  it('happy path', () => {
    const result = NewGame.create(validProps());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.title).toBe('Elden Ring');
      expect(result.value.releaseYear?.value).toBe(2022);
      expect(result.value.hoursPlayed.value).toBe(120);
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

  it('returns error for empty developer', () => {
    const result = NewGame.create({ ...validProps(), developer: '' });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe('developer_empty');
    }
  });

  it('returns error for empty platform', () => {
    const result = NewGame.create({ ...validProps(), platform: '' });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe('platform_invalid');
    }
  });

  it('returns error for invalid status', () => {
    const invalidStatus = 'Pending' as unknown as GameStatus;
    const result = NewGame.create({ ...validProps(), status: invalidStatus });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe('status_invalid');
      const e = result.error as { kind: string; value: string };
      expect(e.value).toBe('Pending');
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
});

describe('Game.fromPersistence', () => {
  it('restores from valid row', () => {
    const game = Game.fromPersistence(validRow);
    expect(game.id).toBe(1);
    const json = game.toJSON();
    expect(json).toEqual({
      id: 1,
      externalId: 'test-uuid-1',
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
