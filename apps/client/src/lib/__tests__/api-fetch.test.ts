import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { ApiError, apiFetch } from '../api-fetch';

type FetchInput = Parameters<typeof fetch>[0];
type FetchInit = Parameters<typeof fetch>[1];
type FetchCall = { input: FetchInput; init: FetchInit };

const originalFetch = globalThis.fetch;
let calls: FetchCall[] = [];

function installFetch(impl: (input: FetchInput, init: FetchInit) => Promise<Response>) {
  globalThis.fetch = ((input: FetchInput, init?: FetchInit) => {
    calls.push({ input, init });
    return impl(input, init);
  }) as typeof fetch;
}

beforeEach(() => {
  calls = [];
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe('apiFetch', () => {
  it('returns parsed JSON on 200', async () => {
    installFetch(
      async () =>
        new Response(JSON.stringify({ id: 1, name: 'pad' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
    );

    const result = await apiFetch<{ id: number; name: string }>('/api/things');

    expect(result).toEqual({ id: 1, name: 'pad' });
  });

  it('sends credentials: include by default', async () => {
    installFetch(async () => new Response('{}', { status: 200 }));

    await apiFetch('/api/things');

    expect(calls[0]?.init?.credentials).toBe('include');
  });

  it('serializes plain object body as JSON with Content-Type', async () => {
    installFetch(async () => new Response('{"ok":true}', { status: 200 }));

    await apiFetch('/api/things', { method: 'POST', body: { name: 'pad' } });

    const init = calls[0]?.init;
    expect(init?.method).toBe('POST');
    expect(init?.body).toBe(JSON.stringify({ name: 'pad' }));
    const headers = new Headers(init?.headers);
    expect(headers.get('Content-Type')).toBe('application/json');
  });

  it('does not set Content-Type when body is FormData', async () => {
    installFetch(async () => new Response('{"ok":true}', { status: 200 }));

    const fd = new FormData();
    fd.append('file', new Blob(['x']), 'x.txt');
    await apiFetch('/api/upload', { method: 'POST', body: fd });

    const init = calls[0]?.init;
    expect(init?.body).toBe(fd);
    const headers = new Headers(init?.headers);
    expect(headers.get('Content-Type')).toBeNull();
  });

  it('adds Idempotency-Key header when provided', async () => {
    installFetch(async () => new Response('{}', { status: 200 }));

    await apiFetch('/api/things', {
      method: 'POST',
      body: { x: 1 },
      idempotencyKey: 'abc-123',
    });

    const headers = new Headers(calls[0]?.init?.headers);
    expect(headers.get('Idempotency-Key')).toBe('abc-123');
  });

  it('throws ApiError carrying detail from problem+json on 400', async () => {
    const problem = {
      type: '/errors/validation',
      title: 'Invalid input',
      status: 400,
      detail: 'title: must not be empty',
    };
    installFetch(
      async () =>
        new Response(JSON.stringify(problem), {
          status: 400,
          headers: { 'Content-Type': 'application/problem+json' },
        }),
    );

    let caught: unknown;
    try {
      await apiFetch('/api/things', { method: 'POST', body: { x: 1 } });
    } catch (e) {
      caught = e;
    }

    expect(caught).toBeInstanceOf(ApiError);
    const err = caught as ApiError;
    expect(err.status).toBe(400);
    expect(err.message).toBe('title: must not be empty');
    expect(err.body).toEqual(problem);
  });

  it('falls back to legacy { error } shape when no detail/title', async () => {
    installFetch(
      async () => new Response(JSON.stringify({ error: 'payload_too_large' }), { status: 413 }),
    );

    let caught: unknown;
    try {
      await apiFetch('/api/import', { method: 'POST', body: {} });
    } catch (e) {
      caught = e;
    }

    const err = caught as ApiError;
    expect(err.status).toBe(413);
    expect(err.message).toBe('payload_too_large');
    expect((err.body as { error: string }).error).toBe('payload_too_large');
  });

  it('uses generic fallback message when body has no recognizable field', async () => {
    installFetch(async () => new Response('not json at all', { status: 500 }));

    let caught: unknown;
    try {
      await apiFetch('/api/things');
    } catch (e) {
      caught = e;
    }

    const err = caught as ApiError;
    expect(err.status).toBe(500);
    expect(err.message).toMatch(/500/);
  });

  it('wraps network errors with a readable message', async () => {
    installFetch(async () => {
      throw new TypeError('Failed to fetch');
    });

    let caught: unknown;
    try {
      await apiFetch('/api/things');
    } catch (e) {
      caught = e;
    }

    expect(caught).toBeInstanceOf(Error);
    expect((caught as Error).message.toLowerCase()).toContain('network');
  });

  it('returns Blob when responseType is "blob"', async () => {
    const blob = new Blob(['hello'], { type: 'text/plain' });
    installFetch(async () => new Response(blob, { status: 200 }));

    const result = await apiFetch<Blob>('/api/export', { responseType: 'blob' });

    expect(result).toBeInstanceOf(Blob);
  });

  it('returns the Response object when responseType is "response"', async () => {
    installFetch(async () => new Response('payload', { status: 200 }));

    const result = await apiFetch<Response>('/api/raw', { responseType: 'response' });

    expect(result).toBeInstanceOf(Response);
    expect(await (result as Response).text()).toBe('payload');
  });

  it('resolves undefined on 204 No Content', async () => {
    installFetch(async () => new Response(null, { status: 204 }));

    const result = await apiFetch<void>('/api/something', { method: 'DELETE' });

    expect(result).toBeUndefined();
  });
});
