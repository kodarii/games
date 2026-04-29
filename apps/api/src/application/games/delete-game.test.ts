import { describe, expect, it } from 'bun:test';
import { Game, type GameUpdate } from '../../domain/games/game';
import type { GameRepository } from '../../domain/games/game-repository';
import { DeleteGame } from './delete-game';

class FakeGameRepository implements GameRepository {
  private games = new Map<number, Game>();

  list = async () => ({ items: [], total: 0 });
  listAll = async (): Promise<Game[]> => [];
  findByExternalId = async (): Promise<Game | null> => null;
  create = async (g: GameUpdate) => {
    return Game.fromPersistence({
      id: Date.now(),
      externalId: g.externalId,
      userId: g.userId,
      title: g.title,
      developer: g.developer,
      genre: g.genre,
      releaseYear: g.releaseYear.value,
      platform: g.platform,
      edition: g.edition ?? null,
      hoursPlayed: g.hoursPlayed.value,
      status: g.status,
      format: g.format,
    });
  };
  update = async (id: number, game: GameUpdate) => {
    const existing = this.games.get(id);
    if (!existing) return null;
    const updated = Game.fromPersistence({
      id: existing.id,
      externalId: existing.externalId,
      userId: game.userId,
      title: game.title,
      developer: game.developer,
      genre: game.genre,
      releaseYear: game.releaseYear.value,
      platform: game.platform,
      edition: game.edition ?? null,
      hoursPlayed: game.hoursPlayed.value,
      status: game.status,
      format: game.format,
    });
    this.games.set(id, updated);
    return updated;
  };

  async findById(id: number): Promise<Game | null> {
    return this.games.get(id) ?? null;
  }

  async delete(id: number): Promise<Game | null> {
    const game = this.games.get(id);
    if (!game) return null;
    this.games.delete(id);
    return game;
  }

  async countByPlatform(_userId: string, _platformName: string): Promise<number> {
    return 0;
  }

  seed(game: Game): void {
    this.games.set(game.id, game);
  }
}

const existingGame = Game.fromPersistence({
  id: 1,
  externalId: 'ext-game-1',
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
    const useCase = new DeleteGame(repo);

    const result = await useCase.execute(1, 'user-A');

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.id).toBe(1);
      expect(result.value.title).toBe('Dark Souls');
    }
  });

  it('returns not_found when game does not exist', async () => {
    const repo = new FakeGameRepository();
    const useCase = new DeleteGame(repo);

    const result = await useCase.execute(99, 'user-A');

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe('not_found');
    }
  });

  it('returns not_found and leaves game intact when user does not own it (IDOR)', async () => {
    const repo = new FakeGameRepository();
    repo.seed(existingGame);
    const useCase = new DeleteGame(repo);

    const result = await useCase.execute(1, 'user-B');

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe('not_found');
    }
    const stillExists = await repo.findById(1);
    expect(stillExists).not.toBeNull();
  });
});
