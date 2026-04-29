import { beforeEach, describe, expect, it } from 'bun:test';
import { Platform, type NewPlatform } from '../../domain/platforms/platform';
import type { PlatformRepository } from '../../domain/platforms/platform-repository';
import { ListPlatforms } from './list-platforms';

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

describe('ListPlatforms', () => {
  let repo: FakePlatformRepository;
  let useCase: ListPlatforms;

  beforeEach(() => {
    repo = new FakePlatformRepository();
    useCase = new ListPlatforms(repo);
  });

  it('returns only platforms belonging to the requested user', async () => {
    repo.seed('user-A', 'PS5');
    repo.seed('user-A', 'PC');
    repo.seed('user-A', 'Switch');
    repo.seed('user-B', 'Xbox');
    repo.seed('user-B', 'PS3');

    const result = await useCase.execute('user-A');

    expect(result).toHaveLength(3);
    expect(result.every((p) => p.userId === 'user-A')).toBe(true);
  });

  it('returns empty array when user has no platforms', async () => {
    repo.seed('user-B', 'PS5');

    const result = await useCase.execute('user-A');

    expect(result).toHaveLength(0);
  });
});
