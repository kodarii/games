import { describe, expect, it } from 'bun:test';
import { createHealthRouter } from '../health';

describe('health router', () => {
  it('GET /live always returns 200', async () => {
    const router = createHealthRouter(async () => {
      throw new Error('db down — irrelevant for liveness');
    });

    const res = await router.request('/live');

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: 'ok' });
  });

  it('GET /ready returns 200 when the DB probe resolves', async () => {
    const router = createHealthRouter(async () => {});

    const res = await router.request('/ready');

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: 'ready', checks: { db: 'ok' } });
  });

  it('GET /ready returns 503 when the DB probe rejects', async () => {
    const router = createHealthRouter(async () => {
      throw new Error('connection refused');
    });

    const res = await router.request('/ready');

    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({
      status: 'not_ready',
      checks: { db: 'error', error: 'connection refused' },
    });
  });
});
