import { describe, expect, it } from 'bun:test';
import { ZodError, type z } from 'zod';
import { __testOnly_envSchema as envSchema } from '../env';

const VALID_BASE = {
  IGDB_TIMEOUT_MS: '5000',
  IGDB_CACHE_TTL_DAYS: '30',
  UPLOADTHING_TOKEN: 'sk_live_xxx',
  BETTER_AUTH_SECRET: 'a'.repeat(64),
  BETTER_AUTH_URL: 'http://localhost:3001',
  CORS_ORIGIN: 'http://localhost:5173',
  LOG_LEVEL: 'info',
  SHUTDOWN_DRAIN_MS: '25000',
  IDEMPOTENCY_TTL_HOURS: '24',
};

describe('env schema sentinel deny-list', () => {
  it('rejects the documented sentinel BETTER_AUTH_SECRET', () => {
    expect(() =>
      envSchema.parse({
        ...VALID_BASE,
        BETTER_AUTH_SECRET: 'replace-with-32-byte-random-aaaaaaaaaa',
      }),
    ).toThrow(ZodError);
    try {
      envSchema.parse({
        ...VALID_BASE,
        BETTER_AUTH_SECRET: 'replace-with-32-byte-random-aaaaaaaaaa',
      });
    } catch (err) {
      const zodErr = err as z.ZodError;
      const messages = zodErr.issues.map((i) => i.message).join(' | ');
      expect(messages).toMatch(/sentinel/i);
    }
  });

  it('accepts a real 64-char random-looking secret', () => {
    const parsed = envSchema.parse(VALID_BASE);
    expect(parsed.BETTER_AUTH_SECRET.length).toBeGreaterThanOrEqual(32);
  });

  it('still rejects secrets shorter than 32 chars (existing rule preserved)', () => {
    expect(() => envSchema.parse({ ...VALID_BASE, BETTER_AUTH_SECRET: 'a'.repeat(31) })).toThrow(
      ZodError,
    );
  });
});
