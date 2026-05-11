import { describe, expect, it } from 'bun:test';
import { Game, type GameUpdate, type NewGame } from '../../domain/games/game';
import type { GameRepository } from '../../domain/games/game-repository';
import type { CoverStorage } from '../cover-storage/cover-storage';
import { DeleteGame } from './delete-game';

class FakeCoverStorage implements CoverStorage {
  deleted: string[] = [];
  upload = async () => ({ url: 'https://fake/uploaded' });
  delete = async (url: string) => {
    this.deleted.push(url);
  };
  listOlderThan = async () => [];
}

class FakeGameRepository implements GameRepository {
  private games = new Map<number, Game>();

  list = async () => ({ items: [], total: 0 });
  listAll = async (): Promise<Game[]> => [];
  findByExternalId = async (): Promise<Game | null> => null;
  create = async (g: NewGame) => {
    return Game.fromPersistence({
      id: Date.now(),
      externalId: g.externalId,
      kind: g.kind,
      userId: g.userId,
      title: g.title,
      developer: g.developer,
      genre: g.genre,
      releaseYear: g.releaseYear?.value ?? null,
      platform: g.platform,
      edition: g.edition ?? null,
      hoursPlayed: g.hoursPlayed?.value ?? null,
      status: g.status,
      format: g.format,
    });
  };
  update = async (_userId: string, _externalId: string, _game: GameUpdate): Promise<Game | null> => {
    return null;
  };

  async findById(id: number): Promise<Game | null> {
    return this.games.get(id) ?? null;
  }

  async delete(userId: string, externalId: string): Promise<Game | null> {
    const game = [...this.games.values()].find(g => g.externalId === externalId && g.userId === userId);
    if (!game) return null;
    this.games.delete(game.id);
    return game;
  }

  async countByPlatform(_userId: string, _platformName: string): Promise<number> {
    return 0;
  }
  async countByGenre(): Promise<number> { return 0; }
  async countByDeveloper(): Promise<number> { return 0; }

  async findAllCoverImages(): Promise<string[]> {
    return [];
  }
  async saveMetadata(): Promise<Game | null> {
    return null;
  }

  seed(game: Game): void {
    this.games.set(game.id, game);
  }
}

const existingGame = Game.fromPersistence({
  id: 1,
  externalId: 'ext-game-1',
  kind: 'owned',
  userId: 'user-A',
  title: 'Dark Souls',
  developer: 'FromSoftware',
  genre: 'ARPG',
  releaseYear: 2011,
  platform: 'PS3',
  edition: null,
  hoursPlayed: 50,
  status: 'Completed',
  format: 'digital',
});

describe('DeleteGame', () => {
  it('deletes game and returns ok', async () => {
    const repo = new FakeGameRepository();
    repo.seed(existingGame);
    const coverStorage = new FakeCoverStorage();
    const useCase = new DeleteGame(repo, coverStorage);

    const result = await useCase.execute('ext-game-1', 'user-A');

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.id).toBe(1);
      expect(result.value.title).toBe('Dark Souls');
    }
  });

  it('returns not_found when game does not exist', async () => {
    const repo = new FakeGameRepository();
    const coverStorage = new FakeCoverStorage();
    const useCase = new DeleteGame(repo, coverStorage);

    const result = await useCase.execute('nonexistent', 'user-A');

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe('not_found');
    }
  });

  it('returns not_found and leaves game intact when user does not own it (IDOR)', async () => {
    const repo = new FakeGameRepository();
    repo.seed(existingGame);
    const coverStorage = new FakeCoverStorage();
    const useCase = new DeleteGame(repo, coverStorage);

    const result = await useCase.execute('ext-game-1', 'user-B');

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe('not_found');
    }
    const stillExists = await repo.findById(1);
    expect(stillExists).not.toBeNull();
  });

  it('deletes cover from storage when game with cover is deleted', async () => {
    const repo = new FakeGameRepository();
    const gameWithCover = Game.fromPersistence({
      id: 1,
      externalId: 'ext-game-1',
      kind: 'owned',
      userId: 'user-A',
      title: 'Dark Souls',
      developer: 'FromSoftware',
      genre: 'ARPG',
      releaseYear: 2011,
      platform: 'PS3',
      edition: null,
      hoursPlayed: 50,
      status: 'Completed',
      format: 'digital',
      coverImage: 'https://utfs.io/f/some-key',
    });
    repo.seed(gameWithCover);
    const coverStorage = new FakeCoverStorage();
    const useCase = new DeleteGame(repo, coverStorage);

    await useCase.execute('ext-game-1', 'user-A');
    await Promise.resolve();
    expect(coverStorage.deleted).toEqual(['https://utfs.io/f/some-key']);
  });

  it('does not call storage when game has no cover', async () => {
    const repo = new FakeGameRepository();
    repo.seed(existingGame);
    const coverStorage = new FakeCoverStorage();
    const useCase = new DeleteGame(repo, coverStorage);

    await useCase.execute('ext-game-1', 'user-A');
    await Promise.resolve();
    expect(coverStorage.deleted).toEqual([]);
  });
});
