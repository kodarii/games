import { describe, expect, it } from 'bun:test';
import type { ProviderName } from '../../../domain/games/external-metadata-ref';
import { Game } from '../../../domain/games/game';
import type { GameMetadataCandidate } from '../../../domain/games/game-metadata-provider';
import type {
  GameRepository,
  ListGamesQuery,
  ListGamesResult,
} from '../../../domain/games/game-repository';
import type { GameUpdate } from '../../../domain/games/game-update';
import type { NewGame } from '../../../domain/games/new-game';
import { InlineTransactionRunner } from '../../shared/__tests__/inline-transaction-runner';
import { EnrichGameMetadata, type MetadataCandidateLookup } from '../enrich-game-metadata';

class FakeGameRepository implements GameRepository {
  private readonly store: Map<string, Game> = new Map();
  saveCalls = 0;

  constructor(games: Game[] = []) {
    for (const g of games) this.store.set(`${g.userId}:${g.externalId}`, g);
  }

  withTx = (_tx: unknown): GameRepository => this;

  async findByExternalId(userId: string, externalId: string): Promise<Game | null> {
    return this.store.get(`${userId}:${externalId}`) ?? null;
  }

  async saveMetadata(
    userId: string,
    externalId: string,
    game: Game,
    _expectedUpdatedAt: Date,
  ): Promise<Game | null> {
    this.saveCalls += 1;
    const key = `${userId}:${externalId}`;
    if (!this.store.has(key)) return null;
    this.store.set(key, game);
    return game;
  }

  list = async (_q: ListGamesQuery): Promise<ListGamesResult> => {
    throw new Error('not implemented');
  };
  listAll = async (): Promise<Game[]> => {
    throw new Error('not implemented');
  };
  findById = async (): Promise<Game | null> => {
    throw new Error('not implemented');
  };
  create = async (_g: NewGame): Promise<Game> => {
    throw new Error('not implemented');
  };
  update = async (
    _u: string,
    _e: string,
    _g: GameUpdate,
    _expectedUpdatedAt: Date,
  ): Promise<Game | null> => {
    throw new Error('not implemented');
  };
  delete = async (): Promise<Game | null> => {
    throw new Error('not implemented');
  };
  countByPlatform = async (): Promise<number> => 0;
  countByGenre = async (): Promise<number> => 0;
  countByDeveloper = async (): Promise<number> => 0;
  findAllCoverImages = async (): Promise<string[]> => [];
}

class StubCandidateLookup implements MetadataCandidateLookup {
  constructor(private readonly entry: GameMetadataCandidate | null) {}
  async findCandidate(
    _provider: string,
    _providerId: string,
  ): Promise<{ candidate: GameMetadataCandidate; fetchedAt: Date } | null> {
    if (!this.entry) return null;
    return { candidate: this.entry, fetchedAt: new Date('2025-01-01') };
  }
}

function makeGame(userId: string, externalId: string): Game {
  return Game.fromPersistence({
    id: 1,
    externalId,
    kind: 'owned',
    userId,
    title: 'Resident Evil 4',
    developer: null,
    genre: 'Action',
    releaseYear: null,
    platform: 'PS2',
    edition: null,
    hoursPlayed: 0,
    status: 'Backlog',
    format: 'physical',
    coverColor: null,
    coverImage: null,
    price: null,
    purchasedAt: null,
    notes: null,
  });
}

const CACHE_COVER_URL = 'https://images.igdb.com/igdb/image/upload/t_cover_big/abc.jpg';

const isCoverHostAllowed = (host: string) =>
  host === 'images.igdb.com' || host === 'utfs.io' || host.endsWith('.ufs.sh');

const PROVIDER = 'igdb' as ProviderName;

const TRUSTED_CANDIDATE: GameMetadataCandidate = {
  providerName: PROVIDER,
  providerId: '12345',
  title: 'Resident Evil 4',
  developer: 'Capcom',
  releaseYear: 2005,
  coverImageUrl: CACHE_COVER_URL,
  platformNames: ['PS2'],
};

const MATCHING_INPUT = {
  providerName: 'igdb' as const,
  providerId: '12345',
  snapshot: {
    coverImageUrl: CACHE_COVER_URL,
    releaseYear: 2005,
    developer: 'Capcom',
  },
};

describe('EnrichGameMetadata snapshot validation', () => {
  it('happy path: snapshot matches cached candidate → saves', async () => {
    const userId = 'user-A';
    const externalId = 'ext-1';
    const repo = new FakeGameRepository([makeGame(userId, externalId)]);
    const lookup = new StubCandidateLookup(TRUSTED_CANDIDATE);
    const usecase = new EnrichGameMetadata(
      repo,
      new InlineTransactionRunner(),
      lookup,
      isCoverHostAllowed,
    );

    const result = await usecase.execute(externalId, MATCHING_INPUT, userId);

    expect(result.ok).toBe(true);
    expect(repo.saveCalls).toBe(1);
  });

  it('rejects snapshot whose developer differs from the cached candidate', async () => {
    const repo = new FakeGameRepository([makeGame('user-A', 'ext-1')]);
    const lookup = new StubCandidateLookup(TRUSTED_CANDIDATE);
    const usecase = new EnrichGameMetadata(
      repo,
      new InlineTransactionRunner(),
      lookup,
      isCoverHostAllowed,
    );

    const result = await usecase.execute(
      'ext-1',
      {
        ...MATCHING_INPUT,
        snapshot: { ...MATCHING_INPUT.snapshot, developer: 'NotCapcom' },
      },
      'user-A',
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe('snapshot_mismatch');
    expect(repo.saveCalls).toBe(0);
  });

  it('rejects snapshot whose releaseYear differs from the cached candidate', async () => {
    const repo = new FakeGameRepository([makeGame('user-A', 'ext-1')]);
    const lookup = new StubCandidateLookup(TRUSTED_CANDIDATE);
    const usecase = new EnrichGameMetadata(
      repo,
      new InlineTransactionRunner(),
      lookup,
      isCoverHostAllowed,
    );

    const result = await usecase.execute(
      'ext-1',
      {
        ...MATCHING_INPUT,
        snapshot: { ...MATCHING_INPUT.snapshot, releaseYear: 1999 },
      },
      'user-A',
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe('snapshot_mismatch');
    expect(repo.saveCalls).toBe(0);
  });

  it('rejects snapshot whose coverImageUrl differs from the cached candidate', async () => {
    const repo = new FakeGameRepository([makeGame('user-A', 'ext-1')]);
    const lookup = new StubCandidateLookup(TRUSTED_CANDIDATE);
    const usecase = new EnrichGameMetadata(
      repo,
      new InlineTransactionRunner(),
      lookup,
      isCoverHostAllowed,
    );

    const result = await usecase.execute(
      'ext-1',
      {
        ...MATCHING_INPUT,
        snapshot: {
          ...MATCHING_INPUT.snapshot,
          coverImageUrl: 'https://images.igdb.com/igdb/image/upload/t_cover_big/evil.jpg',
        },
      },
      'user-A',
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe('snapshot_mismatch');
    expect(repo.saveCalls).toBe(0);
  });

  it('returns cache_miss when the cache no longer contains the providerId', async () => {
    const repo = new FakeGameRepository([makeGame('user-A', 'ext-1')]);
    const lookup = new StubCandidateLookup(null);
    const usecase = new EnrichGameMetadata(
      repo,
      new InlineTransactionRunner(),
      lookup,
      isCoverHostAllowed,
    );

    const result = await usecase.execute('ext-1', MATCHING_INPUT, 'user-A');

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe('cache_miss');
    expect(repo.saveCalls).toBe(0);
  });

  it('runs validation BEFORE applyMetadata — fingerprint mismatch leaves the game untouched', async () => {
    const userId = 'user-A';
    const externalId = 'ext-1';
    const repo = new FakeGameRepository([makeGame(userId, externalId)]);
    const lookup = new StubCandidateLookup(TRUSTED_CANDIDATE);
    const usecase = new EnrichGameMetadata(
      repo,
      new InlineTransactionRunner(),
      lookup,
      isCoverHostAllowed,
    );

    await usecase.execute(
      externalId,
      {
        ...MATCHING_INPUT,
        snapshot: { ...MATCHING_INPUT.snapshot, developer: 'Tampered' },
      },
      userId,
    );

    expect(repo.saveCalls).toBe(0);
  });
});
