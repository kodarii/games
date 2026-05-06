import { describe, expect, it } from 'bun:test';
import { Game, type GameFormat, type GamePlatform, type GameStatus } from '../../../domain/games/game';
import type { GameRepository, ListGamesQuery, ListGamesResult } from '../../../domain/games/game-repository';
import type { NewGame, GameUpdate } from '../../../domain/games/game';
import { Platform } from '../../../domain/platforms/platform';
import type { PlatformRepository } from '../../../domain/platforms/platform-repository';
import type { NewPlatform } from '../../../domain/platforms/platform';
import { ExportData } from '../export-data';
import { toSnapshot } from '../export-snapshot';

class FakeGameRepository implements GameRepository {
  constructor(private readonly games: Game[]) {}

  async listAll(userId: string): Promise<Game[]> {
    return this.games.filter((g) => g.userId === userId);
  }

  async list(_query: ListGamesQuery): Promise<ListGamesResult> {
    throw new Error('not used in this test');
  }
  async findById(_id: number): Promise<Game | null> {
    throw new Error('not used in this test');
  }
  async findByExternalId(_userId: string, _externalId: string): Promise<Game | null> {
    throw new Error('not used in this test');
  }
  async create(_game: NewGame): Promise<Game> {
    throw new Error('not used in this test');
  }
  async update(_id: number, _game: GameUpdate): Promise<Game | null> {
    throw new Error('not used in this test');
  }
  async delete(_id: number): Promise<Game | null> {
    throw new Error('not used in this test');
  }
  async countByPlatform(_userId: string, _platformName: string): Promise<number> {
    throw new Error('not used in this test');
  }

  async findAllCoverImages(): Promise<string[]> {
    return [];
  }
}

class FakePlatformRepository implements PlatformRepository {
  constructor(private readonly platforms: Platform[]) {}

  async list(userId: string): Promise<Platform[]> {
    return this.platforms.filter((p) => p.userId === userId);
  }

  async findById(_id: number): Promise<Platform | null> {
    throw new Error('not used in this test');
  }
  async findByName(_userId: string, _name: string): Promise<Platform | null> {
    throw new Error('not used in this test');
  }
  async findByExternalId(_userId: string, _externalId: string): Promise<Platform | null> {
    throw new Error('not used in this test');
  }
  async create(_platform: NewPlatform): Promise<Platform> {
    throw new Error('not used in this test');
  }
  async delete(_id: number): Promise<Platform | null> {
    throw new Error('not used in this test');
  }
}

function makeGame(overrides: {
  id: number;
  userId: string;
  title: string;
  developer?: string;
  genre?: string;
  releaseYear?: number;
  platform?: string;
  edition?: string | null;
  hoursPlayed?: number;
  status?: GameStatus;
  format?: GameFormat;
  coverColor?: string | null;
  price?: number | null;
  purchasedAt?: string | null;
}): Game {
  return Game.fromPersistence({
    id: overrides.id,
    externalId: `ext-game-${overrides.id}`,
    kind: 'owned',
    userId: overrides.userId,
    title: overrides.title,
    developer: overrides.developer ?? 'Dev',
    genre: overrides.genre ?? 'Action',
    releaseYear: overrides.releaseYear ?? 2020,
    platform: (overrides.platform ?? 'PC') as GamePlatform,
    edition: overrides.edition ?? null,
    hoursPlayed: overrides.hoursPlayed ?? 0,
    status: overrides.status ?? 'Backlog',
    format: overrides.format ?? 'digital',
    coverColor: overrides.coverColor ?? null,
    price: overrides.price ?? null,
    purchasedAt: overrides.purchasedAt ?? null,
  });
}

function makePlatform(id: number, userId: string, name: string): Platform {
  return Platform.fromPersistence({ id, externalId: `ext-platform-${id}`, userId, name });
}

const NOW = new Date('2026-01-15T10:00:00.000Z');

describe('toSnapshot', () => {
  it('returns empty snapshot for no games and no platforms', () => {
    const snapshot = toSnapshot([], [], NOW);
    expect(snapshot).toEqual({
      version: 3,
      exportedAt: '2026-01-15T10:00:00.000Z',
      platforms: [],
      games: [],
    });
  });

  it('sorts platforms by name ASC', () => {
    const platforms = [
      makePlatform(1, 'u1', 'Xbox'),
      makePlatform(2, 'u1', 'Nintendo Switch'),
      makePlatform(3, 'u1', 'PlayStation'),
    ];
    const snapshot = toSnapshot([], platforms, NOW);
    expect(snapshot.platforms.map((p) => p.name)).toEqual([
      'Nintendo Switch',
      'PlayStation',
      'Xbox',
    ]);
  });

  it('includes edition and coverColor when set, omits them when absent', () => {
    const withOptionals = makeGame({
      id: 1,
      userId: 'u1',
      title: 'Alpha',
      edition: 'GOTY',
      coverColor: '#ff0000',
    });
    const withoutOptionals = makeGame({
      id: 2,
      userId: 'u1',
      title: 'Beta',
      edition: null,
      coverColor: null,
    });
    const snapshot = toSnapshot([withOptionals, withoutOptionals], [], NOW);

    expect(snapshot.games[0].edition).toBe('GOTY');
    expect(snapshot.games[0].coverColor).toBe('#ff0000');
    expect(snapshot.games[1]).not.toHaveProperty('edition');
    expect(snapshot.games[1]).not.toHaveProperty('coverColor');
  });

  it('sorts games by title ASC, then releaseYear ASC as tie-break', () => {
    const games = [
      makeGame({ id: 1, userId: 'u1', title: 'Zelda', releaseYear: 2017 }),
      makeGame({ id: 2, userId: 'u1', title: 'Alpha', releaseYear: 2022 }),
      makeGame({ id: 3, userId: 'u1', title: 'Alpha', releaseYear: 2019 }),
    ];
    const snapshot = toSnapshot(games, [], NOW);
    expect(snapshot.games.map((g) => ({ title: g.title, releaseYear: g.releaseYear }))).toEqual([
      { title: 'Alpha', releaseYear: 2019 },
      { title: 'Alpha', releaseYear: 2022 },
      { title: 'Zelda', releaseYear: 2017 },
    ]);
  });

  it('does not include id, userId, or createdAt in game output', () => {
    const game = makeGame({ id: 99, userId: 'u1', title: 'Test' });
    const snapshot = toSnapshot([game], [], NOW);
    const keys = Object.keys(snapshot.games[0]);
    expect(keys).not.toContain('id');
    expect(keys).not.toContain('userId');
    expect(keys).not.toContain('createdAt');
  });

  it('does not include id, userId, or createdAt in platform output', () => {
    const platform = makePlatform(42, 'u1', 'PC');
    const snapshot = toSnapshot([], [platform], NOW);
    const keys = Object.keys(snapshot.platforms[0]);
    expect(keys).not.toContain('id');
    expect(keys).not.toContain('userId');
    expect(keys).not.toContain('createdAt');
  });

  it('exports price and purchasedAt for v3', () => {
    const game = makeGame({
      id: 1,
      userId: 'u1',
      title: 'Alpha',
      price: 5000,
      purchasedAt: '2024-01-01',
    });
    const snapshot = toSnapshot([game], [], NOW);
    expect(snapshot.games[0].price).toBe(5000);
    expect(snapshot.games[0].purchasedAt).toBe('2024-01-01');
  });

  it('exports null for missing price and purchasedAt', () => {
    const game = makeGame({ id: 1, userId: 'u1', title: 'Alpha' });
    const snapshot = toSnapshot([game], [], NOW);
    expect(snapshot.games[0].price).toBeNull();
    expect(snapshot.games[0].purchasedAt).toBeNull();
  });
});

describe('ExportData', () => {
  it('returns snapshot with only data for the requested user', async () => {
    const games = [
      makeGame({ id: 1, userId: 'u1', title: 'GameA', releaseYear: 2020 }),
      makeGame({ id: 2, userId: 'u1', title: 'GameB', releaseYear: 2021 }),
      makeGame({ id: 3, userId: 'u2', title: 'GameC', releaseYear: 2019 }),
    ];
    const platforms = [
      makePlatform(1, 'u1', 'PC'),
      makePlatform(2, 'u2', 'Xbox'),
    ];

    const useCase = new ExportData(
      new FakeGameRepository(games),
      new FakePlatformRepository(platforms),
    );

    const snapshot = await useCase.execute('u1', NOW);

    expect(snapshot.version).toBe(3);
    expect(snapshot.exportedAt).toBe('2026-01-15T10:00:00.000Z');
    expect(snapshot.platforms).toEqual([{ externalId: 'ext-platform-1', name: 'PC' }]);
    expect(snapshot.games).toHaveLength(2);
    expect(snapshot.games.map((g) => g.title)).toEqual(['GameA', 'GameB']);
  });
});
