/**
 * Auth configuration validation.
 *
 * Fail-fast at module load: an undersized or missing BETTER_AUTH_SECRET
 * makes session signatures trivially forgeable. We refuse to boot rather
 * than start a server that issues weak sessions.
 */

const MIN_SECRET_BYTES = 32;

export type AuthConfigInput = {
  BETTER_AUTH_SECRET: string;
  BETTER_AUTH_URL: string;
  CORS_ORIGIN: readonly string[];
};

export type AuthConfig = {
  secret: string;
  baseURL: string;
  trustedOrigins: readonly string[];
};

export function validateAuthConfig(input: AuthConfigInput): AuthConfig {
  const { BETTER_AUTH_SECRET, BETTER_AUTH_URL, CORS_ORIGIN } = input;

  if (BETTER_AUTH_SECRET.length < MIN_SECRET_BYTES) {
    throw new Error(
      `BETTER_AUTH_SECRET must be set and at least ${MIN_SECRET_BYTES} characters long`,
    );
  }

  try {
    new URL(BETTER_AUTH_URL);
  } catch {
    throw new Error(`BETTER_AUTH_URL must be a valid URL, got: ${BETTER_AUTH_URL}`);
  }

  if (CORS_ORIGIN.length === 0) {
    throw new Error('CORS_ORIGIN allowlist must contain at least one origin');
  }

  return {
    secret: BETTER_AUTH_SECRET,
    baseURL: BETTER_AUTH_URL,
    trustedOrigins: CORS_ORIGIN,
  };
}
