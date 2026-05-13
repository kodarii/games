import { beforeEach, describe, expect, it } from 'bun:test';
import { IntegrationCredentials as IntegrationCredentialsClass } from '../../../domain/integrations/integration-credentials';
import type { IntegrationCredentialsRepository } from '../../../domain/integrations/integration-credentials-repository';
import type { IntegrationKind } from '../../../domain/integrations/integration-value-objects';
import type {
  IgdbTokenStorage,
  StoredIgdbToken,
} from '../../../infrastructure/igdb/igdb-token-store';
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

function makeFakeTokenStorage(log: CallLog): IgdbTokenStorage {
  let row: StoredIgdbToken | null = {
    accessToken: 'token',
    expiresAt: new Date(),
    obtainedAt: new Date(),
  };
  const storage: IgdbTokenStorage = {
    async read() {
      return row;
    },
    async write(record) {
      row = record;
    },
    async clear() {
      log.push('tokenStorage.clear');
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

interface FakeChainHolder {
  swap(creds: { clientId: string; clientSecret: string } | null): void;
  readonly swaps: ReadonlyArray<{ clientId: string; clientSecret: string } | null>;
}

function makeFakeChainHolder(log: CallLog): FakeChainHolder {
  const swaps: Array<{ clientId: string; clientSecret: string } | null> = [];
  return {
    swap(creds) {
      log.push('chainHolder.swap');
      swaps.push(creds);
    },
    get swaps() {
      return swaps;
    },
  };
}

describe('ClearIgdbIntegration', () => {
  let log: CallLog;
  let repo: IntegrationCredentialsRepository;
  let tokenStorage: IgdbTokenStorage;
  let txRunner: TransactionRunner;
  let chainHolder: FakeChainHolder;
  let useCase: ClearIgdbIntegration;

  beforeEach(() => {
    log = makeCallLog();
    repo = makeFakeRepo(log);
    tokenStorage = makeFakeTokenStorage(log);
    txRunner = makeFakeTxRunner(log);
    chainHolder = makeFakeChainHolder(log);
    useCase = new ClearIgdbIntegration({
      repo,
      tokenStorage,
      chainHolder,
      transactionRunner: txRunner,
    });
  });

  it('clear with existing row + existing token deletes both inside transaction, then swaps to null', async () => {
    const result = await useCase.execute(USER_ID);
    expect(result.ok).toBe(true);

    // tx.begin happens first; both deletes happen inside it; tx.commit
    // happens before the chain swap.
    expect(log.entries[0]).toBe('tx.begin');
    expect(log.entries).toContain('repo.delete');
    expect(log.entries).toContain('tokenStorage.clear');

    const commitIdx = log.entries.indexOf('tx.commit');
    const repoDeleteIdx = log.entries.indexOf('repo.delete');
    const tokenClearIdx = log.entries.indexOf('tokenStorage.clear');
    const swapIdx = log.entries.indexOf('chainHolder.swap');
    expect(repoDeleteIdx).toBeLessThan(commitIdx);
    expect(tokenClearIdx).toBeLessThan(commitIdx);
    expect(swapIdx).toBeGreaterThan(commitIdx);

    expect(chainHolder.swaps).toEqual([null]);
  });

  it('clear with no existing row also succeeds and swaps to null', async () => {
    repo = makeFakeRepo(log, { initialRow: false });
    useCase = new ClearIgdbIntegration({
      repo,
      tokenStorage,
      chainHolder,
      transactionRunner: txRunner,
    });

    const result = await useCase.execute(USER_ID);
    expect(result.ok).toBe(true);
    expect(chainHolder.swaps).toEqual([null]);
  });

  it('if repo.delete throws, transaction rolls back and chainHolder.swap is NOT called', async () => {
    repo = makeFakeRepo(log, { deleteThrows: true });
    useCase = new ClearIgdbIntegration({
      repo,
      tokenStorage,
      chainHolder,
      transactionRunner: txRunner,
    });

    await expect(useCase.execute(USER_ID)).rejects.toThrow('repo.delete failed');

    expect(log.entries).toContain('tx.rollback');
    expect(log.entries).not.toContain('tx.commit');
    expect(log.entries).not.toContain('chainHolder.swap');
    expect(chainHolder.swaps).toEqual([]);
  });

  it('chainHolder.swap is called AFTER the transaction commits', async () => {
    await useCase.execute(USER_ID);
    const commitIdx = log.entries.indexOf('tx.commit');
    const swapIdx = log.entries.indexOf('chainHolder.swap');
    expect(commitIdx).toBeGreaterThanOrEqual(0);
    expect(swapIdx).toBeGreaterThan(commitIdx);
  });

  it('repo and tokenStorage are bound to the transaction via withTx(tx)', async () => {
    await useCase.execute(USER_ID);
    expect(log.entries.some((e) => e.startsWith('repo.withTx('))).toBe(true);
    expect(log.entries.some((e) => e.startsWith('tokenStorage.withTx('))).toBe(true);
  });
});
