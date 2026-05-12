import type { MiddlewareHandler } from 'hono';
import { type Logger, baseLogger as defaultBaseLogger } from './logger';

export interface RequestContextVariables {
  logger: Logger;
  requestId: string;
}

export interface RequestContextOptions {
  /** Override the process-level logger (tests inject a captured-sink logger). */
  readonly baseLogger?: Logger;
  /** Override id generation (tests use a deterministic generator). */
  readonly generateId?: () => string;
}

const SAFE_REQUEST_ID = /^[A-Za-z0-9._-]{1,128}$/;

/**
 * Per-request context middleware.
 *
 * Generates a `requestId` (or accepts one via `X-Request-Id` when it matches a
 * conservative charset/length), attaches a child logger pre-bound with
 * `requestId`, exposes both as Hono context variables, and emits one
 * `http.request` record after the handler completes.
 *
 * Place this middleware after the error handler so the handler can still
 * access `c.get('logger')`.
 */
export function requestContext(
  options: RequestContextOptions = {},
): MiddlewareHandler<{ Variables: RequestContextVariables }> {
  const base = options.baseLogger ?? defaultBaseLogger;
  const generate = options.generateId ?? (() => crypto.randomUUID());

  return async (c, next) => {
    const headerId = c.req.header('x-request-id');
    const requestId =
      headerId !== undefined && SAFE_REQUEST_ID.test(headerId) ? headerId : generate();

    const reqLogger = base.child({ requestId });
    c.set('logger', reqLogger);
    c.set('requestId', requestId);

    const startedAt = Date.now();
    await next();
    const durationMs = Date.now() - startedAt;

    // Re-read from context in case downstream replaced the logger (e.g.
    // requireAuth swaps in a userId-bound child).
    c.get('logger').event('http.request', {
      method: c.req.method,
      path: c.req.path,
      status: c.res.status,
      durationMs,
    });
  };
}
