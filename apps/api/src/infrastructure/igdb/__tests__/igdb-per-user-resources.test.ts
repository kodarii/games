import { describe, expect, it } from 'bun:test';
import type { CipherError, IntegrationCipher } from '../../../domain/integrations/integration-cipher';
import { IntegrationCredentials } from '../../../domain/integrations/integration-credentials';
import type { IntegrationCredentialsRepository } from '../../../domain/integrations/integration-credentials-repository';
import type { IntegrationKind } from '../../../domain/integrations/integration-value-objects';
import type {
  IntegrationTokenStorage,
  StoredIntegrationToken,
} from '../../../domain/integrations/integration-token-storage';
import { err, ok } from '../../../domain/shared/result';
import type { Result } from '../../../domain/shared/result';
import type { Logger } from '../../logging/logger';
import { IgdbPerUserResources } from '../igdb-per-user-resources';

const USER_A = 'user-a';
const USER_B = 'user-b';

function makeFakeRepo(opts: {
  rows?: Record<string, { clientId: string; enabled: boolean; ciphertext: string } | null>;
  onRead?: () => void;
}): IntegrationCredentialsRepository {
  const repo: IntegrationCredentialsRepository = {
    async findByUserAndKind(userId, kind) {
      opts.onRead?.();
      const r = opts.rows?.[userId];
      if (!r) return null;
      return IntegrationCredentials.fromPersistence({
        id: `id-${userId}`,
        userId,
        integration: kind,
        enabled: r.enabled,
        clientId: r.clientId,
        clientSecretCiphertext: r.ciphertext,
        lastVerifiedAt: new Date('2026-01-01T00:00:00Z'),
        createdAt: new Date('2026-01-01T00:00:00Z'),
        updatedAt: new Date('2026-01-01T00:00:00Z'),
      });
    },
    async save() {},
    async delete() {},
    withTx() { return repo; },
  };
  return repo;
}

function makeFakeCipher(
  decrypt: (ct: string) => Result<string, CipherError> = (ct) =>
    ct.startsWith('enc:') ? ok(ct.slice(4)) : err({ kind: 'tampered' }),
): IntegrationCipher {
  return { encrypt: (p) => `enc:${p}`, decrypt };
}

function makeFakeStorage(): IntegrationTokenStorage {
  const m = new Map<string, StoredIntegrationToken>();
  const key = (u: string, k: string) => `${u}:${k}`;
  const storage: IntegrationTokenStorage = {
    async read(u, k: IntegrationKind) { return m.get(key(u, k)) ?? null; },
    async write(u, k: IntegrationKind, r) { m.set(key(u, k), r); },
    async clear(u, k: IntegrationKind) { m.delete(key(u, k)); },
    withTx() { return storage; },
  };
  return storage;
}

function makeFakeLogger(events: Array<{ name: string; fields: unknown }>): Logger {
  const logger = {
    event(name: string, fields: unknown) { events.push({ name, fields }); },
    info() {}, warn() {}, error() {}, debug() {},
    child() { return logger; },
    level: 'info' as const,
  };
  return logger as unknown as Logger;
}

describe('IgdbPerUserResources', () => {
  it('cold cache, missing row → resolves null', async () => {
    const cache = new IgdbPerUserResources(
      makeFakeRepo({}),
      makeFakeCipher(),
      makeFakeStorage(),
      makeFakeLogger([]),
    );
    expect(await cache.get(USER_A)).toBeNull();
  });

  it('cold cache, disabled row → resolves null and does NOT cache (next save can rebuild)', async () => {
    let reads = 0;
    const cache = new IgdbPerUserResources(
      makeFakeRepo({
        rows: { [USER_A]: { clientId: 'cid', enabled: false, ciphertext: 'enc:sec' } },
        onRead: () => { reads += 1; },
      }),
      makeFakeCipher(),
      makeFakeStorage(),
      makeFakeLogger([]),
    );
    expect(await cache.get(USER_A)).toBeNull();
    expect(await cache.get(USER_A)).toBeNull();
    expect(reads).toBe(2); // not cached: second call hit the repo again
  });

  it('enabled row → resources carry clientId from the row', async () => {
    const cache = new IgdbPerUserResources(
      makeFakeRepo({
        rows: { [USER_A]: { clientId: 'cid-a', enabled: true, ciphertext: 'enc:sec-a' } },
      }),
      makeFakeCipher(),
      makeFakeStorage(),
      makeFakeLogger([]),
    );
    const r = await cache.get(USER_A);
    expect(r).not.toBeNull();
    expect(r!.clientId).toBe('cid-a');
  });

  it('warm cache: second get() does NOT hit the repo', async () => {
    let reads = 0;
    const cache = new IgdbPerUserResources(
      makeFakeRepo({
        rows: { [USER_A]: { clientId: 'cid', enabled: true, ciphertext: 'enc:sec' } },
        onRead: () => { reads += 1; },
      }),
      makeFakeCipher(),
      makeFakeStorage(),
      makeFakeLogger([]),
    );
    await cache.get(USER_A);
    await cache.get(USER_A);
    await cache.get(USER_A);
    expect(reads).toBe(1);
  });

  it('per-user isolation: A and B keep separate entries', async () => {
    const cache = new IgdbPerUserResources(
      makeFakeRepo({
        rows: {
          [USER_A]: { clientId: 'cid-a', enabled: true, ciphertext: 'enc:a' },
          [USER_B]: { clientId: 'cid-b', enabled: true, ciphertext: 'enc:b' },
        },
      }),
      makeFakeCipher(),
      makeFakeStorage(),
      makeFakeLogger([]),
    );
    const a = await cache.get(USER_A);
    const b = await cache.get(USER_B);
    expect(a?.clientId).toBe('cid-a');
    expect(b?.clientId).toBe('cid-b');
    expect(a).not.toBe(b);
  });

  it('decrypt failure → null + logs igdb.resources.decrypt_failed', async () => {
    const events: Array<{ name: string; fields: unknown }> = [];
    const cache = new IgdbPerUserResources(
      makeFakeRepo({
        rows: { [USER_A]: { clientId: 'cid', enabled: true, ciphertext: 'corrupt-no-prefix' } },
      }),
      makeFakeCipher(),
      makeFakeStorage(),
      makeFakeLogger(events),
    );
    expect(await cache.get(USER_A)).toBeNull();
    expect(events.some((e) => e.name === 'igdb.resources.decrypt_failed')).toBe(true);
  });

  it('invalidate(userId) drops the cached entry', async () => {
    let reads = 0;
    const cache = new IgdbPerUserResources(
      makeFakeRepo({
        rows: { [USER_A]: { clientId: 'cid', enabled: true, ciphertext: 'enc:sec' } },
        onRead: () => { reads += 1; },
      }),
      makeFakeCipher(),
      makeFakeStorage(),
      makeFakeLogger([]),
    );
    await cache.get(USER_A);
    cache.invalidate(USER_A);
    await cache.get(USER_A);
    expect(reads).toBe(2);
  });

  it('invalidate during in-flight build does NOT revive a stale cache entry', async () => {
    let reads = 0;
    let resolveRead!: () => void;
    const gate = new Promise<void>((r) => { resolveRead = r; });
    const repo: IntegrationCredentialsRepository = {
      async findByUserAndKind(userId, kind) {
        reads += 1;
        await gate;
        return IntegrationCredentials.fromPersistence({
          id: 'id', userId, integration: kind, enabled: true,
          clientId: 'cid', clientSecretCiphertext: 'enc:sec',
          lastVerifiedAt: new Date(), createdAt: new Date(), updatedAt: new Date(),
        });
      },
      async save() {}, async delete() {},
      withTx() { return repo; },
    };
    const cache = new IgdbPerUserResources(repo, makeFakeCipher(), makeFakeStorage(), makeFakeLogger([]));

    const p1 = cache.get(USER_A);
    cache.invalidate(USER_A);
    resolveRead();
    await p1;

    // A subsequent get MUST perform a fresh DB read — the in-flight build's
    // result was invalidated before it could be cached.
    await cache.get(USER_A);
    expect(reads).toBe(2);
  });

  it('single-flight: two concurrent get(sameUserId) share one DB read', async () => {
    let reads = 0;
    let resolveRead!: () => void;
    const repoReadGate = new Promise<void>((r) => { resolveRead = r; });
    const repo: IntegrationCredentialsRepository = {
      async findByUserAndKind(userId, kind) {
        reads += 1;
        await repoReadGate;
        return IntegrationCredentials.fromPersistence({
          id: 'id', userId, integration: kind, enabled: true,
          clientId: 'cid', clientSecretCiphertext: 'enc:sec',
          lastVerifiedAt: new Date(), createdAt: new Date(), updatedAt: new Date(),
        });
      },
      async save() {},
      async delete() {},
      withTx() { return repo; },
    };
    const cache = new IgdbPerUserResources(repo, makeFakeCipher(), makeFakeStorage(), makeFakeLogger([]));
    const p1 = cache.get(USER_A);
    const p2 = cache.get(USER_A);
    resolveRead();
    const [a, b] = await Promise.all([p1, p2]);
    expect(reads).toBe(1);
    expect(a).toBe(b); // identical resources object
  });
});
