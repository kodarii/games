import Database from 'bun:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/bun-sqlite';
import { migrate } from 'drizzle-orm/bun-sqlite/migrator';
import * as authSchema from '../db/auth-schema';
import * as gameSchema from '../db/schema';
import { games as gamesTable } from '../db/schema';
import { DrizzleGameRepository } from './drizzle-game-repository';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = resolve(__dirname, '../../../drizzle');

type TestDb = ReturnType<typeof makeTestDb>['db'];

function makeTestDb() {
  const sqlite = new Database(':memory:');
  const db = drizzle({ client: sqlite, schema: { ...gameSchema, ...authSchema } });
  migrate(db, { migrationsFolder: MIGRATIONS_DIR });
  return { db, sqlite };
}

describe('DrizzleGameRepository — EXPLAIN QUERY PLAN uses indexes', () => {
  let db: TestDb;
  let sqlite: Database;

  beforeEach(() => {
    const t = makeTestDb();
    db = t.db;
    sqlite = t.sqlite;
  });

  afterEach(() => {
    sqlite.close();
  });

  // Contract: no full table scan on `games`. We explicitly do NOT assert a specific
  // index name — SQLite's planner is free to pick any composite index that covers the
  // predicate, and that choice can shift between SQLite versions or as data grows.
  // Asserting an index name would be a brittle test of an implementation detail.
  // What we care about: the planner found *some* index and didn't fall back to a scan.
  const queries: Array<{ name: string; sql: string }> = [
    {
      name: 'plain list',
      sql: "SELECT * FROM games WHERE user_id = 'u' AND kind = 'owned' LIMIT 10",
    },
    {
      name: 'list with platform filter',
      sql: "SELECT * FROM games WHERE user_id = 'u' AND kind = 'owned' AND platform IN ('PC') LIMIT 10",
    },
    {
      name: 'list with year range',
      sql: "SELECT * FROM games WHERE user_id = 'u' AND kind = 'owned' AND release_year BETWEEN 2000 AND 2020 LIMIT 10",
    },
    {
      name: 'sorted by title',
      sql: "SELECT * FROM games WHERE user_id = 'u' AND kind = 'owned' ORDER BY title LIMIT 10",
    },
  ];

  for (const q of queries) {
    it(`uses an index for: ${q.name}`, async () => {
      const plan = await db.all(sql.raw(`EXPLAIN QUERY PLAN ${q.sql}`));
      const planText = JSON.stringify(plan).toLowerCase();
      expect(planText).not.toContain('scan games');
      expect(planText).toContain('using index');
    });
  }

  it('list with filters under 100ms on 5k rows', async () => {
    // Seed 5000 games for one user. 100ms budget (instead of 50ms suggested by plan)
    // because Phase 2.5 explicitly allows raising the budget if flaky on CI runners.
    const rows = Array.from({ length: 5000 }, (_, i) => ({
      externalId: `perf-${i}`,
      userId: 'u1',
      kind: 'owned',
      title: `Game ${i}`,
      developer: 'Dev',
      genre: 'ARPG',
      releaseYear: 2000 + (i % 30),
      platform: i % 2 === 0 ? 'PC' : 'PS5',
      format: i % 3 === 0 ? 'physical' : ('digital' as 'physical' | 'digital'),
      status: 'Backlog',
      hoursPlayed: 0,
    }));
    // Insert in chunks — bun:sqlite has a parameter cap per statement.
    for (let i = 0; i < rows.length; i += 200) {
      await db.insert(gamesTable).values(rows.slice(i, i + 200));
    }

    const repo = new DrizzleGameRepository(db);

    const t0 = performance.now();
    const result = await repo.list({
      userId: 'u1',
      kind: 'owned',
      platforms: ['PC'],
      page: 1,
      perPage: 25,
      dir: 'asc',
    });
    const elapsed = performance.now() - t0;

    expect(result.items.length).toBe(25);
    expect(elapsed).toBeLessThan(100);
  });
});
