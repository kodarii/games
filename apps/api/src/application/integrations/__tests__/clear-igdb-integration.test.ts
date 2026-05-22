import { beforeEach, describe, expect, it } from 'bun:test';
import { IntegrationCredentials as IntegrationCredentialsClass } from '../../../domain/integrations/integration-credentials';
import type { IntegrationCredentialsRepository } from '../../../domain/integrations/integration-credentials-repository';
import type {
  IntegrationTokenStorage,
  StoredIntegrationToken,
} from '../../../domain/integrations/integration-token-storage';
import type { IntegrationKind } from '../../../domain/integrations/integration-value-objects';
import type { TransactionRunner } from '../../shared/transaction-runner';
import { ClearIgdbIntegration } from '../clear-igdb-integration';

const USER_ID = 'user-clear';
const TX_TOKEN = Symbol('tx');

interface CallLog {
  push(entry: string): void;
  readonly entries: ReadonlyArray<string>;
}

function makeCallLog(): CallLog {
  const entries: string[] = [];
  return {
    push(entry) {
      entries.push(entry);
    },
    get entries() {
      return entries;
    },
  };
}

function makeFakeRepo(
  log: CallLog,
  opts: { initialRow?: boolean; deleteThrows?: boolean } = {},
): IntegrationCredentialsRepository {
  let hasRow = opts.initialRow ?? true;
  const repo: IntegrationCredentialsRepository = {
    async findByUserAndKind(userId, kind) {
      if (!hasRow) return null;
      return IntegrationCredentialsClass.fromPersistence({
        id: 'cred-id',
        userId,
        integration: kind,
        enabled: true,
        clientId: 'cid',
        clientSecretCiphertext: 'enc:secret',
        lastVerifiedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    },
    async save() {
      throw new Error('not used in clear');
    },
    async delete(_userId, _kind: IntegrationKind) {
      if (opts.deleteThrows) {
        log.push('repo.delete:throw');
        throw new Error('repo.delete failed');
      }
      log.push('repo.delete');
      hasRow = false;
    },
    withTx(tx) {
      log.push(`repo.withTx(${String(tx)})`);
      return repo;
    },
  };
  return repo;
}

function makeFakeTokenStorage(log: CallLog): IntegrationTokenStorage {
  let row: StoredIntegrationToken | null = {
    accessToken: 'token',
    expiresAt: new Date(),
    obtainedAt: new Date(),
  };
  const storage: IntegrationTokenStorage = {
    async read() {
      return row;
    },
    async write(_userId, _kind, record) {
      row = record;
    },
    async clear(userId, kind) {
      log.push(`tokenStorage.clear(${userId},${kind})`);
      row = null;
    },
    withTx(tx) {
      log.push(`tokenStorage.withTx(${String(tx)})`);
      return storage;
    },
  };
  return storage;
}

function makeFakeTxRunner(log: CallLog, opts: { rollback?: boolean } = {}): TransactionRunner {
  return {
    async run(cb) {
      log.push('tx.begin');
      try {
        const result = await cb(TX_TOKEN);
        if (opts.rollback) {
          log.push('tx.rollback-forced');
          throw new Error('forced rollback');
        }
        log.push('tx.commit');
        return result;
      } catch (e) {
        log.push('tx.rollback');
        throw e;
      }
    },
  };
}

interface FakeInvalidator {
  invalidate(userId: string): void;
  readonly invalidations: ReadonlyArray<string>;
}

function makeFakeInvalidator(log: CallLog): FakeInvalidator {
  const invalidations: string[] = [];
  return {
    invalidate(userId) {
      log.push(`invalidator.invalidate(${userId})`);
      invalidations.push(userId);
    },
    get invalidations() {
      return invalidations;
    },
  };
}

describe('ClearIgdbIntegration', () => {
  let log: CallLog;
  let repo: IntegrationCredentialsRepository;
  let tokenStorage: IntegrationTokenStorage;
  let txRunner: TransactionRunner;
  let invalidator: FakeInvalidator;
  let useCase: ClearIgdbIntegration;

  beforeEach(() => {
    log = makeCallLog();
    repo = makeFakeRepo(log);
    tokenStorage = makeFakeTokenStorage(log);
    txRunner = makeFakeTxRunner(log);
    invalidator = makeFakeInvalidator(log);
    useCase = new ClearIgdbIntegration({
      repo,
      tokenStorage,
      resourceCache: invalidator,
      transactionRunner: txRunner,
    });
  });

  it('clear with existing row + existing token deletes both inside transaction, then invalidates cache', async () => {
    const result = await useCase.execute(USER_ID);
    expect(result.ok).toBe(true);

    // tx.begin happens first; both deletes happen inside it; tx.commit
    // happens before cache invalidation.
    expect(log.entries[0]).toBe('tx.begin');
    expect(log.entries).toContain('repo.delete');
    expect(log.entries).toContain(`tokenStorage.clear(${USER_ID},igdb)`);

    const commitIdx = log.entries.indexOf('tx.commit');
    const repoDeleteIdx = log.entries.indexOf('repo.delete');
    const tokenClearIdx = log.entries.indexOf(`tokenStorage.clear(${USER_ID},igdb)`);
    const invalidateIdx = log.entries.indexOf(`invalidator.invalidate(${USER_ID})`);
    expect(repoDeleteIdx).toBeLessThan(commitIdx);
    expect(tokenClearIdx).toBeLessThan(commitIdx);
    expect(invalidateIdx).toBeGreaterThan(commitIdx);

    expect(invalidator.invalidations).toEqual([USER_ID]);
  });

  it('clear with no existing row also succeeds and invalidates cache', async () => {
    repo = makeFakeRepo(log, { initialRow: false });
    useCase = new ClearIgdbIntegration({
      repo,
      tokenStorage,
      resourceCache: invalidator,
      transactionRunner: txRunner,
    });

    const result = await useCase.execute(USER_ID);
    expect(result.ok).toBe(true);
    expect(invalidator.invalidations).toEqual([USER_ID]);
  });

  it('if repo.delete throws, transaction rolls back and invalidator is NOT called', async () => {
    repo = makeFakeRepo(log, { deleteThrows: true });
    useCase = new ClearIgdbIntegration({
      repo,
      tokenStorage,
      resourceCache: invalidator,
      transactionRunner: txRunner,
    });

    await expect(useCase.execute(USER_ID)).rejects.toThrow('repo.delete failed');

    expect(log.entries).toContain('tx.rollback');
    expect(log.entries).not.toContain('tx.commit');
    expect(log.entries).not.toContain(`invalidator.invalidate(${USER_ID})`);
    expect(invalidator.invalidations).toEqual([]);
  });

  it('invalidator.invalidate is called AFTER the transaction commits', async () => {
    await useCase.execute(USER_ID);
    const commitIdx = log.entries.indexOf('tx.commit');
    const invalidateIdx = log.entries.indexOf(`invalidator.invalidate(${USER_ID})`);
    expect(commitIdx).toBeGreaterThanOrEqual(0);
    expect(invalidateIdx).toBeGreaterThan(commitIdx);
  });

  it('repo and tokenStorage are bound to the transaction via withTx(tx)', async () => {
    await useCase.execute(USER_ID);
    expect(log.entries.some((e) => e.startsWith('repo.withTx('))).toBe(true);
    expect(log.entries.some((e) => e.startsWith('tokenStorage.withTx('))).toBe(true);
  });
});
