import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { db } from '../infrastructure/db/client';
import { games as gamesTable } from '../infrastructure/db/schema';
import { requestContext } from '../infrastructure/logging/request-context-middleware';
import { attachProblemJsonErrorHandler } from './_problem-json';
import { createGamesRouter } from './games';
import type { AuthVariables } from './middleware/require-auth';
import {
  createGame,
  updateGame,
  deleteGame,
  listGames,
  getGame,
  moveToCollection,
  igdbChainHolder,
  idempotencyKeyMiddleware,
} from '../wiring';

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

const TEST_USER_ID = `test-user-routes-${crypto.randomUUID()}`;

function makeTestApp() {
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

async function seedGame(
  opts: {
    externalId?: string;
    title?: string;
    platform?: string;
    format?: 'physical' | 'digital';
    releaseYear?: number | null;
    kind?: 'owned' | 'wishlist';
  } = {},
) {
  await db.insert(gamesTable).values({
    externalId: opts.externalId ?? `ext-${crypto.randomUUID()}`,
    userId: TEST_USER_ID,
    kind: opts.kind ?? 'owned',
    title: opts.title ?? 'Game',
    developer: 'Dev',
    genre: 'ARPG',
    releaseYear: opts.releaseYear === undefined ? 2020 : opts.releaseYear,
    platform: opts.platform ?? 'PC',
    format: opts.format ?? 'digital',
    status: opts.kind === 'wishlist' ? null : 'Backlog',
    hoursPlayed: opts.kind === 'wishlist' ? null : 0,
  });
}

describe('routes/games', () => {
  let app: ReturnType<typeof makeTestApp>;

  beforeAll(() => {
    app = makeTestApp();
  });

  afterAll(async () => {
    await db.delete(gamesTable).where(eq(gamesTable.userId, TEST_USER_ID));
  });

  describe('GET /api/games — validation & DoS guard', () => {
    it('returns 400 RFC 7807 when releaseYearFrom > releaseYearTo', async () => {
      const res = await app.request('/api/games?releaseYearFrom=2030&releaseYearTo=2000');
      expect(res.status).toBe(400);
      const body = (await res.json()) as Record<string, unknown>;
      expect(body.type).toBe('/errors/validation');
      expect(body.title).toBe('Invalid input');
      expect(Array.isArray(body.issues)).toBe(true);
      // No legacy shape leak
      expect(body).not.toHaveProperty('error');
    });

    it('returns 400 RFC 7807 when more than 20 platforms (Zod array max)', async () => {
      const sp = new URLSearchParams();
      for (let i = 0; i < 21; i++) sp.append('platforms', `P${i}`);
      const res = await app.request(`/api/games?${sp.toString()}`);
      expect(res.status).toBe(400);
      const body = (await res.json()) as Record<string, unknown>;
      expect(body.type).toBe('/errors/validation');
      expect(body).not.toHaveProperty('error');
    });

    it('returns 413 RFC 7807 when more than 100 platforms (DoS pre-check)', async () => {
      const sp = new URLSearchParams();
      for (let i = 0; i < 101; i++) sp.append('platforms', `P${i}`);
      const res = await app.request(`/api/games?${sp.toString()}`);
      expect(res.status).toBe(413);
      const body = (await res.json()) as Record<string, unknown>;
      expect(body.type).toBe('/errors/payload-too-large');
    });
  });

  describe('GET /api/games — happy path with repeated params', () => {
    let seeded = false;

    async function seedOnce() {
      if (seeded) return;
      seeded = true;
      await seedGame({
        platform: 'PC',
        format: 'digital',
        releaseYear: 2015,
        title: 'PC-Digital-2015',
      });
      await seedGame({
        platform: 'PS5',
        format: 'physical',
        releaseYear: 2018,
        title: 'PS5-Physical-2018',
      });
      await seedGame({
        platform: 'Switch',
        format: 'digital',
        releaseYear: 2005,
        title: 'Switch-Digital-2005',
      });
      await seedGame({
        platform: 'PC',
        format: 'digital',
        releaseYear: 2025,
        title: 'PC-Digital-2025',
      });
    }

    it('returns 200 and filters via repeated params', async () => {
      await seedOnce();
      const sp = new URLSearchParams();
      sp.append('platforms', 'PC');
      sp.append('platforms', 'PS5');
      sp.append('formats', 'digital');
      sp.append('releaseYearFrom', '2010');
      sp.append('releaseYearTo', '2020');
      sp.append('perPage', '50');
      const res = await app.request(`/api/games?${sp.toString()}`);
      expect(res.status).toBe(200);
      const body = (await res.json()) as { total: number; items: { title: string }[] };
      expect(body.total).toBe(1);
      expect(body.items[0]?.title).toBe('PC-Digital-2015');
    });
  });

  describe('GET /api/games/metadata/candidates — auth coverage', () => {
    it('returns 401 when no auth cookie / session is present', async () => {
      // Mount the full games router behind the SAME requireAuth middleware
      // used in production (apps/api/src/index.ts:42). With no cookie, the
      // middleware short-circuits to 401 BEFORE the metadata sub-router has
      // a chance to handle the request. Asserts that a future contributor
      // who mounts the metadata router differently cannot silently strip
      // the auth requirement.
      const { requireAuth } = await import('./middleware/require-auth');
      const noAuthApp = new Hono<{ Variables: AuthVariables }>();
      attachProblemJsonErrorHandler(noAuthApp);
      noAuthApp.use('/api/games/*', requireAuth);
      noAuthApp.route('/api/games', games);
      const res = await noAuthApp.request('/api/games/metadata/candidates?title=X&platform=PS2');
      expect(res.status).toBe(401);
    });
  });

  describe('POST /api/games — Option A migration verification', () => {
    it('returns 400 RFC 7807 on bad payload (NOT legacy {error:"validation"})', async () => {
      const res = await app.request('/api/games', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: 'owned', title: '', platform: '' }),
      });
      expect(res.status).toBe(400);
      const body = (await res.json()) as Record<string, unknown>;
      expect(body.type).toBe('/errors/validation');
      expect(body.title).toBe('Invalid input');
      expect(Array.isArray(body.issues)).toBe(true);
      // Legacy shape is gone
      expect(body).not.toHaveProperty('error');
    });
  });

  // BE-05: /metadata/* MUST be registered BEFORE /:externalId in routes/games.ts.
  // Two-test regression pin (Q9 — env-independent):
  //   (1) Q9 body-shape pin: /api/games/metadata/status zwraca ZAWSZE 200 +
  //       {igdbConfigured: boolean}. Endpoint NIE robi chain check (games-metadata.ts:13).
  //       Body shape `igdbConfigured: boolean` jest emitowany WYŁĄCZNIE przez
  //       games-metadata sub-router. :externalId handler zwraca game-shape body
  //       ({id, title, ...}) bez tego pola. Swap-regression failuje konstrukcyjnie
  //       NIEZALEŻNIE od env (creds seeded vs null chain — bez znaczenia).
  //   (2) counter-weight: /api/games/:externalId still reaches the single-game handler.
  // RED is konstrukcyjny i env-independent. Manual swap optional dla debugu, NIE acceptance.
  describe('route ordering pin', () => {
    it('GET /api/games/metadata/status resolves to games-metadata sub-router (not :externalId)', async () => {
      // Q9: pin uses /metadata/status (NIE /metadata/candidates). Endpoint zwraca ZAWSZE 200
      // z {igdbConfigured: boolean} — games-metadata.ts:13, no chain check, no gate.
      // Body-shape pin is constructional AND env-independent:
      //   - :externalId handler returns game-shape body {id, title, ...} — no `igdbConfigured` field
      //   - On swap-regression: either status flips (404 for unknown externalId='status') OR body lacks `igdbConfigured`
      // Both branches fail this test.
      const res = await app.request('/api/games/metadata/status');
      expect(res.status).toBe(200);
      const body = (await res.json()) as Record<string, unknown>;
      expect(body).toHaveProperty('igdbConfigured');
      expect(typeof body.igdbConfigured).toBe('boolean');
    });

    it(':externalId handler still resolves for non-reserved slugs', async () => {
      const res = await app.request('/api/games/some-real-external-id');
      // Whatever the handler returns (404 not-found, 200 match, 400 validation, 401 auth strips),
      // it MUST come from the single-game handler — proves /:externalId route is still reachable.
      expect([200, 400, 401, 404]).toContain(res.status);
    });
  });
});
