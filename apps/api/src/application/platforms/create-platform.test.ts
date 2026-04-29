import { beforeEach, describe, expect, it } from 'bun:test';
import { Platform, type NewPlatform } from '../../domain/platforms/platform';
import type { PlatformRepository } from '../../domain/platforms/platform-repository';
import { CreatePlatform } from './create-platform';

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
}

describe('CreatePlatform', () => {
  let repo: FakePlatformRepository;
  let useCase: CreatePlatform;

  beforeEach(() => {
    repo = new FakePlatformRepository();
    useCase = new CreatePlatform(repo);
  });

  it('creates platform and returns ok', async () => {
    const result = await useCase.execute({ name: 'Wii U' }, 'user-A');

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.name).toBe('Wii U');
      expect(result.value.userId).toBe('user-A');
    }
  });

  it('returns name_taken when duplicate name for same user', async () => {
    await useCase.execute({ name: 'PS5' }, 'user-A');

    const result = await useCase.execute({ name: 'PS5' }, 'user-A');

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe('name_taken');
    }
  });

  it('allows same name for different user', async () => {
    await useCase.execute({ name: 'PS5' }, 'user-A');

    const result = await useCase.execute({ name: 'PS5' }, 'user-B');

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.userId).toBe('user-B');
    }
  });

  it('returns invalid_input for empty name', async () => {
    const result = await useCase.execute({ name: '' }, 'user-A');

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe('invalid_input');
    }
  });
});
