import { beforeEach, describe, expect, it } from 'bun:test';
import { Game, type GameUpdate } from '../../domain/games/game';
import type { GameRepository, ListGamesQuery, ListGamesResult } from '../../domain/games/game-repository';
import { Platform, type NewPlatform } from '../../domain/platforms/platform';
import type { PlatformRepository } from '../../domain/platforms/platform-repository';
import type { CoverStorage } from '../cover-storage/cover-storage';
import { UpdateGame } from './update-game';

class FakeCoverStorage implements CoverStorage {
  deleted: string[] = [];
  upload = async () => ({ url: 'https://fake/uploaded' });
  delete = async (url: string) => {
    this.deleted.push(url);
  };
  listOlderThan = async () => [];
}

class FakeGameRepository implements GameRepository {
  private games = new Map<number, Game>();

  list = async (_q: ListGamesQuery): Promise<ListGamesResult> => ({ items: [], total: 0 });
  listAll = async (): Promise<Game[]> => [];
  countByPlatform = async () => 0;
  countByGenre = async () => 0;
  countByDeveloper = async () => 0;
  findAllCoverImages = async (): Promise<string[]> => [];
  findByExternalId = async (): Promise<Game | null> => null;

  create = async (g: GameUpdate) => {
    const created = Game.fromPersistence({
      id: Date.now(),
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
    });
    this.games.set(created.id, created);
    return created;
  };

  async findById(id: number): Promise<Game | null> {
    return this.games.get(id) ?? null;
  }

  async update(id: number, game: GameUpdate): Promise<Game | null> {
    const existing = this.games.get(id);
    if (!existing) return null;
    const updated = Game.fromPersistence({
      id: existing.id,
      externalId: existing.externalId,
      kind: game.kind,
      userId: game.userId,
      title: game.title,
      developer: game.developer,
      genre: game.genre,
      releaseYear: game.releaseYear?.value ?? null,
      platform: game.platform,
      edition: game.edition ?? null,
      hoursPlayed: game.hoursPlayed?.value ?? null,
      status: game.status,
      format: game.format,
      coverImage: game.coverImage ?? null,
      price: game.price?.value ?? null,
      purchasedAt: game.purchasedAt?.value ?? null,
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

  seed(userId: string, name: string): void {
    const p = Platform.fromPersistence({ id: this.nextId, externalId: `ext-p-${this.nextId}`, userId, name });
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

const existingGame = Game.fromPersistence({
  id: 1,
  externalId: 'ext-game-1',
  kind: 'owned',
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
  let coverStorage: FakeCoverStorage;
  let useCase: UpdateGame;

  beforeEach(() => {
    repo = new FakeGameRepository();
    platformRepo = new FakePlatformRepository();
    coverStorage = new FakeCoverStorage();
    platformRepo.seed('user-A', 'PS5');
    platformRepo.seed('user-A', 'PS3');
    useCase = new UpdateGame(repo, platformRepo, coverStorage);
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

  it('treats empty developer as null (developer is now nullable)', async () => {
    repo.seed(existingGame);

    const result = await useCase.execute(1, { ...validInput, developer: '' }, 'user-A');

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.developer).toBeNull();
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

  it('updates game clearing releaseYear', async () => {
    repo.seed(existingGame);
    const { releaseYear: _releaseYear, ...inputWithoutYear } = validInput;
    const result = await useCase.execute(1, inputWithoutYear, 'user-A');
    expect(result.ok).toBe(true);
  });

  it('deletes old cover from storage when coverImage changes', async () => {
    const seeded = Game.fromPersistence({
      id: 1,
      externalId: 'ext-game-1',
      kind: 'owned',
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
      coverImage: 'https://utfs.io/f/old-key',
    });
    repo.seed(seeded);

    await useCase.execute(1, { ...validInput, coverImage: 'https://utfs.io/f/new-key' }, 'user-A');

    await Promise.resolve();
    expect(coverStorage.deleted).toEqual(['https://utfs.io/f/old-key']);
  });

  it('does not delete when coverImage unchanged', async () => {
    const seeded = Game.fromPersistence({
      id: 1,
      externalId: 'ext-game-1',
      kind: 'owned',
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
      coverImage: 'https://utfs.io/f/same',
    });
    repo.seed(seeded);

    await useCase.execute(1, { ...validInput, coverImage: 'https://utfs.io/f/same' }, 'user-A');
    await Promise.resolve();
    expect(coverStorage.deleted).toEqual([]);
  });

  it('accepts price and purchasedAt on update', async () => {
    repo.seed(existingGame);
    const result = await useCase.execute(
      1,
      { ...validInput, price: 12999, purchasedAt: '2024-06-15' },
      'user-A',
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.toJSON().price).toBe(12999);
      expect(result.value.toJSON().purchasedAt).toBe('2024-06-15');
    }
  });

  it('returns invalid_input for negative price on update', async () => {
    repo.seed(existingGame);
    const result = await useCase.execute(1, { ...validInput, price: -1 }, 'user-A');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe('invalid_input');
      if (result.error.kind === 'invalid_input') {
        expect(result.error.issues.some((i) => i.path[0] === 'price')).toBe(true);
      }
    }
  });

  it('returns invalid_input for bad purchasedAt format on update', async () => {
    repo.seed(existingGame);
    const result = await useCase.execute(
      1,
      { ...validInput, purchasedAt: '2024/06/15' },
      'user-A',
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe('invalid_input');
      if (result.error.kind === 'invalid_input') {
        expect(result.error.issues.some((i) => i.path[0] === 'purchasedAt')).toBe(true);
      }
    }
  });

  it('returns domain purchased_at_in_future on update', async () => {
    repo.seed(existingGame);
    const result = await useCase.execute(
      1,
      { ...validInput, purchasedAt: '2099-01-01' },
      'user-A',
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe('domain');
      if (result.error.kind === 'domain') {
        expect(result.error.error.kind).toBe('purchased_at_in_future');
      }
    }
  });

  it('clears price when null is sent', async () => {
    const seeded = Game.fromPersistence({
      id: 1,
      externalId: 'ext-game-1',
      kind: 'owned',
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
      price: 12999,
    });
    repo.seed(seeded);
    const result = await useCase.execute(1, { ...validInput, price: null }, 'user-A');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.toJSON().price).toBeNull();
    }
  });

  it('clears purchasedAt when null is sent', async () => {
    const seeded = Game.fromPersistence({
      id: 1,
      externalId: 'ext-game-1',
      kind: 'owned',
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
      purchasedAt: '2020-01-01',
    });
    repo.seed(seeded);
    const result = await useCase.execute(
      1,
      { ...validInput, purchasedAt: null },
      'user-A',
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.toJSON().purchasedAt).toBeNull();
    }
  });

  it('clears price when key omitted (replace pattern)', async () => {
    const seeded = Game.fromPersistence({
      id: 1,
      externalId: 'ext-game-1',
      kind: 'owned',
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
      price: 5000,
    });
    repo.seed(seeded);
    const result = await useCase.execute(1, validInput, 'user-A');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.toJSON().price).toBeNull();
    }
  });

  it('deletes old cover when user clears coverImage (sets null)', async () => {
    const seeded = Game.fromPersistence({
      id: 1,
      externalId: 'ext-game-1',
      kind: 'owned',
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
      coverImage: 'https://utfs.io/f/will-go',
    });
    repo.seed(seeded);

    await useCase.execute(1, { ...validInput, coverImage: null }, 'user-A');
    await Promise.resolve();
    expect(coverStorage.deleted).toEqual(['https://utfs.io/f/will-go']);
  });

  it('updates wishlist game with kind=wishlist and null status/hoursPlayed', async () => {
    const wishlistGame = Game.fromPersistence({
      id: 1,
      externalId: 'ext-game-1',
      kind: 'wishlist',
      userId: 'user-A',
      title: 'Silksong',
      developer: 'Team Cherry',
      genre: 'Metroidvania',
      releaseYear: null,
      platform: 'PS5',
      edition: null,
      hoursPlayed: null,
      status: null,
      format: 'digital',
    });
    repo.seed(wishlistGame);

    const result = await useCase.execute(
      1,
      { kind: 'wishlist', title: 'Silksong Updated', platform: 'PS5' },
      'user-A',
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.kind).toBe('wishlist');
      expect(result.value.status).toBeNull();
      expect(result.value.hoursPlayed).toBeNull();
    }
  });

  it('rejects wishlist update with status field', async () => {
    const wishlistGame = Game.fromPersistence({
      id: 1,
      externalId: 'ext-game-1',
      kind: 'wishlist',
      userId: 'user-A',
      title: 'Silksong',
      developer: null,
      genre: '',
      releaseYear: null,
      platform: 'PS5',
      edition: null,
      hoursPlayed: null,
      status: null,
      format: 'digital',
    });
    repo.seed(wishlistGame);

    const result = await useCase.execute(
      1,
      { kind: 'wishlist', title: 'Silksong', platform: 'PS5', status: 'Backlog' },
      'user-A',
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe('invalid_input');
    }
  });
});
