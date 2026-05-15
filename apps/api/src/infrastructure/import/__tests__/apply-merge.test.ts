import Database from 'bun:sqlite';
import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { eq, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/bun-sqlite';
import { migrate } from 'drizzle-orm/bun-sqlite/migrator';
import { NewGame } from '../../../domain/games/new-game';
import type { ImportPlan } from '../../../domain/import/import-repository';
import { NewPlatform } from '../../../domain/platforms/platform';
import * as authSchema from '../../db/auth-schema';
import * as gameSchema from '../../db/schema';
import { games, platforms } from '../../db/schema';
import { DrizzleImportRepository } from '../drizzle-import-repository';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = resolve(__dirname, '../../../../drizzle');

// Q7: static IDs — in-memory isolation eliminates the need for per-run UUIDs.
const TEST_USER_A = 'user-a';
const TEST_USER_B = 'user-b';

let sqlite: Database;
let db: ReturnType<typeof drizzle<typeof gameSchema & typeof authSchema>>;
let repo: DrizzleImportRepository;

function makePlatform(externalId: string, name: string, userId: string): NewPlatform {
  const result = NewPlatform.create({ userId, name }, () => externalId);
  if (!result.ok) {
    throw new Error(`NewPlatform.create failed: ${JSON.stringify(result.error)}`);
  }
  return result.value;
}

function makeGame(
  externalId: string,
  userId: string,
  overrides: { title?: string; hoursPlayed?: number } = {},
): NewGame {
  const result = NewGame.create(
    {
      kind: 'owned',
      userId,
      title: overrides.title ?? `Game ${externalId}`,
      developer: null,
      genre: 'Action',
      releaseYear: 2020,
      platform: 'PC',
      hoursPlayed: overrides.hoursPlayed ?? 0,
      status: 'Playing',
      format: 'digital',
    },
    () => externalId,
  );
  if (!result.ok) {
    throw new Error(`NewGame.create failed: ${JSON.stringify(result.error)}`);
  }
  return result.value;
}

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
        id: TEST_USER_B,
        email: 'b@test.local',
        name: 'User B',
        emailVerified: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ])
    .run();

  // Seed 50 games + 5 platforms for A (overlap fixture for Test 1 + Test 4).
  // `owned` games must have BOTH status and hours_played non-null
  // (games_kind_consistency CHECK constraint, migration 0010).
  const seedGamesA: (typeof games.$inferInsert)[] = [];
  for (let i = 0; i < 50; i++) {
    seedGamesA.push({
      userId: TEST_USER_A,
      externalId: `seed-g-${i}`,
      kind: 'owned',
      title: `Seed Game ${i}`,
      genre: 'Action',
      platform: 'PC',
      format: 'digital',
      status: 'Playing',
      // Test 4 reads back hoursPlayed for seed-g-0 — start at 10.
      hoursPlayed: i === 0 ? 10 : 0,
    });
  }
  db.insert(games).values(seedGamesA).run();

  const seedPlatformsA: (typeof platforms.$inferInsert)[] = [];
  for (let i = 0; i < 5; i++) {
    seedPlatformsA.push({
      userId: TEST_USER_A,
      externalId: `seed-p-${i}`,
      name: `Seed Platform ${i}`,
    });
  }
  db.insert(platforms).values(seedPlatformsA).run();

  // Seed 5 games for B (per-user isolation pin for Test 2).
  const seedGamesB: (typeof games.$inferInsert)[] = [];
  for (let i = 0; i < 5; i++) {
    seedGamesB.push({
      userId: TEST_USER_B,
      externalId: `b-g-${i}`,
      kind: 'owned',
      title: `B Game ${i}`,
      genre: 'Action',
      platform: 'PC',
      format: 'digital',
      status: 'Playing',
      hoursPlayed: 0,
    });
  }
  db.insert(games).values(seedGamesB).run();

  // Q7: inject the isolated in-memory db — NOT the production singleton.
  repo = new DrizzleImportRepository(db);
});

afterAll(() => {
  sqlite.close();
});

describe('DrizzleImportRepository.applyMerge (BE-03 semantic regression)', () => {
  it('merges 100 games + 5 platforms with correct upsert counts (75 new, 25 update)', async () => {
    // Plan: 25 reuse seed-g-0..24, 75 new (new-g-0..74); 3 reuse seed-p-0..2, 2 new.
    const planPlatforms: NewPlatform[] = [];
    for (let i = 0; i < 3; i++) {
      // Same name — UPDATE branch skips (name unchanged).
      planPlatforms.push(makePlatform(`seed-p-${i}`, `Seed Platform ${i}`, TEST_USER_A));
    }
    for (let i = 0; i < 2; i++) {
      planPlatforms.push(makePlatform(`new-p-${i}`, `New Platform ${i}`, TEST_USER_A));
    }

    const planGames: NewGame[] = [];
    for (let i = 0; i < 25; i++) {
      planGames.push(makeGame(`seed-g-${i}`, TEST_USER_A));
    }
    for (let i = 0; i < 75; i++) {
      planGames.push(makeGame(`new-g-${i}`, TEST_USER_A));
    }

    const plan: ImportPlan = { platforms: planPlatforms, games: planGames };
    const report = await repo.apply(TEST_USER_A, plan, 'merge');

    expect(report.mode).toBe('merge');
    expect(report.games.created).toBe(75);
    expect(report.games.updated).toBe(25);
    expect(report.platforms.created).toBe(2);
    // pUpdated stays at 0 — same names, no name change triggers the UPDATE branch.
    expect(report.platforms.updated).toBe(0);

    const [{ c }] = await db
      .select({ c: sql<number>`count(*)` })
      .from(games)
      .where(eq(games.userId, TEST_USER_A));
    expect(c).toBe(125); // 50 seeded + 75 created
  });

  it("does not touch user B's rows when merging for user A (T-5-03 isolation pin)", async () => {
    const beforeBQuery = await db
      .select({ c: sql<number>`count(*)` })
      .from(games)
      .where(eq(games.userId, TEST_USER_B));
    const beforeB = beforeBQuery[0]?.c ?? 0;

    // Sanity: B has 5 seeded games. Merge for A must not change that.
    expect(beforeB).toBe(5);

    const plan: ImportPlan = {
      platforms: [makePlatform('a-only-p-1', 'A Only Platform', TEST_USER_A)],
      games: [makeGame('a-only-g-1', TEST_USER_A)],
    };
    await repo.apply(TEST_USER_A, plan, 'merge');

    const afterBQuery = await db
      .select({ c: sql<number>`count(*)` })
      .from(games)
      .where(eq(games.userId, TEST_USER_B));
    const afterB = afterBQuery[0]?.c ?? 0;
    expect(afterB).toBe(beforeB);
  });

  it('empty plan does not error and reports zeros (empty-array IN () guard)', async () => {
    const report = await repo.apply(TEST_USER_A, { platforms: [], games: [] }, 'merge');

    expect(report).toEqual({
      mode: 'merge',
      platforms: { created: 0, updated: 0 },
      games: { created: 0, updated: 0 },
    });
  });

  it('updates existing row fields (upsert semantics on existing externalId)', async () => {
    // seed-g-0 starts with hoursPlayed=10 (see beforeAll seed). Merge plan
    // carries hoursPlayed=42 for the same externalId — UPDATE must apply.
    const plan: ImportPlan = {
      platforms: [],
      games: [
        makeGame('seed-g-0', TEST_USER_A, { title: 'Seed Game 0 — updated', hoursPlayed: 42 }),
      ],
    };

    await repo.apply(TEST_USER_A, plan, 'merge');

    const [row] = await db.select().from(games).where(eq(games.externalId, 'seed-g-0')).limit(1);
    expect(row).toBeDefined();
    expect(row?.hoursPlayed).toBe(42);
    expect(row?.title).toBe('Seed Game 0 — updated');
  });
});
