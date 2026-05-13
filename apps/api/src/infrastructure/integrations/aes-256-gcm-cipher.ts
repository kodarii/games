import { createCipheriv, createDecipheriv, createHash, hkdfSync, randomBytes } from 'node:crypto';
import type { CipherError, IntegrationCipher } from '../../domain/integrations/integration-cipher';
import { err, ok } from '../../domain/shared/result';
import type { Result } from '../../domain/shared/result';

const IV_LENGTH = 12; // GCM standard
const TAG_LENGTH = 16; // GCM auth tag
const KEY_LENGTH = 32; // AES-256
const KEY_INFO = Buffer.from('apex.integration-cipher.v1', 'utf8');
const KEY_SALT = createHash('sha256').update('apex.integration-cipher').digest();
const MIN_SECRET_LENGTH = 32;

let cachedKey: Buffer | null = null;

/**
 * Derives the AES-256 key from `BETTER_AUTH_SECRET` via HKDF-SHA256 and caches
 * the result at module scope. Reads the env var lazily (on first call) so a
 * test setting `process.env.BETTER_AUTH_SECRET` before the first encrypt is
 * honored.
 *
 * A missing or too-short secret is a deployment-config error, not a runtime
 * input error — it MUST surface loudly. We throw here intentionally; this
 * function is only ever called from the cipher methods, which are themselves
 * only called from wired-up use-cases (boot path), so the throw cannot leak to
 * untrusted callers.
 */
function getKey(): Buffer {
  if (cachedKey !== null) {
    return cachedKey;
  }
  const secret = process.env.BETTER_AUTH_SECRET;
  if (!secret || secret.length < MIN_SECRET_LENGTH) {
    throw new Error('Aes256GcmCipher: BETTER_AUTH_SECRET is missing or shorter than 32 characters');
  }
  const derived = hkdfSync('sha256', Buffer.from(secret, 'utf8'), KEY_SALT, KEY_INFO, KEY_LENGTH);
  cachedKey = Buffer.from(derived);
  return cachedKey;
}

/**
 * Production cipher for integration secrets at rest.
 *
 * Format: base64(`iv (12B) ‖ ciphertext ‖ authTag (16B)`).
 *
 * The class itself is stateless — it holds no per-instance state and is safe
 * to share. The derived key lives at module scope.
 */
export class Aes256GcmCipher implements IntegrationCipher {
  encrypt(plaintext: string): string {
    const iv = randomBytes(IV_LENGTH);
    const cipher = createCipheriv('aes-256-gcm', getKey(), iv);
    const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();
    return Buffer.concat([iv, ciphertext, authTag]).toString('base64');
  }

  decrypt(ciphertext: string): Result<string, CipherError> {
    if (ciphertext.length === 0) {
      return err({ kind: 'malformed', reason: 'empty input' });
    }

    const raw = Buffer.from(ciphertext, 'base64');
    if (raw.length <= IV_LENGTH + TAG_LENGTH) {
      // Need at least 1 byte of ciphertext between IV and tag. Equal length
      // means zero ciphertext bytes — treat as malformed too.
      return err({ kind: 'malformed', reason: 'input too short for iv+ct+tag layout' });
    }

    const iv = raw.subarray(0, IV_LENGTH);
    const tag = raw.subarray(raw.length - TAG_LENGTH);
    const body = raw.subarray(IV_LENGTH, raw.length - TAG_LENGTH);

    try {
      const decipher = createDecipheriv('aes-256-gcm', getKey(), iv);
      decipher.setAuthTag(tag);
      const plaintext = Buffer.concat([decipher.update(body), decipher.final()]);
      return ok(plaintext.toString('utf8'));
    } catch {
      // GCM auth-tag verification failure (or any other decipher error) means
      // the payload was tampered with or encrypted under a different key. We
      // intentionally collapse these into a single `tampered` result — leaking
      // the underlying error would be a side-channel.
      return err({ kind: 'tampered' });
    }
  }
}
