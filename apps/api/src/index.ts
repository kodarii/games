import { sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { auth } from './infrastructure/auth/auth';
import { env } from './infrastructure/config/env';
import { db, sqlite } from './infrastructure/db/client';
import { baseLogger } from './infrastructure/logging/logger';
import { requestContext } from './infrastructure/logging/request-context-middleware';
import { attachProblemJsonErrorHandler } from './routes/_problem-json';
import { developers } from './routes/developers';
import { exportRoute } from './routes/export';
import { games } from './routes/games';
import { genres } from './routes/genres';
import { createHealthRouter } from './routes/health';
import { importRoute } from './routes/import';
import { me } from './routes/me';
import { type AuthVariables, requireAuth } from './routes/middleware/require-auth';
import { requireUploadPermission } from './routes/middleware/require-upload-permission';
import { platforms } from './routes/platforms';
import { createUploadRoute } from './routes/upload';
import { cleanupOrphans, coverStorage, idempotencyKeyMiddleware } from './wiring';

const app = new Hono<{ Variables: AuthVariables }>();

attachProblemJsonErrorHandler(app);

// Health probes must answer without auth, CORS, or request-context overhead.
// Mount BEFORE the CORS middleware below so k8s probes never get rejected on
// origin checks.
app.route(
  '/health',
  createHealthRouter(async () => {
    await db.run(sql`SELECT 1`);
  }),
);

app.use('*', requestContext());

const corsAllowlist = new Set(env.CORS_ORIGIN);

app.use(
  '/api/*',
  cors({
    origin: (origin) => (corsAllowlist.has(origin) ? origin : null),
    credentials: true,
    allowHeaders: ['Content-Type'],
    allowMethods: ['POST', 'GET', 'OPTIONS', 'PUT', 'DELETE'],
    exposeHeaders: ['Content-Length'],
    maxAge: 600,
  }),
);

app.get('/', (c) => c.json({ name: 'apex-api', status: 'ok' }));

app.on(['POST', 'GET'], '/api/auth/*', (c) => auth.handler(c.req.raw));

app.use('/api/games/*', requireAuth);
app.route('/api/games', games);

app.use('/api/platforms/*', requireAuth);
app.route('/api/platforms', platforms);

app.use('/api/genres/*', requireAuth);
app.route('/api/genres', genres);

app.use('/api/developers/*', requireAuth);
app.route('/api/developers', developers);

app.use('/api/export/*', requireAuth);
app.route('/api/export', exportRoute);

app.use('/api/import/*', requireAuth);
app.route('/api/import', importRoute);

app.use('/api/me/*', requireAuth);
app.route('/api/me', me);

app.use('/api/upload/*', requireAuth);
app.use('/api/upload/*', requireUploadPermission);
app.route('/api/upload', createUploadRoute(coverStorage, idempotencyKeyMiddleware));

const port = Number(process.env.PORT ?? 3001);

const server = Bun.serve({
  port,
  fetch: app.fetch,
});

baseLogger.event('api.listening', { port, url: `http://localhost:${port}` });

// --- Cron: orphan cover cleanup ------------------------------------------
// Interval shortened from 24h to 1h. The CronLock ensures only one instance
// in a horizontally-scaled deployment runs the sweep per TTL window;
// competing instances log `cleanup.orphans.skipped` and move on.
const ONE_HOUR_MS = 60 * 60 * 1000;
const cleanupTimer = setInterval(async () => {
  try {
    const result = await cleanupOrphans.run();
    if (result.status === 'skipped') {
      baseLogger.event('cleanup.orphans.skipped', { reason: result.reason });
    } else {
      baseLogger.event('cleanup.orphans.completed', {
        listed: result.listed,
        inDb: result.inDb,
        orphans: result.orphans,
        deleted: result.deleted,
        failed: result.failed,
        idempotencyKeysDeleted: result.idempotencyKeysDeleted,
      });
      if (result.idempotencyKeysDeleted > 0) {
        baseLogger.event('idempotency.cleanup.done', {
          deleted: result.idempotencyKeysDeleted,
        });
      }
    }
  } catch (err) {
    baseLogger.error({
      event: 'cleanup.orphans.failed',
      err: err instanceof Error ? err : new Error(String(err)),
    });
  }
}, ONE_HOUR_MS);

// --- Graceful shutdown ----------------------------------------------------
let shuttingDown = false;

async function shutdown(signal: NodeJS.Signals): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;

  baseLogger.event('shutdown.start', { signal });
  clearInterval(cleanupTimer);

  // Stop accepting new connections; existing in-flight requests finish.
  // We bound the wait at SHUTDOWN_DRAIN_MS so k8s SIGKILL (default 30s after
  // SIGTERM) never finds us still draining.
  const drained = new Promise<'drained'>((resolve) => {
    void server.stop(false).then(() => resolve('drained'));
  });
  const timedOut = new Promise<'timeout'>((resolve) => {
    setTimeout(() => resolve('timeout'), env.SHUTDOWN_DRAIN_MS).unref();
  });
  const outcome = await Promise.race([drained, timedOut]);

  if (outcome === 'timeout') {
    baseLogger.event('shutdown.drain.timeout', { drainMs: env.SHUTDOWN_DRAIN_MS });
    // Force-close any remaining sockets — best effort.
    await server.stop(true);
  } else {
    baseLogger.event('shutdown.drain.complete', {});
  }

  try {
    sqlite.close();
    baseLogger.event('shutdown.db.closed', {});
  } catch (err) {
    baseLogger.error({
      event: 'shutdown.db.close_failed',
      err: err instanceof Error ? err : new Error(String(err)),
    });
  }

  baseLogger.event('shutdown.done', { signal });
  process.exit(0);
}

process.on('SIGTERM', () => {
  void shutdown('SIGTERM');
});
process.on('SIGINT', () => {
  void shutdown('SIGINT');
});
