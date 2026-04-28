import { beforeEach, describe, expect, it } from 'bun:test';
import { Game, type NewGame } from '../../domain/games/game';
import type { GameRepository } from '../../domain/games/game-repository';
import { Platform, type NewPlatform } from '../../domain/platforms/platform';
import type { PlatformRepository } from '../../domain/platforms/platform-repository';
import { CreateGame } from './create-game';

class FakeGameRepository implements GameRepository {
  list = async () => ({ items: [], total: 0 });
  findById = async () => null;
  delete = async () => null;
  update = async () => null;
  countByPlatform = async () => 0;

  create = async (g: NewGame) => {
    return Game.fromPersistence({
      id: 1,
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

describe('CreateGame', () => {
  let gameRepo: FakeGameRepository;
  let platformRepo: FakePlatformRepository;
  let useCase: CreateGame;

  beforeEach(() => {
    gameRepo = new FakeGameRepository();
    platformRepo = new FakePlatformRepository();
    platformRepo.seed('user-A', 'PS5');
    useCase = new CreateGame(gameRepo, platformRepo);
  });

  it('creates game and returns ok', async () => {
    const result = await useCase.execute(validInput, 'user-A');

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.title).toBe('Elden Ring');
      expect(result.value.format).toBe('digital');
    }
  });

  it('stores the userId from auth context', async () => {
    const result = await useCase.execute(validInput, 'user-A');

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.userId).toBe('user-A');
    }
  });

  it('accepts format physical and returns ok', async () => {
    const result = await useCase.execute({ ...validInput, format: 'physical' }, 'user-A');

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.format).toBe('physical');
    }
  });

  it('defaults format to digital when omitted', async () => {
    const { format: _format, ...inputWithoutFormat } = validInput;

    const result = await useCase.execute(inputWithoutFormat, 'user-A');

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.format).toBe('digital');
    }
  });

  it('returns invalid_input for invalid format', async () => {
    const result = await useCase.execute({ ...validInput, format: 'cartridge' }, 'user-A');

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe('invalid_input');
      if (result.error.kind === 'invalid_input') {
        expect(result.error.issues.some((i) => i.path[0] === 'format')).toBe(true);
      }
    }
  });

  it('returns domain platform_invalid when platform not in user dictionary', async () => {
    const result = await useCase.execute({ ...validInput, platform: 'Wii U' }, 'user-A');

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe('domain');
      if (result.error.kind === 'domain') {
        expect(result.error.error.kind).toBe('platform_invalid');
      }
    }
  });
});
