import { describe, expect, it } from 'bun:test';
import { IntegrationCredentials } from '../integration-credentials';
import { ClientId } from '../integration-value-objects';
import { NewIntegrationCredentials } from '../new-integration-credentials';

const fixedNow = new Date('2026-05-01T12:00:00.000Z');

function buildValidProps(
  overrides: Partial<Parameters<typeof NewIntegrationCredentials.create>[0]> = {},
) {
  return {
    id: 'cred-1',
    userId: 'user-A',
    integration: 'igdb' as const,
    clientId: 'twitch-client-id',
    clientSecretCiphertext: 'base64-cipher-blob',
    now: fixedNow,
    ...overrides,
  };
}

describe('NewIntegrationCredentials.create', () => {
  it('produces an aggregate with enabled=false, lastVerifiedAt=null, createdAt=updatedAt=now', () => {
    const result = NewIntegrationCredentials.create(buildValidProps());
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const creds = result.value;
    expect(creds.id).toBe('cred-1');
    expect(creds.userId).toBe('user-A');
    expect(creds.integration).toBe('igdb');
    expect(creds.enabled).toBe(false);
    expect(creds.clientId.value).toBe('twitch-client-id');
    expect(creds.clientSecretCiphertext).toBe('base64-cipher-blob');
    expect(creds.lastVerifiedAt).toBeNull();
    expect(creds.createdAt).toEqual(fixedNow);
    expect(creds.updatedAt).toEqual(fixedNow);
  });

  it('returns err on empty clientId', () => {
    const result = NewIntegrationCredentials.create(buildValidProps({ clientId: '' }));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe('invalid_client_id');
    }
  });

  it('trims clientId before storing', () => {
    const result = NewIntegrationCredentials.create(buildValidProps({ clientId: '   raw-id   ' }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.clientId.value).toBe('raw-id');
  });
});

describe('IntegrationCredentials mutations (immutable, return fresh instances)', () => {
  function freshCreds(): IntegrationCredentials {
    const r = NewIntegrationCredentials.create(buildValidProps());
    if (!r.ok) throw new Error('test setup failed');
    return r.value;
  }

  it('enable() returns a new instance with enabled=true and a bumped updatedAt', () => {
    const original = freshCreds();
    const enabled = original.enable();
    expect(enabled).not.toBe(original);
    expect(enabled.enabled).toBe(true);
    expect(original.enabled).toBe(false);
    expect(enabled.updatedAt.getTime()).toBeGreaterThanOrEqual(original.updatedAt.getTime());
    expect(enabled.id).toBe(original.id);
    expect(enabled.clientId.value).toBe(original.clientId.value);
    expect(enabled.clientSecretCiphertext).toBe(original.clientSecretCiphertext);
  });

  it('disable() returns a new instance with enabled=false', () => {
    const original = freshCreds().enable();
    const disabled = original.disable();
    expect(disabled).not.toBe(original);
    expect(disabled.enabled).toBe(false);
    expect(disabled.updatedAt.getTime()).toBeGreaterThanOrEqual(original.updatedAt.getTime());
  });

  it('markVerified(at) sets lastVerifiedAt and bumps updatedAt', () => {
    const original = freshCreds();
    const verifiedAt = new Date('2026-05-02T08:00:00.000Z');
    const verified = original.markVerified(verifiedAt);
    expect(verified).not.toBe(original);
    expect(verified.lastVerifiedAt).toEqual(verifiedAt);
    expect(verified.updatedAt.getTime()).toBeGreaterThanOrEqual(original.updatedAt.getTime());
  });

  it('replaceSecret(newCiphertext) swaps ciphertext and bumps updatedAt; rest preserved', () => {
    const original = freshCreds();
    const replaced = original.replaceSecret('new-cipher');
    expect(replaced).not.toBe(original);
    expect(replaced.clientSecretCiphertext).toBe('new-cipher');
    expect(replaced.clientId.value).toBe(original.clientId.value);
    expect(replaced.enabled).toBe(original.enabled);
    expect(replaced.updatedAt.getTime()).toBeGreaterThanOrEqual(original.updatedAt.getTime());
  });

  it('replaceClientId(newClientId) swaps clientId and bumps updatedAt; rest preserved', () => {
    const original = freshCreds();
    const replaced = original.replaceClientId(ClientId.fromTrusted('new-id'));
    expect(replaced).not.toBe(original);
    expect(replaced.clientId.value).toBe('new-id');
    expect(replaced.clientSecretCiphertext).toBe(original.clientSecretCiphertext);
    expect(replaced.updatedAt.getTime()).toBeGreaterThanOrEqual(original.updatedAt.getTime());
  });
});

describe('IntegrationCredentials.fromPersistence', () => {
  it('round-trips: row → aggregate → row-shape equality', () => {
    const lastVerifiedAt = new Date('2026-04-30T10:00:00.000Z');
    const createdAt = new Date('2026-04-29T10:00:00.000Z');
    const updatedAt = new Date('2026-05-01T10:00:00.000Z');

    const aggregate = IntegrationCredentials.fromPersistence({
      id: 'cred-9',
      userId: 'user-B',
      integration: 'igdb',
      enabled: true,
      clientId: 'persisted-id',
      clientSecretCiphertext: 'persisted-cipher',
      lastVerifiedAt,
      createdAt,
      updatedAt,
    });

    expect(aggregate.id).toBe('cred-9');
    expect(aggregate.userId).toBe('user-B');
    expect(aggregate.integration).toBe('igdb');
    expect(aggregate.enabled).toBe(true);
    expect(aggregate.clientId.value).toBe('persisted-id');
    expect(aggregate.clientSecretCiphertext).toBe('persisted-cipher');
    expect(aggregate.lastVerifiedAt).toEqual(lastVerifiedAt);
    expect(aggregate.createdAt).toEqual(createdAt);
    expect(aggregate.updatedAt).toEqual(updatedAt);
  });

  it('handles null lastVerifiedAt', () => {
    const aggregate = IntegrationCredentials.fromPersistence({
      id: 'cred-10',
      userId: 'user-B',
      integration: 'igdb',
      enabled: false,
      clientId: 'cid',
      clientSecretCiphertext: 'cipher',
      lastVerifiedAt: null,
      createdAt: new Date(0),
      updatedAt: new Date(0),
    });
    expect(aggregate.lastVerifiedAt).toBeNull();
  });
});
