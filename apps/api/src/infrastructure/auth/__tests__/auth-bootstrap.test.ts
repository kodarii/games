import { describe, expect, test } from 'bun:test';
import { validateAuthConfig } from '../auth-config';

const validInput = {
  BETTER_AUTH_SECRET: 'a'.repeat(32),
  BETTER_AUTH_URL: 'http://localhost:3001',
  CORS_ORIGIN: ['http://localhost:5173'],
};

describe('validateAuthConfig', () => {
  test('throws when BETTER_AUTH_SECRET is empty', () => {
    expect(() => validateAuthConfig({ ...validInput, BETTER_AUTH_SECRET: '' })).toThrow(
      /BETTER_AUTH_SECRET/,
    );
  });

  test('throws when BETTER_AUTH_SECRET is shorter than 32 chars', () => {
    expect(() => validateAuthConfig({ ...validInput, BETTER_AUTH_SECRET: 'a'.repeat(31) })).toThrow(
      /BETTER_AUTH_SECRET/,
    );
  });

  test('throws when CORS_ORIGIN allowlist is empty', () => {
    expect(() => validateAuthConfig({ ...validInput, CORS_ORIGIN: [] })).toThrow(/CORS_ORIGIN/);
  });

  test('throws when BETTER_AUTH_URL is not a valid URL', () => {
    expect(() => validateAuthConfig({ ...validInput, BETTER_AUTH_URL: 'not-a-url' })).toThrow(
      /BETTER_AUTH_URL/,
    );
  });

  test('returns the normalized config on valid input', () => {
    const result = validateAuthConfig(validInput);
    expect(result.secret).toBe(validInput.BETTER_AUTH_SECRET);
    expect(result.baseURL).toBe(validInput.BETTER_AUTH_URL);
    expect(result.trustedOrigins).toEqual(validInput.CORS_ORIGIN);
  });
});
