import { createHash } from 'node:crypto';
import type { MiddlewareHandler } from 'hono';
import type { IdempotencyKeyRepository } from '../../application/idempotency/idempotency-key-repository';
import type { AuthVariables } from './require-auth';

/**
 * Idempotency-Key header validation. RFC draft + Stripe convention: a
 * client-generated opaque string between 16 and 128 chars from a safe URL
 * alphabet. UUID v4 (36 chars) fits comfortably.
 */
const KEY_REGEX = /^[A-Za-z0-9_-]{16,128}$/;

export interface IdempotencyKeyMiddlewareOptions {
  readonly repo: IdempotencyKeyRepository;
  /** Override the clock so tests get deterministic `createdAt` values. */
  readonly now?: () => number;
}

interface CachedResponse {
  status: number;
  body: string;
}

function hashRequest(method: string, path: string, body: string): string {
  return createHash('sha256').update(`${method}\n${path}\n${body}`).digest('hex');
}

function invalidKeyProblem(detail: string): unknown {
  return {
    type: '/errors/idempotency-key-invalid',
    title: 'Invalid Idempotency-Key',
    status: 400,
    detail,
  };
}

function conflictProblem(): unknown {
  return {
    type: '/errors/idempotency-key-conflict',
    title: 'Idempotency-Key conflict',
    status: 409,
    detail: 'This Idempotency-Key was already used with a different request body',
  };
}

/**
 * Idempotency-Key middleware.
 *
 * - Without a header: pass-through, no caching. Lets legacy clients keep working.
 * - With a malformed header: 400 problem+json, handler not invoked.
 * - With a known `(key, userId)` whose stored `request_hash` matches the
 *   current request: replay the cached 2xx response verbatim, skip the handler.
 * - With a known `(key, userId)` but a different hash: 409 conflict
 *   (`/errors/idempotency-key-conflict`) — protects against accidental reuse.
 * - Otherwise: invoke the handler, then on a 2xx persist `(status, body, hash)`
 *   for subsequent retries. 4xx and 5xx are NOT cached — failures must stay
 *   retryable, and validation errors are cheap to recompute.
 *
 * The body capture uses `c.res.clone().text()` so the original response stream
 * remains intact for the client.
 */
export function idempotencyKey(
  options: IdempotencyKeyMiddlewareOptions,
): MiddlewareHandler<{ Variables: AuthVariables }> {
  const { repo } = options;
  const now = options.now ?? (() => Date.now());

  return async (c, next) => {
    const key = c.req.header('idempotency-key');
    if (key === undefined) {
      await next();
      return;
    }

    if (!KEY_REGEX.test(key)) {
      return c.json(invalidKeyProblem('Header must match ^[A-Za-z0-9_-]{16,128}$'), 400);
    }

    const userId = c.get('user').id;

    // Snapshot the request body BEFORE the handler consumes it. `c.req.text()`
    // is safe to call multiple times in Hono — the body buffer is cached on
    // the request object after the first read. FormData / non-JSON bodies are
    // captured as their raw byte representation via Web Streams.
    const rawBody = await c.req.raw.clone().text();
    const requestHash = hashRequest(c.req.method, c.req.path, rawBody);

    const cached = await repo.find(key, userId);
    if (cached) {
      if (cached.requestHash !== requestHash) {
        return c.json(conflictProblem(), 409);
      }
      return new Response(cached.responseBody, {
        status: cached.status,
        headers: { 'content-type': 'application/json; charset=UTF-8' },
      });
    }

    await next();

    const captured = await captureResponse(c.res);
    if (captured.status >= 200 && captured.status < 300) {
      await repo.save({
        key,
        userId,
        requestHash,
        status: captured.status,
        responseBody: captured.body,
        createdAt: now(),
      });
    }
  };
}

async function captureResponse(res: Response): Promise<CachedResponse> {
  // Cloning is mandatory — reading the body consumes the stream, and the
  // original response still has to be sent to the client.
  const cloned = res.clone();
  const body = await cloned.text();
  return { status: res.status, body };
}
