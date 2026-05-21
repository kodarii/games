import type { MiddlewareHandler } from 'hono';
import type { RateLimitBucketRepository } from '../../domain/rate-limit/rate-limit-bucket-repository';
import { problemResponse } from '../../routes/_problem-json';
import type { AuthVariables } from '../../routes/middleware/require-auth';
import type { Logger } from '../logging/logger';

const MUTATING_METHODS = new Set(['POST', 'PATCH', 'PUT', 'DELETE']);
const WINDOW_MS = 60_000;
const DEFAULT_LIMIT = 60;

export interface MutationRateLimitDeps {
  readonly repo: RateLimitBucketRepository;
  readonly now: () => number;
  readonly limit?: number;
}

/**
 * Per-user fixed-window mutation rate limit.
 *
 * Persists counters via `RateLimitBucketRepository.increment`. The adapter
 * uses an atomic UPSERT so the post-increment count is correct under
 * concurrent writers in the same window.
 *
 * Reads (`GET`/`HEAD`/`OPTIONS`) are not counted. `requireAuth` MUST run
 * before this middleware so `c.get('user')` is populated; if not, we fail
 * closed (429) — never silently allow.
 */
export function mutationRateLimit(deps: MutationRateLimitDeps): MiddlewareHandler<{
  Variables: AuthVariables;
}> {
  const limit = deps.limit ?? DEFAULT_LIMIT;
  return async (c, next) => {
    if (!MUTATING_METHODS.has(c.req.method)) {
      return next();
    }
    const user = c.get('user') as { id: string } | undefined;
    if (!user) {
      return problemResponse(c, {
        type: '/errors/rate-limited',
        title: 'Too Many Requests',
        status: 429,
        detail: 'Rate limit could not resolve user',
      });
    }
    const nowMs = deps.now();
    const windowStart = Math.floor(nowMs / WINDOW_MS) * WINDOW_MS;
    const logger = c.get('logger') as Logger | undefined;

    let currentCount: number;
    try {
      currentCount = await deps.repo.increment(user.id, windowStart);
    } catch (err) {
      // Fail-closed: if the limiter store is unavailable we reject rather than
      // silently allowing unbounded mutations.
      logger?.error({
        event: 'rate_limit.db_error',
        userId: user.id,
        err: err instanceof Error ? err : new Error(String(err)),
      });
      const retryAfterSeconds = Math.ceil((windowStart + WINDOW_MS - nowMs) / 1000);
      c.header('Retry-After', String(retryAfterSeconds));
      return problemResponse(c, {
        type: '/errors/rate-limited',
        title: 'Too Many Requests',
        status: 429,
        detail: 'Rate limiter temporarily unavailable',
        retryAfterSeconds,
      });
    }

    if (currentCount > limit) {
      const retryAfterSeconds = Math.ceil((windowStart + WINDOW_MS - nowMs) / 1000);
      logger?.event('rate_limit.rejected', {
        userId: user.id,
        count: currentCount,
        limit,
        windowStart,
        path: c.req.path,
        method: c.req.method,
      });
      c.header('Retry-After', String(retryAfterSeconds));
      return problemResponse(c, {
        type: '/errors/rate-limited',
        title: 'Too Many Requests',
        status: 429,
        detail: `Mutation rate limit exceeded (${limit}/min)`,
        retryAfterSeconds,
      });
    }
    return next();
  };
}
