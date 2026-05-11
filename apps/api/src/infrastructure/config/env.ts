import { z } from 'zod';

const envSchema = z.object({
  IGDB_CLIENT_ID: z.string().min(1),
  IGDB_CLIENT_SECRET: z.string().min(1),
  IGDB_TIMEOUT_MS: z.coerce.number().int().positive().default(5000),
  IGDB_CACHE_TTL_DAYS: z.coerce.number().int().positive().default(30),
  UPLOADTHING_TOKEN: z.string().min(1),
  BETTER_AUTH_SECRET: z.string().min(1),
  BETTER_AUTH_URL: z.string().url().optional(),
});

export const env = envSchema.parse(process.env);
export type Env = typeof env;
