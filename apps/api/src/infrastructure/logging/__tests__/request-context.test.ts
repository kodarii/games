import { describe, expect, test } from 'bun:test';
import { Hono } from 'hono';
import { type Logger, createLogger } from '../logger';
import { type RequestContextVariables, requestContext } from '../request-context-middleware';

function makeApp(captured: string[]): {
  app: Hono<{ Variables: RequestContextVariables }>;
  baseLogger: Logger;
} {
  const baseLogger = createLogger({
    level: 'info',
    sink: (line) => captured.push(line),
    time: () => '2024-01-01T00:00:00.000Z',
  });
  const app = new Hono<{ Variables: RequestContextVariables }>();
  app.use('*', requestContext({ baseLogger }));
  return { app, baseLogger };
}

describe('requestContext middleware', () => {
  test('attaches a logger and requestId to the Hono context', async () => {
    const lines: string[] = [];
    const { app } = makeApp(lines);
    app.get('/echo', (c) => {
      const log = c.get('logger');
      const requestId = c.get('requestId');
      log.event('handler.touch', { requestId });
      return c.json({ requestId });
    });

    const res = await app.request('/echo');
    const body = (await res.json()) as { requestId: string };
    expect(typeof body.requestId).toBe('string');
    expect(body.requestId.length).toBeGreaterThan(0);

    const handlerLine = lines.find((l) => l.includes('"event":"handler.touch"'));
    expect(handlerLine).toBeDefined();
    expect(JSON.parse(handlerLine as string).requestId).toBe(body.requestId);
  });

  test('emits an http.request record with method, path, status, durationMs', async () => {
    const lines: string[] = [];
    const { app } = makeApp(lines);
    app.get('/ok', (c) => c.json({ ok: true }));

    await app.request('/ok');

    const httpLine = lines.find((l) => l.includes('"event":"http.request"'));
    expect(httpLine).toBeDefined();
    const record = JSON.parse(httpLine as string);
    expect(record.method).toBe('GET');
    expect(record.path).toBe('/ok');
    expect(record.status).toBe(200);
    expect(typeof record.durationMs).toBe('number');
    expect(record.requestId).toBeDefined();
  });

  test('produces different requestIds for distinct requests', async () => {
    const lines: string[] = [];
    const { app } = makeApp(lines);
    app.get('/x', (c) => c.json({ requestId: c.get('requestId') }));

    const r1 = (await (await app.request('/x')).json()) as { requestId: string };
    const r2 = (await (await app.request('/x')).json()) as { requestId: string };

    expect(r1.requestId).not.toBe(r2.requestId);
  });

  test('honors X-Request-Id header when provided', async () => {
    const lines: string[] = [];
    const { app } = makeApp(lines);
    app.get('/x', (c) => c.json({ requestId: c.get('requestId') }));

    const res = await app.request('/x', { headers: { 'X-Request-Id': 'rid-from-edge' } });
    const body = (await res.json()) as { requestId: string };
    expect(body.requestId).toBe('rid-from-edge');
  });
});
