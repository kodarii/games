import { describe, expect, it } from 'bun:test';
import { ReleaseYearRange } from './release-year-range';

describe('ReleaseYearRange', () => {
  it('creates valid range', () => {
    const r = ReleaseYearRange.create(2000, 2030);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.from).toBe(2000);
      expect(r.value.to).toBe(2030);
    }
  });

  it('allows from === to (single year)', () => {
    const r = ReleaseYearRange.create(2020, 2020);
    expect(r.ok).toBe(true);
  });

  it('rejects from > to as inverted', () => {
    const r = ReleaseYearRange.create(2030, 2000);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.kind).toBe('inverted');
  });

  it('rejects from below 1958 as out_of_bounds_low', () => {
    const r = ReleaseYearRange.create(1900, 2000);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.kind).toBe('out_of_bounds_low');
  });

  it('rejects to above 2100 as out_of_bounds_high', () => {
    const r = ReleaseYearRange.create(2000, 2200);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.kind).toBe('out_of_bounds_high');
  });

  it('rejects non-integer values', () => {
    const r = ReleaseYearRange.create(2000.5, 2030);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.kind).toBe('not_integer');
  });
});
