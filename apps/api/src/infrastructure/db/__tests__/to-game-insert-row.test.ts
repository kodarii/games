import Database from 'bun:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Glob } from 'bun';
import { drizzle } from 'drizzle-orm/bun-sqlite';
import { migrate } from 'drizzle-orm/bun-sqlite/migrator';
import { NewGame } from '../../../domain/games/new-game';
import { DrizzleGameRepository } from '../../games/drizzle-game-repository';
import * as authSchema from '../auth-schema';
import * as gameSchema from '../schema';
import { type GameRowInput, games as gamesTable, toGameInsertRow } from '../schema';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = resolve(__dirname, '../../../../drizzle');
const API_SRC_ROOT = resolve(__dirname, '../../..');

const USER_ID = 'user-helper-test';

/**
 * Count regex matches across every `.ts` file under one or more roots.
 * Used by the two snapshot-pin tests below. Walks files via Bun.Glob and
 * counts non-overlapping matches per file with a global regex, summed.
 * Portable — does not depend on `rg` being installed on the test host.
 */
async function countMatches(roots: string[], pattern: RegExp): Promise<number> {
  if (!pattern.global) {
    throw new Error('countMatches requires a global regex');
  }
  let total = 0;
  for (const root of roots) {
    const glob = new Glob('**/*.ts');
    for await (const rel of glob.scan({ cwd: root, onlyFiles: true })) {
      const abs = join(root, rel);
      const src = readFileSync(abs, 'utf8');
      pattern.lastIndex = 0;
      const matches = src.match(pattern);
      total += matches?.length ?? 0;
    }
  }
  return total;
}

describe('toGameInsertRow', () => {
  let sqlite: Database;
  let db: ReturnType<typeof drizzle<typeof gameSchema & typeof authSchema>>;

  beforeEach(() => {
    sqlite = new Database(':memory:');
    db = drizzle({ client: sqlite, schema: { ...gameSchema, ...authSchema } });
    migrate(db, { migrationsFolder: MIGRATIONS_DIR });
    db.insert(authSchema.user)
      .values({
        id: USER_ID,
        email: 'helper-test@example.com',
        name: 'Helper Test',
        emailVerified: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .run();
  });

  afterEach(() => {
    sqlite.close();
  });

  it('returns identical column payload for owned game with all fields populated', () => {
    const matchedAt = new Date('2026-01-01T00:00:00.000Z');
    const input: GameRowInput = {
      kind: 'owned',
      externalId: 'ext-full-1',
      title: 'Resident Evil 4',
      genre: 'Action',
      platform: 'PC',
      format: 'digital',
      developer: 'Capcom',
      releaseYear: { value: 2005 },
      edition: 'Gold',
      hoursPlayed: { value: 42 },
      status: 'Playing',
      coverColor: '#abcdef',
      coverImage: 'https://covers.example/re4.png',
      price: { value: 9999 },
      purchasedAt: { value: '2024-12-31' },
      notes: 'classic',
      metadataRef: { providerName: 'igdb', providerId: '42', matchedAt },
    };

    const row = toGameInsertRow(USER_ID, input);

    expect(row).toEqual({
      userId: USER_ID,
      externalId: 'ext-full-1',
      kind: 'owned',
      title: 'Resident Evil 4',
      developer: 'Capcom',
      genre: 'Action',
      releaseYear: 2005,
      platform: 'PC',
      edition: 'Gold',
      hoursPlayed: 42,
      status: 'Playing',
      format: 'digital',
      coverColor: '#abcdef',
      coverImage: 'https://covers.example/re4.png',
      price: 9999,
      purchasedAt: '2024-12-31',
      notes: 'classic',
      metadataProvider: 'igdb',
      metadataProviderId: '42',
      metadataMatchedAt: '2026-01-01T00:00:00.000Z',
    });
  });

  it('nullable columns default to null when omitted', () => {
    const input: GameRowInput = {
      kind: 'wishlist',
      externalId: 'ext-min-1',
      title: 'Minimal',
      genre: 'Strategy',
      platform: 'PC',
      format: 'digital',
    };

    const row = toGameInsertRow(USER_ID, input);

    expect(row.userId).toBe(USER_ID);
    expect(row.externalId).toBe('ext-min-1');
    expect(row.kind).toBe('wishlist');
    expect(row.title).toBe('Minimal');
    expect(row.genre).toBe('Strategy');
    expect(row.platform).toBe('PC');
    expect(row.format).toBe('digital');
    expect(row.developer).toBe(null);
    expect(row.releaseYear).toBe(null);
    expect(row.edition).toBe(null);
    expect(row.hoursPlayed).toBe(null);
    expect(row.status).toBe(null);
    expect(row.coverColor).toBe(null);
    expect(row.coverImage).toBe(null);
    expect(row.price).toBe(null);
    expect(row.purchasedAt).toBe(null);
    expect(row.notes).toBe(null);
    expect(row.metadataProvider).toBe(null);
    expect(row.metadataProviderId).toBe(null);
    expect(row.metadataMatchedAt).toBe(null);
  });

  it('round-trip via .insert().returning() matches helper output (user-managed columns)', async () => {
    const matchedAt = new Date('2026-02-02T12:00:00.000Z');
    const input: GameRowInput = {
      kind: 'owned',
      externalId: 'ext-rt-1',
      title: 'Hades',
      genre: 'Roguelike',
      platform: 'PC',
      format: 'digital',
      developer: 'Supergiant',
      releaseYear: { value: 2020 },
      hoursPlayed: { value: 12 },
      status: 'Playing',
      price: { value: 2499 },
      purchasedAt: { value: '2024-01-15' },
      metadataRef: { providerName: 'igdb', providerId: 'h-1', matchedAt },
    };

    const row = toGameInsertRow(USER_ID, input);
    const [returned] = await db.insert(gamesTable).values(row).returning();

    expect(returned).toMatchObject({
      userId: USER_ID,
      externalId: 'ext-rt-1',
      kind: 'owned',
      title: 'Hades',
      developer: 'Supergiant',
      genre: 'Roguelike',
      releaseYear: 2020,
      platform: 'PC',
      edition: null,
      hoursPlayed: 12,
      status: 'Playing',
      format: 'digital',
      coverColor: null,
      coverImage: null,
      price: 2499,
      purchasedAt: '2024-01-15',
      notes: null,
      metadataProvider: 'igdb',
      metadataProviderId: 'h-1',
      metadataMatchedAt: '2026-02-02T12:00:00.000Z',
    });
  });

  it('DrizzleGameRepository.create produces same shape as direct helper insert', async () => {
    const repo = new DrizzleGameRepository(db);
    const newGameResult = NewGame.create({
      kind: 'owned',
      userId: USER_ID,
      title: 'Hollow Knight',
      developer: 'Team Cherry',
      genre: 'Metroidvania',
      releaseYear: 2017,
      platform: 'PC',
      hoursPlayed: 30,
      status: 'Completed',
      format: 'digital',
      price: 1499,
      purchasedAt: '2023-06-01',
      metadataRef: { providerName: 'igdb', providerId: 'hk-1' },
    });
    if (!newGameResult.ok) {
      throw new Error(`NewGame.create failed: ${JSON.stringify(newGameResult.error)}`);
    }
    const created = await repo.create(newGameResult.value);

    // Project the domain aggregate (mapRowToGame round-trip) to assert the
    // helper-produced row materialises as the expected domain shape.
    expect(created.userId).toBe(USER_ID);
    expect(created.title).toBe('Hollow Knight');
    expect(created.kind).toBe('owned');
    expect(created.developer).toBe('Team Cherry');
    expect(created.genre).toBe('Metroidvania');
    expect(created.releaseYear?.value).toBe(2017);
    expect(created.platform).toBe('PC');
    expect(created.hoursPlayed?.value).toBe(30);
    expect(created.status).toBe('Completed');
    expect(created.format).toBe('digital');
    expect(created.price?.value).toBe(1499);
    expect(created.purchasedAt?.value).toBe('2023-06-01');
    expect(created.metadataRef?.providerName as string).toBe('igdb');
    expect(created.metadataRef?.providerId).toBe('hk-1');
  });

  it('PIN (BE-02 SC-2): dedup grep — `kind: <var>.kind` total occurrences match snapshot', async () => {
    // Snapshot pin for the `kind: <var>.kind` pattern across the API source.
    // Plan SC-2 originally targeted "exactly 1 inside the helper", but the
    // refactor preserves shorthand-incompatible call-sites (import-repo
    // iterates per-row, UPDATE branch retains inline `.set(...)` per D-10,
    // and tests + other call-sites legitimately use the pattern). The pin
    // catches drift: a NEW occurrence in production code (not tests) is a
    // signal to re-evaluate whether a 4th call-site warrants further dedup.
    const total = await countMatches([API_SRC_ROOT], /kind: \w+\.kind/g);
    // Measured after BE-02 refactor (2026-05-15) = 23. Updated by BE-03
    // (2026-05-15) to 22 — applyMerge UPDATE branch no longer carries an
    // inline shorthand reference to ng's kind (row built once via
    // toGameInsertRow, then the kind property is stripped before
    // `.set()`). Update with deliberate intent when call-sites change.
    const EXPECTED_KIND_DOT_KIND_COUNT = 22;
    expect(total).toBe(EXPECTED_KIND_DOT_KIND_COUNT);
  });

  it('PIN (D-10 carve-out): VO-unwrap pattern (.value ?? null) occurs exactly N times across helper + UPDATE call-sites', () => {
    // D-10 świadomie zostawia update() i saveMetadata() z inline VO-unwrap
    // (różne use-case'y vs INSERT). Ten test pinuje OBECNĄ liczbę
    // wystąpień. Gdy test wybuchnie:
    //   - liczba wzrosła = nowy call-site z VO-unwrap → rozważ promotion do
    //     osobnego helpera (toGameUpdateRow / toGameMetadataRow OSOBNO, NIE
    //     wspólnego — D-10 + Q5 rationale)
    //   - liczba spadła = ktoś zdedplikował → zaktualizuj liczbę (lub usuń
    //     test, jeśli helper przejął wszystko)
    // To snapshot pin, nie limit — wymusza świadomą decyzję w PR, nie
    // blokuje rozwoju.
    const repoSrc = readFileSync(
      join(API_SRC_ROOT, 'infrastructure/games/drizzle-game-repository.ts'),
      'utf8',
    );
    const schemaSrc = readFileSync(join(API_SRC_ROOT, 'infrastructure/db/schema.ts'), 'utf8');
    const pattern = /\.value \?\? null/g;
    const total = (repoSrc.match(pattern)?.length ?? 0) + (schemaSrc.match(pattern)?.length ?? 0);
    // Measured after Task 1 + Task 2: 5 in drizzle-game-repository.ts
    // (update() ×4 + saveMetadata() ×1), 0 in schema.ts (helper uses an
    // `unwrap()` function, not `.value ?? null` directly).
    const EXPECTED_VO_UNWRAP_COUNT = 5;
    expect(total).toBe(EXPECTED_VO_UNWRAP_COUNT);
  });
});
