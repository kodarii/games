import { describe, expect, it } from 'bun:test';
import type { Game } from '../../domain/games/game';
import type { GameRepository } from '../../domain/games/game-repository';
import { DeleteGame } from './delete-game';

class FakeGameRepository implements GameRepository {
  private games = new Map<number, Game>();

  list = async () => ({ items: [], total: 0 });
  create = async (g: Game) => g;
  update = async (id: number, game: Game) => {
    const existing = this.games.get(id);
    if (!existing) return null;
    const updated = { ...existing, ...game };
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

  seed(game: Game): void {
    this.games.set(game.id, game);
  }
}

const existingGame: Game = {
  id: 1,
  title: 'Dark Souls',
  developer: 'FromSoftware',
  genre: 'ARPG',
  releaseYear: 2011,
  platform: 'PS3',
  edition: undefined,
  hoursPlayed: 50,
  status: 'Completed',
};

describe('DeleteGame', () => {
  it('deletes game and returns ok', async () => {
    const repo = new FakeGameRepository();
    repo.seed(existingGame);
    const useCase = new DeleteGame(repo);

    const result = await useCase.execute(1);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.id).toBe(1);
      expect(result.value.title).toBe('Dark Souls');
    }
  });

  it('returns not_found when game does not exist', async () => {
    const repo = new FakeGameRepository();
    const useCase = new DeleteGame(repo);

    const result = await useCase.execute(99);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe('not_found');
    }
  });
});
