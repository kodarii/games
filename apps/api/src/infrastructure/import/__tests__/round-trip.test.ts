import Database from 'bun:sqlite';
import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { and, eq, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/bun-sqlite';
import { migrate } from 'drizzle-orm/bun-sqlite/migrator';
import { type ExportSnapshot, toSnapshot } from '../../../application/export/export-snapshot';
import { ImportData } from '../../../application/import/import-data';
import { NewGame } from '../../../domain/games/new-game';
import { PLATFORM_DICTIONARY_KIND, type PlatformKind } from '../../../domain/platforms/platform';
import * as authSchema from '../../db/auth-schema';
import * as gameSchema from '../../db/schema';
import { games, platforms as platformsTable } from '../../db/schema';
import { makeDrizzleDictionaryRepository } from '../../dictionary/make-drizzle-dictionary-repository';
import { DrizzleGameRepository } from '../../games/drizzle-game-repository';
import { DrizzleImportRepository } from '../drizzle-import-repository';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = resolve(__dirname, '../../../../drizzle');

// Three users, no per-run UUIDs (in-memory isolation, single bun:test process).
const TEST_USER_A = 'user-a';
// Separate import target — keeps the seed and read-back sides observable.
const TEST_USER_A_CLONE = 'user-a-clone';
const TEST_USER_B = 'user-b';

let sqlite: Database;
let db: ReturnType<typeof drizzle<typeof gameSchema & typeof authSchema>>;
let importData: ImportData;
let gameRepo: DrizzleGameRepository;
let platformRepo: ReturnType<typeof makeDrizzleDictionaryRepository<PlatformKind>>;
let importRepo: DrizzleImportRepository;

beforeAll(() => {
  sqlite = new Database(':memory:');
  db = drizzle({ client: sqlite, schema: { ...gameSchema, ...authSchema } });
  migrate(db, { migrationsFolder: MIGRATIONS_DIR });

  // Seed auth users — FK constraint on games.userId / platforms.userId.
  db.insert(authSchema.user)
    .values([
      {
        id: TEST_USER_A,
        email: 'a@test.local',
        name: 'User A',
        emailVerified: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: TEST_USER_A_CLONE,
        email: 'a-clone@test.local',
        name: 'User A Clone',
        emailVerified: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: TEST_USER_B,
        email: 'b@test.local',
        name: 'User B',
        emailVerified: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ])
    .run();

  // All three repos wired against the same in-memory db handle via existing
  // DI surfaces (Q7 option (c) — no widening required).
  gameRepo = new DrizzleGameRepository(db);
  platformRepo = makeDrizzleDictionaryRepository<PlatformKind>({
    table: platformsTable,
    kind: PLATFORM_DICTIONARY_KIND,
    db,
  });
  importRepo = new DrizzleImportRepository(db);
  importData = new ImportData(gameRepo, platformRepo, importRepo);
});

afterAll(() => {
  sqlite.close();
});

async function exportSnapshotForUser(userId: string, now: Date): Promise<ExportSnapshot> {
  const gamesList = await gameRepo.listAll(userId);
  const platformsList = await platformRepo.list(userId);
  return toSnapshot(gamesList, platformsList, now);
}

function stripVolatile(s: ExportSnapshot): Omit<ExportSnapshot, 'exportedAt'> & {
  exportedAt: 'STRIP';
} {
  return { ...s, exportedAt: 'STRIP' };
}

describe('ImportData round-trip via real production constructor + execute', () => {
  it('Test 1: v4 round-trip preserves price/purchasedAt/notes; documents BE-02c gap via not.toHaveProperty', async () => {
    // F-2 fix: seed platforms FIRST so every game's `platform` field
    // matches a seeded platform name. ImportData.execute returns
    // `err({ kind: 'unknown_platform' })` if a game references a name not
    // present in `snap.platforms` ∪ `userPlatforms`.
    db.insert(platformsTable)
      .values([
        { userId: TEST_USER_A, name: 'PC', externalId: 'pc' },
        { userId: TEST_USER_A, name: 'PS5', externalId: 'ps5' },
      ])
      .run();

    // Seed 3 games for TEST_USER_A, each populating price/purchasedAt/notes.
    // At least one carries coverImage + metadataRef in the SEED — proving
    // the silent drop is at the SNAPSHOT (export) layer, not at the repo
    // (BE-02b repo-layer fix landed in Phase 5).
    db.insert(games)
      .values([
        {
          userId: TEST_USER_A,
          externalId: 'rt-1',
          kind: 'owned',
          title: 'A Game',
          genre: 'rpg',
          platform: 'PC',
          format: 'digital',
          hoursPlayed: 12,
          status: 'Playing',
          price: 4999,
          purchasedAt: '2025-01-15',
          notes: 'first',
          coverImage: 'https://imgs.example/a.jpg',
          metadataProvider: 'igdb',
          metadataProviderId: '101',
          metadataMatchedAt: '2025-01-01T00:00:00.000Z',
        },
        {
          userId: TEST_USER_A,
          externalId: 'rt-2',
          kind: 'owned',
          title: 'B Game',
          genre: 'action',
          platform: 'PS5',
          format: 'physical',
          hoursPlayed: 0,
          status: 'Backlog',
          price: 7999,
          purchasedAt: '2025-02-20',
          notes: 'second',
        },
        {
          userId: TEST_USER_A,
          externalId: 'rt-3',
          kind: 'owned',
          title: 'C Game',
          genre: 'strategy',
          platform: 'PC',
          format: 'digital',
          hoursPlayed: 100,
          status: 'Completed',
          price: 1999,
          purchasedAt: '2025-03-10',
          notes: 'third',
        },
      ])
      .run();

    const fixedNow1 = new Date('2025-05-01T00:00:00.000Z');
    const snapshot1 = await exportSnapshotForUser(TEST_USER_A, fixedNow1);
    expect(snapshot1.games.length).toBe(3);
    expect(snapshot1.platforms.length).toBe(2);

    // F-2 result.ok pin: turn silent error into loud signal.
    const result = await importData.execute(
      TEST_USER_A_CLONE,
      JSON.stringify(snapshot1),
      'replace',
    );
    expect(result.ok).toBe(true);

    const fixedNow2 = new Date('2025-05-02T00:00:00.000Z');
    const snapshot2 = await exportSnapshotForUser(TEST_USER_A_CLONE, fixedNow2);

    // The two snapshots are byte-identical after stripping the volatile
    // `exportedAt` field. externalIds round-trip because ImportData.execute
    // calls `NewGame.create({...}, () => g.externalId)`.
    expect(stripVolatile(snapshot2)).toEqual(stripVolatile(snapshot1));

    // Per-game positive preservation of the 3 v4-carried fields.
    for (let i = 0; i < snapshot1.games.length; i++) {
      expect(snapshot2.games[i]).toMatchObject({
        price: snapshot1.games[i].price,
        purchasedAt: snapshot1.games[i].purchasedAt,
        notes: snapshot1.games[i].notes,
      });
    }

    // BE-02c v5 tripwire. These assertions are structurally true today
    // because `ExportedGame` (the result type of `toSnapshot`) lacks these
    // keys. They fail RED the moment a v5 PR adds those keys to
    // `ExportedGame`. That RED signal forces the v5 author to consciously
    // decide whether to (a) extend `ImportData.execute` to consume the new
    // fields and flip the assertions to positive preservation, OR (b)
    // document why round-trip intentionally skips them. See
    // FIXME(BE-02c, F-08-1) markers in `import-data.ts` + `export-snapshot.ts`.
    expect(snapshot1.games[0]).not.toHaveProperty('coverImage');
    expect(snapshot1.games[0]).not.toHaveProperty('metadataProvider');
    expect(snapshot1.games[0]).not.toHaveProperty('metadataProviderId');
    expect(snapshot1.games[0]).not.toHaveProperty('metadataMatchedAt');
    expect(snapshot2.games[0]).not.toHaveProperty('coverImage');
    expect(snapshot2.games[0]).not.toHaveProperty('metadataProvider');
    expect(snapshot2.games[0]).not.toHaveProperty('metadataProviderId');
    expect(snapshot2.games[0]).not.toHaveProperty('metadataMatchedAt');
  });

  it('Test 2: metadataRef.matchedAt is re-stamped, not round-tripped (Q-DDD-2)', async () => {
    // Direct DB seed preserves matchedAt verbatim (proves seed → row).
    db.insert(games)
      .values({
        userId: TEST_USER_A,
        externalId: 'rs-seed',
        kind: 'owned',
        title: 'matched seed',
        genre: 'rpg',
        platform: 'PC',
        format: 'digital',
        hoursPlayed: 1,
        status: 'Playing',
        metadataProvider: 'igdb',
        metadataProviderId: '99',
        metadataMatchedAt: '2020-01-01T00:00:00.000Z',
      })
      .run();

    const seeded = await db
      .select()
      .from(games)
      .where(and(eq(games.userId, TEST_USER_A), eq(games.externalId, 'rs-seed')));
    expect(seeded[0]?.metadataMatchedAt).toBe('2020-01-01T00:00:00.000Z');

    // NewGame.create re-stamps matchedAt to new Date() inside the
    // constructor (new-game.ts:60). Even when the caller does not pass
    // matchedAt (NewGameProps does not declare it), the persisted value is
    // "now", never the seeded 2020 timestamp.
    const ngResult = NewGame.create(
      {
        kind: 'owned',
        userId: TEST_USER_A_CLONE,
        title: 'matched new',
        developer: null,
        genre: 'rpg',
        platform: 'PC',
        hoursPlayed: 1,
        status: 'Playing',
        format: 'digital',
        metadataRef: { providerName: 'igdb', providerId: '99' },
      },
      () => 'rs-1',
    );
    expect(ngResult.ok).toBe(true);
    if (!ngResult.ok) throw new Error('unreachable');

    await importRepo.apply(TEST_USER_A_CLONE, { platforms: [], games: [ngResult.value] }, 'merge');

    const [row] = await db
      .select()
      .from(games)
      .where(and(eq(games.userId, TEST_USER_A_CLONE), eq(games.externalId, 'rs-1')));
    expect(row).toBeDefined();
    expect(row?.metadataProvider).toBe('igdb');
    expect(row?.metadataProviderId).toBe('99');
    expect(row?.metadataMatchedAt).not.toBeNull();
    expect(row?.metadataMatchedAt).not.toBe('2020-01-01T00:00:00.000Z');
  });

  it('Test 3: per-user isolation — replace import on A does not touch B (F-08-6)', async () => {
    // Seed TEST_USER_B with distinct rows.
    db.insert(games)
      .values([
        {
          userId: TEST_USER_B,
          externalId: 'b-1',
          kind: 'owned',
          title: 'B One',
          genre: 'rpg',
          platform: 'PC',
          format: 'digital',
          hoursPlayed: 1,
          status: 'Playing',
        },
        {
          userId: TEST_USER_B,
          externalId: 'b-2',
          kind: 'owned',
          title: 'B Two',
          genre: 'rpg',
          platform: 'PC',
          format: 'digital',
          hoursPlayed: 2,
          status: 'Playing',
        },
      ])
      .run();
    db.insert(platformsTable).values({ userId: TEST_USER_B, name: 'PC', externalId: 'b-pc' }).run();

    const [{ c: bCountBefore = 0 } = {}] = await db
      .select({ c: sql<number>`count(*)` })
      .from(games)
      .where(eq(games.userId, TEST_USER_B));
    expect(bCountBefore).toBe(2);

    // Build snapshot from TEST_USER_A. The count depends on cumulative
    // seeding from earlier tests in this file (bun:test honors source
    // order within a file but does not isolate per-test state by default).
    // Capture the expected count dynamically.
    const fixedNow = new Date('2025-06-01T00:00:00.000Z');
    const snapshotA = await exportSnapshotForUser(TEST_USER_A, fixedNow);
    const expectedACount = snapshotA.games.length;
    expect(expectedACount).toBeGreaterThanOrEqual(3);

    // F-2 result.ok pin.
    const result3 = await importData.execute(
      TEST_USER_A_CLONE,
      JSON.stringify(snapshotA),
      'replace',
    );
    expect(result3.ok).toBe(true);

    // B-side count unchanged — replace mode scoped strictly per-user.
    const [{ c: bCountAfter = 0 } = {}] = await db
      .select({ c: sql<number>`count(*)` })
      .from(games)
      .where(eq(games.userId, TEST_USER_B));
    expect(bCountAfter).toBe(bCountBefore);

    // Clone has exactly TEST_USER_A's games (count matches), none of B's.
    const cloneSnapshot = await exportSnapshotForUser(TEST_USER_A_CLONE, fixedNow);
    expect(cloneSnapshot.games.length).toBe(expectedACount);
    const bExternalIds = new Set(['b-1', 'b-2']);
    for (const g of cloneSnapshot.games) {
      expect(bExternalIds.has(g.externalId)).toBe(false);
    }
  });
});
