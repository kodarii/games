import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { env } from '../config/env';
import { db } from '../db/client';
import { validateAuthConfig } from './auth-config';

const config = validateAuthConfig({
  BETTER_AUTH_SECRET: env.BETTER_AUTH_SECRET,
  BETTER_AUTH_URL: env.BETTER_AUTH_URL,
  CORS_ORIGIN: env.CORS_ORIGIN,
});

export const auth = betterAuth({
  baseURL: config.baseURL,
  secret: config.secret,
  database: drizzleAdapter(db, { provider: 'sqlite' }),
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
    autoSignIn: true,
  },
  trustedOrigins: [...config.trustedOrigins],
  advanced: {
    defaultCookieAttributes: {
      sameSite: 'strict',
    },
  },
  rateLimit: {
    enabled: true,
    // Defaults apply to all auth endpoints; tighter rule for credential login below.
    window: 60,
    max: 100,
    customRules: {
      '/sign-in/email': { window: 60, max: 5 },
    },
  },
});

export type Auth = typeof auth;
