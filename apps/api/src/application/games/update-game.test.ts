import { describe, expect, it } from 'bun:test';
import { Game, type GameUpdate } from '../../domain/games/game';
import { HoursPlayed, ReleaseYear } from '../../domain/games/game';
import type { GameRepository } from '../../domain/games/game-repository';
import { UpdateGame } from './update-game';

class FakeGameRepository implements GameRepository {
  private games = new Map<number, Game>();

  list = async () => ({ items: [], total: 0 });
  create = async (g: GameUpdate) => {
    return Game.fromPersistence({
      id: Date.now(),
      title: g.title,
      developer: g.developer,
      genre: g.genre,
      releaseYear: g.releaseYear.value,
      platform: g.platform,
      edition: g.edition ?? null,
      hoursPlayed: g.hoursPlayed.value,
      status: g.status,
    });
  };

  async findById(id: number): Promise<Game | null> {
    return this.games.get(id) ?? null;
  }

  async update(id: number, game: GameUpdate): Promise<Game | null> {
    const existing = this.games.get(id);
    if (!existing) return null;
    const updated = Game.fromPersistence({
      id: existing.id,
      title: game.title,
      developer: game.developer,
      genre: game.genre,
      releaseYear: game.releaseYear.value,
      platform: game.platform,
      edition: game.edition ?? null,
      hoursPlayed: game.hoursPlayed.value,
      status: game.status,
    });
    this.games.set(id, updated);
    return updated;
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

const validInput = {
  title: 'Elden Ring',
  developer: 'FromSoftware',
  genre: 'ARPG',
  releaseYear: 2022,
  platform: 'PS5' as const,
  edition: undefined,
  hoursPlayed: 120,
  status: 'Completed' as const,
};

const existingGame = Game.fromPersistence({
  id: 1,
  title: 'Dark Souls',
  developer: 'FromSoftware',
  genre: 'ARPG',
  releaseYear: 2011,
  platform: 'PS3',
  edition: null,
  hoursPlayed: 50,
  status: 'Completed',
});

describe('UpdateGame', () => {
  it('updates game and returns ok', async () => {
    const repo = new FakeGameRepository();
    repo.seed(existingGame);
    const useCase = new UpdateGame(repo);

    const result = await useCase.execute(1, validInput);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.title).toBe('Elden Ring');
      expect(result.value.developer).toBe('FromSoftware');
      expect(result.value.id).toBe(1);
    }
  });

  it('returns not_found when game does not exist', async () => {
    const repo = new FakeGameRepository();
    const useCase = new UpdateGame(repo);

    const result = await useCase.execute(99, validInput);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe('not_found');
    }
  });

  it('returns invalid_input for empty title', async () => {
    const repo = new FakeGameRepository();
    repo.seed(existingGame);
    const useCase = new UpdateGame(repo);

    const result = await useCase.execute(1, { ...validInput, title: '' });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe('invalid_input');
    }
  });

  it('returns invalid_input for empty developer', async () => {
    const repo = new FakeGameRepository();
    repo.seed(existingGame);
    const useCase = new UpdateGame(repo);

    const result = await useCase.execute(1, { ...validInput, developer: '' });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe('invalid_input');
    }
  });

  it('returns invalid_input for releaseYear out of range', async () => {
    const repo = new FakeGameRepository();
    repo.seed(existingGame);
    const useCase = new UpdateGame(repo);

    const result = await useCase.execute(1, { ...validInput, releaseYear: 1900 });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe('invalid_input');
    }
  });

  it('returns invalid_input for negative hoursPlayed', async () => {
    const repo = new FakeGameRepository();
    repo.seed(existingGame);
    const useCase = new UpdateGame(repo);

    const result = await useCase.execute(1, { ...validInput, hoursPlayed: -5 });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe('invalid_input');
    }
  });
});
