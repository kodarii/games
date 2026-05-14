import type { MiddlewareHandler } from 'hono';
import type { Logger } from '../../infrastructure/logging/logger';
import { problemResponse } from '../_problem-json';

const MUTATING_METHODS = new Set(['POST', 'PATCH', 'PUT', 'DELETE']);

/**
 * Origin-allowlist CSRF guard.
 *
 * Mutating requests must carry an `Origin` header that exactly matches one of
 * the configured CORS allowlist entries. Reads (`GET`, `HEAD`, `OPTIONS`) are
 * NOT checked — they cannot mutate state, and CORS already gates the
 * cross-origin cookie envelope on the browser side.
 */
export function originGuard(allowedOrigins: ReadonlySet<string>): MiddlewareHandler {
  return async (c, next) => {
    if (!MUTATING_METHODS.has(c.req.method)) {
      return next();
    }
    const origin = c.req.header('origin');
    if (!origin || !allowedOrigins.has(origin)) {
      const logger = c.get('logger') as Logger | undefined;
      logger?.event('csrf.rejected', {
        origin: origin ?? null,
        path: c.req.path,
        method: c.req.method,
      });
      return problemResponse(c, {
        type: '/errors/csrf-rejected',
        title: 'Forbidden',
        status: 403,
        detail: 'Origin header missing or not allowlisted',
      });
    }
    return next();
  };
}
