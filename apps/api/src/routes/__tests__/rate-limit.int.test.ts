import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { db } from '../../infrastructure/db/client';
import {
  games as gamesTable,
  platforms as platformsTable,
  rateLimitBuckets,
} from '../../infrastructure/db/schema';
import { requestContext } from '../../infrastructure/logging/request-context-middleware';
import { attachProblemJsonErrorHandler } from '../_problem-json';
import { createGamesRouter } from '../games';
import { mutationRateLimit } from '../middleware/mutation-rate-limit';
import type { AuthVariables } from '../middleware/require-auth';
import { Application } from '../../app';

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

const USER_A = `test-rl-int-a-${crypto.randomUUID()}`;
const USER_B = `test-rl-int-b-${crypto.randomUUID()}`;

function makeApp(now: () => number, limit: number) {
  const app = new Hono<{ Variables: AuthVariables }>();
  attachProblemJsonErrorHandler(app);
  app.use('*', requestContext());
  app.use('/api/games/*', async (c, next) => {
    const u = c.req.header('x-test-user');
    if (u) c.set('user', { id: u } as AuthVariables['user']);
    await next();
  });
  app.use('/api/games/*', mutationRateLimit({ db, now, limit }));
  app.route('/api/games', games);
  return app;
}

const NEW_GAME = (n: number) => ({
  kind: 'owned' as const,
  title: `RL Game ${n}`,
  platform: 'PC',
  format: 'digital' as const,
  genre: 'RPG',
  developer: 'Studio',
  releaseYear: 2020,
});

async function clear() {
  for (const u of [USER_A, USER_B]) {
    await db.delete(gamesTable).where(eq(gamesTable.userId, u));
    await db.delete(platformsTable).where(eq(platformsTable.userId, u));
    await db.delete(rateLimitBuckets).where(eq(rateLimitBuckets.userId, u));
  }
}

beforeAll(async () => {
  await clear();
  for (const u of [USER_A, USER_B]) {
    await db
      .insert(platformsTable)
      .values({ userId: u, name: 'PC', externalId: `pf-${crypto.randomUUID()}` })
      .onConflictDoNothing();
  }
});

afterAll(clear);

describe('mutationRateLimit end-to-end on /api/games', () => {
  it('60 POSTs in one window all succeed; 61st returns 429 with Retry-After', async () => {
    const t0 = 1_700_000_000_000;
    const app = makeApp(() => t0, 60);
    for (let i = 0; i < 60; i++) {
      const res = await app.request('/api/games', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-test-user': USER_A,
          'idempotency-key': `rl-burst-${i}-${crypto.randomUUID()}`,
        },
        body: JSON.stringify(NEW_GAME(i)),
      });
      expect(res.status).toBe(201);
    }
    const blocked = await app.request('/api/games', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-test-user': USER_A,
        'idempotency-key': `rl-blocked-${crypto.randomUUID()}`,
      },
      body: JSON.stringify(NEW_GAME(61)),
    });
    expect(blocked.status).toBe(429);
    const blockedBody = (await blocked.json()) as { type: string };
    expect(blockedBody.type).toBe('/errors/rate-limited');
    expect(blocked.headers.get('Retry-After')).toMatch(/^\d+$/);
  });

  it('advancing past the window resets the counter', async () => {
    let nowMs = 1_800_000_000_000;
    const app = makeApp(() => nowMs, 1);
    const ok = await app.request('/api/games', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-test-user': USER_B,
        'idempotency-key': `rl-reset-1-${crypto.randomUUID()}`,
      },
      body: JSON.stringify(NEW_GAME(1)),
    });
    expect(ok.status).toBe(201);
    const blocked = await app.request('/api/games', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-test-user': USER_B,
        'idempotency-key': `rl-reset-2-${crypto.randomUUID()}`,
      },
      body: JSON.stringify(NEW_GAME(2)),
    });
    expect(blocked.status).toBe(429);
    nowMs += 60_000;
    const allowed = await app.request('/api/games', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-test-user': USER_B,
        'idempotency-key': `rl-reset-3-${crypto.randomUUID()}`,
      },
      body: JSON.stringify(NEW_GAME(3)),
    });
    expect(allowed.status).toBe(201);
  });

  it('reads (GET) are not counted against the mutation budget', async () => {
    const app = makeApp(() => 1_900_000_000_000, 1);
    for (let i = 0; i < 100; i++) {
      const res = await app.request('/api/games', {
        method: 'GET',
        headers: { 'x-test-user': USER_A },
      });
      expect(res.status).toBe(200);
    }
    const res = await app.request('/api/games', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-test-user': USER_A,
        'idempotency-key': `rl-gets-noop-${crypto.randomUUID()}`,
      },
      body: JSON.stringify(NEW_GAME(999)),
    });
    expect(res.status).toBe(201);
  });
});
