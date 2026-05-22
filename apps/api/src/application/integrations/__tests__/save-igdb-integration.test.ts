import { beforeEach, describe, expect, it } from 'bun:test';
import type {
  IgdbCredentialsVerifier,
  VerifyError,
} from '../../../domain/integrations/igdb-credentials-verifier';
import type {
  CipherError,
  IntegrationCipher,
} from '../../../domain/integrations/integration-cipher';
import type { IntegrationCredentials } from '../../../domain/integrations/integration-credentials';
import { IntegrationCredentials as IntegrationCredentialsClass } from '../../../domain/integrations/integration-credentials';
import type { IntegrationCredentialsRepository } from '../../../domain/integrations/integration-credentials-repository';
import type { IntegrationKind } from '../../../domain/integrations/integration-value-objects';
import type { Result } from '../../../domain/shared/result';
import { err, ok } from '../../../domain/shared/result';
import { SaveIgdbIntegration } from '../save-igdb-integration';

const USER_ID = 'user-123';
const FIXED_NOW = new Date('2025-01-01T00:00:00.000Z');
const FIXED_UUID = '00000000-0000-4000-8000-000000000000';

interface FakeInvalidator {
  invalidate(userId: string): void;
  readonly invalidations: ReadonlyArray<string>;
}

function makeFakeInvalidator(): FakeInvalidator {
  const calls: string[] = [];
  return {
    invalidate(userId) {
      calls.push(userId);
    },
    get invalidations() {
      return calls;
    },
  };
}

function makeFakeCipher(): IntegrationCipher {
  const decryptOk = (ciphertext: string): Result<string, CipherError> => {
    if (ciphertext.startsWith('enc:')) {
      return ok(ciphertext.slice('enc:'.length));
    }
    return err({ kind: 'tampered' });
  };
  return {
    encrypt: (plaintext) => `enc:${plaintext}`,
    decrypt: decryptOk,
  };
}

function makeFakeRepo(): IntegrationCredentialsRepository & {
  readonly saved: ReadonlyArray<IntegrationCredentials>;
} {
  const rows = new Map<string, IntegrationCredentials>();
  const saved: IntegrationCredentials[] = [];
  const repo: IntegrationCredentialsRepository & {
    readonly saved: ReadonlyArray<IntegrationCredentials>;
  } = {
    async findByUserAndKind(userId, kind) {
      return rows.get(`${userId}:${kind}`) ?? null;
    },
    async save(creds) {
      rows.set(`${creds.userId}:${creds.integration}`, creds);
      saved.push(creds);
    },
    async delete(userId, kind) {
      rows.delete(`${userId}:${kind}`);
    },
    withTx() {
      return repo;
    },
    get saved() {
      return saved;
    },
  };
  return repo;
}

function makeFakeVerifier(
  result: Result<void, VerifyError> = ok(undefined),
): IgdbCredentialsVerifier & {
  readonly calls: ReadonlyArray<{ clientId: string; clientSecret: string }>;
} {
  const calls: Array<{ clientId: string; clientSecret: string }> = [];
  return {
    async verify(input) {
      calls.push(input);
      return result;
    },
    get calls() {
      return calls;
    },
  };
}

function seedExisting(
  repo: IntegrationCredentialsRepository,
  opts: {
    clientId?: string;
    ciphertext?: string;
    enabled?: boolean;
    lastVerifiedAt?: Date | null;
  } = {},
): Promise<void> {
  const row = IntegrationCredentialsClass.fromPersistence({
    id: 'existing-id',
    userId: USER_ID,
    integration: 'igdb' as IntegrationKind,
    enabled: opts.enabled ?? true,
    clientId: opts.clientId ?? 'existing-client-id',
    clientSecretCiphertext: opts.ciphertext ?? 'enc:existing-secret',
    lastVerifiedAt:
      opts.lastVerifiedAt === undefined
        ? new Date('2024-12-01T00:00:00.000Z')
        : opts.lastVerifiedAt,
    createdAt: new Date('2024-11-01T00:00:00.000Z'),
    updatedAt: new Date('2024-12-01T00:00:00.000Z'),
  });
  return repo.save(row);
}

describe('SaveIgdbIntegration', () => {
  let repo: ReturnType<typeof makeFakeRepo>;
  let cipher: IntegrationCipher;
  let verifier: ReturnType<typeof makeFakeVerifier>;
  let invalidator: FakeInvalidator;
  let useCase: SaveIgdbIntegration;

  beforeEach(() => {
    repo = makeFakeRepo();
    cipher = makeFakeCipher();
    verifier = makeFakeVerifier();
    invalidator = makeFakeInvalidator();
    useCase = new SaveIgdbIntegration({
      repo,
      cipher,
      verifier,
      resourceCache: invalidator,
      now: () => FIXED_NOW,
      uuid: () => FIXED_UUID,
    });
  });

  it('first save with valid input + verifier OK stores aggregate, enabled=true, cache invalidated', async () => {
    const result = await useCase.execute(
      { clientId: 'new-client-id', clientSecret: 'new-secret', enabled: true },
      USER_ID,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.creds.enabled).toBe(true);
    expect(result.value.creds.clientId.value).toBe('new-client-id');
    expect(result.value.creds.clientSecretCiphertext).toBe('enc:new-secret');
    expect(result.value.creds.lastVerifiedAt).toEqual(FIXED_NOW);
    expect(result.value.creds.id).toBe(FIXED_UUID);

    expect(repo.saved.length).toBe(1);
    expect(verifier.calls).toEqual([{ clientId: 'new-client-id', clientSecret: 'new-secret' }]);
    expect(invalidator.invalidations).toEqual([USER_ID]);
  });

  it('second save with clientSecret omitted reuses stored ciphertext after decrypt', async () => {
    await seedExisting(repo, { ciphertext: 'enc:kept-secret' });

    const result = await useCase.execute(
      { clientId: 'existing-client-id', clientSecret: null, enabled: true },
      USER_ID,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.creds.clientSecretCiphertext).toBe('enc:kept-secret');
    expect(result.value.creds.lastVerifiedAt).toEqual(FIXED_NOW);
    expect(verifier.calls).toEqual([
      { clientId: 'existing-client-id', clientSecret: 'kept-secret' },
    ]);
    expect(invalidator.invalidations).toEqual([USER_ID]);
  });

  it('clientSecret omitted with no existing row returns invalid_input', async () => {
    const result = await useCase.execute(
      { clientId: 'new-client-id', clientSecret: '', enabled: true },
      USER_ID,
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe('invalid_input');
    expect(repo.saved.length).toBe(0);
    expect(invalidator.invalidations).toEqual([]);
  });

  it('verifier returns invalid_credentials → no DB write, no cache invalidation, err propagates', async () => {
    verifier = makeFakeVerifier(err({ kind: 'invalid_credentials', reason: 'client_secret' }));
    useCase = new SaveIgdbIntegration({
      repo,
      cipher,
      verifier,
      resourceCache: invalidator,
      now: () => FIXED_NOW,
      uuid: () => FIXED_UUID,
    });

    const result = await useCase.execute(
      { clientId: 'new-client-id', clientSecret: 'bad-secret', enabled: true },
      USER_ID,
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toEqual({ kind: 'invalid_credentials', reason: 'client_secret' });
    expect(repo.saved.length).toBe(0);
    expect(invalidator.invalidations).toEqual([]);
  });

  it('verifier returns twitch_unavailable → err propagates', async () => {
    verifier = makeFakeVerifier(err({ kind: 'twitch_unavailable', status: 503 }));
    useCase = new SaveIgdbIntegration({
      repo,
      cipher,
      verifier,
      resourceCache: invalidator,
      now: () => FIXED_NOW,
      uuid: () => FIXED_UUID,
    });

    const result = await useCase.execute(
      { clientId: 'cid', clientSecret: 'secret-value', enabled: true },
      USER_ID,
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toEqual({ kind: 'twitch_unavailable', status: 503 });
    expect(repo.saved.length).toBe(0);
    expect(invalidator.invalidations).toEqual([]);
  });

  it('verifier returns network_unreachable → err propagates', async () => {
    verifier = makeFakeVerifier(err({ kind: 'network_unreachable', reason: 'timeout' }));
    useCase = new SaveIgdbIntegration({
      repo,
      cipher,
      verifier,
      resourceCache: invalidator,
      now: () => FIXED_NOW,
      uuid: () => FIXED_UUID,
    });

    const result = await useCase.execute(
      { clientId: 'cid', clientSecret: 'secret-value', enabled: true },
      USER_ID,
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toEqual({ kind: 'network_unreachable', reason: 'timeout' });
  });

  it('existing row with corrupt ciphertext and omitted secret returns storage_corrupt', async () => {
    await seedExisting(repo, { ciphertext: 'corrupted-no-prefix' });

    const result = await useCase.execute(
      { clientId: 'existing-client-id', clientSecret: '', enabled: true },
      USER_ID,
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toEqual({ kind: 'storage_corrupt' });
    expect(verifier.calls).toEqual([]);
    expect(invalidator.invalidations).toEqual([]);
  });

  it('trims clientId whitespace before validating and storing', async () => {
    const result = await useCase.execute(
      { clientId: '  spaced-id  ', clientSecret: 'secret-value', enabled: true },
      USER_ID,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.creds.clientId.value).toBe('spaced-id');
    expect(verifier.calls[0]?.clientId).toBe('spaced-id');
  });

  it('rejects empty clientId with invalid_input', async () => {
    const result = await useCase.execute(
      { clientId: '   ', clientSecret: 'secret-value', enabled: true },
      USER_ID,
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe('invalid_input');
    expect(verifier.calls).toEqual([]);
  });

  it('enabled=false on a non-first save stores enabled=false AND invalidates cache unconditionally', async () => {
    await seedExisting(repo, { lastVerifiedAt: new Date('2024-12-01T00:00:00.000Z') });

    const result = await useCase.execute(
      { clientId: 'existing-client-id', clientSecret: 'fresh-secret', enabled: false },
      USER_ID,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.creds.enabled).toBe(false);
    expect(invalidator.invalidations).toEqual([USER_ID]);
  });

  it('first verified save auto-enables even when input.enabled=false', async () => {
    // First save (no existing row, lastVerifiedAt was null upstream).
    const result = await useCase.execute(
      { clientId: 'first-id', clientSecret: 'first-secret', enabled: false },
      USER_ID,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // Plan: enabled=true is auto-set ONLY on the FIRST verified save.
    expect(result.value.creds.enabled).toBe(true);
    expect(invalidator.invalidations).toEqual([USER_ID]);
  });

  it('on update of existing creds, repo.save is called with the new ciphertext', async () => {
    await seedExisting(repo, { ciphertext: 'enc:old-secret' });
    const savedBefore = repo.saved.length;

    const result = await useCase.execute(
      { clientId: 'existing-client-id', clientSecret: 'new-secret', enabled: true },
      USER_ID,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.creds.clientSecretCiphertext).toBe('enc:new-secret');
    expect(repo.saved.length - savedBefore).toBe(1);
    expect(repo.saved.at(-1)?.clientSecretCiphertext).toBe('enc:new-secret');
  });
});
