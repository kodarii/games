import { describe, expect, it } from 'bun:test';
import { IntegrationCredentials } from '../../../domain/integrations/integration-credentials';
import type { IntegrationCredentialsRepository } from '../../../domain/integrations/integration-credentials-repository';
import { GetIgdbIntegrationStatus } from '../get-igdb-integration-status';

function makeRepo(row: IntegrationCredentials | null): IntegrationCredentialsRepository {
  return {
    async findByUserAndKind() {
      return row;
    },
    async save() {
      throw new Error('not used');
    },
    async delete() {
      throw new Error('not used');
    },
    withTx() {
      throw new Error('not used');
    },
  };
}

describe('GetIgdbIntegrationStatus', () => {
  it('returns not-configured shape when repo returns null', async () => {
    const useCase = new GetIgdbIntegrationStatus(makeRepo(null));
    const result = await useCase.execute('user-1');
    expect(result).toEqual({
      status: 'not-configured',
      enabled: false,
      clientId: null,
      clientIdMasked: null,
      hasSecret: false,
      lastVerifiedAt: null,
      updatedAt: null,
    });
  });

  it('returns configured shape with maskedClientId when row exists', async () => {
    const now = new Date('2026-01-01T12:00:00Z');
    const verifiedAt = new Date('2025-12-31T11:00:00Z');
    const row = IntegrationCredentials.fromPersistence({
      id: 'cred-1',
      userId: 'user-1',
      integration: 'igdb',
      enabled: true,
      clientId: '0123456789abcdef0123456789ABCDEF',
      clientSecretCiphertext: 'enc:xxx',
      lastVerifiedAt: verifiedAt,
      createdAt: now,
      updatedAt: now,
    });
    const useCase = new GetIgdbIntegrationStatus(makeRepo(row));
    const result = await useCase.execute('user-1');
    expect(result).toEqual({
      status: 'configured',
      enabled: true,
      clientId: '0123456789abcdef0123456789ABCDEF',
      clientIdMasked: '0123456789ab…CDEF',
      hasSecret: true,
      lastVerifiedAt: '2025-12-31T11:00:00.000Z',
      updatedAt: '2026-01-01T12:00:00.000Z',
    });
  });

  it('configured shape uses null for lastVerifiedAt when not yet verified', async () => {
    const now = new Date('2026-01-01T12:00:00Z');
    const row = IntegrationCredentials.fromPersistence({
      id: 'cred-1',
      userId: 'user-1',
      integration: 'igdb',
      enabled: false,
      clientId: '0123456789abcdef0123456789ABCDEF',
      clientSecretCiphertext: 'enc:xxx',
      lastVerifiedAt: null,
      createdAt: now,
      updatedAt: now,
    });
    const useCase = new GetIgdbIntegrationStatus(makeRepo(row));
    const result = await useCase.execute('user-1');
    expect(result.status).toBe('configured');
    if (result.status === 'configured') {
      expect(result.enabled).toBe(false);
      expect(result.lastVerifiedAt).toBeNull();
    }
  });
});
