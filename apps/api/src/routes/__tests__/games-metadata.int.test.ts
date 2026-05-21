import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'bun:test';
import { eq, inArray } from 'drizzle-orm';
import { Hono } from 'hono';
import { EnrichGameMetadata } from '../../application/games/enrich-game-metadata';
import { SearchGameMetadata } from '../../application/games/search-game-metadata';
import { isCoverHostAllowed } from '../../infrastructure/config/cover-hosts';
import { db } from '../../infrastructure/db/client';
import { DrizzleTransactionRunner } from '../../infrastructure/db/drizzle-transaction-runner';
import { games as gamesTable, igdbOauthToken, metadataCache } from '../../infrastructure/db/schema';
import { DrizzleGameRepository } from '../../infrastructure/games/drizzle-game-repository';
import { CircuitBreaker } from '../../infrastructure/igdb/circuit-breaker';
import { DrizzleIgdbTokenStorage } from '../../infrastructure/igdb/drizzle-igdb-token-storage';
import type { IgdbChain, IgdbChainHolder } from '../../infrastructure/igdb/igdb-chain-holder';
import { IgdbGameMetadataProvider } from '../../infrastructure/igdb/igdb-game-metadata-provider';
import { IgdbHttpClient } from '../../infrastructure/igdb/igdb-http-client';
import { IgdbTokenStore } from '../../infrastructure/igdb/igdb-token-store';
import { requestContext } from '../../infrastructure/logging/request-context-middleware';
import { CachingGameMetadataProvider } from '../../infrastructure/metadata/caching-game-metadata-provider';
import { MetadataCacheRepository } from '../../infrastructure/metadata/metadata-cache-repository';
import { TokenBucketRateLimiter } from '../../infrastructure/metadata/rate-limiter';
import { createGamesMetadataRouter } from '../games-metadata';
import type { AuthVariables } from '../middleware/require-auth';

function fixedChainHolder(chain: IgdbChain | null): Pick<IgdbChainHolder, 'get' | 'isConfigured'> {
  return {
    get: () => chain,
    isConfigured: () => chain !== null,
  };
}

const TEST_USER_ID = `test-igdb-int-${crypto.randomUUID()}`;

const IGDB_FIXTURE = [
  {
    id: 12345,
    name: 'Resident Evil 4',
    first_release_date: 1106956800,
    cover: { image_id: 'co1abc' },
    platforms: [{ name: 'PlayStation 2' }],
    involved_companies: [{ developer: true, company: { name: 'Capcom' } }],
  },
];

interface FakeIgdbState {
  requestCount: number;
  response: 'ok' | 'error500';
}

function makeFakeIgdbApp(state: FakeIgdbState): Hono {
  const app = new Hono();
  app.post('/games', async (c) => {
    state.requestCount += 1;
    if (state.response === 'error500') return c.json({ message: 'boom' }, 500);
    return c.json(IGDB_FIXTURE);
  });
  return app;
}

interface BuiltApp {
  app: Hono<{ Variables: AuthVariables }>;
  cacheKey: string;
  resetCache: () => Promise<void>;
}

function buildApp(state: FakeIgdbState): BuiltApp {
  // fetchImpl routes any URL → fake IGDB Hono app so the IgdbHttpClient
  // never touches the network. Token store talks to id.twitch.tv which we
  // also short-circuit through the same fetchImpl by returning a baked-in
  // OAuth token response.
  const fakeIgdb = makeFakeIgdbApp(state);
  const fetchImpl = (async (input: unknown, init?: RequestInit): Promise<Response> => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : '';
    if (url.startsWith('https://id.twitch.tv/oauth2/token')) {
      return new Response(
        JSON.stringify({
          access_token: 'test-token',
          expires_in: 3600,
          token_type: 'bearer',
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    }
    // Route any IGDB host call (we use baseUrl 'https://fake-igdb.local/v4'
    // in tests) into the in-memory Hono app.
    if (url.includes('/v4/games') || url.endsWith('/games')) {
      const body = typeof init?.body === 'string' ? init.body : '';
      return fakeIgdb.request('/games', { method: 'POST', body });
    }
    throw new Error(`Unexpected fetch url in test: ${url}`);
  }) as unknown as typeof fetch;

  const tokenStorage = new DrizzleIgdbTokenStorage();
  const tokenStore = new IgdbTokenStore({
    storage: tokenStorage,
    clientId: 'test-client-id',
    clientSecret: 'test-secret',
    fetchImpl,
  });
  const breaker = new CircuitBreaker({
    failureThreshold: 5,
    windowMs: 60_000,
    halfOpenAfterMs: 30_000,
  });
  const rateLimiter = new TokenBucketRateLimiter({ capacity: 100, refillIntervalMs: 1 });
  const httpClient = new IgdbHttpClient({
    baseUrl: 'https://fake-igdb.local/v4',
    clientId: 'test-client-id',
    tokenStore,
    rateLimiter,
    breaker,
    timeoutMs: 5_000,
    fetchImpl,
    setTimeoutImpl: ((fn: () => void): unknown => {
      queueMicrotask(fn);
      return 0;
    }) as typeof setTimeout,
  });
  const provider = new IgdbGameMetadataProvider({ httpClient });
  const cacheRepo = new MetadataCacheRepository();
  const cachingProvider = new CachingGameMetadataProvider({
    inner: provider,
    cacheRepo,
    providerName: 'igdb',
    positiveTtlDays: 30,
    negativeTtlDays: 1,
  });
  const searchGameMetadata = new SearchGameMetadata(cachingProvider, cacheRepo);
  // EnrichGameMetadata is local to this test app to keep it independent of
  // the runtime composition root. The metadata-router tests only exercise
  // the search side, so `enrichGameMetadata` is referenced below to keep
  // its import live.
  const enrichGameMetadata = new EnrichGameMetadata(
    new DrizzleGameRepository(),
    new DrizzleTransactionRunner(db),
    cacheRepo,
    isCoverHostAllowed,
  );

  const app = new Hono<{ Variables: AuthVariables }>();
  // Install the same request-context middleware production wires in
  // `index.ts` so `c.get('logger')` is populated for every handler.
  app.use('*', requestContext());
  app.use('/api/games/*', async (c, next) => {
    c.set('user', { id: TEST_USER_ID } as AuthVariables['user']);
    await next();
  });
  // Mount the metadata sub-router under `/api/games/metadata`. This mirrors
  // the production mounting where `games.route('/metadata', …)` is registered
  // BEFORE `:externalId` in `games.ts`.
  const gamesRouter = new Hono<{ Variables: AuthVariables }>();
  gamesRouter.route(
    '/metadata',
    createGamesMetadataRouter({
      chainHolder: fixedChainHolder({ searchGameMetadata, enrichGameMetadata }),
    }),
  );
  app.route('/api/games', gamesRouter);

  // Expose injected use cases for tests that need direct repo access.
  void enrichGameMetadata; // wired but only the search side is exercised here

  const cacheKey = cachingProvider.buildCacheKey('Resident Evil 4', 'PS2');

  return {
    app,
    cacheKey,
    resetCache: async () => {
      await db.delete(metadataCache).where(eq(metadataCache.cacheKey, cacheKey));
    },
  };
}

describe('GET /api/games/metadata/candidates (integration with fake IGDB)', () => {
  let built: BuiltApp;
  const state: FakeIgdbState = { requestCount: 0, response: 'ok' };

  beforeAll(async () => {
    // Make sure no token row interferes with a leaked test run.
    await db.delete(igdbOauthToken);
    built = buildApp(state);
  });

  beforeEach(() => {
    state.requestCount = 0;
    state.response = 'ok';
  });

  afterEach(async () => {
    await built.resetCache();
  });

  afterAll(async () => {
    await built.resetCache();
    await db.delete(igdbOauthToken);
    await db.delete(gamesTable).where(inArray(gamesTable.externalId, [`test-${TEST_USER_ID}`]));
  });

  it('happy path: returns 200 with non-empty candidates and degraded=false', async () => {
    const res = await built.app.request(
      '/api/games/metadata/candidates?title=Resident%20Evil%204&platform=PS2',
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      candidates: unknown[];
      degraded: boolean;
      reason?: string;
      staleAt?: string;
    };
    expect(body.degraded).toBe(false);
    expect(body.candidates.length).toBeGreaterThan(0);
    expect(body.reason).toBeUndefined();
    expect(body.staleAt).toBeUndefined();
    expect(state.requestCount).toBe(1);
  });

  it('second call hits cache (fake IGDB request count stays at 1)', async () => {
    await built.app.request(
      '/api/games/metadata/candidates?title=Resident%20Evil%204&platform=PS2',
    );
    expect(state.requestCount).toBe(1);
    const res2 = await built.app.request(
      '/api/games/metadata/candidates?title=Resident%20Evil%204&platform=PS2',
    );
    expect(res2.status).toBe(200);
    const body = (await res2.json()) as { degraded: boolean; staleAt?: string };
    expect(body.degraded).toBe(false);
    expect(state.requestCount).toBe(1);
  });

  it('provider down + no cache → degraded:true with reason provider_down', async () => {
    state.response = 'error500';
    const res = await built.app.request(
      '/api/games/metadata/candidates?title=Resident%20Evil%204&platform=PS2',
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      candidates: unknown[];
      degraded: boolean;
      reason?: string;
    };
    expect(body.degraded).toBe(true);
    expect(body.reason).toBe('provider_down');
    expect(body.candidates).toEqual([]);
    // 3 attempts inside the http client
    expect(state.requestCount).toBe(3);
  });

  it('cache pre-populated + provider down → response with staleAt', async () => {
    // Warm cache with a successful call
    state.response = 'ok';
    const ok = await built.app.request(
      '/api/games/metadata/candidates?title=Resident%20Evil%204&platform=PS2',
    );
    expect(ok.status).toBe(200);
    state.requestCount = 0;

    // Force a stale cache fetchedAt so the decorator definitely falls
    // through to the inner provider on the second call.
    await db
      .update(metadataCache)
      .set({ fetchedAt: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000) })
      .where(eq(metadataCache.cacheKey, built.cacheKey));

    state.response = 'error500';
    const res = await built.app.request(
      '/api/games/metadata/candidates?title=Resident%20Evil%204&platform=PS2',
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      candidates: unknown[];
      degraded: boolean;
      staleAt?: string;
    };
    expect(body.degraded).toBe(false);
    expect(typeof body.staleAt).toBe('string');
    expect(body.candidates.length).toBeGreaterThan(0);
  });
});

describe('GET /api/games/metadata/status', () => {
  function buildStatusApp(igdbConfigured: boolean): Hono<{ Variables: AuthVariables }> {
    const fakeSearchGameMetadata = {
      execute: async () => ({
        ok: true as const,
        value: { candidates: [], degraded: false },
      }),
    } as unknown as SearchGameMetadata;
    const fakeEnrichGameMetadata = {} as unknown as EnrichGameMetadata;

    const app = new Hono<{ Variables: AuthVariables }>();
    app.use('*', requestContext());
    app.use('/api/games/*', async (c, next) => {
      c.set('user', { id: TEST_USER_ID } as AuthVariables['user']);
      await next();
    });
    const gamesRouter = new Hono<{ Variables: AuthVariables }>();
    gamesRouter.route(
      '/metadata',
      createGamesMetadataRouter({
        chainHolder: fixedChainHolder(
          igdbConfigured
            ? {
                searchGameMetadata: fakeSearchGameMetadata,
                enrichGameMetadata: fakeEnrichGameMetadata,
              }
            : null,
        ),
      }),
    );
    app.route('/api/games', gamesRouter);
    return app;
  }

  it('returns igdbConfigured: true when wired with true', async () => {
    const app = buildStatusApp(true);
    const res = await app.request('/api/games/metadata/status');
    expect(res.status).toBe(200);
    const body = (await res.json()) as { igdbConfigured: boolean };
    expect(body).toEqual({ igdbConfigured: true });
  });

  it('returns igdbConfigured: false when wired with false', async () => {
    const app = buildStatusApp(false);
    const res = await app.request('/api/games/metadata/status');
    expect(res.status).toBe(200);
    const body = (await res.json()) as { igdbConfigured: boolean };
    expect(body).toEqual({ igdbConfigured: false });
  });
});

describe('GET /api/games/metadata/candidates — route order (literal before param)', () => {
  it('mounts via routes/games.ts BEFORE :externalId and returns 200, NOT 404', async () => {
    // Asserts the production registration order in routes/games.ts: the
    // `games.route('/metadata', …)` line must appear BEFORE
    // `games.get('/:externalId', …)`. If a future contributor reverses
    // those two registrations, this test flips: the `:externalId` handler
    // would match `metadata` and yield 404 from `getGame.execute`.
    const { createGamesRouter: makeGamesRouter } = await import('../games');
    const { Application } = await import('../../app');
    const _ta = Application.buildForTesting();
    const wOps = _ta.gameOpsForTesting();
    const wMw = _ta.httpMwForTesting();
    const realGames = makeGamesRouter({
      create: wOps.create,
      update: wOps.update,
      delete: wOps.delete,
      list: wOps.list,
      get: wOps.get,
      moveToCollection: wOps.moveToCollection,
      igdbChainHolder: _ta.igdbHolderForTesting(),
      idempotencyKey: wMw.idempotencyKey,
    });
    const app = new Hono<{ Variables: AuthVariables }>();
    app.use('*', requestContext());
    app.use('/api/games/*', async (c, next) => {
      c.set('user', { id: TEST_USER_ID } as AuthVariables['user']);
      await next();
    });
    app.route('/api/games', realGames);

    const res = await app.request('/api/games/metadata/candidates');
    // We do not care whether the response is 200 or a validation 400 here —
    // ONLY that it is NOT a 404 from the `:externalId` handler, which would
    // indicate the metadata sub-router is shadowed.
    expect(res.status).not.toBe(404);
  });
});
