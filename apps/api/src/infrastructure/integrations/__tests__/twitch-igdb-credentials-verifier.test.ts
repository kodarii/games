import { describe, expect, it } from 'bun:test';
import type { LogFields, Logger } from '../../logging/logger';
import { TwitchIgdbCredentialsVerifier } from '../twitch-igdb-credentials-verifier';

type FetchResponse = Response | (() => Promise<Response>) | Error;

interface RecordedCall {
  url: string;
  init: RequestInit;
}

function makeFakeFetch(responses: FetchResponse[], calls: RecordedCall[] = []): typeof fetch {
  let i = 0;
  return (async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
    calls.push({ url: typeof input === 'string' ? input : String(input), init: init ?? {} });
    const r = responses[i++];
    if (r instanceof Error) throw r;
    if (typeof r === 'function') return r();
    if (r === undefined) throw new Error('fake fetch: no response queued');
    return r;
  }) as typeof fetch;
}

interface LoggedEvent {
  name: string;
  fields: LogFields;
}

function makeRecordingLogger(): { logger: Logger; events: LoggedEvent[] } {
  const events: LoggedEvent[] = [];
  const logger: Logger = {
    level: 'info',
    child: () => logger,
    event: (name: string, fields: LogFields = {}) => {
      events.push({ name, fields });
    },
    debug: () => {},
    info: () => {},
    warn: () => {},
    error: () => {},
  };
  return { logger, events };
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

const VALID_TOKEN_BODY = {
  access_token: 'tok_abc',
  expires_in: 3600,
  token_type: 'bearer',
};

describe('TwitchIgdbCredentialsVerifier', () => {
  it('returns ok when Twitch responds 200 with a valid token body', async () => {
    const calls: RecordedCall[] = [];
    const fakeFetch = makeFakeFetch([jsonResponse(200, VALID_TOKEN_BODY)], calls);
    const { logger, events } = makeRecordingLogger();
    const verifier = new TwitchIgdbCredentialsVerifier({
      fetch: fakeFetch,
      timeoutMs: 5000,
      logger,
    });

    const result = await verifier.verify({ clientId: 'cid', clientSecret: 'sec' });

    expect(result.ok).toBe(true);
    expect(events.find((e) => e.name === 'integration.igdb.verify.success')).toBeDefined();
  });

  it('returns invalid_credentials/client_id on 400 with "invalid client" body', async () => {
    const calls: RecordedCall[] = [];
    const fakeFetch = makeFakeFetch(
      [
        new Response(JSON.stringify({ status: 400, message: 'invalid client' }), {
          status: 400,
          headers: { 'content-type': 'application/json' },
        }),
      ],
      calls,
    );
    const { logger, events } = makeRecordingLogger();
    const verifier = new TwitchIgdbCredentialsVerifier({
      fetch: fakeFetch,
      timeoutMs: 5000,
      logger,
    });

    const result = await verifier.verify({ clientId: 'cid', clientSecret: 'sec' });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe('invalid_credentials');
      if (result.error.kind === 'invalid_credentials') {
        expect(result.error.reason).toBe('client_id');
      }
    }
    expect(events.find((e) => e.name === 'integration.igdb.verify.invalid')?.fields.reason).toBe(
      'client_id',
    );
  });

  it('returns invalid_credentials/client_secret on 403 with "invalid client secret" body', async () => {
    const fakeFetch = makeFakeFetch([
      new Response(JSON.stringify({ status: 403, message: 'invalid client secret' }), {
        status: 403,
        headers: { 'content-type': 'application/json' },
      }),
    ]);
    const { logger, events } = makeRecordingLogger();
    const verifier = new TwitchIgdbCredentialsVerifier({
      fetch: fakeFetch,
      timeoutMs: 5000,
      logger,
    });

    const result = await verifier.verify({ clientId: 'cid', clientSecret: 'sec' });

    expect(result.ok).toBe(false);
    if (!result.ok && result.error.kind === 'invalid_credentials') {
      expect(result.error.reason).toBe('client_secret');
    } else {
      throw new Error('expected invalid_credentials/client_secret');
    }
    expect(events.find((e) => e.name === 'integration.igdb.verify.invalid')?.fields.reason).toBe(
      'client_secret',
    );
  });

  it('returns invalid_credentials/unknown on bare 401', async () => {
    const fakeFetch = makeFakeFetch([new Response('', { status: 401 })]);
    const { logger } = makeRecordingLogger();
    const verifier = new TwitchIgdbCredentialsVerifier({
      fetch: fakeFetch,
      timeoutMs: 5000,
      logger,
    });

    const result = await verifier.verify({ clientId: 'cid', clientSecret: 'sec' });

    expect(result.ok).toBe(false);
    if (!result.ok && result.error.kind === 'invalid_credentials') {
      expect(result.error.reason).toBe('unknown');
    } else {
      throw new Error('expected invalid_credentials/unknown');
    }
  });

  it('returns twitch_unavailable on 500', async () => {
    const fakeFetch = makeFakeFetch([new Response('boom', { status: 500 })]);
    const { logger, events } = makeRecordingLogger();
    const verifier = new TwitchIgdbCredentialsVerifier({
      fetch: fakeFetch,
      timeoutMs: 5000,
      logger,
    });

    const result = await verifier.verify({ clientId: 'cid', clientSecret: 'sec' });

    expect(result.ok).toBe(false);
    if (!result.ok && result.error.kind === 'twitch_unavailable') {
      expect(result.error.status).toBe(500);
    } else {
      throw new Error('expected twitch_unavailable/500');
    }
    expect(
      events.find((e) => e.name === 'integration.igdb.verify.unavailable')?.fields.status,
    ).toBe(500);
  });

  it('returns network_unreachable/timeout when fetch throws AbortError', async () => {
    const abortErr = new Error('aborted');
    abortErr.name = 'AbortError';
    const fakeFetch = makeFakeFetch([abortErr]);
    const { logger, events } = makeRecordingLogger();
    const verifier = new TwitchIgdbCredentialsVerifier({
      fetch: fakeFetch,
      timeoutMs: 5000,
      logger,
    });

    const result = await verifier.verify({ clientId: 'cid', clientSecret: 'sec' });

    expect(result.ok).toBe(false);
    if (!result.ok && result.error.kind === 'network_unreachable') {
      expect(result.error.reason).toBe('timeout');
    } else {
      throw new Error('expected network_unreachable/timeout');
    }
    expect(
      events.find((e) => e.name === 'integration.igdb.verify.unavailable')?.fields.reason,
    ).toBe('timeout');
  });

  it('returns network_unreachable/fetch_failed when fetch throws a generic Error', async () => {
    const fakeFetch = makeFakeFetch([new Error('econnrefused')]);
    const { logger } = makeRecordingLogger();
    const verifier = new TwitchIgdbCredentialsVerifier({
      fetch: fakeFetch,
      timeoutMs: 5000,
      logger,
    });

    const result = await verifier.verify({ clientId: 'cid', clientSecret: 'sec' });

    expect(result.ok).toBe(false);
    if (!result.ok && result.error.kind === 'network_unreachable') {
      expect(result.error.reason).toBe('fetch_failed');
    } else {
      throw new Error('expected network_unreachable/fetch_failed');
    }
  });

  it('sends client_id, client_secret, and grant_type=client_credentials as form-encoded body', async () => {
    const calls: RecordedCall[] = [];
    const fakeFetch = makeFakeFetch([jsonResponse(200, VALID_TOKEN_BODY)], calls);
    const { logger } = makeRecordingLogger();
    const verifier = new TwitchIgdbCredentialsVerifier({
      fetch: fakeFetch,
      timeoutMs: 5000,
      logger,
    });

    await verifier.verify({ clientId: 'my-cid', clientSecret: 'my-sec' });

    expect(calls).toHaveLength(1);
    const recorded = calls[0];
    expect(recorded).toBeDefined();
    const body = String(recorded?.init.body ?? '');
    const parsed = new URLSearchParams(body);
    expect(parsed.get('client_id')).toBe('my-cid');
    expect(parsed.get('client_secret')).toBe('my-sec');
    expect(parsed.get('grant_type')).toBe('client_credentials');
  });

  it('POSTs to https://id.twitch.tv/oauth2/token', async () => {
    const calls: RecordedCall[] = [];
    const fakeFetch = makeFakeFetch([jsonResponse(200, VALID_TOKEN_BODY)], calls);
    const { logger } = makeRecordingLogger();
    const verifier = new TwitchIgdbCredentialsVerifier({
      fetch: fakeFetch,
      timeoutMs: 5000,
      logger,
    });

    await verifier.verify({ clientId: 'a', clientSecret: 'b' });

    expect(calls[0]?.url).toBe('https://id.twitch.tv/oauth2/token');
    expect(calls[0]?.init.method).toBe('POST');
  });

  it('sets Content-Type: application/x-www-form-urlencoded', async () => {
    const calls: RecordedCall[] = [];
    const fakeFetch = makeFakeFetch([jsonResponse(200, VALID_TOKEN_BODY)], calls);
    const { logger } = makeRecordingLogger();
    const verifier = new TwitchIgdbCredentialsVerifier({
      fetch: fakeFetch,
      timeoutMs: 5000,
      logger,
    });

    await verifier.verify({ clientId: 'a', clientSecret: 'b' });

    const headers = calls[0]?.init.headers;
    const contentType =
      headers instanceof Headers
        ? headers.get('content-type')
        : Array.isArray(headers)
          ? headers.find(([k]) => k.toLowerCase() === 'content-type')?.[1]
          : ((headers as Record<string, string> | undefined)?.['Content-Type'] ??
            (headers as Record<string, string> | undefined)?.['content-type']);
    expect(contentType).toBe('application/x-www-form-urlencoded');
  });

  it('returns ok even when 200 body is malformed JSON (body is ignored on success)', async () => {
    const fakeFetch = makeFakeFetch([
      new Response('not-json-at-all', {
        status: 200,
        headers: { 'content-type': 'text/plain' },
      }),
    ]);
    const { logger } = makeRecordingLogger();
    const verifier = new TwitchIgdbCredentialsVerifier({
      fetch: fakeFetch,
      timeoutMs: 5000,
      logger,
    });

    const result = await verifier.verify({ clientId: 'a', clientSecret: 'b' });

    expect(result.ok).toBe(true);
  });

  it('does not log the clientId or secret on success/invalid/unavailable', async () => {
    const calls: RecordedCall[] = [];
    const fakeFetch = makeFakeFetch(
      [
        jsonResponse(200, VALID_TOKEN_BODY),
        new Response('invalid client', { status: 400 }),
        new Response('boom', { status: 502 }),
      ],
      calls,
    );
    const { logger, events } = makeRecordingLogger();
    const verifier = new TwitchIgdbCredentialsVerifier({
      fetch: fakeFetch,
      timeoutMs: 5000,
      logger,
    });

    await verifier.verify({ clientId: 'super-secret-id', clientSecret: 'super-secret-key' });
    await verifier.verify({ clientId: 'super-secret-id', clientSecret: 'super-secret-key' });
    await verifier.verify({ clientId: 'super-secret-id', clientSecret: 'super-secret-key' });

    const serialized = JSON.stringify(events);
    expect(serialized.includes('super-secret-id')).toBe(false);
    expect(serialized.includes('super-secret-key')).toBe(false);
  });
});
