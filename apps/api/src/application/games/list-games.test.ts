import { describe, expect, it } from 'bun:test';
import { Game, type GameUpdate } from '../../domain/games/game';
import type { GameRepository, ListGamesQuery } from '../../domain/games/game-repository';
import { ListGames } from './list-games';

class FakeGameRepository implements GameRepository {
  constructor(private readonly all: Game[]) {}

  list = async (query: ListGamesQuery) => {
    let filtered = this.all.filter((g) => g.userId === query.userId);
    if (query.kind) {
      filtered = filtered.filter((g) => g.kind === query.kind);
    }
    const start = (query.page - 1) * query.perPage;
    const end = start + query.perPage;
    return { items: filtered.slice(start, end), total: filtered.length };
  };
  findById = async (): Promise<Game | null> => {
    throw new Error('not implemented');
  };
  findByExternalId = async (): Promise<Game | null> => {
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
  countByPlatform = async (): Promise<number> => 0;
  countByGenre = async (): Promise<number> => 0;
  countByDeveloper = async (): Promise<number> => 0;
  findAllCoverImages = async (): Promise<string[]> => [];
  listAll = async (): Promise<Game[]> => [];
}

function makeGames(count: number, userId = 'user-A'): Game[] {
  return Array.from({ length: count }, (_, i) =>
    Game.fromPersistence({
      id: i + 1,
      externalId: `ext-game-${i + 1}`,
      kind: 'owned',
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

function makeWishlistGames(count: number, idOffset = 100, userId = 'user-A'): Game[] {
  return Array.from({ length: count }, (_, i) =>
    Game.fromPersistence({
      id: idOffset + i + 1,
      externalId: `ext-wish-${idOffset + i + 1}`,
      kind: 'wishlist',
      userId,
      title: `Wish ${idOffset + i + 1}`,
      developer: null,
      genre: 'RPG',
      releaseYear: null,
      platform: 'PC',
      edition: null,
      hoursPlayed: null,
      status: null,
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

  it('kind=wishlist filters to only wishlist games', async () => {
    const all = [...makeGames(2), ...makeWishlistGames(2)];
    const repo = new FakeGameRepository(all);
    const useCase = new ListGames(repo);

    const result = await useCase.execute({ kind: 'wishlist', page: 1, perPage: 20 }, 'user-A');

    expect(result.items).toHaveLength(2);
    expect(result.items.every((g) => g.kind === 'wishlist')).toBe(true);
  });

  it('kind=owned filters to only owned games', async () => {
    const all = [...makeGames(2), ...makeWishlistGames(2)];
    const repo = new FakeGameRepository(all);
    const useCase = new ListGames(repo);

    const result = await useCase.execute({ kind: 'owned', page: 1, perPage: 20 }, 'user-A');

    expect(result.items).toHaveLength(2);
    expect(result.items.every((g) => g.kind === 'owned')).toBe(true);
  });

  it('no kind filter returns all games', async () => {
    const all = [...makeGames(2), ...makeWishlistGames(2)];
    const repo = new FakeGameRepository(all);
    const useCase = new ListGames(repo);

    const result = await useCase.execute({ page: 1, perPage: 20 }, 'user-A');

    expect(result.total).toBe(4);
  });

  it('invalid kind value throws a Zod parse error', async () => {
    const repo = new FakeGameRepository([]);
    const useCase = new ListGames(repo);

    await expect(useCase.execute({ kind: 'invalid' as never, page: 1, perPage: 20 }, 'user-A')).rejects.toThrow();
  });
});
