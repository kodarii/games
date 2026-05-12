import { Hono } from 'hono';

export type DbHealthCheck = () => Promise<void>;

/**
 * Builds `/live` and `/ready` endpoints for k8s probes.
 *
 * - `GET /live` — always 200; the process is up and accepting connections.
 *   Used as `livenessProbe`. Failing this restarts the pod.
 * - `GET /ready` — runs `checkDb` (a `SELECT 1`-equivalent). 200 when the
 *   probe succeeds, 503 otherwise. Used as `readinessProbe`; failing pulls
 *   the pod out of the service so traffic stops being routed to it.
 *
 * Both endpoints are unauthenticated and CORS-less — they are called by the
 * orchestrator, not by browsers.
 */
export function createHealthRouter(checkDb: DbHealthCheck): Hono {
  const router = new Hono();

  router.get('/live', (c) => c.json({ status: 'ok' }));

  router.get('/ready', async (c) => {
    try {
      await checkDb();
      return c.json({ status: 'ready', checks: { db: 'ok' } }, 200);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return c.json({ status: 'not_ready', checks: { db: 'error', error: message } }, 503);
    }
  });

  return router;
}
