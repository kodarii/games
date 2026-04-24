import { describe, expect, it } from 'bun:test';
import { Game, type GameProps, HoursPlayed, NewGame, ReleaseYear } from '../game';

const validRow = {
  id: 1,
  title: 'Elden Ring',
  developer: 'FromSoftware',
  genre: 'ARPG',
  releaseYear: 2022,
  platform: 'PS5' as const,
  edition: 'Standard',
  hoursPlayed: 120,
  status: 'Completed' as const,
};

const validProps = (): GameProps => ({
  title: 'Elden Ring',
  developer: 'FromSoftware',
  genre: 'ARPG',
  releaseYear: 2022,
  platform: 'PS5',
  edition: 'Standard',
  hoursPlayed: 120,
  status: 'Completed',
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

import type { GamePlatform, GameStatus } from '../game';

describe('NewGame.create', () => {
  it('happy path', () => {
    const result = NewGame.create(validProps());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.title).toBe('Elden Ring');
      expect(result.value.releaseYear.value).toBe(2022);
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

  it('returns error for invalid platform', () => {
    const invalidPlatform = 'Atari' as unknown as GamePlatform;
    const result = NewGame.create({ ...validProps(), platform: invalidPlatform });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe('platform_invalid');
      const e = result.error as { kind: string; value: string };
      expect(e.value).toBe('Atari');
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
});

describe('Game.fromPersistence', () => {
  it('restores from valid row', () => {
    const game = Game.fromPersistence(validRow);
    expect(game.id).toBe(1);
    const json = game.toJSON();
    expect(json).toEqual({
      id: 1,
      title: 'Elden Ring',
      developer: 'FromSoftware',
      genre: 'ARPG',
      releaseYear: 2022,
      platform: 'PS5',
      edition: 'Standard',
      hoursPlayed: 120,
      status: 'Completed',
    });
  });

  it('maps null edition to undefined', () => {
    const rowWithNullEdition = { ...validRow, edition: null };
    const game = Game.fromPersistence(rowWithNullEdition);
    expect(game.edition).toBeUndefined();
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
