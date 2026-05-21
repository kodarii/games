import type { Game } from './game';
import type { GameUpdate } from './game-update';
import type { GameFormat, GameKind } from './game-value-objects';
import type { NewGame } from './new-game';
import type { ReleaseYearRange } from './release-year-range';

/**
 * Thrown by repositories when a read-modify-write sequence detects that the
 * row was modified by another writer between the read and the write. Routes
 * map this to 409 Conflict (problem+json type `optimistic-lock`).
 */
export class OptimisticLockError extends Error {
  readonly kind = 'optimistic_lock' as const;
  constructor(public readonly externalId: string) {
    super(`Game ${externalId} was modified by another request`);
    this.name = 'OptimisticLockError';
  }
}

/**
 * Read-side query DTO for listing games.
 * Semantyka pól:
 *   - filters: search, kind, platforms, formats, releaseYearRange
 *   - sort: sort, dir
 *   - pagination: page, perPage
 * userId jest implicit constraint (auth) — zawsze ustawiony przez application layer.
 */
export interface ListGamesQuery {
  userId: string;
  // filters
  search?: string;
  kind?: GameKind;
  platforms?: string[];
  formats?: GameFormat[];
  releaseYearRange?: ReleaseYearRange;
  // sort
  sort?: 'title' | 'genre' | 'platform' | 'format' | 'status' | 'releaseYear' | 'hoursPlayed';
  dir: 'asc' | 'desc';
  // pagination
  page: number;
  perPage: number;
}

export interface ListGamesResult {
  items: Game[];
  total: number;
}

export interface GameRepository {
  /**
   * Return a repository instance bound to a transaction handle. Concrete
   * implementations (Drizzle, in-memory fakes) decide what "tx" means.
   * The caller must use the returned repo inside the same atomic block.
   */
  withTx(tx: unknown): GameRepository;
  list(query: ListGamesQuery): Promise<ListGamesResult>;
  listAll(userId: string): Promise<Game[]>;
  findByExternalId(userId: string, externalId: string): Promise<Game | null>;
  create(game: NewGame): Promise<Game>;
  /**
   * Optimistic update — succeeds only if the row's `updated_at` still
   * matches `expectedUpdatedAt`. Throws `OptimisticLockError` if another
   * writer changed the row between the caller's read and this write.
   * Returns null when no row exists at all for (userId, externalId).
   */
  update(
    userId: string,
    externalId: string,
    game: GameUpdate,
    expectedUpdatedAt: Date,
  ): Promise<Game | null>;
  /**
   * Optimistic delete — same semantics as `update`. Use the freshly-read
   * Game's `updatedAt` as `expectedUpdatedAt`.
   */
  delete(userId: string, externalId: string, expectedUpdatedAt: Date): Promise<Game | null>;
  countByPlatform(userId: string, platformName: string): Promise<number>;
  countByGenre(userId: string, genre: string): Promise<number>;
  countByDeveloper(userId: string, developer: string): Promise<number>;
  /**
   * Persist the metadata-mutated subset of a Game: cover image, release
   * year, developer + the `metadata_*` ref columns. Scoped by user_id +
   * external_id so cross-user writes cannot leak (IDOR). Optimistic on
   * `expectedUpdatedAt`. Returns null if no row matched at all; throws
   * `OptimisticLockError` on a stale `expectedUpdatedAt`.
   */
  saveMetadata(
    userId: string,
    externalId: string,
    game: Game,
    expectedUpdatedAt: Date,
  ): Promise<Game | null>;
  /**
   * Used by orphan-cleanup cron — returns all non-null cover URLs across all users.
   */
  findAllCoverImages(): Promise<string[]>;
}
