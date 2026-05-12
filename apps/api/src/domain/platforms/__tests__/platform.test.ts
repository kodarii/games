import { describe, expect, it } from 'bun:test';
import { NewPlatform, PLATFORM_NAME_MAX_LENGTH, Platform } from '../platform';

describe('NewPlatform.create', () => {
  it('creates a platform on happy path', () => {
    const result = NewPlatform.create({ userId: 'user-A', name: 'Wii U' });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.userId).toBe('user-A');
      expect(result.value.name).toBe('Wii U');
      expect(result.value.kind).toBe('platform');
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

  it('rejects names exceeding the platform-specific max length', () => {
    const result = NewPlatform.create({
      userId: 'user-A',
      name: 'a'.repeat(PLATFORM_NAME_MAX_LENGTH + 1),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe('name_too_long');
    }
  });
});

describe('Platform.fromPersistence', () => {
  it('restores from a valid row and toJSON returns the expected shape', () => {
    const platform = Platform.fromPersistence({
      id: 1,
      externalId: 'test-uuid-p1',
      userId: 'user-A',
      name: 'Wii U',
    });
    expect(platform.id).toBe(1);
    expect(platform.externalId).toBe('test-uuid-p1');
    expect(platform.toJSON()).toEqual({
      id: 1,
      externalId: 'test-uuid-p1',
      userId: 'user-A',
      name: 'Wii U',
    });
  });
});
