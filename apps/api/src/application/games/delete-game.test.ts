import { describe, expect, it } from 'bun:test';
import { Game } from '../../domain/games/game';
import type { GameRepository } from '../../domain/games/game-repository';
import type { GameUpdate } from '../../domain/games/game-update';
import type { NewGame } from '../../domain/games/new-game';
import { InlineTransactionRunner } from '../shared/__tests__/inline-transaction-runner';
import { DeleteGame } from './delete-game';

class FakeGameRepository implements GameRepository {
  private games = new Map<number, Game>();

  withTx = (_tx: unknown): GameRepository => this;
  list = async () => ({ items: [], total: 0 });
  listAll = async (): Promise<Game[]> => [];
  findByExternalId = async (userId: string, externalId: string): Promise<Game | null> => {
    return (
      [...this.games.values()].find((g) => g.externalId === externalId && g.userId === userId) ??
      null
    );
  };
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
  update = async (
    _userId: string,
    _externalId: string,
    _game: GameUpdate,
    _expectedUpdatedAt: Date,
  ): Promise<Game | null> => {
    return null;
  };

  async delete(userId: string, externalId: string, _expectedUpdatedAt: Date): Promise<Game | null> {
    const game = [...this.games.values()].find(
      (g) => g.externalId === externalId && g.userId === userId,
    );
    if (!game) return null;
    this.games.delete(game.id);
    return game;
  }

  async countByPlatform(_userId: string, _platformName: string): Promise<number> {
    return 0;
  }
  async countByGenre(): Promise<number> {
    return 0;
  }
  async countByDeveloper(): Promise<number> {
    return 0;
  }

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
    const useCase = new DeleteGame(repo, new InlineTransactionRunner());

    const result = await useCase.execute('ext-game-1', 'user-A');

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.id).toBe(1);
      expect(result.value.title).toBe('Dark Souls');
    }
  });

  it('returns not_found when game does not exist', async () => {
    const repo = new FakeGameRepository();
    const useCase = new DeleteGame(repo, new InlineTransactionRunner());

    const result = await useCase.execute('nonexistent', 'user-A');

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe('not_found');
    }
  });

  it('returns not_found and leaves game intact when user does not own it (IDOR)', async () => {
    const repo = new FakeGameRepository();
    repo.seed(existingGame);
    const useCase = new DeleteGame(repo, new InlineTransactionRunner());

    const result = await useCase.execute('ext-game-1', 'user-B');

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe('not_found');
    }
    const stillExists = await repo.findByExternalId('user-A', 'ext-game-1');
    expect(stillExists).not.toBeNull();
  });

  it('does NOT touch cover storage when deleting a game with a cover (cron-only cleanup)', async () => {
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
    const useCase = new DeleteGame(repo, new InlineTransactionRunner());

    const result = await useCase.execute('ext-game-1', 'user-A');
    expect(result.ok).toBe(true);
    // Regression guard: the constructor must NOT accept a CoverStorage
    // dependency. The cron sweep is the single source of truth for
    // orphan cleanup.
    expect(useCase.constructor.length).toBe(2);
  });
});
