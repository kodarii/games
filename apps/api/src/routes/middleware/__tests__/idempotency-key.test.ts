import { beforeEach, describe, expect, it } from 'bun:test';
import { Hono } from 'hono';
import type {
  IdempotencyKeyRepository,
  IdempotencyRecord,
} from '../../../application/idempotency/idempotency-key-repository';
import { idempotencyKey } from '../idempotency-key';
import type { AuthVariables } from '../require-auth';

/**
 * Tiny in-memory adapter for the port. Tests assert on observable behavior
 * (handler call count, response body, conflict surface), not on the
 * concrete Drizzle row shape.
 */
class FakeIdempotencyRepo implements IdempotencyKeyRepository {
  readonly store = new Map<string, IdempotencyRecord>();

  async find(key: string, userId: string): Promise<IdempotencyRecord | null> {
    return this.store.get(`${userId}:${key}`) ?? null;
  }

  async save(record: IdempotencyRecord): Promise<void> {
    const k = `${record.userId}:${record.key}`;
    // Mimic ON CONFLICT DO NOTHING — first writer wins.
    if (!this.store.has(k)) this.store.set(k, record);
  }

  async deleteOlderThan(_olderThanMs: number): Promise<number> {
    return 0;
  }
}

const TEST_USER_ID = 'user-1';
const VALID_KEY = '11111111-2222-3333-4444-555555555555';

function buildApp(repo: IdempotencyKeyRepository): {
  app: Hono<{ Variables: AuthVariables }>;
  handlerCalls: { count: number };
} {
  const handlerCalls = { count: 0 };
  const app = new Hono<{ Variables: AuthVariables }>();
  // Stub auth — the middleware reads `c.get('user').id` for scoping.
  app.use('*', async (c, next) => {
    c.set('user', { id: TEST_USER_ID } as AuthVariables['user']);
    await next();
  });
  app.post('/things', idempotencyKey({ repo }), async (c) => {
    handlerCalls.count += 1;
    const body = (await c.req.json().catch(() => ({}))) as { value?: string };
    return c.json({ created: 1, echo: body.value ?? null }, 201);
  });
  return { app, handlerCalls };
}

describe('idempotencyKey middleware', () => {
  let repo: FakeIdempotencyRepo;

  beforeEach(() => {
    repo = new FakeIdempotencyRepo();
  });

  it('passes through when no Idempotency-Key header is present', async () => {
    const { app, handlerCalls } = buildApp(repo);

    const res = await app.request('/things', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ value: 'a' }),
    });

    expect(res.status).toBe(201);
    expect(handlerCalls.count).toBe(1);
  });

  it('rejects malformed Idempotency-Key with 400 problem+json', async () => {
    const { app, handlerCalls } = buildApp(repo);

    const res = await app.request('/things', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': 'too short',
      },
      body: JSON.stringify({ value: 'a' }),
    });

    expect(res.status).toBe(400);
    const body = (await res.json()) as { type?: string; detail?: string };
    expect(body.type).toBe('/errors/idempotency-key-invalid');
    expect(handlerCalls.count).toBe(0);
  });

  it('returns the cached 2xx response on second call with the same key', async () => {
    const { app, handlerCalls } = buildApp(repo);

    const first = await app.request('/things', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': VALID_KEY,
      },
      body: JSON.stringify({ value: 'a' }),
    });
    expect(first.status).toBe(201);
    const firstBody = await first.json();

    const second = await app.request('/things', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': VALID_KEY,
      },
      body: JSON.stringify({ value: 'a' }),
    });

    expect(second.status).toBe(201);
    expect(await second.json()).toEqual(firstBody);
    expect(handlerCalls.count).toBe(1);
  });

  it('returns 409 idempotency_key_conflict when same key is reused with a different body', async () => {
    const { app, handlerCalls } = buildApp(repo);

    const first = await app.request('/things', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': VALID_KEY,
      },
      body: JSON.stringify({ value: 'a' }),
    });
    expect(first.status).toBe(201);

    const second = await app.request('/things', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': VALID_KEY,
      },
      body: JSON.stringify({ value: 'DIFFERENT' }),
    });

    expect(second.status).toBe(409);
    const body = (await second.json()) as { type?: string };
    expect(body.type).toBe('/errors/idempotency-key-conflict');
    // Handler must NOT have run a second time.
    expect(handlerCalls.count).toBe(1);
  });

  it('does NOT cache 5xx responses (failing requests stay retryable)', async () => {
    const handlerCalls = { count: 0 };
    const app = new Hono<{ Variables: AuthVariables }>();
    app.use('*', async (c, next) => {
      c.set('user', { id: TEST_USER_ID } as AuthVariables['user']);
      await next();
    });
    app.post('/boom', idempotencyKey({ repo }), async (c) => {
      handlerCalls.count += 1;
      return c.json({ error: 'internal' }, 500);
    });

    const first = await app.request('/boom', {
      method: 'POST',
      headers: { 'Idempotency-Key': VALID_KEY },
    });
    expect(first.status).toBe(500);

    const second = await app.request('/boom', {
      method: 'POST',
      headers: { 'Idempotency-Key': VALID_KEY },
    });
    // Retry hits the handler again — no stale 500 served from cache.
    expect(second.status).toBe(500);
    expect(handlerCalls.count).toBe(2);
  });

  it('scopes records by userId — same key, different users are independent', async () => {
    const handlerCalls = { count: 0 };
    const app = new Hono<{ Variables: AuthVariables }>();
    let nextUserId = 'user-A';
    app.use('*', async (c, next) => {
      c.set('user', { id: nextUserId } as AuthVariables['user']);
      await next();
    });
    app.post('/things', idempotencyKey({ repo }), async (c) => {
      handlerCalls.count += 1;
      return c.json({ owner: c.get('user').id }, 201);
    });

    const a = await app.request('/things', {
      method: 'POST',
      headers: { 'Idempotency-Key': VALID_KEY },
    });
    expect(a.status).toBe(201);

    nextUserId = 'user-B';
    const b = await app.request('/things', {
      method: 'POST',
      headers: { 'Idempotency-Key': VALID_KEY },
    });
    expect(b.status).toBe(201);
    expect(await b.json()).toEqual({ owner: 'user-B' });
    // Both users hit the handler — user-B was not served user-A's cache.
    expect(handlerCalls.count).toBe(2);
  });
});
