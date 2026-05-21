import Database from 'bun:sqlite';
import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { and, eq, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/bun-sqlite';
import { migrate } from 'drizzle-orm/bun-sqlite/migrator';
import { NewGame } from '../../../domain/games/new-game';
import type { ImportPlan } from '../../../domain/import/import-repository';
import { NewPlatform } from '../../../domain/platforms/platform';
import * as authSchema from '../../db/auth-schema';
import * as gameSchema from '../../db/schema';
import { games, platforms, toGameInsertRow } from '../../db/schema';
import { DrizzleImportRepository } from '../drizzle-import-repository';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = resolve(__dirname, '../../../../drizzle');

// Q7: static IDs — in-memory isolation eliminates the need for per-run UUIDs.
const TEST_USER_A = 'user-a';
const TEST_USER_B = 'user-b';
// TEST_USER_C is exclusive to Test 6 (applyReplace) — zero seeded games so the
// replace mode does not wipe state used by earlier tests against TEST_USER_A.
const TEST_USER_C = 'user-c';

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
      {
        id: TEST_USER_C,
        email: 'c@test.local',
        name: 'User C',
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

  it('Test 5: applyMerge INSERT persists coverImage/price/purchasedAt/notes/metadataRef (BE-02b)', async () => {
    const ngResult = NewGame.create(
      {
        kind: 'owned',
        userId: TEST_USER_A,
        title: 'Test 5 title',
        developer: null,
        genre: 'rpg',
        releaseYear: 1999,
        platform: 'PC',
        hoursPlayed: 5,
        status: 'Playing',
        format: 'digital',
        coverImage: 'https://imgs.example/c.jpg',
        price: 4999,
        purchasedAt: '2025-06-15',
        notes: 'good',
        metadataRef: { providerName: 'igdb', providerId: '42' },
      },
      () => 'q8-merge-1',
    );
    expect(ngResult.ok).toBe(true);
    if (!ngResult.ok) throw new Error('unreachable');
    const ng = ngResult.value;

    await repo.apply(TEST_USER_A, { platforms: [], games: [ng] }, 'merge');

    const [row] = await db
      .select()
      .from(games)
      .where(and(eq(games.userId, TEST_USER_A), eq(games.externalId, 'q8-merge-1')));
    expect(row).toBeDefined();
    expect(row?.coverImage).toBe('https://imgs.example/c.jpg');
    expect(row?.price).toBe(4999);
    expect(row?.purchasedAt).toBe('2025-06-15');
    expect(row?.notes).toBe('good');
    expect(row?.metadataProvider).toBe('igdb');
    expect(row?.metadataProviderId).toBe('42');
    expect(row?.metadataMatchedAt).not.toBeNull();
  });

  it('Test 6: applyReplace INSERT persists coverImage/price/purchasedAt/notes/metadataRef (BE-02b)', async () => {
    // Capture TEST_USER_A baseline BEFORE the TEST_USER_C replace, so the
    // assertion that A-side rows are untouched holds regardless of declaration
    // order within bun:test (which honors source order anyway).
    const aBefore = await db
      .select({ c: sql<number>`count(*)` })
      .from(games)
      .where(eq(games.userId, TEST_USER_A));
    const aCountBefore = aBefore[0]?.c ?? 0;

    const ngResult = NewGame.create(
      {
        kind: 'owned',
        userId: TEST_USER_C,
        title: 'Test 6 title',
        developer: null,
        genre: 'rpg',
        releaseYear: 2001,
        platform: 'PC',
        hoursPlayed: 3,
        status: 'Playing',
        format: 'digital',
        coverImage: 'https://imgs.example/r.jpg',
        price: 5999,
        purchasedAt: '2025-07-20',
        notes: 'replace mode',
        metadataRef: { providerName: 'igdb', providerId: '77' },
      },
      () => 'q8-replace-1',
    );
    expect(ngResult.ok).toBe(true);
    if (!ngResult.ok) throw new Error('unreachable');
    const ng = ngResult.value;

    await repo.apply(TEST_USER_C, { platforms: [], games: [ng] }, 'replace');

    const [row] = await db
      .select()
      .from(games)
      .where(and(eq(games.userId, TEST_USER_C), eq(games.externalId, 'q8-replace-1')));
    expect(row).toBeDefined();
    expect(row?.coverImage).toBe('https://imgs.example/r.jpg');
    expect(row?.price).toBe(5999);
    expect(row?.purchasedAt).toBe('2025-07-20');
    expect(row?.notes).toBe('replace mode');
    expect(row?.metadataProvider).toBe('igdb');
    expect(row?.metadataProviderId).toBe('77');
    expect(row?.metadataMatchedAt).not.toBeNull();

    // Replace on TEST_USER_C did not touch TEST_USER_A's rows.
    const aAfter = await db
      .select({ c: sql<number>`count(*)` })
      .from(games)
      .where(eq(games.userId, TEST_USER_A));
    const aCountAfter = aAfter[0]?.c ?? 0;
    expect(aCountAfter).toBe(aCountBefore);
  });

  it('Test 7: applyMerge UPDATE branch persists 5 fields when seed exists (Q-DDD-1)', async () => {
    // Seed: SQLite picks the integer auto-incremented id. No string-id literal.
    await db
      .insert(games)
      .values({
        userId: TEST_USER_A,
        externalId: 'q8-update-target',
        kind: 'owned',
        title: 'old title',
        genre: 'rpg',
        platform: 'PC',
        format: 'digital',
        hoursPlayed: 1,
        status: 'Backlog',
        // coverImage/price/purchasedAt/notes/metadata* default to NULL via schema
      })
      .run();

    const ngResult = NewGame.create(
      {
        kind: 'owned',
        userId: TEST_USER_A,
        title: 'new title',
        developer: null,
        genre: 'rpg',
        platform: 'PC',
        hoursPlayed: 99,
        status: 'Completed',
        format: 'digital',
        coverImage: 'https://imgs.example/u.jpg',
        price: 7999,
        purchasedAt: '2025-12-24',
        notes: 'updated',
        metadataRef: { providerName: 'igdb', providerId: '7' },
      },
      () => 'q8-update-target',
    );
    expect(ngResult.ok).toBe(true);
    if (!ngResult.ok) throw new Error('unreachable');
    const ng = ngResult.value;

    await repo.apply(TEST_USER_A, { platforms: [], games: [ng] }, 'merge');

    const rows = await db
      .select()
      .from(games)
      .where(and(eq(games.userId, TEST_USER_A), eq(games.externalId, 'q8-update-target')));
    expect(rows.length).toBe(1); // proves UPDATE (not duplicate INSERT)
    const row = rows[0];
    expect(row.title).toBe('new title');
    expect(row.hoursPlayed).toBe(99);
    expect(row.coverImage).toBe('https://imgs.example/u.jpg');
    expect(row.price).toBe(7999);
    expect(row.purchasedAt).toBe('2025-12-24');
    expect(row.notes).toBe('updated');
    expect(row.metadataProvider).toBe('igdb');
    expect(row.metadataProviderId).toBe('7');
    expect(row.metadataMatchedAt).not.toBeNull();
  });

  it('Test 8: applyMerge UPDATE destructure strips kind/id/userId/externalId (D-34, NEW-14)', async () => {
    // PLAN DEVIATION — DB-level CHECK constraint blocks the originally
    // proposed scenario.
    //
    // The plan proposed a roundtrip test: seed `kind='wishlist'`
    // (externalId='q8-kind-flip'), call repo.apply with a NewGame whose
    // `kind='owned'`, then assert `row.kind === 'wishlist'` (kind flip
    // suppressed) AND `row.status === 'Playing'`, `row.hoursPlayed === 10`
    // (other scalars updated). That construction is rejected by SQLite at
    // UPDATE time: migration 0010 installs a `games_kind_consistency`
    // CHECK constraint requiring `kind='wishlist' AND status IS NULL AND
    // hours_played IS NULL AND purchased_at IS NULL`. With `kind: _k`
    // correctly stripped, the resulting row is wishlist + status='Playing'
    // + hoursPlayed=10 — CHECK fails, the UPDATE throws SQLITE_CONSTRAINT.
    // (The CHECK itself enforces D-34 at the DB layer.)
    //
    // Pivot: pin the strip MECHANIC at the row-construction layer. Build a
    // row via `toGameInsertRow` (same helper the repo calls), then apply
    // the same destructure pattern. Asserts:
    //   - D-34: `kind` is not in updateSet (import cannot flip kind).
    //   - Q-DDD-1: `id`/`userId`/`externalId` are not in updateSet.
    //   - NEW-14 surgical: every other column DID make it in — if a future
    //     contributor expanded the destructure to drop `status` or
    //     `hoursPlayed` or `coverImage`, the matching assertion fails RED.
    const ngResult = NewGame.create(
      {
        kind: 'owned',
        userId: TEST_USER_A,
        title: 'q8-kind-flip title',
        developer: null,
        genre: 'rpg',
        platform: 'PC',
        hoursPlayed: 10,
        status: 'Playing',
        format: 'digital',
        coverImage: 'https://imgs.example/k.jpg',
      },
      () => 'q8-kind-flip',
    );
    expect(ngResult.ok).toBe(true);
    if (!ngResult.ok) throw new Error('unreachable');
    const ng = ngResult.value;

    const row = toGameInsertRow(TEST_USER_A, {
      kind: ng.kind,
      externalId: ng.externalId,
      title: ng.title,
      developer: ng.developer,
      genre: ng.genre,
      releaseYear: ng.releaseYear,
      platform: ng.platform,
      edition: ng.edition,
      hoursPlayed: ng.hoursPlayed,
      status: ng.status,
      format: ng.format,
      coverColor: ng.coverColor,
      coverImage: ng.coverImage,
      price: ng.price,
      purchasedAt: ng.purchasedAt,
      notes: ng.notes,
      metadataRef: ng.metadataRef
        ? {
            providerName: ng.metadataRef.providerName,
            providerId: ng.metadataRef.providerId,
            matchedAt: ng.metadataRef.matchedAt,
          }
        : null,
    });

    // EXACT destructure pattern mirrored from
    // drizzle-import-repository.ts applyMerge UPDATE branch. Variable
    // names match deliberately so a `git grep "id: _id, userId: _u, externalId: _e, kind: _k"`
    // links source ↔ test.
    const { id: _id, userId: _u, externalId: _e, kind: _k, ...updateSet } = row;
    void _id;
    void _u;
    void _e;
    void _k;

    // D-34: kind dropped from updateSet — UPDATE cannot flip kind.
    expect('kind' in updateSet).toBe(false);
    // Q-DDD-1: id/userId/externalId never make it into the SET clause.
    expect('id' in updateSet).toBe(false);
    expect('userId' in updateSet).toBe(false);
    expect('externalId' in updateSet).toBe(false);

    // NEW-14: every other column DID make it through. Including positive
    // assertions on status/hoursPlayed/coverImage so that if a future
    // contributor expands the destructure (e.g. adding `status: _s` by
    // mistake), the assertion fails RED.
    expect(updateSet.title).toBe('q8-kind-flip title');
    expect(updateSet.status).toBe('Playing');
    expect(updateSet.hoursPlayed).toBe(10);
    expect(updateSet.coverImage).toBe('https://imgs.example/k.jpg');
  });
});
