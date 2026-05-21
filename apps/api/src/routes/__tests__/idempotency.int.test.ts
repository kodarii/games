import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { Application } from '../../app';
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

const _testApp = Application.buildForTesting();
const _gameOps = _testApp.gameOpsForTesting();
const _httpMw = _testApp.httpMwForTesting();
const games = createGamesRouter({
  create: _gameOps.create,
  update: _gameOps.update,
  delete: _gameOps.delete,
  list: _gameOps.list,
  get: _gameOps.get,
  moveToCollection: _gameOps.moveToCollection,
  igdbChainHolder: _testApp.igdbHolderForTesting(),
  idempotencyKey: _httpMw.idempotencyKey,
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

describe('Idempotency-Key end-to-end on mutating /api/games/:externalId', () => {
  const userId = `test-idem-mut-${crypto.randomUUID()}`;

  beforeAll(async () => {
    await db
      .insert(platformsTable)
      .values({ userId, name: 'PC', externalId: `pf-${crypto.randomUUID()}` })
      .onConflictDoNothing();
  });

  async function seedGame(title = 'Mutation Subject'): Promise<string> {
    const externalId = `g-${crypto.randomUUID()}`;
    await db.insert(gamesTable).values({
      userId,
      externalId,
      kind: 'owned',
      title,
      platform: 'PC',
      format: 'digital',
      genre: 'RPG',
      developer: 'Studio',
      releaseYear: 2020,
      status: 'Playing',
      hoursPlayed: 0,
    });
    return externalId;
  }

  function makeAppForUser(): Hono<{ Variables: AuthVariables }> {
    const app = new Hono<{ Variables: AuthVariables }>();
    attachProblemJsonErrorHandler(app);
    app.use('*', requestContext());
    app.use('/api/games/*', async (c, next) => {
      c.set('user', { id: userId } as AuthVariables['user']);
      await next();
    });
    app.route('/api/games', games);
    return app;
  }

  afterAll(async () => {
    await db.delete(gamesTable).where(eq(gamesTable.userId, userId));
    await db.delete(platformsTable).where(eq(platformsTable.userId, userId));
    await db.delete(idempotencyKeysTable).where(eq(idempotencyKeysTable.userId, userId));
  });

  it('PUT /api/games/:externalId is idempotent on Idempotency-Key replay', async () => {
    const externalId = await seedGame('PUT Subject');
    const app = makeAppForUser();
    const key = crypto.randomUUID();
    const body = {
      kind: 'owned',
      title: 'PUT Subject Renamed',
      platform: 'PC',
      format: 'digital',
      genre: 'RPG',
      developer: 'Studio',
      releaseYear: 2021,
    };

    const first = await app.request(`/api/games/${externalId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'Idempotency-Key': key },
      body: JSON.stringify(body),
    });
    expect(first.status).toBe(200);
    const firstBody = (await first.json()) as { id: string; title: string };
    expect(firstBody.title).toBe('PUT Subject Renamed');

    const second = await app.request(`/api/games/${externalId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'Idempotency-Key': key },
      body: JSON.stringify(body),
    });
    expect(second.status).toBe(200);
    const secondBody = (await second.json()) as { id: string; title: string };
    // Cached response replays bit-for-bit. Without idempotency the optimistic
    // lock would 409 the second PUT (version mismatch); the cache hides that.
    expect(secondBody).toEqual(firstBody);

    const rows = await db
      .select({ title: gamesTable.title })
      .from(gamesTable)
      .where(eq(gamesTable.externalId, externalId));
    expect(rows[0]?.title).toBe('PUT Subject Renamed');
  });

  it('DELETE /api/games/:externalId is idempotent on Idempotency-Key replay', async () => {
    const externalId = await seedGame('DELETE Subject');
    const app = makeAppForUser();
    const key = crypto.randomUUID();

    const first = await app.request(`/api/games/${externalId}`, {
      method: 'DELETE',
      headers: { 'Idempotency-Key': key },
    });
    expect(first.status).toBe(200);

    const rowsAfterFirst = await db
      .select({ id: gamesTable.id })
      .from(gamesTable)
      .where(eq(gamesTable.externalId, externalId));
    expect(rowsAfterFirst.length).toBe(0);

    const second = await app.request(`/api/games/${externalId}`, {
      method: 'DELETE',
      headers: { 'Idempotency-Key': key },
    });
    // Cached 200 replays even though the row no longer exists — that is the
    // whole point of the cache (replay-safety for retries after timeouts).
    expect(second.status).toBe(200);
  });

  it('PATCH /api/games/:externalId/metadata is idempotent on Idempotency-Key replay', async () => {
    // IGDB is not configured in tests → handler short-circuits with 503. We
    // assert the cached 503 replays bit-for-bit; that is the cache contract
    // and proves the middleware ran (independent of feature availability).
    const externalId = await seedGame('PATCH Subject');
    const app = makeAppForUser();
    const key = crypto.randomUUID();

    const first = await app.request(`/api/games/${externalId}/metadata`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'Idempotency-Key': key },
      body: JSON.stringify({ providerId: '123', snapshot: {} }),
    });
    const firstText = await first.text();
    const firstStatus = first.status;

    const second = await app.request(`/api/games/${externalId}/metadata`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'Idempotency-Key': key },
      body: JSON.stringify({ providerId: '999', snapshot: { tampered: true } }),
    });
    expect(second.status).toBe(firstStatus);
    expect(await second.text()).toBe(firstText);
  });
});
