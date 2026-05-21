import { describe, expect, it } from 'bun:test';
import { Game } from '../../../domain/games/game';
import type {
  GameRepository,
  ListGamesQuery,
  ListGamesResult,
} from '../../../domain/games/game-repository';
import type { GameUpdate } from '../../../domain/games/game-update';
import { InlineTransactionRunner } from '../../shared/__tests__/inline-transaction-runner';
import { MoveToCollection } from '../move-to-collection';

class FakeGameRepository implements GameRepository {
  private store: Map<number, Game> = new Map();

  constructor(games: Game[] = []) {
    for (const g of games) this.store.set(g.id, g);
  }

  withTx = (_tx: unknown): GameRepository => this;

  findByExternalId = async (userId: string, externalId: string): Promise<Game | null> => {
    for (const g of this.store.values()) {
      if (g.userId === userId && g.externalId === externalId) return g;
    }
    return null;
  };

  update = async (
    userId: string,
    externalId: string,
    newGame: GameUpdate,
    _expectedUpdatedAt: Date,
  ): Promise<Game | null> => {
    const existing = [...this.store.values()].find(
      (g) => g.externalId === externalId && g.userId === userId,
    );
    if (!existing) return null;
    const updated = Game.fromPersistence({
      id: existing.id,
      externalId: existing.externalId,
      kind: newGame.kind,
      userId: newGame.userId,
      title: newGame.title,
      developer: newGame.developer,
      genre: newGame.genre,
      releaseYear: newGame.releaseYear?.value ?? null,
      platform: newGame.platform,
      edition: newGame.edition ?? null,
      hoursPlayed: newGame.hoursPlayed?.value ?? null,
      status: newGame.status ?? null,
      format: newGame.format,
      coverColor: newGame.coverColor ?? null,
      coverImage: newGame.coverImage ?? null,
      price: newGame.price?.value ?? null,
      purchasedAt: newGame.purchasedAt?.value ?? null,
    });
    this.store.set(existing.id, updated);
    return updated;
  };

  list = async (_q: ListGamesQuery): Promise<ListGamesResult> => {
    throw new Error('not implemented');
  };
  listAll = async (): Promise<Game[]> => {
    throw new Error('not implemented');
  };
  create = async (): Promise<Game> => {
    throw new Error('not implemented');
  };
  delete = async (): Promise<Game | null> => {
    throw new Error('not implemented');
  };
  countByPlatform = async (): Promise<number> => 0;
  countByGenre = async (): Promise<number> => 0;
  countByDeveloper = async (): Promise<number> => 0;
  findAllCoverImages = async (): Promise<string[]> => [];
  saveMetadata = async (): Promise<Game | null> => {
    throw new Error('not implemented');
  };
}

function makeWishlistGame(
  overrides: Partial<Parameters<typeof Game.fromPersistence>[0]> = {},
): Game {
  return Game.fromPersistence({
    id: 1,
    externalId: 'ext-wish-1',
    kind: 'wishlist',
    userId: 'user-A',
    title: 'Hades',
    developer: 'Supergiant',
    genre: 'Roguelike',
    releaseYear: 2020,
    platform: 'PC',
    edition: null,
    hoursPlayed: null,
    status: null,
    format: 'digital',
    coverImage: 'https://example.com/cover.jpg',
    coverColor: '#abc',
    price: 1999,
    purchasedAt: null,
    ...overrides,
  });
}

describe('MoveToCollection', () => {
  it('moves a wishlist game to owned with status=Backlog and hoursPlayed=0', async () => {
    const game = makeWishlistGame();
    const repo = new FakeGameRepository([game]);
    const useCase = new MoveToCollection(repo, new InlineTransactionRunner());

    const result = await useCase.execute('ext-wish-1', 'user-A');

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.kind).toBe('owned');
    expect(result.value.status).toBe('Backlog');
    expect(result.value.hoursPlayed?.value).toBe(0);
  });

  it('preserves all other fields after move', async () => {
    const game = makeWishlistGame();
    const repo = new FakeGameRepository([game]);
    const useCase = new MoveToCollection(repo, new InlineTransactionRunner());

    const result = await useCase.execute('ext-wish-1', 'user-A');

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.title).toBe('Hades');
    expect(result.value.developer).toBe('Supergiant');
    expect(result.value.genre).toBe('Roguelike');
    expect(result.value.releaseYear?.value).toBe(2020);
    expect(result.value.platform).toBe('PC');
    expect(result.value.format).toBe('digital');
    expect(result.value.coverImage).toBe('https://example.com/cover.jpg');
    expect(result.value.coverColor).toBe('#abc');
    expect(result.value.price?.value).toBe(1999);
  });

  it('returns not_found when game does not exist', async () => {
    const repo = new FakeGameRepository([]);
    const useCase = new MoveToCollection(repo, new InlineTransactionRunner());

    const result = await useCase.execute('nonexistent', 'user-A');

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe('not_found');
  });

  it('returns not_found when game belongs to another user', async () => {
    const game = makeWishlistGame({ userId: 'user-B' });
    const repo = new FakeGameRepository([game]);
    const useCase = new MoveToCollection(repo, new InlineTransactionRunner());

    const result = await useCase.execute('ext-wish-1', 'user-A');

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe('not_found');
  });

  it('returns already_owned when game is already owned', async () => {
    const game = Game.fromPersistence({
      id: 2,
      externalId: 'ext-owned-2',
      kind: 'owned',
      userId: 'user-A',
      title: 'Hades',
      developer: 'Supergiant',
      genre: 'Roguelike',
      releaseYear: 2020,
      platform: 'PC',
      edition: null,
      hoursPlayed: 10,
      status: 'Playing',
      format: 'digital',
    });
    const repo = new FakeGameRepository([game]);
    const useCase = new MoveToCollection(repo, new InlineTransactionRunner());

    const result = await useCase.execute('ext-owned-2', 'user-A');

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe('already_owned');
  });

  it('preserves null developer after move', async () => {
    const game = makeWishlistGame({ developer: null });
    const repo = new FakeGameRepository([game]);
    const useCase = new MoveToCollection(repo, new InlineTransactionRunner());

    const result = await useCase.execute('ext-wish-1', 'user-A');

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.developer).toBeNull();
  });
});
