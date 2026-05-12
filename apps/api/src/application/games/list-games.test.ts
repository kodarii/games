import { describe, expect, it } from 'bun:test';
import { Game } from '../../domain/games/game';
import type { GameRepository, ListGamesQuery } from '../../domain/games/game-repository';
import type { GameFormat, GameKind } from '../../domain/games/game-value-objects';
import type { NewGame } from '../../domain/games/new-game';
import { ListGames } from './list-games';

class FakeGameRepository implements GameRepository {
  lastQuery: ListGamesQuery | null = null;

  constructor(private readonly all: Game[]) {}

  withTx = (_tx: unknown): GameRepository => this;
  list = async (query: ListGamesQuery) => {
    this.lastQuery = query;
    let filtered = this.all.filter((g) => g.userId === query.userId);
    if (query.kind) {
      filtered = filtered.filter((g) => g.kind === query.kind);
    }
    if (query.platforms?.length) {
      const set = new Set(query.platforms);
      filtered = filtered.filter((g) => set.has(g.platform));
    }
    if (query.formats?.length) {
      const set = new Set<GameFormat>(query.formats);
      filtered = filtered.filter((g) => set.has(g.format));
    }
    if (query.releaseYearRange) {
      const { from, to } = query.releaseYearRange;
      filtered = filtered.filter((g) => {
        const y = g.releaseYear?.value;
        return y != null && y >= from && y <= to;
      });
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
  create = async (_g: NewGame): Promise<Game> => {
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
  saveMetadata = async (): Promise<Game | null> => null;
}

type GameOverrides = {
  id?: number;
  externalId?: string;
  kind?: GameKind;
  userId?: string;
  title?: string;
  platform?: string;
  format?: GameFormat;
  releaseYear?: number | null;
};

function makeGame(overrides: GameOverrides = {}): Game {
  const id = overrides.id ?? 1;
  return Game.fromPersistence({
    id,
    externalId: overrides.externalId ?? `ext-${id}`,
    kind: overrides.kind ?? 'owned',
    userId: overrides.userId ?? 'user-A',
    title: overrides.title ?? `Game ${id}`,
    developer: 'Dev',
    genre: 'ARPG',
    releaseYear: overrides.releaseYear === undefined ? 2020 : overrides.releaseYear,
    platform: overrides.platform ?? 'PS5',
    edition: null,
    hoursPlayed: overrides.kind === 'wishlist' ? null : 0,
    status: overrides.kind === 'wishlist' ? null : 'Backlog',
    format: overrides.format ?? 'digital',
  });
}

function makeGames(count: number, userId = 'user-A'): Game[] {
  return Array.from({ length: count }, (_, i) => makeGame({ id: i + 1, userId }));
}

function makeWishlistGames(count: number, idOffset = 100, userId = 'user-A'): Game[] {
  return Array.from({ length: count }, (_, i) =>
    makeGame({
      id: idOffset + i + 1,
      externalId: `ext-wish-${idOffset + i + 1}`,
      kind: 'wishlist',
      userId,
      title: `Wish ${idOffset + i + 1}`,
      platform: 'PC',
      releaseYear: null,
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

    await expect(
      useCase.execute({ kind: 'invalid' as never, page: 1, perPage: 20 }, 'user-A'),
    ).rejects.toThrow();
  });

  it('filters by platforms', async () => {
    const all = [
      makeGame({ id: 1, platform: 'PC' }),
      makeGame({ id: 2, platform: 'PS5' }),
      makeGame({ id: 3, platform: 'Switch' }),
    ];
    const repo = new FakeGameRepository(all);
    const useCase = new ListGames(repo);

    const result = await useCase.execute({ platforms: ['PC'], page: 1, perPage: 20 }, 'user-A');

    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.platform).toBe('PC');
  });

  it('filters by formats', async () => {
    const all = [
      makeGame({ id: 1, format: 'digital' }),
      makeGame({ id: 2, format: 'physical' }),
      makeGame({ id: 3, format: 'digital' }),
    ];
    const repo = new FakeGameRepository(all);
    const useCase = new ListGames(repo);

    const result = await useCase.execute({ formats: ['digital'], page: 1, perPage: 20 }, 'user-A');

    expect(result.items).toHaveLength(2);
    expect(result.items.every((g) => g.format === 'digital')).toBe(true);
  });

  it('filters by release year range', async () => {
    const all = [
      makeGame({ id: 1, releaseYear: 2008 }),
      makeGame({ id: 2, releaseYear: 2012 }),
      makeGame({ id: 3, releaseYear: 2014 }),
      makeGame({ id: 4, releaseYear: 2020 }),
    ];
    const repo = new FakeGameRepository(all);
    const useCase = new ListGames(repo);

    const result = await useCase.execute(
      { releaseYearFrom: 2010, releaseYearTo: 2015, page: 1, perPage: 20 },
      'user-A',
    );

    expect(result.items).toHaveLength(2);
    expect(result.items.map((g) => g.releaseYear?.value).sort()).toEqual([2012, 2014]);
  });

  it('rejects more than 20 platforms', async () => {
    const repo = new FakeGameRepository([]);
    const useCase = new ListGames(repo);

    await expect(
      useCase.execute({ platforms: Array(21).fill('PC'), page: 1, perPage: 20 }, 'user-A'),
    ).rejects.toThrow();
  });

  it('rejects releaseYearFrom > releaseYearTo', async () => {
    const repo = new FakeGameRepository([]);
    const useCase = new ListGames(repo);

    await expect(
      useCase.execute(
        { releaseYearFrom: 2030, releaseYearTo: 2000, page: 1, perPage: 20 },
        'user-A',
      ),
    ).rejects.toThrow();
  });

  it('rejects releaseYearFrom out of bounds (below 1958)', async () => {
    const repo = new FakeGameRepository([]);
    const useCase = new ListGames(repo);

    await expect(
      useCase.execute({ releaseYearFrom: 1900, page: 1, perPage: 20 }, 'user-A'),
    ).rejects.toThrow();
  });

  it('rejects releaseYearTo out of bounds (above 2100)', async () => {
    const repo = new FakeGameRepository([]);
    const useCase = new ListGames(repo);

    await expect(
      useCase.execute({ releaseYearTo: 2200, page: 1, perPage: 20 }, 'user-A'),
    ).rejects.toThrow();
  });

  it('escapes wildcard characters in search before passing to repo', async () => {
    const repo = new FakeGameRepository([]);
    const useCase = new ListGames(repo);

    await useCase.execute({ search: '50%_off\\bonus', page: 1, perPage: 20 }, 'user-A');

    expect(repo.lastQuery?.search).toBe('50\\%\\_off\\\\bonus');
  });
});
