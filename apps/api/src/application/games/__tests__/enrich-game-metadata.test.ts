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

const PROVIDER = 'igdb' as ProviderName;

const isCoverHostAllowed = (host: string) =>
  host === 'images.igdb.com' || host === 'utfs.io' || host.endsWith('.ufs.sh');

/**
 * Stub configured per-test to return a specific cached candidate. The
 * legacy tests in this file predate snapshot validation; they exercise the
 * IDOR / domain / invalid_input branches and need a lookup whose
 * fingerprint matches whatever snapshot the call carries.
 */
function lookupReturning(candidate: GameMetadataCandidate | null): MetadataCandidateLookup {
  return {
    findCandidate: async () =>
      candidate === null ? null : { candidate, fetchedAt: new Date('2025-01-01') },
  };
}

const VALID_CANDIDATE: GameMetadataCandidate = {
  providerName: PROVIDER,
  providerId: '12345',
  title: 'Resident Evil 4',
  developer: 'Capcom',
  releaseYear: 2005,
  coverImageUrl: 'https://images.igdb.com/igdb/image/upload/t_cover_big/abc.jpg',
  platformNames: ['PS2'],
};

const NULL_FIELDS_CANDIDATE: GameMetadataCandidate = {
  providerName: PROVIDER,
  providerId: '7',
  title: 'Whatever',
  developer: null,
  releaseYear: null,
  coverImageUrl: null,
  platformNames: [],
};

const EVIL_CANDIDATE: GameMetadataCandidate = {
  ...VALID_CANDIDATE,
  coverImageUrl: 'https://evil.example.com/x.jpg',
};

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

const VALID_INPUT = {
  providerName: 'igdb' as const,
  providerId: '12345',
  snapshot: {
    coverImageUrl: 'https://images.igdb.com/igdb/image/upload/t_cover_big/abc.jpg',
    releaseYear: 2005,
    developer: 'Capcom',
  },
};

describe('EnrichGameMetadata', () => {
  it('happy path: applies snapshot and persists via saveMetadata', async () => {
    const userId = 'user-A';
    const externalId = 'ext-1';
    const repo = new FakeGameRepository([makeGame(userId, externalId)]);
    const usecase = new EnrichGameMetadata(
      repo,
      new InlineTransactionRunner(),
      lookupReturning(VALID_CANDIDATE),
      isCoverHostAllowed,
    );

    const result = await usecase.execute(externalId, VALID_INPUT, userId);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.developer).toBe('Capcom');
    expect(result.value.releaseYear?.value).toBe(2005);
    expect(result.value.coverImage).toBe(
      'https://images.igdb.com/igdb/image/upload/t_cover_big/abc.jpg',
    );
    expect(result.value.metadataRef?.providerId).toBe('12345');
    expect(repo.saveCalls).toBe(1);
  });

  it('IDOR: game owned by a different user returns not_found', async () => {
    const repo = new FakeGameRepository([makeGame('user-A', 'ext-1')]);
    const usecase = new EnrichGameMetadata(
      repo,
      new InlineTransactionRunner(),
      lookupReturning(VALID_CANDIDATE),
      isCoverHostAllowed,
    );

    const result = await usecase.execute('ext-1', VALID_INPUT, 'user-B');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe('not_found');
    expect(repo.saveCalls).toBe(0);
  });

  it('non-existent externalId returns not_found', async () => {
    const repo = new FakeGameRepository([makeGame('user-A', 'ext-1')]);
    const usecase = new EnrichGameMetadata(
      repo,
      new InlineTransactionRunner(),
      lookupReturning(VALID_CANDIDATE),
      isCoverHostAllowed,
    );
    const result = await usecase.execute('ext-missing', VALID_INPUT, 'user-A');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe('not_found');
  });

  it('coverImageUrl with disallowed host fails domain validation', async () => {
    const repo = new FakeGameRepository([makeGame('user-A', 'ext-1')]);
    const usecase = new EnrichGameMetadata(
      repo,
      new InlineTransactionRunner(),
      lookupReturning(EVIL_CANDIDATE),
      isCoverHostAllowed,
    );
    const input = {
      ...VALID_INPUT,
      snapshot: { ...VALID_INPUT.snapshot, coverImageUrl: 'https://evil.example.com/x.jpg' },
    };
    const result = await usecase.execute('ext-1', input, 'user-A');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe('domain');
  });

  it('empty providerId fails Zod with invalid_input', async () => {
    const repo = new FakeGameRepository([makeGame('user-A', 'ext-1')]);
    const usecase = new EnrichGameMetadata(
      repo,
      new InlineTransactionRunner(),
      lookupReturning(VALID_CANDIDATE),
      isCoverHostAllowed,
    );
    const input = { ...VALID_INPUT, providerId: '' };
    const result = await usecase.execute('ext-1', input, 'user-A');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe('invalid_input');
  });

  it('null snapshot fields keep existing values', async () => {
    const userId = 'user-A';
    const externalId = 'ext-1';
    const repo = new FakeGameRepository([makeGame(userId, externalId)]);
    const usecase = new EnrichGameMetadata(
      repo,
      new InlineTransactionRunner(),
      lookupReturning(NULL_FIELDS_CANDIDATE),
      isCoverHostAllowed,
    );
    const input = {
      providerName: 'igdb' as const,
      providerId: '7',
      snapshot: { coverImageUrl: null, releaseYear: null, developer: null },
    };
    const result = await usecase.execute(externalId, input, userId);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.developer).toBeNull();
    expect(result.value.releaseYear).toBeNull();
    expect(result.value.coverImage).toBeUndefined();
    // Ref is still set on the game even when snapshot fields are all null —
    // the user explicitly confirmed a match.
    expect(result.value.metadataRef?.providerId).toBe('7');
  });
});
