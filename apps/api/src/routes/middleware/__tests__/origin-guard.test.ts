import { describe, expect, it } from 'bun:test';
import { Hono } from 'hono';
import { createLogger } from '../../../infrastructure/logging/logger';
import type { RequestContextVariables } from '../../../infrastructure/logging/request-context-middleware';
import { originGuard } from '../origin-guard';

const ALLOWED = new Set(['http://localhost:5173', 'https://apex.example']);

function makeApp() {
  const app = new Hono();
  app.use('/api/*', originGuard(ALLOWED));
  app.all('/api/echo', (c) => c.json({ ok: true }));
  return app;
}

describe('originGuard', () => {
  it('rejects POST with foreign Origin (403 + problem+json)', async () => {
    const res = await makeApp().request('/api/echo', {
      method: 'POST',
      headers: { Origin: 'https://evil.example.com' },
    });
    expect(res.status).toBe(403);
    const body = (await res.json()) as { type: string; status: number };
    expect(body.type).toBe('/errors/csrf-rejected');
    expect(body.status).toBe(403);
  });

  it('rejects POST with no Origin header at all', async () => {
    const res = await makeApp().request('/api/echo', { method: 'POST' });
    expect(res.status).toBe(403);
  });

  it('allows POST when Origin is allowlisted', async () => {
    const res = await makeApp().request('/api/echo', {
      method: 'POST',
      headers: { Origin: 'http://localhost:5173' },
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it('does not check safe methods (GET passes regardless of Origin)', async () => {
    const res = await makeApp().request('/api/echo', {
      method: 'GET',
      headers: { Origin: 'https://evil.example.com' },
    });
    expect(res.status).toBe(200);
  });

  it('emits a structured csrf.rejected event on reject', async () => {
    const lines: string[] = [];
    const logger = createLogger({ level: 'debug', sink: (l) => lines.push(l) });
    const app = new Hono<{ Variables: RequestContextVariables }>();
    app.use('/api/*', async (c, next) => {
      c.set('logger', logger);
      await next();
    });
    app.use('/api/*', originGuard(ALLOWED));
    app.all('/api/echo', (c) => c.json({ ok: true }));
    const res = await app.request('/api/echo', {
      method: 'POST',
      headers: { Origin: 'https://evil.example.com' },
    });
    expect(res.status).toBe(403);
    const event = lines.map((l) => JSON.parse(l)).find((r) => r.event === 'csrf.rejected');
    expect(event).toBeDefined();
    expect(event.origin).toBe('https://evil.example.com');
    expect(event.method).toBe('POST');
    expect(event.path).toBe('/api/echo');
  });

  it('also passes HEAD and OPTIONS regardless of Origin', async () => {
    const head = await makeApp().request('/api/echo', {
      method: 'HEAD',
      headers: { Origin: 'https://evil.example.com' },
    });
    expect(head.status).toBe(200);
    const options = await makeApp().request('/api/echo', {
      method: 'OPTIONS',
      headers: { Origin: 'https://evil.example.com' },
    });
    expect(options.status).toBe(200);
  });
});
