import { describe, expect, it } from 'bun:test';
import { Game, type GameUpdate } from '../../domain/games/game';
import type { GameRepository, ListGamesQuery } from '../../domain/games/game-repository';
import { ListGames } from './list-games';

class FakeGameRepository implements GameRepository {
  constructor(private readonly all: Game[]) {}

  list = async (query: ListGamesQuery) => {
    const filtered = this.all.filter((g) => g.userId === query.userId);
    const start = (query.page - 1) * query.perPage;
    const end = start + query.perPage;
    return { items: filtered.slice(start, end), total: filtered.length };
  };
  findById = async (): Promise<Game | null> => {
    throw new Error('not implemented');
  };
  create = async (_g: GameUpdate): Promise<Game> => {
    throw new Error('not implemented');
  };
  update = async (): Promise<Game | null> => {
    throw new Error('not implemented');
  };
  delete = async (): Promise<Game | null> => {
    throw new Error('not implemented');
  };
}

function makeGames(count: number, userId = 'user-A'): Game[] {
  return Array.from({ length: count }, (_, i) =>
    Game.fromPersistence({
      id: i + 1,
      userId,
      title: `Game ${i + 1}`,
      developer: 'Dev',
      genre: 'ARPG',
      releaseYear: 2020,
      platform: 'PS5',
      edition: null,
      hoursPlayed: 0,
      status: 'Backlog',
      format: 'digital',
    }),
  );
}

describe('ListGames', () => {
  it('hasMore is false when total fits on the requested page', async () => {
    const repo = new FakeGameRepository(makeGames(5));
    const useCase = new ListGames(repo);

    const result = await useCase.execute({ page: 1, perPage: 10 }, 'user-A');

    expect(result.items).toHaveLength(5);
    expect(result.total).toBe(5);
    expect(result.hasMore).toBe(false);
  });

  it('hasMore is true when more pages remain', async () => {
    const repo = new FakeGameRepository(makeGames(20));
    const useCase = new ListGames(repo);

    const result = await useCase.execute({ page: 1, perPage: 7 }, 'user-A');

    expect(result.items).toHaveLength(7);
    expect(result.total).toBe(20);
    expect(result.hasMore).toBe(true);
  });

  it('hasMore is false on the last (partial) page', async () => {
    const repo = new FakeGameRepository(makeGames(20));
    const useCase = new ListGames(repo);

    const result = await useCase.execute({ page: 3, perPage: 7 }, 'user-A');

    expect(result.items).toHaveLength(6);
    expect(result.total).toBe(20);
    expect(result.hasMore).toBe(false);
  });

  it('response does not include totalPages', async () => {
    const repo = new FakeGameRepository(makeGames(3));
    const useCase = new ListGames(repo);

    const result = await useCase.execute({ page: 1, perPage: 7 }, 'user-A');

    expect('totalPages' in result).toBe(false);
  });

  it('only returns games belonging to the requesting user', async () => {
    const repo = new FakeGameRepository([...makeGames(5, 'user-A'), ...makeGames(3, 'user-B')]);
    const useCase = new ListGames(repo);

    const result = await useCase.execute({ page: 1, perPage: 20 }, 'user-A');

    expect(result.items).toHaveLength(5);
    expect(result.total).toBe(5);
  });
});
