import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { and, eq, inArray } from 'drizzle-orm';
import { Hono } from 'hono';
import { ClearIgdbIntegration } from '../../application/integrations/clear-igdb-integration';
import { GetIgdbIntegrationStatus } from '../../application/integrations/get-igdb-integration-status';
import { SaveIgdbIntegration } from '../../application/integrations/save-igdb-integration';
import type { IgdbCredentialsVerifier } from '../../domain/integrations/igdb-credentials-verifier';
import { ok } from '../../domain/shared/result';
import { db } from '../../infrastructure/db/client';
import { DrizzleTransactionRunner } from '../../infrastructure/db/drizzle-transaction-runner';
import {
  integrationCredentials as integrationCredentialsTable,
  integrationOauthToken as integrationOauthTokenTable,
} from '../../infrastructure/db/schema';
import { DrizzleIdempotencyKeyRepository } from '../../infrastructure/idempotency/drizzle-idempotency-key-repository';
import { createIgdbApiBreaker } from '../../infrastructure/igdb/igdb-api-breaker';
import { IgdbChainFactory } from '../../infrastructure/igdb/igdb-chain-factory';
import { IgdbPerUserResources } from '../../infrastructure/igdb/igdb-per-user-resources';
import { Aes256GcmCipher } from '../../infrastructure/integrations/aes-256-gcm-cipher';
import { DrizzleIntegrationCredentialsRepository } from '../../infrastructure/integrations/drizzle-integration-credentials-repository';
import { DrizzleIntegrationOauthTokenStorage } from '../../infrastructure/integrations/drizzle-integration-oauth-token-storage';
import { baseLogger } from '../../infrastructure/logging/logger';
import { requestContext } from '../../infrastructure/logging/request-context-middleware';
import { MetadataCacheRepository } from '../../infrastructure/metadata/metadata-cache-repository';
import { attachProblemJsonErrorHandler } from '../_problem-json';
import { createGamesMetadataRouter } from '../games-metadata';
import { createIntegrationsRouter } from '../integrations';
import { idempotencyKey as idempotencyKeyMiddlewareFactory } from '../middleware/idempotency-key';
import type { AuthVariables } from '../middleware/require-auth';

const USER_A = `mt-igdb-a-${crypto.randomUUID()}`;
const USER_B = `mt-igdb-b-${crypto.randomUUID()}`;

// Titles must be unique per run — the metadata_cache table is shared across
// tests/users, so a prior run leaving `foo:PC` cached would let user A's
// /candidates serve from cache and skip the fetch interceptor we rely on.
const RUN_ID = crypto.randomUUID();
const TITLE_FOO = `mt-foo-${RUN_ID}`;
const TITLE_BAR = `mt-bar-${RUN_ID}`;
const TITLE_BAZ = `mt-baz-${RUN_ID}`;
const TITLE_QUX = `mt-qux-${RUN_ID}`;

interface IgdbCall {
  clientId: string | null;
  authorization: string | null;
}

function buildAppForUsers(calls: IgdbCall[]) {
  const cipher = new Aes256GcmCipher();
  const repo = new DrizzleIntegrationCredentialsRepository();
  const storage = new DrizzleIntegrationOauthTokenStorage();
  const txRunner = new DrizzleTransactionRunner(db);
  const idemRepo = new DrizzleIdempotencyKeyRepository();
  const idemMw = idempotencyKeyMiddlewareFactory({ repo: idemRepo });

  const breaker = createIgdbApiBreaker(baseLogger);
  const resources = new IgdbPerUserResources(repo, cipher, storage, baseLogger);
  const cacheRepo = new MetadataCacheRepository();
  const chainFactory = new IgdbChainFactory(resources, breaker, cacheRepo, baseLogger, 5000, 30);
  const getStatus = new GetIgdbIntegrationStatus(repo);

  const originalFetch = globalThis.fetch;
  const fetchImpl = (async (input: unknown, init?: RequestInit): Promise<Response> => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : '';
    if (url.startsWith('https://id.twitch.tv/oauth2/token')) {
      return new Response(
        JSON.stringify({ access_token: 'test-token', expires_in: 3600, token_type: 'bearer' }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    }
    if (url.includes('api.igdb.com')) {
      const headers = init?.headers as Record<string, string> | undefined;
      calls.push({
        clientId: headers?.['client-id'] ?? null,
        authorization: headers?.authorization ?? null,
      });
      return new Response('[]', { status: 200, headers: { 'content-type': 'application/json' } });
    }
    throw new Error(`Unexpected fetch url: ${url}`);
  }) as unknown as typeof fetch;

  (globalThis as { fetch: typeof fetch }).fetch = fetchImpl;

  const verifier: IgdbCredentialsVerifier = { verify: async () => ok(undefined) };
  let uuidCounter = 0;

  const saveFor = () =>
    new SaveIgdbIntegration({
      repo,
      cipher,
      verifier,
      resourceCache: resources,
      now: () => new Date(),
      uuid: () => `mt-uuid-${++uuidCounter}`,
    });
  const clearFor = () =>
    new ClearIgdbIntegration({
      repo,
      tokenStorage: storage,
      resourceCache: resources,
      transactionRunner: txRunner,
    });

  const app = new Hono<{ Variables: AuthVariables }>();
  attachProblemJsonErrorHandler(app);
  app.use('*', requestContext());
  app.use('/api/*', async (c, next) => {
    const requestedUser = c.req.header('x-test-user') ?? USER_A;
    c.set('user', { id: requestedUser } as AuthVariables['user']);
    await next();
  });

  app.route(
    '/api/integrations',
    createIntegrationsRouter({
      saveIgdbIntegration: saveFor(),
      clearIgdbIntegration: clearFor(),
      getIgdbIntegrationStatus: getStatus,
      idempotencyKeyMiddleware: idemMw,
    }),
  );

  const gamesRouter = new Hono<{ Variables: AuthVariables }>();
  gamesRouter.route('/metadata', createGamesMetadataRouter({ chainFactory, getStatus }));
  app.route('/api/games', gamesRouter);

  return {
    app,
    restore: () => {
      (globalThis as { fetch: typeof fetch }).fetch = originalFetch;
    },
    repo,
    cipher,
    cacheRepo,
    resources,
  };
}

async function cleanup(): Promise<void> {
  await db
    .delete(integrationOauthTokenTable)
    .where(inArray(integrationOauthTokenTable.userId, [USER_A, USER_B]));
  await db
    .delete(integrationCredentialsTable)
    .where(inArray(integrationCredentialsTable.userId, [USER_A, USER_B]));
}

const BODY_A = {
  clientId: 'cid-mt-A-0000000000000000',
  clientSecret: 'sec-mt-A-0000000000000000',
  enabled: true,
};
const BODY_B = {
  clientId: 'cid-mt-B-0000000000000000',
  clientSecret: 'sec-mt-B-0000000000000000',
  enabled: true,
};

describe('multi-tenant IGDB', () => {
  let calls: IgdbCall[];
  let app: ReturnType<typeof buildAppForUsers>;

  beforeAll(async () => {
    await cleanup();
    calls = [];
    app = buildAppForUsers(calls);
  });

  afterAll(async () => {
    app.restore();
    await cleanup();
  });

  it('each user saves their own creds; each user search hits IGDB with their own clientId', async () => {
    const putA = await app.app.request('/api/integrations/igdb', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'x-test-user': USER_A,
        'Idempotency-Key': '11111111-1111-1111-1111-111111111111',
      },
      body: JSON.stringify(BODY_A),
    });
    expect(putA.status).toBe(200);

    const putB = await app.app.request('/api/integrations/igdb', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'x-test-user': USER_B,
        'Idempotency-Key': '22222222-2222-2222-2222-222222222222',
      },
      body: JSON.stringify(BODY_B),
    });
    expect(putB.status).toBe(200);

    calls.length = 0;
    const searchA = await app.app.request(
      `/api/games/metadata/candidates?title=${TITLE_FOO}&platform=PC`,
      { headers: { 'x-test-user': USER_A } },
    );
    expect(searchA.status).toBe(200);
    const aCall = calls.find((c) => c.clientId === BODY_A.clientId);
    expect(aCall).toBeDefined();

    const searchB = await app.app.request(
      `/api/games/metadata/candidates?title=${TITLE_BAR}&platform=PC`,
      { headers: { 'x-test-user': USER_B } },
    );
    expect(searchB.status).toBe(200);
    const bCall = calls.find((c) => c.clientId === BODY_B.clientId);
    expect(bCall).toBeDefined();
  });

  it('A DELETE removes A creds + A token row atomically; B unaffected', async () => {
    const del = await app.app.request('/api/integrations/igdb', {
      method: 'DELETE',
      headers: {
        'x-test-user': USER_A,
        'Idempotency-Key': '33333333-3333-3333-3333-333333333333',
      },
    });
    expect(del.status).toBe(204);

    const aRow = await db
      .select()
      .from(integrationCredentialsTable)
      .where(eq(integrationCredentialsTable.userId, USER_A));
    expect(aRow.length).toBe(0);

    const aTok = await db
      .select()
      .from(integrationOauthTokenTable)
      .where(eq(integrationOauthTokenTable.userId, USER_A));
    expect(aTok.length).toBe(0);

    const bRow = await db
      .select()
      .from(integrationCredentialsTable)
      .where(
        and(
          eq(integrationCredentialsTable.userId, USER_B),
          eq(integrationCredentialsTable.integration, 'igdb'),
        ),
      );
    expect(bRow.length).toBe(1);
  });

  it("after A's DELETE: A's /candidates returns 503; B's still returns 200", async () => {
    const aRes = await app.app.request(
      `/api/games/metadata/candidates?title=${TITLE_BAZ}&platform=PC`,
      { headers: { 'x-test-user': USER_A } },
    );
    expect(aRes.status).toBe(503);

    const bRes = await app.app.request(
      `/api/games/metadata/candidates?title=${TITLE_QUX}&platform=PC`,
      { headers: { 'x-test-user': USER_B } },
    );
    expect(bRes.status).toBe(200);
  });
});
