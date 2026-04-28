import { beforeEach, describe, expect, it } from 'bun:test';
import { Game, type GameUpdate } from '../../domain/games/game';
import type { GameRepository, ListGamesQuery, ListGamesResult } from '../../domain/games/game-repository';
import { Platform, type NewPlatform } from '../../domain/platforms/platform';
import type { PlatformRepository } from '../../domain/platforms/platform-repository';
import { UpdateGame } from './update-game';

class FakeGameRepository implements GameRepository {
  private games = new Map<number, Game>();

  list = async (_q: ListGamesQuery): Promise<ListGamesResult> => ({ items: [], total: 0 });
  countByPlatform = async () => 0;

  create = async (g: GameUpdate) => {
    return Game.fromPersistence({
      id: Date.now(),
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

  async findById(id: number): Promise<Game | null> {
    return this.games.get(id) ?? null;
  }

  async update(id: number, game: GameUpdate): Promise<Game | null> {
    const existing = this.games.get(id);
    if (!existing) return null;
    const updated = Game.fromPersistence({
      id: existing.id,
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

  async create(np: NewPlatform): Promise<Platform> {
    const p = Platform.fromPersistence({ id: this.nextId++, userId: np.userId, name: np.name });
    this.store.set(p.id, p);
    return p;
  }

  async delete(id: number): Promise<Platform | null> {
    const p = this.store.get(id);
    if (!p) return null;
    this.store.delete(id);
    return p;
  }

  seed(userId: string, name: string): void {
    const p = Platform.fromPersistence({ id: this.nextId++, userId, name });
    this.store.set(p.id, p);
  }
}

const validInput = {
  title: 'Elden Ring',
  developer: 'FromSoftware',
  genre: 'ARPG',
  releaseYear: 2022,
  platform: 'PS5',
  edition: undefined,
  hoursPlayed: 120,
  status: 'Completed' as const,
  format: 'digital' as const,
};

const existingGame = Game.fromPersistence({
  id: 1,
  userId: 'user-A',
  title: 'Dark Souls',
  developer: 'FromSoftware',
  genre: 'ARPG',
  releaseYear: 2011,
  platform: 'PS3',
  edition: null,
  hoursPlayed: 50,
  status: 'Completed',
  format: 'physical',
});

describe('UpdateGame', () => {
  let repo: FakeGameRepository;
  let platformRepo: FakePlatformRepository;
  let useCase: UpdateGame;

  beforeEach(() => {
    repo = new FakeGameRepository();
    platformRepo = new FakePlatformRepository();
    platformRepo.seed('user-A', 'PS5');
    platformRepo.seed('user-A', 'PS3');
    useCase = new UpdateGame(repo, platformRepo);
  });

  it('updates game and returns ok', async () => {
    repo.seed(existingGame);

    const result = await useCase.execute(1, validInput, 'user-A');

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.title).toBe('Elden Ring');
      expect(result.value.developer).toBe('FromSoftware');
      expect(result.value.id).toBe(1);
    }
  });

  it('does not change userId when updating', async () => {
    repo.seed(existingGame);

    const result = await useCase.execute(1, validInput, 'user-A');

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.userId).toBe('user-A');
    }
  });

  it('returns not_found when game does not exist', async () => {
    const result = await useCase.execute(99, validInput, 'user-A');

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe('not_found');
    }
  });

  it('returns not_found when game belongs to a different user (IDOR)', async () => {
    repo.seed(existingGame);

    const result = await useCase.execute(1, validInput, 'user-B');

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe('not_found');
    }
  });

  it('returns invalid_input for empty title', async () => {
    repo.seed(existingGame);

    const result = await useCase.execute(1, { ...validInput, title: '' }, 'user-A');

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe('invalid_input');
    }
  });

  it('returns invalid_input for empty developer', async () => {
    repo.seed(existingGame);

    const result = await useCase.execute(1, { ...validInput, developer: '' }, 'user-A');

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe('invalid_input');
    }
  });

  it('returns invalid_input for releaseYear out of range', async () => {
    repo.seed(existingGame);

    const result = await useCase.execute(1, { ...validInput, releaseYear: 1900 }, 'user-A');

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe('invalid_input');
    }
  });

  it('returns invalid_input for negative hoursPlayed', async () => {
    repo.seed(existingGame);

    const result = await useCase.execute(1, { ...validInput, hoursPlayed: -5 }, 'user-A');

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe('invalid_input');
    }
  });

  it('accepts format physical and returns ok', async () => {
    repo.seed(existingGame);

    const result = await useCase.execute(1, { ...validInput, format: 'physical' }, 'user-A');

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.format).toBe('physical');
    }
  });

  it('returns invalid_input for invalid format', async () => {
    repo.seed(existingGame);

    const result = await useCase.execute(1, { ...validInput, format: 'cartridge' }, 'user-A');

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe('invalid_input');
      if (result.error.kind === 'invalid_input') {
        expect(result.error.issues.some((i) => i.path[0] === 'format')).toBe(true);
      }
    }
  });

  it('returns domain platform_invalid when platform not in user dictionary', async () => {
    repo.seed(existingGame);

    const result = await useCase.execute(1, { ...validInput, platform: 'Wii U' }, 'user-A');

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe('domain');
      if (result.error.kind === 'domain') {
        expect(result.error.error.kind).toBe('platform_invalid');
      }
    }
  });
});
