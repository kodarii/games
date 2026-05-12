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

const optionalNonEmpty = z
  .string()
  .optional()
  .transform((s) => (s !== undefined && s.length > 0 ? s : undefined));

const envSchema = z.object({
  // IGDB credentials are optional. When either is missing, the IGDB metadata
  // feature is disabled at wiring time (see wiring.ts → `igdbConfigured`) and
  // search/enrich endpoints return 503. Required for the feature to work; not
  // required for the API to boot.
  IGDB_CLIENT_ID: optionalNonEmpty,
  IGDB_CLIENT_SECRET: optionalNonEmpty,
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
