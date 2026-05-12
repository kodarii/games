import { beforeEach, describe, expect, it } from 'bun:test';
import {
  Dictionary,
  type DictionaryRepository,
  type NewDictionary,
} from '../../../domain/dictionary/dictionary';
import { InlineTransactionRunner } from '../../shared/__tests__/inline-transaction-runner';
import {
  type DictionaryUsageCounter,
  type DictionaryUseCases,
  makeDictionaryUseCases,
} from '../make-dictionary-use-cases';

const KIND = 'platform' as const;
type Kind = typeof KIND;

class FakeRepo implements DictionaryRepository<Kind> {
  private store = new Map<number, Dictionary<Kind>>();
  private nextId = 1;

  withTx = (_tx: unknown): DictionaryRepository<Kind> => this;

  async list(userId: string): Promise<Dictionary<Kind>[]> {
    return [...this.store.values()].filter((d) => d.userId === userId);
  }

  async findById(id: number): Promise<Dictionary<Kind> | null> {
    return this.store.get(id) ?? null;
  }

  async findByName(userId: string, name: string): Promise<Dictionary<Kind> | null> {
    return [...this.store.values()].find((d) => d.userId === userId && d.name === name) ?? null;
  }

  async create(entry: NewDictionary<Kind>): Promise<Dictionary<Kind>> {
    const d = Dictionary.fromPersistence(
      { id: this.nextId, externalId: entry.externalId, userId: entry.userId, name: entry.name },
      KIND,
    );
    this.nextId++;
    this.store.set(d.id, d);
    return d;
  }

  async delete(id: number): Promise<Dictionary<Kind> | null> {
    const d = this.store.get(id);
    if (!d) return null;
    this.store.delete(id);
    return d;
  }

  seed(userId: string, name: string): Dictionary<Kind> {
    const d = Dictionary.fromPersistence(
      { id: this.nextId, externalId: `ext-${this.nextId}`, userId, name },
      KIND,
    );
    this.nextId++;
    this.store.set(d.id, d);
    return d;
  }
}

describe('makeDictionaryUseCases', () => {
  let repo: FakeRepo;
  let usageCount: number;
  let counter: DictionaryUsageCounter;
  let useCases: DictionaryUseCases<Kind>;

  beforeEach(() => {
    repo = new FakeRepo();
    usageCount = 0;
    counter = async () => usageCount;
    useCases = makeDictionaryUseCases<Kind>({
      repo,
      withCounterTx: () => counter,
      transactionRunner: new InlineTransactionRunner(),
      kind: KIND,
      maxNameLength: 40,
    });
  });

  describe('create', () => {
    it('creates a dictionary entry on happy path', async () => {
      const result = await useCases.create.execute({ name: 'PS5' }, 'user-A');
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.name).toBe('PS5');
        expect(result.value.userId).toBe('user-A');
      }
    });

    it('rejects duplicate name for the same user', async () => {
      await useCases.create.execute({ name: 'PS5' }, 'user-A');
      const result = await useCases.create.execute({ name: 'PS5' }, 'user-A');
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.kind).toBe('name_taken');
    });

    it('allows the same name for a different user', async () => {
      await useCases.create.execute({ name: 'PS5' }, 'user-A');
      const result = await useCases.create.execute({ name: 'PS5' }, 'user-B');
      expect(result.ok).toBe(true);
    });

    it('returns invalid_input for empty name', async () => {
      const result = await useCases.create.execute({ name: '' }, 'user-A');
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.kind).toBe('invalid_input');
    });

    it('returns domain error for names exceeding max length', async () => {
      const result = await useCases.create.execute({ name: 'a'.repeat(41) }, 'user-A');
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.kind).toBe('domain');
    });
  });

  describe('delete', () => {
    it('deletes when not in use', async () => {
      const entry = repo.seed('user-A', 'PS5');
      const result = await useCases.delete.execute(entry.id, 'user-A');
      expect(result.ok).toBe(true);
      expect(await repo.findById(entry.id)).toBeNull();
    });

    it('returns not_found when entry belongs to another user', async () => {
      const entry = repo.seed('user-A', 'PS5');
      const result = await useCases.delete.execute(entry.id, 'user-B');
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.kind).toBe('not_found');
      expect(await repo.findById(entry.id)).not.toBeNull();
    });

    it('returns in_use when the counter reports at least one usage', async () => {
      const entry = repo.seed('user-A', 'PS5');
      usageCount = 1;
      const result = await useCases.delete.execute(entry.id, 'user-A');
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.kind).toBe('in_use');
      expect(await repo.findById(entry.id)).not.toBeNull();
    });

    it('returns not_found for non-existent id', async () => {
      const result = await useCases.delete.execute(999, 'user-A');
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.kind).toBe('not_found');
    });
  });

  describe('list', () => {
    it('returns only entries belonging to the requested user', async () => {
      repo.seed('user-A', 'PS5');
      repo.seed('user-A', 'PC');
      repo.seed('user-B', 'Xbox');
      const result = await useCases.list.execute('user-A');
      expect(result).toHaveLength(2);
      expect(result.every((d) => d.userId === 'user-A')).toBe(true);
    });
  });
});
