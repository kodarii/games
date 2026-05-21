import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { db } from '../../infrastructure/db/client';
import {
  games as gamesTable,
  idempotencyKeys as idempotencyKeysTable,
  platforms as platformsTable,
} from '../../infrastructure/db/schema';
import { requestContext } from '../../infrastructure/logging/request-context-middleware';
import { attachProblemJsonErrorHandler } from '../_problem-json';
import { createGamesRouter } from '../games';
import type { AuthVariables } from '../middleware/require-auth';
import {
  createGame,
  updateGame,
  deleteGame,
  listGames,
  getGame,
  moveToCollection,
  igdbChainHolder,
  idempotencyKeyMiddleware,
} from '../../wiring';

const games = createGamesRouter({
  create: createGame,
  update: updateGame,
  delete: deleteGame,
  list: listGames,
  get: getGame,
  moveToCollection,
  igdbChainHolder,
  idempotencyKey: idempotencyKeyMiddleware,
});

const TEST_USER_ID = `test-idem-int-${crypto.randomUUID()}`;
const KEY = '01234567-89ab-cdef-0123-456789abcdef';

function makeApp() {
  const app = new Hono<{ Variables: AuthVariables }>();
  attachProblemJsonErrorHandler(app);
  app.use('*', requestContext());
  app.use('/api/games/*', async (c, next) => {
    c.set('user', { id: TEST_USER_ID } as AuthVariables['user']);
    await next();
  });
  app.route('/api/games', games);
  return app;
}

interface CreateGameBody {
  kind: 'owned' | 'wishlist';
  title: string;
  platform: string;
  format: 'physical' | 'digital';
  genre: string;
  developer: string;
  releaseYear: number;
}

const NEW_GAME_BODY: CreateGameBody = {
  kind: 'owned',
  title: 'Idempotent Game',
  platform: 'PC',
  format: 'digital',
  genre: 'RPG',
  developer: 'Studio',
  releaseYear: 2020,
};

describe('Idempotency-Key end-to-end on POST /api/games', () => {
  beforeAll(async () => {
    // Seed the platform so create-game does not 400 on unknown platform.
    await db
      .insert(platformsTable)
      .values({
        userId: TEST_USER_ID,
        name: 'PC',
        externalId: `pf-${crypto.randomUUID()}`,
      })
      .onConflictDoNothing();
  });

  afterAll(async () => {
    await db.delete(gamesTable).where(eq(gamesTable.userId, TEST_USER_ID));
    await db.delete(platformsTable).where(eq(platformsTable.userId, TEST_USER_ID));
    await db.delete(idempotencyKeysTable).where(eq(idempotencyKeysTable.userId, TEST_USER_ID));
  });

  it('second POST with the same Idempotency-Key returns the cached response and does not create a second game', async () => {
    const app = makeApp();

    const first = await app.request('/api/games', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': KEY,
      },
      body: JSON.stringify(NEW_GAME_BODY),
    });
    expect(first.status).toBe(201);
    const firstBody = (await first.json()) as { id: string; title: string };
    expect(firstBody.title).toBe('Idempotent Game');

    const rowsAfterFirst = await db
      .select({ id: gamesTable.id })
      .from(gamesTable)
      .where(eq(gamesTable.userId, TEST_USER_ID));
    expect(rowsAfterFirst.length).toBe(1);

    const second = await app.request('/api/games', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': KEY,
      },
      body: JSON.stringify(NEW_GAME_BODY),
    });
    expect(second.status).toBe(201);
    const secondBody = (await second.json()) as { id: string };
    // Same response body served from cache — same externalId echoed back.
    expect(secondBody.id).toBe(firstBody.id);

    const rowsAfterSecond = await db
      .select({ id: gamesTable.id })
      .from(gamesTable)
      .where(eq(gamesTable.userId, TEST_USER_ID));
    // Critical assertion: still exactly one row in the table.
    expect(rowsAfterSecond.length).toBe(1);
  });
});
