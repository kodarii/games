import { describe, expect, it } from 'bun:test';
import { createGameUpdate } from '../game';

const validInput = {
  title: 'Elden Ring',
  developer: 'FromSoftware',
  genre: 'ARPG',
  releaseYear: 2022,
  platform: 'PS5' as const,
  hoursPlayed: 120,
  status: 'Completed' as const,
};

describe('createGameUpdate', () => {
  it('returns ok with all fields for valid input', () => {
    const result = createGameUpdate(validInput);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.title).toBe('Elden Ring');
      expect(result.value.developer).toBe('FromSoftware');
      expect(result.value.genre).toBe('ARPG');
      expect(result.value.releaseYear).toBe(2022);
      expect(result.value.platform).toBe('PS5');
      expect(result.value.edition).toBeUndefined();
      expect(result.value.hoursPlayed).toBe(120);
      expect(result.value.status).toBe('Completed');
    }
  });

  it('returns ok with edition when provided', () => {
    const result = createGameUpdate({ ...validInput, edition: 'Deluxe' });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.edition).toBe('Deluxe');
    }
  });

  it('returns ok with empty edition as undefined', () => {
    const result = createGameUpdate({ ...validInput, edition: '' });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.edition).toBeUndefined();
    }
  });

  it('returns error for empty title', () => {
    const result = createGameUpdate({ ...validInput, title: '' });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe('title_empty');
    }
  });

  it('returns error for whitespace-only title', () => {
    const result = createGameUpdate({ ...validInput, title: '   ' });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe('title_empty');
    }
  });

  it('returns error for empty developer', () => {
    const result = createGameUpdate({ ...validInput, developer: '' });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe('developer_empty');
    }
  });

  it('returns error for releaseYear below 1970', () => {
    const result = createGameUpdate({ ...validInput, releaseYear: 1900 });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe('release_year_out_of_range');
    }
  });

  it('returns error for releaseYear above 2100', () => {
    const result = createGameUpdate({ ...validInput, releaseYear: 2200 });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe('release_year_out_of_range');
    }
  });

  it('returns error for negative hoursPlayed', () => {
    const result = createGameUpdate({ ...validInput, hoursPlayed: -5 });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe('hours_played_negative');
    }
  });

  it('returns error for hoursPlayed equal to 0 - valid', () => {
    const result = createGameUpdate({ ...validInput, hoursPlayed: 0 });
    expect(result.ok).toBe(true);
  });
});
