import { describe, expect, it } from 'bun:test';
import { NewPlatform, Platform, PlatformName } from '../platform';

describe('PlatformName', () => {
  it("creates 'PS5'", () => {
    const result = PlatformName.create('PS5');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.value).toBe('PS5');
    }
  });

  it("creates '  Wii U  ' trimmed to 'Wii U'", () => {
    const result = PlatformName.create('  Wii U  ');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.value).toBe('Wii U');
    }
  });

  it("returns error for empty string ''", () => {
    const result = PlatformName.create('');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe('name_empty');
    }
  });

  it("returns error for whitespace-only '   '", () => {
    const result = PlatformName.create('   ');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe('name_empty');
    }
  });

  it('returns error for name longer than 40 chars', () => {
    const result = PlatformName.create('a'.repeat(41));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe('name_too_long');
      const e = result.error as { kind: string; length: number };
      expect(e.length).toBe(41);
    }
  });
});

describe('NewPlatform.create', () => {
  it('happy path', () => {
    const result = NewPlatform.create({ userId: 'user-A', name: 'Wii U' });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.userId).toBe('user-A');
      expect(result.value.name).toBe('Wii U');
    }
  });

  it("returns error for empty userId ''", () => {
    const result = NewPlatform.create({ userId: '', name: 'PS5' });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe('missing_user_id');
    }
  });

  it("returns error for whitespace userId '   '", () => {
    const result = NewPlatform.create({ userId: '   ', name: 'PS5' });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe('missing_user_id');
    }
  });

  it("returns error for empty name ''", () => {
    const result = NewPlatform.create({ userId: 'user-A', name: '' });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe('name_empty');
    }
  });
});

describe('Platform.fromPersistence', () => {
  it('restores from valid row and toJSON returns correct shape', () => {
    const platform = Platform.fromPersistence({ id: 1, externalId: 'test-uuid-p1', userId: 'user-A', name: 'Wii U' });
    expect(platform.id).toBe(1);
    expect(platform.externalId).toBe('test-uuid-p1');
    expect(platform.toJSON()).toEqual({ id: 1, externalId: 'test-uuid-p1', userId: 'user-A', name: 'Wii U' });
  });
});
