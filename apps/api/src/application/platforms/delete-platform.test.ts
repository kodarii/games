import { beforeEach, describe, expect, it } from 'bun:test';
import { Game, type NewGame } from '../../domain/games/game';
import type { GameRepository, ListGamesQuery, ListGamesResult } from '../../domain/games/game-repository';
import { Platform, type NewPlatform } from '../../domain/platforms/platform';
import type { PlatformRepository } from '../../domain/platforms/platform-repository';
import { DeletePlatform } from './delete-platform';

class FakePlatformRepository implements PlatformRepository {
  private store = new Map<number, Platform>();
  private nextId = 1;

  async list(userId: string): Promise<Platform[]> {
    return [...this.store.values()].filter((p) => p.userId === userId);
  }

  async findById(id: number): Promise<Platform | null> {
    return this.store.get(id) ?? null;
  }

  async findByName(userId: string, name: string): Promise<Platform | null> {
    return [...this.store.values()].find((p) => p.userId === userId && p.name === name) ?? null;
  }

  async findByExternalId(_userId: string, _externalId: string): Promise<Platform | null> {
    return null;
  }

  async create(np: NewPlatform): Promise<Platform> {
    const p = Platform.fromPersistence({ id: this.nextId, externalId: `ext-p-${this.nextId}`, userId: np.userId, name: np.name });
    this.nextId++;
    this.store.set(p.id, p);
    return p;
  }

  async delete(id: number): Promise<Platform | null> {
    const p = this.store.get(id);
    if (!p) return null;
    this.store.delete(id);
    return p;
  }

  seed(userId: string, name: string): Platform {
    const p = Platform.fromPersistence({ id: this.nextId, externalId: `ext-p-${this.nextId}`, userId, name });
    this.nextId++;
    this.store.set(p.id, p);
    return p;
  }
}

class FakeGameRepository implements GameRepository {
  private store = new Map<number, Game>();
  private nextId = 1;

  async list(_q: ListGamesQuery): Promise<ListGamesResult> {
    return { items: [], total: 0 };
  }

  async listAll(_userId: string): Promise<Game[]> {
    return [];
  }

  async findById(id: number): Promise<Game | null> {
    return this.store.get(id) ?? null;
  }

  async findByExternalId(_userId: string, _externalId: string): Promise<Game | null> {
    return null;
  }

  async create(g: NewGame): Promise<Game> {
    const game = Game.fromPersistence({
      id: this.nextId,
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
    this.nextId++;
    this.store.set(game.id, game);
    return game;
  }

  async update(_id: number, _g: NewGame): Promise<Game | null> {
    return null;
  }

  async delete(id: number): Promise<Game | null> {
    const game = this.store.get(id);
    if (!game) return null;
    this.store.delete(id);
    return game;
  }

  async countByPlatform(userId: string, platformName: string): Promise<number> {
    return [...this.store.values()].filter(
      (g) => g.userId === userId && g.platform === platformName,
    ).length;
  }

  async findAllCoverImages(): Promise<string[]> {
    return [];
  }

  seedGame(userId: string, platformName: string): Game {
    const game = Game.fromPersistence({
      id: this.nextId,
      externalId: `ext-game-${this.nextId}`,
      kind: 'owned',
      userId,
      title: 'Test Game',
      developer: 'Dev',
      genre: '',
      releaseYear: 2020,
      platform: platformName,
      edition: null,
      hoursPlayed: 0,
      status: 'Backlog',
      format: 'digital',
    });
    this.nextId++;
    this.store.set(game.id, game);
    return game;
  }
}

describe('DeletePlatform', () => {
  let platformRepo: FakePlatformRepository;
  let gameRepo: FakeGameRepository;
  let useCase: DeletePlatform;

  beforeEach(() => {
    platformRepo = new FakePlatformRepository();
    gameRepo = new FakeGameRepository();
    useCase = new DeletePlatform(platformRepo, gameRepo);
  });

  it('returns not_found when platform belongs to a different user', async () => {
    const platform = platformRepo.seed('user-A', 'PS5');

    const result = await useCase.execute(platform.id, 'user-B');

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe('not_found');
    }
    expect(await platformRepo.findById(platform.id)).not.toBeNull();
  });

  it('returns in_use when at least one game uses the platform', async () => {
    const platform = platformRepo.seed('user-A', 'PS5');
    gameRepo.seedGame('user-A', 'PS5');

    const result = await useCase.execute(platform.id, 'user-A');

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe('in_use');
    }
    expect(await platformRepo.findById(platform.id)).not.toBeNull();
  });

  it('deletes platform and returns ok when not in use', async () => {
    const platform = platformRepo.seed('user-A', 'PS5');

    const result = await useCase.execute(platform.id, 'user-A');

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.name).toBe('PS5');
    }
    expect(await platformRepo.findById(platform.id)).toBeNull();
  });

  it('returns not_found for nonexistent platform', async () => {
    const result = await useCase.execute(999, 'user-A');

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe('not_found');
    }
  });
});
