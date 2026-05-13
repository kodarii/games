// Set a deterministic key BEFORE the cipher module is imported. The cipher
// reads BETTER_AUTH_SECRET on first use (lazy), so as long as this assignment
// runs before any encrypt/decrypt call the test is hermetic.
process.env.BETTER_AUTH_SECRET = '0123456789abcdef0123456789abcdef-test-secret';

import { describe, expect, it } from 'bun:test';
import { Aes256GcmCipher } from '../aes-256-gcm-cipher';

describe('Aes256GcmCipher', () => {
  const cipher = new Aes256GcmCipher();

  it('roundtrips a short ASCII string', () => {
    const plaintext = 'hello-world';
    const ciphertext = cipher.encrypt(plaintext);
    const decrypted = cipher.decrypt(ciphertext);
    expect(decrypted.ok).toBe(true);
    if (decrypted.ok) {
      expect(decrypted.value).toBe(plaintext);
    }
  });

  it('roundtrips a long unicode string', () => {
    const chunk = 'zażółć gęślą jaźń 🎮🕹️👾🇵🇱 ';
    const plaintext = chunk.repeat(Math.ceil(4096 / chunk.length)).slice(0, 4096);
    const ciphertext = cipher.encrypt(plaintext);
    const decrypted = cipher.decrypt(ciphertext);
    expect(decrypted.ok).toBe(true);
    if (decrypted.ok) {
      expect(decrypted.value).toBe(plaintext);
    }
  });

  it('produces different ciphertexts for the same plaintext (random IV)', () => {
    const plaintext = 'same-input';
    const a = cipher.encrypt(plaintext);
    const b = cipher.encrypt(plaintext);
    expect(a).not.toBe(b);
  });

  it('decrypt of tampered ciphertext returns err({ kind: "tampered" })', () => {
    const plaintext = 'sensitive-payload';
    const ciphertext = cipher.encrypt(plaintext);
    const raw = Buffer.from(ciphertext, 'base64');
    // Flip a byte well inside the ciphertext body (after the 12-byte IV).
    const flipAt = Math.floor((12 + raw.length - 16) / 2);
    raw[flipAt] = raw[flipAt] ^ 0xff;
    const tampered = raw.toString('base64');

    const result = cipher.decrypt(tampered);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe('tampered');
    }
  });

  it('decrypt of too-short input returns err({ kind: "malformed" })', () => {
    // Less than iv (12) + tag (16) bytes — there is no room for a ciphertext.
    const tooShort = Buffer.alloc(20, 0).toString('base64');
    const result = cipher.decrypt(tooShort);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe('malformed');
    }
  });

  it('decrypt of invalid base64 returns err({ kind: "malformed" })', () => {
    const result = cipher.decrypt('!!!not-base64!!!');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe('malformed');
    }
  });

  it('decrypt of empty string returns err({ kind: "malformed" })', () => {
    const result = cipher.decrypt('');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe('malformed');
    }
  });
});
