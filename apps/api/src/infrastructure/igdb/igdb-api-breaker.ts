import type { Logger } from '../logging/logger';
import { CircuitBreaker } from './circuit-breaker';

/**
 * Build the global breaker that guards every call to `api.igdb.com`.
 *
 * The breaker is intentionally process-global: it observes failures of the
 * upstream *service*, not of any user's credentials. With N users, a per-user
 * breaker would each have to rediscover that IGDB is down; one shared breaker
 * trips faster and stays tripped for everyone until the upstream recovers.
 *
 * Returns a fresh instance — wire one once in `app.ts` and inject everywhere.
 */
export function createIgdbApiBreaker(logger: Logger): CircuitBreaker {
  return new CircuitBreaker({
    failureThreshold: 5,
    windowMs: 60_000,
    halfOpenAfterMs: 30_000,
    onStateChange: (next, prev) =>
      logger.event(next === 'open' ? 'igdb.breaker.open' : 'igdb.breaker.close', {
        host: 'api.igdb.com',
        from: prev,
        to: next,
      }),
  });
}
