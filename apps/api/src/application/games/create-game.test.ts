import { beforeEach, describe, expect, it } from 'bun:test';
import { Game, type NewGame } from '../../domain/games/game';
import type { GameRepository } from '../../domain/games/game-repository';
import { type NewPlatform, Platform } from '../../domain/platforms/platform';
import type { PlatformRepository } from '../../domain/platforms/platform-repository';
import { CreateGame } from './create-game';

class FakeGameRepository implements GameRepository {
  list = async () => ({ items: [], total: 0 });
  listAll = async (): Promise<Game[]> => [];
  findById = async () => null;
  findByExternalId = async () => null;
  delete = async () => null;
  update = async () => null;
  countByPlatform = async () => 0;
  countByGenre = async () => 0;
  countByDeveloper = async () => 0;
  findAllCoverImages = async (): Promise<string[]> => [];
  saveMetadata = async (): Promise<Game | null> => null;

  create = async (g: NewGame) => {
    const ref = g.metadataRef;
    return Game.fromPersistence({
      id: 1,
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
      price: g.price?.value ?? null,
      purchasedAt: g.purchasedAt?.value ?? null,
      metadataProvider: ref?.providerName ?? null,
      metadataProviderId: ref?.providerId ?? null,
      metadataMatchedAt: ref?.matchedAt.toISOString() ?? null,
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

  async findByExternalId(_userId: string, _externalId: string): Promise<Platform | null> {
    return null;
  }

  async create(np: NewPlatform): Promise<Platform> {
    const p = Platform.fromPersistence({
      id: this.nextId,
      externalId: `ext-p-${this.nextId}`,
      userId: np.userId,
      name: np.name,
    });
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

  seed(userId: string, name: string): void {
    const p = Platform.fromPersistence({
      id: this.nextId,
      externalId: `ext-p-${this.nextId}`,
      userId,
      name,
    });
    this.nextId++;
    this.store.set(p.id, p);
  }
}

const validInput = {
  kind: 'owned' as const,
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

  it('creates game without releaseYear', async () => {
    const { releaseYear: _releaseYear, ...inputWithoutYear } = validInput;
    const result = await useCase.execute(inputWithoutYear, 'user-A');
    expect(result.ok).toBe(true);
  });

  it('accepts price and purchasedAt', async () => {
    const result = await useCase.execute(
      { ...validInput, price: 12999, purchasedAt: '2024-06-15' },
      'user-A',
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.toJSON().price).toBe(12999);
      expect(result.value.toJSON().purchasedAt).toBe('2024-06-15');
    }
  });

  it('omits price/purchasedAt when not provided', async () => {
    const result = await useCase.execute(validInput, 'user-A');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.toJSON().price).toBeNull();
      expect(result.value.toJSON().purchasedAt).toBeNull();
    }
  });

  it('returns invalid_input for negative price', async () => {
    const result = await useCase.execute({ ...validInput, price: -1 }, 'user-A');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe('invalid_input');
      if (result.error.kind === 'invalid_input') {
        expect(result.error.issues.some((i) => i.path[0] === 'price')).toBe(true);
      }
    }
  });

  it('returns invalid_input for bad purchasedAt format', async () => {
    const result = await useCase.execute({ ...validInput, purchasedAt: '2024/06/15' }, 'user-A');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe('invalid_input');
      if (result.error.kind === 'invalid_input') {
        expect(result.error.issues.some((i) => i.path[0] === 'purchasedAt')).toBe(true);
      }
    }
  });

  it('returns domain price_too_large for huge price', async () => {
    const result = await useCase.execute({ ...validInput, price: 999_999_999 }, 'user-A');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe('domain');
      if (result.error.kind === 'domain') {
        expect(result.error.error.kind).toBe('price_too_large');
      }
    }
  });

  it('returns domain purchased_at_in_future', async () => {
    const result = await useCase.execute({ ...validInput, purchasedAt: '2099-01-01' }, 'user-A');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe('domain');
      if (result.error.kind === 'domain') {
        expect(result.error.error.kind).toBe('purchased_at_in_future');
      }
    }
  });

  it('creates wishlist game with kind=wishlist and null status/hoursPlayed', async () => {
    const result = await useCase.execute(
      { kind: 'wishlist', title: 'Silksong', platform: 'PS5' },
      'user-A',
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.kind).toBe('wishlist');
      expect(result.value.status).toBeNull();
      expect(result.value.hoursPlayed).toBeNull();
    }
  });

  it('rejects wishlist game with status field', async () => {
    const result = await useCase.execute(
      { kind: 'wishlist', title: 'Silksong', platform: 'PS5', status: 'Backlog' },
      'user-A',
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe('invalid_input');
    }
  });

  it('creates owned game with metadataRef and persists it', async () => {
    const result = await useCase.execute(
      {
        ...validInput,
        metadataRef: { providerName: 'igdb', providerId: 'igdb-abc-123' },
      },
      'user-A',
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.metadataRef).not.toBeNull();
      expect(result.value.metadataRef?.providerName).toBe('igdb');
      expect(result.value.metadataRef?.providerId).toBe('igdb-abc-123');
    }
  });

  it('creates wishlist game with metadataRef and persists it', async () => {
    const result = await useCase.execute(
      {
        kind: 'wishlist',
        title: 'Silksong',
        platform: 'PS5',
        metadataRef: { providerName: 'igdb', providerId: 'igdb-silksong' },
      },
      'user-A',
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.metadataRef?.providerId).toBe('igdb-silksong');
    }
  });

  it('treats input without kind as owned (legacy compat)', async () => {
    const { kind: _kind, ...inputWithoutKind } = validInput;
    const result = await useCase.execute(inputWithoutKind, 'user-A');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.kind).toBe('owned');
      expect(result.value.status).toBe('Completed');
    }
  });
});
