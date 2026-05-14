import { afterAll, beforeEach, describe, expect, it } from 'bun:test';
import { eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { db } from '../../../infrastructure/db/client';
import { rateLimitBuckets } from '../../../infrastructure/db/schema';
import { createLogger } from '../../../infrastructure/logging/logger';
import { type MutationRateLimitDeps, mutationRateLimit } from '../mutation-rate-limit';
import type { AuthVariables } from '../require-auth';

const USER_A = `test-rl-a-${crypto.randomUUID()}`;
const USER_B = `test-rl-b-${crypto.randomUUID()}`;

function makeApp(now: () => number, limit?: number) {
  const app = new Hono<{ Variables: AuthVariables }>();
  app.use('/api/*', async (c, next) => {
    const userHeader = c.req.header('x-test-user');
    if (userHeader) c.set('user', { id: userHeader } as AuthVariables['user']);
    await next();
  });
  app.use('/api/*', mutationRateLimit({ db, now, limit }));
  app.all('/api/echo', (c) => c.json({ ok: true }));
  return app;
}

async function clearBuckets() {
  await db.delete(rateLimitBuckets).where(eq(rateLimitBuckets.userId, USER_A));
  await db.delete(rateLimitBuckets).where(eq(rateLimitBuckets.userId, USER_B));
}

beforeEach(async () => {
  await clearBuckets();
});

afterAll(async () => {
  await clearBuckets();
});

describe('mutationRateLimit', () => {
  it('allows N requests at the limit and rejects N+1 with 429 + Retry-After', async () => {
    const t0 = 1_700_000_000_000;
    const now = () => t0;
    const app = makeApp(now, 3);
    for (let i = 0; i < 3; i++) {
      const res = await app.request('/api/echo', {
        method: 'POST',
        headers: { 'x-test-user': USER_A },
      });
      expect(res.status).toBe(200);
    }
    const fourth = await app.request('/api/echo', {
      method: 'POST',
      headers: { 'x-test-user': USER_A },
    });
    expect(fourth.status).toBe(429);
    const body = (await fourth.json()) as { type: string; retryAfterSeconds: number };
    expect(body.type).toBe('/errors/rate-limited');
    expect(body.retryAfterSeconds).toBeGreaterThan(0);
    expect(fourth.headers.get('Retry-After')).toMatch(/^\d+$/);
  });

  it('resets when the window advances', async () => {
    let nowMs = 1_700_000_000_000;
    const now = () => nowMs;
    const app = makeApp(now, 2);
    await app.request('/api/echo', { method: 'POST', headers: { 'x-test-user': USER_A } });
    await app.request('/api/echo', { method: 'POST', headers: { 'x-test-user': USER_A } });
    const blocked = await app.request('/api/echo', {
      method: 'POST',
      headers: { 'x-test-user': USER_A },
    });
    expect(blocked.status).toBe(429);
    nowMs += 60_000;
    const allowed = await app.request('/api/echo', {
      method: 'POST',
      headers: { 'x-test-user': USER_A },
    });
    expect(allowed.status).toBe(200);
  });

  it('does not count GET requests', async () => {
    const app = makeApp(() => 1_700_000_000_000, 1);
    for (let i = 0; i < 50; i++) {
      const res = await app.request('/api/echo', {
        method: 'GET',
        headers: { 'x-test-user': USER_A },
      });
      expect(res.status).toBe(200);
    }
    const post = await app.request('/api/echo', {
      method: 'POST',
      headers: { 'x-test-user': USER_A },
    });
    expect(post.status).toBe(200);
  });

  it('isolates users (B is unaffected by A hitting the limit)', async () => {
    const app = makeApp(() => 1_700_000_000_000, 1);
    const a1 = await app.request('/api/echo', {
      method: 'POST',
      headers: { 'x-test-user': USER_A },
    });
    expect(a1.status).toBe(200);
    const a2 = await app.request('/api/echo', {
      method: 'POST',
      headers: { 'x-test-user': USER_A },
    });
    expect(a2.status).toBe(429);
    const b1 = await app.request('/api/echo', {
      method: 'POST',
      headers: { 'x-test-user': USER_B },
    });
    expect(b1.status).toBe(200);
  });

  it('fails closed with 429 if no user is set on the context', async () => {
    const app = makeApp(() => 1_700_000_000_000, 10);
    const res = await app.request('/api/echo', { method: 'POST' });
    expect(res.status).toBe(429);
    const body = (await res.json()) as { detail: string };
    expect(body.detail).toMatch(/user/i);
  });

  it('fails closed with 429 + Retry-After when the limiter store throws', async () => {
    const lines: string[] = [];
    const logger = createLogger({ level: 'debug', sink: (l) => lines.push(l) });
    const brokenDb = {
      insert: () => ({
        values: () => ({
          onConflictDoUpdate: () => ({
            returning: () => Promise.reject(new Error('disk I/O error')),
          }),
        }),
      }),
    } as unknown as MutationRateLimitDeps['db'];
    const app = new Hono<{ Variables: AuthVariables }>();
    app.use('/api/*', async (c, next) => {
      c.set('user', { id: USER_A } as AuthVariables['user']);
      c.set('logger', logger);
      await next();
    });
    app.use('/api/*', mutationRateLimit({ db: brokenDb, now: () => 1_700_000_000_000, limit: 60 }));
    app.all('/api/echo', (c) => c.json({ ok: true }));

    const res = await app.request('/api/echo', { method: 'POST' });
    expect(res.status).toBe(429);
    expect(res.headers.get('Retry-After')).toMatch(/^\d+$/);
    const body = (await res.json()) as { type: string; detail: string };
    expect(body.type).toBe('/errors/rate-limited');
    expect(body.detail).toMatch(/unavailable/i);
    const errEvent = lines.map((l) => JSON.parse(l)).find((r) => r.event === 'rate_limit.db_error');
    expect(errEvent).toBeDefined();
    expect(errEvent.userId).toBe(USER_A);
    expect(errEvent.level).toBe('error');
  });

  it('emits a structured rate_limit.rejected event when limit is exceeded', async () => {
    const lines: string[] = [];
    const logger = createLogger({ level: 'debug', sink: (l) => lines.push(l) });
    const t0 = 1_700_000_060_000;
    const app = new Hono<{ Variables: AuthVariables }>();
    app.use('/api/*', async (c, next) => {
      c.set('user', { id: USER_A } as AuthVariables['user']);
      c.set('logger', logger);
      await next();
    });
    app.use('/api/*', mutationRateLimit({ db, now: () => t0, limit: 1 }));
    app.all('/api/echo', (c) => c.json({ ok: true }));

    const ok = await app.request('/api/echo', { method: 'POST' });
    expect(ok.status).toBe(200);
    const blocked = await app.request('/api/echo', { method: 'POST' });
    expect(blocked.status).toBe(429);
    const event = lines.map((l) => JSON.parse(l)).find((r) => r.event === 'rate_limit.rejected');
    expect(event).toBeDefined();
    expect(event.userId).toBe(USER_A);
    expect(event.limit).toBe(1);
    expect(event.count).toBeGreaterThan(1);
    expect(event.method).toBe('POST');
  });
});
