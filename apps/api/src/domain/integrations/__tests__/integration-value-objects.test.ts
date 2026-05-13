import { describe, expect, it } from 'bun:test';
import { ClientId, ClientSecret } from '../integration-value-objects';

describe('ClientId', () => {
  it('rejects empty string', () => {
    const result = ClientId.create('');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toEqual({ kind: 'invalid_client_id', reason: 'empty' });
    }
  });

  it('rejects whitespace-only string (trims then empty)', () => {
    const result = ClientId.create('   ');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toEqual({ kind: 'invalid_client_id', reason: 'empty' });
    }
  });

  it('rejects strings longer than 128 chars', () => {
    const result = ClientId.create('a'.repeat(129));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toEqual({ kind: 'invalid_client_id', reason: 'too_long' });
    }
  });

  it('accepts a valid trimmed string', () => {
    const result = ClientId.create('  valid-value  ');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.value).toBe('valid-value');
    }
  });

  it('accepts max-length value (128 chars)', () => {
    const raw = 'b'.repeat(128);
    const result = ClientId.create(raw);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.value).toBe(raw);
    }
  });

  it('fromTrusted constructs without validation', () => {
    const v = ClientId.fromTrusted('whatever');
    expect(v.value).toBe('whatever');
  });
});

describe('ClientSecret', () => {
  it('rejects empty string', () => {
    const result = ClientSecret.create('');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toEqual({ kind: 'invalid_client_secret', reason: 'empty' });
    }
  });

  it('rejects whitespace-only string', () => {
    const result = ClientSecret.create('   ');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toEqual({ kind: 'invalid_client_secret', reason: 'empty' });
    }
  });

  it('rejects strings longer than 128 chars', () => {
    const result = ClientSecret.create('s'.repeat(129));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toEqual({ kind: 'invalid_client_secret', reason: 'too_long' });
    }
  });

  it('accepts a valid trimmed string', () => {
    const result = ClientSecret.create('  secret-value  ');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.value).toBe('secret-value');
    }
  });

  it('fromTrusted constructs without validation', () => {
    const v = ClientSecret.fromTrusted('whatever');
    expect(v.value).toBe('whatever');
  });
});
