import { describe, expect, it } from 'bun:test';
import { normalizeTitle } from '../normalize-title';

describe('normalizeTitle', () => {
  it('strips diacritics, lowercases, and trims', () => {
    expect(normalizeTitle('  Pokémon ')).toBe('pokemon');
  });

  it('lowercases ASCII', () => {
    expect(normalizeTitle('ABC')).toBe('abc');
  });

  it('collapses internal whitespace', () => {
    expect(normalizeTitle('a   b')).toBe('a b');
  });

  it('strips leading/trailing punctuation but keeps middle punctuation', () => {
    expect(normalizeTitle('Pokémon: Red & Blue!  ')).toBe('pokemon: red & blue');
  });

  it('keeps middle punctuation but strips trailing closing parenthesis', () => {
    // Trailing punctuation includes ')' — only middle punctuation survives.
    expect(normalizeTitle('Doom (2016) Edition')).toBe('doom (2016) edition');
    expect(normalizeTitle('Doom (2016)')).toBe('doom (2016');
  });

  it('handles common diacritics in cafe', () => {
    expect(normalizeTitle('café')).toBe('cafe');
  });

  it('returns empty string for punctuation-only input', () => {
    expect(normalizeTitle('!!!')).toBe('');
  });
});
