import { describe, expect, it } from 'bun:test';
import { TokenBucketRateLimiter } from '../../metadata/rate-limiter';
import { CircuitBreaker } from '../circuit-breaker';
import { IgdbHttpClient, IgdbHttpError } from '../igdb-http-client';
import type { IgdbTokenStore } from '../igdb-token-store';

interface FakeTokenStoreState {
  token: string;
  refreshes: number;
}

function makeFakeTokenStore(initial = 'tok-A'): {
  store: Pick<IgdbTokenStore, 'getValidToken' | 'forceRefresh'>;
  state: FakeTokenStoreState;
} {
  const state: FakeTokenStoreState = { token: initial, refreshes: 0 };
  const store = {
    async getValidToken() {
      return state.token;
    },
    async forceRefresh() {
      state.refreshes += 1;
      state.token = `tok-refreshed-${state.refreshes}`;
      return state.token;
    },
  };
  return { store, state };
}

function makeBreaker() {
  return new CircuitBreaker({
    failureThreshold: 5,
    windowMs: 60_000,
    halfOpenAfterMs: 30_000,
    now: () => 0,
  });
}

function makePassThroughRateLimiter() {
  // High capacity, fast refill — effectively no-op for these tests.
  return new TokenBucketRateLimiter({
    capacity: 1000,
    refillIntervalMs: 1,
  });
}

/** Captures setTimeout invocations so tests can assert backoff delays without waiting. */
function makeImmediateScheduler() {
  const delays: number[] = [];
  const setTimeoutImpl = ((fn: () => void, ms: number): unknown => {
    delays.push(ms);
    // Fire on next microtask so chained promises advance.
    queueMicrotask(fn);
    return 0 as unknown;
  }) as typeof setTimeout;
  return { setTimeoutImpl, delays };
}

function jsonResponse(status: number, body: unknown, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });
}

describe('IgdbHttpClient', () => {
  it('returns the response on a 200 happy path', async () => {
    const { store } = makeFakeTokenStore();
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const fetchImpl = (async (input: unknown, init?: RequestInit) => {
      calls.push({ url: String(input), init });
      return jsonResponse(200, [{ id: 1 }]);
    }) as unknown as typeof fetch;
    const sched = makeImmediateScheduler();

    const client = new IgdbHttpClient({
      baseUrl: 'https://api.igdb.com/v4',
      clientId: 'cid',
      tokenStore: store,
      rateLimiter: makePassThroughRateLimiter(),
      breaker: makeBreaker(),
      timeoutMs: 5000,
      fetchImpl,
      setTimeoutImpl: sched.setTimeoutImpl,
    });

    const res = await client.post('/games', 'fields name; limit 1;');
    expect(res.status).toBe(200);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe('https://api.igdb.com/v4/games');
    const headers = new Headers(calls[0]?.init?.headers);
    expect(headers.get('client-id')).toBe('cid');
    expect(headers.get('authorization')).toBe('Bearer tok-A');
    expect(headers.get('accept')).toBe('application/json');
    expect(headers.get('content-type')).toBe('text/plain');
  });

  it('on a single 401 forces a token refresh and retries once', async () => {
    const { store, state } = makeFakeTokenStore('tok-A');
    let call = 0;
    const seenAuthHeaders: string[] = [];
    const fetchImpl = (async (_input: unknown, init?: RequestInit) => {
      call += 1;
      const headers = new Headers(init?.headers);
      const auth = headers.get('authorization');
      seenAuthHeaders.push(auth ?? '');
      if (call === 1) {
        return jsonResponse(401, { message: 'expired' });
      }
      return jsonResponse(200, [{ id: 1 }]);
    }) as unknown as typeof fetch;
    const sched = makeImmediateScheduler();

    const client = new IgdbHttpClient({
      baseUrl: 'https://api.igdb.com/v4',
      clientId: 'cid',
      tokenStore: store,
      rateLimiter: makePassThroughRateLimiter(),
      breaker: makeBreaker(),
      timeoutMs: 5000,
      fetchImpl,
      setTimeoutImpl: sched.setTimeoutImpl,
    });

    const res = await client.post('/games', 'fields name;');
    expect(res.status).toBe(200);
    expect(call).toBe(2);
    expect(state.refreshes).toBe(1);
    expect(seenAuthHeaders[0]).toBe('Bearer tok-A');
    expect(seenAuthHeaders[1]).toBe('Bearer tok-refreshed-1');
  });

  it('two consecutive 401s rejects with unavailable', async () => {
    const { store } = makeFakeTokenStore('tok-A');
    let call = 0;
    const fetchImpl = (async () => {
      call += 1;
      return jsonResponse(401, { message: 'expired' });
    }) as unknown as typeof fetch;
    const sched = makeImmediateScheduler();

    const client = new IgdbHttpClient({
      baseUrl: 'https://api.igdb.com/v4',
      clientId: 'cid',
      tokenStore: store,
      rateLimiter: makePassThroughRateLimiter(),
      breaker: makeBreaker(),
      timeoutMs: 5000,
      fetchImpl,
      setTimeoutImpl: sched.setTimeoutImpl,
    });

    await expect(client.post('/games', '')).rejects.toBeInstanceOf(IgdbHttpError);
    await client.post('/games', '').catch((e: unknown) => {
      if (!(e instanceof IgdbHttpError)) throw new Error('expected IgdbHttpError');
      expect(e.kind).toBe('unavailable');
    });
    // 2 attempts per call × 2 calls = 4
    expect(call).toBe(4);
  });

  it('honors Retry-After header on 429', async () => {
    const { store } = makeFakeTokenStore();
    let call = 0;
    const fetchImpl = (async () => {
      call += 1;
      if (call === 1) {
        return jsonResponse(429, { message: 'too many' }, { 'retry-after': '1' });
      }
      return jsonResponse(200, []);
    }) as unknown as typeof fetch;
    const sched = makeImmediateScheduler();

    const client = new IgdbHttpClient({
      baseUrl: 'https://api.igdb.com/v4',
      clientId: 'cid',
      tokenStore: store,
      rateLimiter: makePassThroughRateLimiter(),
      breaker: makeBreaker(),
      timeoutMs: 5000,
      fetchImpl,
      setTimeoutImpl: sched.setTimeoutImpl,
    });

    const res = await client.post('/games', '');
    expect(res.status).toBe(200);
    expect(call).toBe(2);
    expect(sched.delays[0]).toBeGreaterThanOrEqual(1000);
  });

  it('retries up to 2 times on 5xx then rejects (3 total fetch calls)', async () => {
    const { store } = makeFakeTokenStore();
    let call = 0;
    const fetchImpl = (async () => {
      call += 1;
      return jsonResponse(500, { message: 'boom' });
    }) as unknown as typeof fetch;
    const sched = makeImmediateScheduler();

    const client = new IgdbHttpClient({
      baseUrl: 'https://api.igdb.com/v4',
      clientId: 'cid',
      tokenStore: store,
      rateLimiter: makePassThroughRateLimiter(),
      breaker: makeBreaker(),
      timeoutMs: 5000,
      fetchImpl,
      setTimeoutImpl: sched.setTimeoutImpl,
    });

    await expect(client.post('/games', '')).rejects.toBeInstanceOf(IgdbHttpError);
    expect(call).toBe(3);
  });

  it('retries on network errors up to 2 times', async () => {
    const { store } = makeFakeTokenStore();
    let call = 0;
    const fetchImpl = (async () => {
      call += 1;
      throw new Error('network down');
    }) as unknown as typeof fetch;
    const sched = makeImmediateScheduler();

    const client = new IgdbHttpClient({
      baseUrl: 'https://api.igdb.com/v4',
      clientId: 'cid',
      tokenStore: store,
      rateLimiter: makePassThroughRateLimiter(),
      breaker: makeBreaker(),
      timeoutMs: 5000,
      fetchImpl,
      setTimeoutImpl: sched.setTimeoutImpl,
    });

    await expect(client.post('/games', '')).rejects.toBeInstanceOf(IgdbHttpError);
    expect(call).toBe(3);
  });

  it('when breaker is open, throws unavailable without calling fetch', async () => {
    const { store } = makeFakeTokenStore();
    let fetchCalls = 0;
    const fetchImpl = (async () => {
      fetchCalls += 1;
      return jsonResponse(200, []);
    }) as unknown as typeof fetch;
    const breaker = new CircuitBreaker({
      failureThreshold: 1,
      windowMs: 60_000,
      halfOpenAfterMs: 60_000,
      now: () => 0,
    });
    // Force open
    breaker.recordFailure();
    expect(breaker.state).toBe('open');

    const client = new IgdbHttpClient({
      baseUrl: 'https://api.igdb.com/v4',
      clientId: 'cid',
      tokenStore: store,
      rateLimiter: makePassThroughRateLimiter(),
      breaker,
      timeoutMs: 5000,
      fetchImpl,
    });

    let thrown: unknown;
    try {
      await client.post('/games', '');
    } catch (e) {
      thrown = e;
    }
    expect(thrown).toBeInstanceOf(IgdbHttpError);
    if (!(thrown instanceof IgdbHttpError)) throw new Error('not IgdbHttpError');
    expect(thrown.kind).toBe('unavailable');
    expect(fetchCalls).toBe(0);
  });

  it('caps concurrency at maxInflight=8: with 10 concurrent calls, exactly 8 fetch in-flight', async () => {
    const { store } = makeFakeTokenStore();
    let inflight = 0;
    let peakInflight = 0;
    const releasers: Array<() => void> = [];
    const fetchImpl = (async () => {
      inflight += 1;
      peakInflight = Math.max(peakInflight, inflight);
      // Park until released
      await new Promise<void>((resolve) => {
        releasers.push(() => {
          inflight -= 1;
          resolve();
        });
      });
      return jsonResponse(200, []);
    }) as unknown as typeof fetch;

    const client = new IgdbHttpClient({
      baseUrl: 'https://api.igdb.com/v4',
      clientId: 'cid',
      tokenStore: store,
      rateLimiter: makePassThroughRateLimiter(),
      breaker: makeBreaker(),
      timeoutMs: 5000,
      fetchImpl,
      maxInflight: 8,
    });

    const calls = Array.from({ length: 10 }, () => client.post('/games', ''));
    // Let microtasks settle so semaphore + fetch interactions resolve
    for (let i = 0; i < 50; i++) await Promise.resolve();
    expect(inflight).toBe(8);
    expect(peakInflight).toBe(8);

    // Release everything
    while (releasers.length > 0) {
      const r = releasers.shift();
      if (r) r();
      for (let i = 0; i < 10; i++) await Promise.resolve();
    }
    await Promise.all(calls);
  });

  it('does not include the bearer token in thrown error messages (redaction)', async () => {
    const { store } = makeFakeTokenStore('SECRET-TOKEN-XYZ');
    const fetchImpl = (async () => {
      return jsonResponse(500, { message: 'boom' });
    }) as unknown as typeof fetch;
    const sched = makeImmediateScheduler();

    const client = new IgdbHttpClient({
      baseUrl: 'https://api.igdb.com/v4',
      clientId: 'cid',
      tokenStore: store,
      rateLimiter: makePassThroughRateLimiter(),
      breaker: makeBreaker(),
      timeoutMs: 5000,
      fetchImpl,
      setTimeoutImpl: sched.setTimeoutImpl,
    });

    let thrown: unknown;
    try {
      await client.post('/games', '');
    } catch (e) {
      thrown = e;
    }
    expect(thrown).toBeInstanceOf(IgdbHttpError);
    const message = thrown instanceof Error ? thrown.message : '';
    expect(message).not.toContain('SECRET-TOKEN-XYZ');
  });
});
