import Database from 'bun:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { drizzle } from 'drizzle-orm/bun-sqlite';
import { migrate } from 'drizzle-orm/bun-sqlite/migrator';
import { ReleaseYearRange } from '../../domain/games/release-year-range';
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

type SeedRow = {
  id?: number;
  externalId?: string;
  userId?: string;
  kind?: 'owned' | 'wishlist';
  title?: string;
  developer?: string | null;
  genre?: string;
  releaseYear?: number | null;
  platform?: string;
  format?: 'physical' | 'digital';
  status?: string | null;
  hoursPlayed?: number | null;
};

let nextId = 1;

async function seed(db: TestDb, rows: SeedRow[]) {
  for (const r of rows) {
    const id = r.id ?? nextId++;
    await db.insert(gamesTable).values({
      id,
      externalId: r.externalId ?? `ext-${id}`,
      userId: r.userId ?? 'user-A',
      kind: r.kind ?? 'owned',
      title: r.title ?? `Game ${id}`,
      developer: r.developer ?? 'Dev',
      genre: r.genre ?? 'ARPG',
      releaseYear: r.releaseYear === undefined ? 2020 : r.releaseYear,
      platform: r.platform ?? 'PC',
      format: r.format ?? 'digital',
      status: r.status === undefined ? 'Backlog' : r.status,
      hoursPlayed: r.hoursPlayed === undefined ? 0 : r.hoursPlayed,
    });
  }
}

describe('DrizzleGameRepository.list filtering & sorting', () => {
  let db: TestDb;
  let sqlite: Database;
  let repo: DrizzleGameRepository;

  beforeEach(() => {
    nextId = 1;
    const t = makeTestDb();
    db = t.db;
    sqlite = t.sqlite;
    repo = new DrizzleGameRepository(db);
  });

  afterEach(() => {
    sqlite.close();
  });

  it('filters by platforms (inArray)', async () => {
    await seed(db, [{ platform: 'PC' }, { platform: 'PS5' }, { platform: 'Switch' }]);

    const result = await repo.list({
      userId: 'user-A',
      platforms: ['PC', 'PS5'],
      page: 1,
      perPage: 20,
      dir: 'asc',
    });

    expect(result.total).toBe(2);
    expect(result.items.map((g) => g.platform).sort()).toEqual(['PC', 'PS5']);
  });

  it('filters by formats (inArray)', async () => {
    await seed(db, [{ format: 'digital' }, { format: 'physical' }, { format: 'digital' }]);

    const result = await repo.list({
      userId: 'user-A',
      formats: ['digital'],
      page: 1,
      perPage: 20,
      dir: 'asc',
    });

    expect(result.total).toBe(2);
    expect(result.items.every((g) => g.format === 'digital')).toBe(true);
  });

  it('filters by release year range (gte/lte)', async () => {
    await seed(db, [{ releaseYear: 2010 }, { releaseYear: 2015 }, { releaseYear: 2020 }]);

    const range = ReleaseYearRange.create(2012, 2018);
    if (!range.ok) throw new Error('range invalid');

    const result = await repo.list({
      userId: 'user-A',
      releaseYearRange: range.value,
      page: 1,
      perPage: 20,
      dir: 'asc',
    });

    expect(result.total).toBe(1);
    expect(result.items[0]?.releaseYear?.value).toBe(2015);
  });

  it('LIKE escapes wildcard in search (ESCAPE clause)', async () => {
    await seed(db, [
      { title: '50% off' },
      { title: 'fifty percent off' },
      { title: '50_off' },
      { title: '50 deal' },
    ]);

    // Application would already escape `%` → `\%`. Here we pass already-escaped pattern.
    const result = await repo.list({
      userId: 'user-A',
      search: '50\\%',
      page: 1,
      perPage: 20,
      dir: 'asc',
    });

    expect(result.total).toBe(1);
    expect(result.items[0]?.title).toBe('50% off');
  });

  it('sorts by releaseYear NULLS LAST asc', async () => {
    await seed(db, [
      { releaseYear: 2020, title: 'A' },
      { releaseYear: null, title: 'B' },
      { releaseYear: 2010, title: 'C' },
    ]);

    const result = await repo.list({
      userId: 'user-A',
      sort: 'releaseYear',
      dir: 'asc',
      page: 1,
      perPage: 20,
    });

    const years = result.items.map((g) => g.releaseYear?.value ?? null);
    expect(years).toEqual([2010, 2020, null]);
  });

  it('sorts by releaseYear NULLS LAST desc', async () => {
    await seed(db, [
      { releaseYear: 2020, title: 'A' },
      { releaseYear: null, title: 'B' },
      { releaseYear: 2010, title: 'C' },
    ]);

    const result = await repo.list({
      userId: 'user-A',
      sort: 'releaseYear',
      dir: 'desc',
      page: 1,
      perPage: 20,
    });

    const years = result.items.map((g) => g.releaseYear?.value ?? null);
    expect(years).toEqual([2020, 2010, null]);
  });

  it('userId scope is enforced under filters (no cross-tenant leak)', async () => {
    await seed(db, [
      { userId: 'user-A', platform: 'PC', title: 'A-pc' },
      { userId: 'user-B', platform: 'PC', title: 'B-pc' },
    ]);

    const result = await repo.list({
      userId: 'user-A',
      platforms: ['PC'],
      page: 1,
      perPage: 20,
      dir: 'asc',
    });

    expect(result.total).toBe(1);
    expect(result.items[0]?.title).toBe('A-pc');
  });
});
