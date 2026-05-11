import { describe, expect, it } from 'bun:test';
import type { Game, GameUpdate, NewGame } from '../../domain/games/game';
import type { GameRepository, ListGamesQuery, ListGamesResult } from '../../domain/games/game-repository';
import type { CoverStorage } from './cover-storage';
import { CleanupOrphans } from './cleanup-orphans';

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
  list = async (_q: ListGamesQuery): Promise<ListGamesResult> => ({ items: [], total: 0 });
  listAll = async (): Promise<Game[]> => [];
  findById = async (): Promise<Game | null> => null;
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

describe('CleanupOrphans', () => {
  it('deletes only files not present in DB', async () => {
    const storage = new FakeStorage(['url-A', 'url-B', 'url-C']);
    const repo = new FakeGameRepository(['url-A']);
    const cleanup = new CleanupOrphans(storage, repo);

    const r = await cleanup.run();

    expect(storage.deleted.sort()).toEqual(['url-B', 'url-C']);
    expect(r).toEqual({ listed: 3, inDb: 1, orphans: 2, deleted: 2, failed: 0 });
  });

  it('does nothing when all files have DB references', async () => {
    const storage = new FakeStorage(['url-A']);
    const repo = new FakeGameRepository(['url-A']);
    const cleanup = new CleanupOrphans(storage, repo);

    const r = await cleanup.run();

    expect(storage.deleted).toEqual([]);
    expect(r.deleted).toBe(0);
  });

  it('matches files by key even when URL domains differ', async () => {
    // storage returns utfs.io URLs, DB has ufs.sh URLs — same file key, different domain
    const storage = new FakeStorage([
      'https://utfs.io/f/key-abc',
      'https://utfs.io/f/key-orphan',
    ]);
    const repo = new FakeGameRepository(['https://xxxx.ufs.sh/f/key-abc']);
    const cleanup = new CleanupOrphans(storage, repo);

    const r = await cleanup.run();

    expect(storage.deleted).toEqual(['https://utfs.io/f/key-orphan']);
    expect(r).toEqual({ listed: 2, inDb: 1, orphans: 1, deleted: 1, failed: 0 });
  });

  it('handles empty storage', async () => {
    const storage = new FakeStorage([]);
    const repo = new FakeGameRepository(['url-A']);
    const cleanup = new CleanupOrphans(storage, repo);

    const r = await cleanup.run();

    expect(r).toEqual({ listed: 0, inDb: 1, orphans: 0, deleted: 0, failed: 0 });
  });
});
