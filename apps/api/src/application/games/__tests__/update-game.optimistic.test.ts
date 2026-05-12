import Database from 'bun:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { and, eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/bun-sqlite';
import { migrate } from 'drizzle-orm/bun-sqlite/migrator';
import { OptimisticLockError } from '../../../domain/games/game-repository';
import { PLATFORM_DICTIONARY_KIND, type PlatformKind } from '../../../domain/platforms/platform';
import * as authSchema from '../../../infrastructure/db/auth-schema';
import { DrizzleTransactionRunner } from '../../../infrastructure/db/drizzle-transaction-runner';
import * as gameSchema from '../../../infrastructure/db/schema';
import {
  games as gamesTable,
  platforms as platformsTable,
} from '../../../infrastructure/db/schema';
import { makeDrizzleDictionaryRepository } from '../../../infrastructure/dictionary/make-drizzle-dictionary-repository';
import type { DrizzleHandle } from '../../../infrastructure/games/drizzle-game-repository';
import { DrizzleGameRepository } from '../../../infrastructure/games/drizzle-game-repository';
import { UpdateGame } from '../update-game';

function makePlatformRepo(database: DrizzleHandle) {
  return makeDrizzleDictionaryRepository<PlatformKind>({
    table: platformsTable,
    kind: PLATFORM_DICTIONARY_KIND,
    db: database,
  });
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = resolve(__dirname, '../../../../drizzle');

const USER_ID = 'user-A';
const EXTERNAL_ID = 'ext-1';

const validUpdate = {
  kind: 'owned' as const,
  title: 'Updated Title',
  developer: 'Capcom',
  genre: 'Action',
  releaseYear: 2005,
  platform: 'PC',
  hoursPlayed: 5,
  status: 'Playing' as const,
  format: 'digital' as const,
};

describe('UpdateGame optimistic locking', () => {
  let sqlite: Database;
  let db: ReturnType<typeof drizzle<typeof gameSchema & typeof authSchema>>;
  let repo: DrizzleGameRepository;
  let useCase: UpdateGame;

  beforeEach(async () => {
    sqlite = new Database(':memory:');
    db = drizzle({ client: sqlite, schema: { ...gameSchema, ...authSchema } });
    migrate(db, { migrationsFolder: MIGRATIONS_DIR });
    repo = new DrizzleGameRepository(db);
    const platformRepo = makePlatformRepo(db);
    const txRunner = new DrizzleTransactionRunner(db);
    useCase = new UpdateGame(repo, platformRepo, txRunner);

    await db.insert(platformsTable).values({
      userId: USER_ID,
      name: 'PC',
      externalId: 'plat-pc',
    });
    await db.insert(gamesTable).values({
      userId: USER_ID,
      externalId: EXTERNAL_ID,
      kind: 'owned',
      title: 'Resident Evil 4',
      developer: 'Capcom',
      genre: 'Action',
      releaseYear: 2005,
      platform: 'PC',
      format: 'digital',
      hoursPlayed: 0,
      status: 'Backlog',
      updatedAt: new Date(1_700_000_000_000),
    });
  });

  afterEach(() => {
    sqlite.close();
  });

  it('use-case maps OptimisticLockError → conflict when repo throws', async () => {
    // We cannot squeeze a concurrent writer between the use-case's tx-internal
    // read and its tx-internal write (single-threaded JS, plus `BEGIN IMMEDIATE`
    // would serialise such a writer anyway). Verify the mapping by wrapping
    // the real repo and forcing `update` to throw — this is the contract the
    // production transaction will exercise under real contention.
    const failingRepo: typeof repo = Object.assign(
      Object.create(Object.getPrototypeOf(repo) as object),
      repo,
      {
        withTx: (tx: unknown) => {
          const inner = repo.withTx(tx);
          return Object.assign(Object.create(Object.getPrototypeOf(inner) as object), inner, {
            update: async () => {
              throw new OptimisticLockError(EXTERNAL_ID);
            },
          });
        },
      },
    );

    const platformRepo = makePlatformRepo(db);
    const txRunner = new DrizzleTransactionRunner(db);
    const conflictUseCase = new UpdateGame(failingRepo, platformRepo, txRunner);

    const result = await conflictUseCase.execute(EXTERNAL_ID, validUpdate, USER_ID);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe('conflict');
  });

  it('happy path: no concurrent writer → update succeeds and bumps updated_at', async () => {
    const before = await repo.findByExternalId(USER_ID, EXTERNAL_ID);
    expect(before).not.toBeNull();
    if (!before) return;

    const result = await useCase.execute(EXTERNAL_ID, validUpdate, USER_ID);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.title).toBe('Updated Title');
    expect(result.value.updatedAt.getTime()).toBeGreaterThan(before.updatedAt.getTime());
  });

  it('repo.update throws OptimisticLockError directly when expected timestamp is stale', async () => {
    const existing = await repo.findByExternalId(USER_ID, EXTERNAL_ID);
    expect(existing).not.toBeNull();
    if (!existing) return;

    await db
      .update(gamesTable)
      .set({ title: 'Concurrent', updatedAt: new Date(1_700_000_555_000) })
      .where(eq(gamesTable.externalId, EXTERNAL_ID));

    const { GameUpdate } = await import('../../../domain/games/game-update');
    const updResult = GameUpdate.create({
      kind: existing.kind,
      userId: existing.userId,
      title: existing.title,
      developer: existing.developer,
      genre: existing.genre,
      releaseYear: existing.releaseYear?.value,
      platform: existing.platform,
      edition: existing.edition,
      hoursPlayed: existing.hoursPlayed?.value ?? null,
      status: existing.status,
      format: existing.format,
      coverColor: existing.coverColor,
      coverImage: existing.coverImage,
      price: existing.price?.value,
      purchasedAt: existing.purchasedAt?.value,
      notes: existing.notes,
    });
    if (!updResult.ok) throw new Error('test fixture violated invariants');
    const upd = updResult.value;
    let thrown: unknown = null;
    try {
      await repo.update(USER_ID, EXTERNAL_ID, upd, existing.updatedAt);
    } catch (e) {
      thrown = e;
    }
    expect(thrown).toBeInstanceOf(OptimisticLockError);
  });

  it('repo.update returns null when row genuinely does not exist', async () => {
    const ref = await repo.findByExternalId(USER_ID, EXTERNAL_ID);
    expect(ref).not.toBeNull();
    if (!ref) return;
    await db
      .delete(gamesTable)
      .where(and(eq(gamesTable.userId, USER_ID), eq(gamesTable.externalId, EXTERNAL_ID)));

    const { GameUpdate } = await import('../../../domain/games/game-update');
    const updResult = GameUpdate.create({
      kind: ref.kind,
      userId: ref.userId,
      title: ref.title,
      developer: ref.developer,
      genre: ref.genre,
      releaseYear: ref.releaseYear?.value,
      platform: ref.platform,
      edition: ref.edition,
      hoursPlayed: ref.hoursPlayed?.value ?? null,
      status: ref.status,
      format: ref.format,
      coverColor: ref.coverColor,
      coverImage: ref.coverImage,
      price: ref.price?.value,
      purchasedAt: ref.purchasedAt?.value,
      notes: ref.notes,
    });
    if (!updResult.ok) throw new Error('test fixture violated invariants');
    const upd = updResult.value;
    const out = await repo.update(USER_ID, EXTERNAL_ID, upd, ref.updatedAt);
    expect(out).toBeNull();
  });
});
