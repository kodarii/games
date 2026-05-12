import { z } from 'zod';

const csvList = z
  .string()
  .min(1)
  .transform((s) =>
    s
      .split(',')
      .map((origin) => origin.trim())
      .filter((origin) => origin.length > 0),
  );

const envSchema = z.object({
  IGDB_CLIENT_ID: z.string().min(1),
  IGDB_CLIENT_SECRET: z.string().min(1),
  IGDB_TIMEOUT_MS: z.coerce.number().int().positive().default(5000),
  IGDB_CACHE_TTL_DAYS: z.coerce.number().int().positive().default(30),
  UPLOADTHING_TOKEN: z.string().min(1),
  BETTER_AUTH_SECRET: z.string().min(32),
  BETTER_AUTH_URL: z.string().url(),
  CORS_ORIGIN: csvList,
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  SHUTDOWN_DRAIN_MS: z.coerce.number().int().positive().default(25_000),
  IDEMPOTENCY_TTL_HOURS: z.coerce.number().int().positive().default(24),
});

export const env = envSchema.parse(process.env);
export type Env = typeof env;
