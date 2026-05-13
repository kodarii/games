import type { Result } from '../shared/result';

/**
 * Failure modes for {@link IntegrationCipher.decrypt}.
 *
 * - `tampered`: the ciphertext decoded fine but the AEAD auth tag did not
 *   verify — the payload was modified or encrypted under a different key.
 * - `malformed`: the input was not valid base64 of `iv ‖ ciphertext ‖ authTag`
 *   (e.g. too short, invalid base64). This is a structural error, not a
 *   cryptographic one.
 */
export type CipherError = { kind: 'malformed'; reason: string } | { kind: 'tampered' };

/**
 * Port for symmetric encryption of integration secrets at rest.
 *
 * Implementations MUST:
 * - use authenticated encryption (AEAD);
 * - emit a fresh random IV per encryption (no IV reuse);
 * - return a structural error for malformed input and an auth-tag error for
 *   tampered input, distinguishable to callers.
 *
 * The interface intentionally exposes only string in/out — base64 framing is
 * an implementation detail. Use-cases depending on this port stay framework-
 * and crypto-library-free.
 */
export interface IntegrationCipher {
  encrypt(plaintext: string): string;
  decrypt(ciphertext: string): Result<string, CipherError>;
}
