import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { Application } from '../../app';
import type { EnrichGameMetadata } from '../../application/games/enrich-game-metadata';
import type { GetIgdbIntegrationStatus } from '../../application/integrations/get-igdb-integration-status';
import { db } from '../../infrastructure/db/client';
import { games as gamesTable, platforms as platformsTable } from '../../infrastructure/db/schema';
import type { IgdbChainFactory } from '../../infrastructure/igdb/igdb-chain-factory';
import { requestContext } from '../../infrastructure/logging/request-context-middleware';
import { attachProblemJsonErrorHandler } from '../_problem-json';
import { createGamesRouter } from '../games';
import { originGuard } from '../middleware/origin-guard';
import type { AuthVariables } from '../middleware/require-auth';

const _testApp = Application.buildForTesting();
const _gameOps = _testApp.gameOpsForTesting();
const _httpMw = _testApp.httpMwForTesting();
// CSRF tests don't hit IGDB; null/disabled stubs keep the deps shape satisfied.
const NULL_CHAIN_FACTORY: IgdbChainFactory = {
  async buildFor() {
    return null;
  },
} as unknown as IgdbChainFactory;
const DISABLED_STATUS: GetIgdbIntegrationStatus = {
  async execute() {
    return { status: 'not-configured', enabled: false } as never;
  },
} as unknown as GetIgdbIntegrationStatus;
const NEVER_CALLED_ENRICH: EnrichGameMetadata = {
  async execute() {
    throw new Error('enrich should not be called in this test');
  },
} as unknown as EnrichGameMetadata;
const games = createGamesRouter({
  create: _gameOps.create,
  update: _gameOps.update,
  delete: _gameOps.delete,
  list: _gameOps.list,
  get: _gameOps.get,
  moveToCollection: _gameOps.moveToCollection,
  igdbChainFactory: NULL_CHAIN_FACTORY,
  enrichGameMetadata: NEVER_CALLED_ENRICH,
  getIgdbIntegrationStatus: DISABLED_STATUS,
  idempotencyKey: _httpMw.idempotencyKey,
});

const TEST_USER_ID = `test-csrf-${crypto.randomUUID()}`;
const ALLOWED = new Set(['http://localhost:5173']);

function makeApp() {
  const app = new Hono<{ Variables: AuthVariables }>();
  attachProblemJsonErrorHandler(app);
  app.use('*', requestContext());
  app.use('/api/*', originGuard(ALLOWED));
  app.use('/api/games/*', async (c, next) => {
    c.set('user', { id: TEST_USER_ID } as AuthVariables['user']);
    await next();
  });
  app.route('/api/games', games);
  return app;
}

const NEW_GAME = {
  kind: 'owned' as const,
  title: 'CSRF Test Game',
  platform: 'PC',
  format: 'digital' as const,
  genre: 'RPG',
  developer: 'Studio',
  releaseYear: 2020,
};

beforeAll(async () => {
  await db
    .insert(platformsTable)
    .values({ userId: TEST_USER_ID, name: 'PC', externalId: `pf-${crypto.randomUUID()}` })
    .onConflictDoNothing();
});

afterAll(async () => {
  await db.delete(gamesTable).where(eq(gamesTable.userId, TEST_USER_ID));
  await db.delete(platformsTable).where(eq(platformsTable.userId, TEST_USER_ID));
});

describe('originGuard end-to-end on /api/games', () => {
  it('POST with foreign Origin → 403 csrf-rejected', async () => {
    const res = await makeApp().request('/api/games', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: 'https://evil.example.com',
      },
      body: JSON.stringify(NEW_GAME),
    });
    expect(res.status).toBe(403);
    const body = (await res.json()) as { type: string };
    expect(body.type).toBe('/errors/csrf-rejected');
  });

  it('POST with no Origin → 403', async () => {
    const res = await makeApp().request('/api/games', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(NEW_GAME),
    });
    expect(res.status).toBe(403);
  });

  it('POST with allowlisted Origin → proceeds (201)', async () => {
    const res = await makeApp().request('/api/games', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: 'http://localhost:5173',
        'idempotency-key': `csrf-pass-${crypto.randomUUID()}`,
      },
      body: JSON.stringify(NEW_GAME),
    });
    expect(res.status).toBe(201);
  });

  it('GET with foreign Origin → 200 (reads not checked)', async () => {
    const res = await makeApp().request('/api/games', {
      method: 'GET',
      headers: { origin: 'https://evil.example.com' },
    });
    expect(res.status).toBe(200);
  });
});
