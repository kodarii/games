import { describe, expect, it } from 'bun:test';
import type { Game } from '../../domain/games/game';
import type {
  GameRepository,
  ListGamesQuery,
  ListGamesResult,
} from '../../domain/games/game-repository';
import type { GameUpdate } from '../../domain/games/game-update';
import type { NewGame } from '../../domain/games/new-game';
import type { LogFields, Logger } from '../../infrastructure/logging/logger';
import type {
  IdempotencyKeyRepository,
  IdempotencyRecord,
} from '../idempotency/idempotency-key-repository';
import { CleanupOrphans } from './cleanup-orphans';
import type { CoverStorage } from './cover-storage';

function makeFakeLogger(): { logger: Logger; events: Array<{ name: string; fields: LogFields }> } {
  const events: Array<{ name: string; fields: LogFields }> = [];
  const logger: Logger = {
    level: 'info',
    child: () => logger,
    event: (name, fields = {}) => events.push({ name, fields }),
    debug: () => {},
    info: () => {},
    warn: () => {},
    error: () => {},
  };
  return { logger, events };
}

class FakeIdempotencyRepo implements IdempotencyKeyRepository {
  deletedCalls: number[] = [];
  toDelete = 0;
  async find(_key: string, _userId: string): Promise<IdempotencyRecord | null> {
    return null;
  }
  async save(_record: IdempotencyRecord): Promise<void> {}
  async deleteOlderThan(olderThanMs: number): Promise<number> {
    this.deletedCalls.push(olderThanMs);
    return this.toDelete;
  }
}

class FakeStorage implements CoverStorage {
  deleted: string[] = [];
  constructor(private files: string[]) {}
  upload = async () => ({ url: '' });
  delete = async (u: string) => {
    this.deleted.push(u);
  };
  listOlderThan = async () => this.files;
}

class FakeGameRepository implements GameRepository {
  constructor(private urls: string[]) {}
  withTx = (_tx: unknown): GameRepository => this;
  list = async (_q: ListGamesQuery): Promise<ListGamesResult> => ({ items: [], total: 0 });
  listAll = async (): Promise<Game[]> => [];
  findByExternalId = async (): Promise<Game | null> => null;
  create = async (_g: NewGame): Promise<Game> => {
    throw new Error('unused');
  };
  update = async (): Promise<Game | null> => null;
  delete = async (): Promise<Game | null> => null;
  countByPlatform = async () => 0;
  countByGenre = async () => 0;
  countByDeveloper = async () => 0;
  findAllCoverImages = async () => this.urls;
  saveMetadata = async (): Promise<Game | null> => null;
}

class StubLock {
  acquireResult = true;
  released = 0;
  async tryAcquire(_name: string, _ttl: number): Promise<boolean> {
    return this.acquireResult;
  }
  async release(_name: string): Promise<void> {
    this.released += 1;
  }
}

describe('CleanupOrphans', () => {
  it('deletes only files not present in DB', async () => {
    const storage = new FakeStorage(['url-A', 'url-B', 'url-C']);
    const repo = new FakeGameRepository(['url-A']);
    const idempotency = new FakeIdempotencyRepo();
    const cleanup = new CleanupOrphans(storage, repo, idempotency);

    const r = await cleanup.run();

    expect(storage.deleted.sort()).toEqual(['url-B', 'url-C']);
    expect(r).toEqual({
      status: 'completed',
      details: {
        listed: 3,
        inDb: 1,
        orphans: 2,
        deleted: 2,
        failed: 0,
        idempotencyKeysDeleted: 0,
      },
    });
  });

  it('does nothing when all files have DB references', async () => {
    const storage = new FakeStorage(['url-A']);
    const repo = new FakeGameRepository(['url-A']);
    const idempotency = new FakeIdempotencyRepo();
    const cleanup = new CleanupOrphans(storage, repo, idempotency);

    const r = await cleanup.run();

    expect(storage.deleted).toEqual([]);
    if (r.status !== 'completed') throw new Error('expected completed');
    if (!r.details) throw new Error('expected details');
    expect(r.details.deleted).toBe(0);
  });

  it('matches files by key even when URL domains differ', async () => {
    // storage returns utfs.io URLs, DB has ufs.sh URLs — same file key, different domain
    const storage = new FakeStorage(['https://utfs.io/f/key-abc', 'https://utfs.io/f/key-orphan']);
    const repo = new FakeGameRepository(['https://xxxx.ufs.sh/f/key-abc']);
    const idempotency = new FakeIdempotencyRepo();
    const cleanup = new CleanupOrphans(storage, repo, idempotency);

    const r = await cleanup.run();

    expect(storage.deleted).toEqual(['https://utfs.io/f/key-orphan']);
    expect(r).toEqual({
      status: 'completed',
      details: {
        listed: 2,
        inDb: 1,
        orphans: 1,
        deleted: 1,
        failed: 0,
        idempotencyKeysDeleted: 0,
      },
    });
  });

  it('handles empty storage', async () => {
    const storage = new FakeStorage([]);
    const repo = new FakeGameRepository(['url-A']);
    const idempotency = new FakeIdempotencyRepo();
    const cleanup = new CleanupOrphans(storage, repo, idempotency);

    const r = await cleanup.run();

    expect(r).toEqual({
      status: 'completed',
      details: {
        listed: 0,
        inDb: 1,
        orphans: 0,
        deleted: 0,
        failed: 0,
        idempotencyKeysDeleted: 0,
      },
    });
  });

  it('skips when lock is held by another instance', async () => {
    const storage = new FakeStorage(['url-A']);
    const repo = new FakeGameRepository([]);
    const idempotency = new FakeIdempotencyRepo();
    const lock = new StubLock();
    lock.acquireResult = false;
    const cleanup = new CleanupOrphans(storage, repo, idempotency, lock);

    const r = await cleanup.run();

    expect(r).toEqual({ status: 'skipped', reason: 'lock_held' });
    expect(storage.deleted).toEqual([]);
    expect(lock.released).toBe(0);
    // Idempotency cache is NOT pruned when the lock is unavailable — the
    // winning instance handles it.
    expect(idempotency.deletedCalls).toEqual([]);
  });

  it('releases the lock after a successful sweep', async () => {
    const storage = new FakeStorage(['url-A']);
    const repo = new FakeGameRepository([]);
    const idempotency = new FakeIdempotencyRepo();
    const lock = new StubLock();
    const cleanup = new CleanupOrphans(storage, repo, idempotency, lock);

    const r = await cleanup.run();

    expect(r.status).toBe('completed');
    expect(lock.released).toBe(1);
  });

  it('skips when no cover storage is configured', async () => {
    const repo = new FakeGameRepository(['url-A']);
    const idempotency = new FakeIdempotencyRepo();
    const cleanup = new CleanupOrphans(null, repo, idempotency);

    const r = await cleanup.run();

    expect(r).toEqual({ status: 'skipped', reason: 'no_storage' });
    expect(idempotency.deletedCalls).toEqual([]);
  });

  it('prunes idempotency-key rows older than the configured TTL', async () => {
    const storage = new FakeStorage([]);
    const repo = new FakeGameRepository([]);
    const idempotency = new FakeIdempotencyRepo();
    idempotency.toDelete = 7;
    const now = 10_000_000;
    const ttlMs = 60_000;
    const cleanup = new CleanupOrphans(storage, repo, idempotency, undefined, {
      idempotencyTtlMs: ttlMs,
      now: () => now,
    });

    const r = await cleanup.run();

    if (r.status !== 'completed') throw new Error('expected completed');
    if (!r.details) throw new Error('expected details');
    expect(r.details.idempotencyKeysDeleted).toBe(7);
    expect(idempotency.deletedCalls).toEqual([now - ttlMs]);
  });

  it('emits idempotency.cleanup.done when idempotencyKeysDeleted > 0', async () => {
    const { logger, events } = makeFakeLogger();
    const storage = new FakeStorage([]);
    const repo = new FakeGameRepository([]);
    const idempotency = new FakeIdempotencyRepo();
    idempotency.toDelete = 3;
    const cleanup = new CleanupOrphans(storage, repo, idempotency, undefined, {
      idempotencyTtlMs: 10_000,
      now: () => 100_000,
      logger,
    });
    const result = await cleanup.run();
    expect(result).toEqual({
      status: 'completed',
      details: {
        listed: 0,
        inDb: 0,
        orphans: 0,
        deleted: 0,
        failed: 0,
        idempotencyKeysDeleted: 3,
      },
    });
    expect(events).toEqual([{ name: 'idempotency.cleanup.done', fields: { deleted: 3 } }]);
  });

  it('does NOT emit idempotency.cleanup.done when idempotencyKeysDeleted === 0', async () => {
    const { logger, events } = makeFakeLogger();
    const storage = new FakeStorage([]);
    const repo = new FakeGameRepository([]);
    const idempotency = new FakeIdempotencyRepo();
    idempotency.toDelete = 0;
    const cleanup = new CleanupOrphans(storage, repo, idempotency, undefined, {
      idempotencyTtlMs: 10_000,
      now: () => 100_000,
      logger,
    });
    await cleanup.run();
    expect(events).toEqual([]);
  });
});
