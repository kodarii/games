import { describe, expect, it } from 'bun:test';
import { DictionaryName } from '../dictionary-name';

describe('DictionaryName', () => {
  it('creates a name from a non-empty trimmed string', () => {
    const result = DictionaryName.create('PS5', 40);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.value).toBe('PS5');
    }
  });

  it('trims whitespace around the value', () => {
    const result = DictionaryName.create('  Wii U  ', 40);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.value).toBe('Wii U');
    }
  });

  it('rejects empty string', () => {
    const result = DictionaryName.create('', 40);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe('name_empty');
    }
  });

  it('rejects whitespace-only string', () => {
    const result = DictionaryName.create('   ', 40);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe('name_empty');
    }
  });

  it('rejects values longer than the configured max length', () => {
    const result = DictionaryName.create('a'.repeat(41), 40);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe('name_too_long');
      if (result.error.kind === 'name_too_long') {
        expect(result.error.length).toBe(41);
      }
    }
  });

  it('respects different max-length limits per dictionary', () => {
    const fortyOne = 'a'.repeat(41);
    expect(DictionaryName.create(fortyOne, 40).ok).toBe(false);
    expect(DictionaryName.create(fortyOne, 60).ok).toBe(true);
  });

  it('fromTrusted skips validation and constructs unconditionally', () => {
    const value = DictionaryName.fromTrusted('anything');
    expect(value.value).toBe('anything');
  });
});
