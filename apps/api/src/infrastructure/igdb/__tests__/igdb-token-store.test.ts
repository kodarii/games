import { describe, expect, it } from 'bun:test';
import type {
  IntegrationTokenStorage,
  StoredIntegrationToken,
} from '../../../domain/integrations/integration-token-storage';
import { IgdbTokenStore } from '../igdb-token-store';

function createDeferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason: unknown) => void;
} {
  let resolveFn!: (value: T) => void;
  let rejectFn!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolveFn = res;
    rejectFn = rej;
  });
  return { promise, resolve: resolveFn, reject: rejectFn };
}

interface FakeStorageOptions {
  initial?: StoredIntegrationToken | null;
}

function makeFakeStorage(opts: FakeStorageOptions = {}) {
  let current: StoredIntegrationToken | null = opts.initial ?? null;
  let reads = 0;
  let writes = 0;
  const storage: IntegrationTokenStorage = {
    async read() {
      reads += 1;
      return current;
    },
    async write(record) {
      writes += 1;
      current = record;
    },
    async clear() {
      current = null;
    },
    withTx() {
      return storage;
    },
  };
  return {
    storage,
    get reads() {
      return reads;
    },
    get writes() {
      return writes;
    },
    get current() {
      return current;
    },
  };
}

function makeFetchOk(token: string, expiresInSeconds: number) {
  let calls = 0;
  const fetchImpl = (async (_input: unknown, _init?: RequestInit) => {
    calls += 1;
    return new Response(
      JSON.stringify({
        access_token: token,
        expires_in: expiresInSeconds,
        token_type: 'bearer',
      }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    );
  }) as unknown as typeof fetch;
  return {
    fetchImpl,
    get calls() {
      return calls;
    },
  };
}

const NOW = new Date('2026-01-01T00:00:00Z');
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

describe('IgdbTokenStore', () => {
  it('fetches and persists a token on first call', async () => {
    const fakeStorage = makeFakeStorage();
    const fetcher = makeFetchOk('access-1', 5_000_000);
    const store = new IgdbTokenStore({
      storage: fakeStorage.storage,
      clientId: 'cid',
      clientSecret: 'sec',
      fetchImpl: fetcher.fetchImpl,
      now: () => NOW,
    });

    const token = await store.getValidToken();
    expect(token).toBe('access-1');
    expect(fetcher.calls).toBe(1);
    expect(fakeStorage.writes).toBe(1);
    expect(fakeStorage.current?.accessToken).toBe('access-1');
  });

  it('returns the cached token when valid (expires > 1 day away) without fetching', async () => {
    const valid: StoredIntegrationToken = {
      accessToken: 'cached',
      expiresAt: new Date(NOW.getTime() + 10 * ONE_DAY_MS),
      obtainedAt: new Date(NOW.getTime() - ONE_DAY_MS),
    };
    const fakeStorage = makeFakeStorage({ initial: valid });
    const fetcher = makeFetchOk('should-not-fetch', 5_000_000);
    const store = new IgdbTokenStore({
      storage: fakeStorage.storage,
      clientId: 'cid',
      clientSecret: 'sec',
      fetchImpl: fetcher.fetchImpl,
      now: () => NOW,
    });

    const token = await store.getValidToken();
    expect(token).toBe('cached');
    expect(fetcher.calls).toBe(0);
  });

  it('refreshes when the cached token expires in less than 1 day', async () => {
    const expiringSoon: StoredIntegrationToken = {
      accessToken: 'stale',
      expiresAt: new Date(NOW.getTime() + 30 * 60 * 1000), // 30 min away
      obtainedAt: new Date(NOW.getTime() - 30 * ONE_DAY_MS),
    };
    const fakeStorage = makeFakeStorage({ initial: expiringSoon });
    const fetcher = makeFetchOk('fresh', 5_000_000);
    const store = new IgdbTokenStore({
      storage: fakeStorage.storage,
      clientId: 'cid',
      clientSecret: 'sec',
      fetchImpl: fetcher.fetchImpl,
      now: () => NOW,
    });

    const token = await store.getValidToken();
    expect(token).toBe('fresh');
    expect(fetcher.calls).toBe(1);
    expect(fakeStorage.current?.accessToken).toBe('fresh');
  });

  it('throws when Twitch returns 401', async () => {
    const fakeStorage = makeFakeStorage();
    const fetchImpl = (async () =>
      new Response(JSON.stringify({ status: 401, message: 'invalid client' }), {
        status: 401,
      })) as unknown as typeof fetch;
    const store = new IgdbTokenStore({
      storage: fakeStorage.storage,
      clientId: 'cid',
      clientSecret: 'sec',
      fetchImpl,
      now: () => NOW,
    });

    await expect(store.getValidToken()).rejects.toThrow();
  });

  it('single-flight: concurrent callers share a single fetch', async () => {
    const fakeStorage = makeFakeStorage();
    let calls = 0;
    const deferred = createDeferred<Response>();
    const fetchImpl = (async () => {
      calls += 1;
      return deferred.promise;
    }) as unknown as typeof fetch;

    const store = new IgdbTokenStore({
      storage: fakeStorage.storage,
      clientId: 'cid',
      clientSecret: 'sec',
      fetchImpl,
      now: () => NOW,
    });

    const a = store.getValidToken();
    const b = store.getValidToken();
    // give microtasks a chance to register
    await Promise.resolve();
    expect(calls).toBe(1);

    deferred.resolve(
      new Response(
        JSON.stringify({ access_token: 'shared', expires_in: 5_000_000, token_type: 'bearer' }),
        { status: 200 },
      ),
    );

    const [ra, rb] = await Promise.all([a, b]);
    expect(ra).toBe('shared');
    expect(rb).toBe('shared');
    expect(calls).toBe(1);
    expect(fakeStorage.writes).toBe(1);
  });

  it('persist order: DB write error rejects inflight and does not poison memo', async () => {
    // Storage that fails the first write, then recovers. If the store
    // populated its in-memory memo BEFORE the DB write succeeded, the second
    // call would skip the fetch — proving memo poisoning. We assert that
    // doesn't happen by checking the fetch count after recovery.
    let current: StoredIntegrationToken | null = null;
    let writes = 0;
    let failNext = true;
    const recoverable: IntegrationTokenStorage = {
      async read() {
        return current;
      },
      async write(record) {
        writes += 1;
        if (failNext) {
          failNext = false;
          throw new Error('transient');
        }
        current = record;
      },
      async clear() {
        current = null;
      },
      withTx() {
        return recoverable;
      },
    };
    const fetcher = makeFetchOk('eventual', 5_000_000);
    const store = new IgdbTokenStore({
      storage: recoverable,
      clientId: 'cid',
      clientSecret: 'sec',
      fetchImpl: fetcher.fetchImpl,
      now: () => NOW,
    });

    await expect(store.getValidToken()).rejects.toThrow(/transient/);
    const token = await store.getValidToken();
    expect(token).toBe('eventual');
    // Two fetches happened — confirming the failed write did not leave the memo populated.
    expect(fetcher.calls).toBe(2);
    expect(writes).toBe(2);
  });

  it('forceRefresh fetches a new token even when current one is fresh', async () => {
    const valid: StoredIntegrationToken = {
      accessToken: 'old',
      expiresAt: new Date(NOW.getTime() + 10 * ONE_DAY_MS),
      obtainedAt: new Date(NOW.getTime() - ONE_DAY_MS),
    };
    const fakeStorage = makeFakeStorage({ initial: valid });
    const fetcher = makeFetchOk('new', 5_000_000);
    const store = new IgdbTokenStore({
      storage: fakeStorage.storage,
      clientId: 'cid',
      clientSecret: 'sec',
      fetchImpl: fetcher.fetchImpl,
      now: () => NOW,
    });

    const token = await store.forceRefresh();
    expect(token).toBe('new');
    expect(fetcher.calls).toBe(1);
    expect(fakeStorage.current?.accessToken).toBe('new');
  });
});
