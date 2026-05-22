import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { inArray } from 'drizzle-orm';
import { Hono } from 'hono';
import { Application } from '../app';
import { EnrichGameMetadata } from '../application/games/enrich-game-metadata';
import type { GetIgdbIntegrationStatus } from '../application/integrations/get-igdb-integration-status';
import { isCoverHostAllowed } from '../infrastructure/config/cover-hosts';
import { db } from '../infrastructure/db/client';
import { DrizzleTransactionRunner } from '../infrastructure/db/drizzle-transaction-runner';
import { games as gamesTable } from '../infrastructure/db/schema';
import { DrizzleGameRepository } from '../infrastructure/games/drizzle-game-repository';
import type { IgdbChainFactory } from '../infrastructure/igdb/igdb-chain-factory';
import { requestContext } from '../infrastructure/logging/request-context-middleware';
import { MetadataCacheRepository } from '../infrastructure/metadata/metadata-cache-repository';
import { createGamesRouter } from './games';
import type { AuthVariables } from './middleware/require-auth';

const _testApp = Application.buildForTesting();
const _gameOps = _testApp.gameOpsForTesting();
const _httpMw = _testApp.httpMwForTesting();

const ALWAYS_NULL_CHAIN_FACTORY: IgdbChainFactory = {
  async buildFor() {
    return null;
  },
} as unknown as IgdbChainFactory;

const ALWAYS_ENABLED_STATUS: GetIgdbIntegrationStatus = {
  async execute() {
    return { status: 'configured', enabled: true } as never;
  },
} as unknown as GetIgdbIntegrationStatus;

const enrich = new EnrichGameMetadata(
  new DrizzleGameRepository(),
  new DrizzleTransactionRunner(db),
  new MetadataCacheRepository(),
  isCoverHostAllowed,
);

const games = createGamesRouter({
  create: _gameOps.create,
  update: _gameOps.update,
  delete: _gameOps.delete,
  list: _gameOps.list,
  get: _gameOps.get,
  moveToCollection: _gameOps.moveToCollection,
  igdbChainFactory: ALWAYS_NULL_CHAIN_FACTORY,
  enrichGameMetadata: enrich,
  getIgdbIntegrationStatus: ALWAYS_ENABLED_STATUS,
  idempotencyKey: _httpMw.idempotencyKey,
});

const USER_A = `idor-user-A-${crypto.randomUUID()}`;
const USER_B = `idor-user-B-${crypto.randomUUID()}`;

// Each user has 2 games. Both users have IDENTICAL attributes (same titles,
// platforms, formats, years), so a leak via a missing user_id WHERE clause
// would surface as "user A sees user B's items" — not as a tautological no-match.
const SHARED_FIXTURE = [
  {
    title: 'Witcher 3',
    platform: 'PC',
    format: 'digital' as const,
    releaseYear: 2015,
  },
  {
    title: 'Bloodborne',
    platform: 'PS5',
    format: 'digital' as const,
    releaseYear: 2015,
  },
];

const userAExternalIds = SHARED_FIXTURE.map((_, i) => `idor-A-ext-${i}-${crypto.randomUUID()}`);
const userBExternalIds = SHARED_FIXTURE.map((_, i) => `idor-B-ext-${i}-${crypto.randomUUID()}`);

function makeAppForUser(userId: string) {
  const app = new Hono<{ Variables: AuthVariables }>();
  app.use('*', requestContext());
  app.use('/api/games/*', async (c, next) => {
    c.set('user', { id: userId } as AuthVariables['user']);
    await next();
  });
  app.route('/api/games', games);
  return app;
}

async function seedFixture() {
  for (let i = 0; i < SHARED_FIXTURE.length; i++) {
    const f = SHARED_FIXTURE[i];
    await db.insert(gamesTable).values({
      externalId: userAExternalIds[i],
      userId: USER_A,
      kind: 'owned',
      title: f.title,
      developer: 'Dev',
      genre: 'ARPG',
      releaseYear: f.releaseYear,
      platform: f.platform,
      format: f.format,
      status: 'Backlog',
      hoursPlayed: 0,
    });
    await db.insert(gamesTable).values({
      externalId: userBExternalIds[i],
      userId: USER_B,
      kind: 'owned',
      title: f.title,
      developer: 'Dev',
      genre: 'ARPG',
      releaseYear: f.releaseYear,
      platform: f.platform,
      format: f.format,
      status: 'Backlog',
      hoursPlayed: 0,
    });
  }
}

describe('GET /api/games — IDOR resistance', () => {
  beforeAll(async () => {
    // IGDB gate is mocked through ALWAYS_ENABLED_STATUS so the route reaches
    // its 404 IDOR path (the real `EnrichGameMetadata` performs the row-scoped
    // lookup that returns `not_found` for cross-user IDs).
    await seedFixture();
  });

  afterAll(async () => {
    const all = [...userAExternalIds, ...userBExternalIds];
    await db.delete(gamesTable).where(inArray(gamesTable.externalId, all));
  });

  // No beforeEach delete — fixture is stable, all queries are read-only.

  const cases: Array<{ name: string; qs: string }> = [
    { name: 'no filters', qs: '' },
    { name: 'platforms filter', qs: '?platforms=PC' },
    { name: 'multi platforms', qs: '?platforms=PC&platforms=PS5' },
    { name: 'formats filter', qs: '?formats=digital' },
    { name: 'year range filter', qs: '?releaseYearFrom=2010&releaseYearTo=2020' },
    { name: 'search filter', qs: '?search=Witcher' },
    {
      name: 'combined',
      qs: '?platforms=PC&platforms=PS5&formats=digital&releaseYearFrom=2010&releaseYearTo=2020&search=Witcher',
    },
    { name: 'sort by title', qs: '?sort=title&dir=asc' },
  ];

  for (const c of cases) {
    it(`user A never sees user B's games: ${c.name}`, async () => {
      const app = makeAppForUser(USER_A);
      const res = await app.request(`/api/games${c.qs}`);
      expect(res.status).toBe(200);
      const body = (await res.json()) as { items: Array<{ id: string }>; total: number };

      const userBSet = new Set(userBExternalIds);
      for (const item of body.items) {
        expect(userBSet.has(item.id)).toBe(false);
      }
      // Sanity: at least one of user A's games matches when filter is permissive.
      // For 'sort by title' / 'no filters' / broad filters, A should have ≥1 match.
      // For tight filters that still match A's data (Witcher search → 1, PC → 1, PS5 → 1)
      // we assert ≥1 to ensure the test isn't passing trivially.
      const userASet = new Set(userAExternalIds);
      const userAItems = body.items.filter((g) => userASet.has(g.id));
      expect(userAItems.length).toBeGreaterThan(0);
    });
  }

  it("user B sees only B's games (symmetric check)", async () => {
    const app = makeAppForUser(USER_B);
    const res = await app.request('/api/games');
    expect(res.status).toBe(200);
    const body = (await res.json()) as { items: Array<{ id: string }>; total: number };

    const userASet = new Set(userAExternalIds);
    for (const item of body.items) {
      expect(userASet.has(item.id)).toBe(false);
    }
  });

  it("PATCH /:externalId/metadata: user B cannot patch user A's game (returns 404)", async () => {
    const appForB = makeAppForUser(USER_B);
    const aExternalId = userAExternalIds[0];
    const res = await appForB.request(`/api/games/${aExternalId}/metadata`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        providerName: 'igdb',
        providerId: '12345',
        snapshot: { coverImageUrl: null, releaseYear: null, developer: null },
      }),
    });
    expect(res.status).toBe(404);
  });

  it('PATCH /:externalId/metadata: returns 503 when GetIgdbIntegrationStatus reports the user has not connected IGDB', async () => {
    const ALWAYS_DISABLED_STATUS: GetIgdbIntegrationStatus = {
      async execute() {
        return { status: 'not-configured', enabled: false } as never;
      },
    } as unknown as GetIgdbIntegrationStatus;
    const gatedGames = createGamesRouter({
      create: _gameOps.create,
      update: _gameOps.update,
      delete: _gameOps.delete,
      list: _gameOps.list,
      get: _gameOps.get,
      moveToCollection: _gameOps.moveToCollection,
      igdbChainFactory: ALWAYS_NULL_CHAIN_FACTORY,
      enrichGameMetadata: enrich,
      getIgdbIntegrationStatus: ALWAYS_DISABLED_STATUS,
      idempotencyKey: _httpMw.idempotencyKey,
    });
    const app = new Hono<{ Variables: AuthVariables }>();
    app.use('*', requestContext());
    app.use('/api/games/*', async (c, next) => {
      c.set('user', { id: USER_A } as AuthVariables['user']);
      await next();
    });
    app.route('/api/games', gatedGames);

    const res = await app.request(`/api/games/${userAExternalIds[0]}/metadata`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        providerName: 'igdb',
        providerId: '12345',
        snapshot: { coverImageUrl: null, releaseYear: null, developer: null },
      }),
    });
    expect(res.status).toBe(503);
    const body = (await res.json()) as { type: string };
    expect(body.type).toBe('/errors/feature-disabled');
  });
});
