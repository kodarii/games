import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { CleanupOrphans } from './application/cover-storage/cleanup-orphans';
import { auth } from './infrastructure/auth/auth';
import { attachProblemJsonErrorHandler } from './routes/_problem-json';
import { developers } from './routes/developers';
import { exportRoute } from './routes/export';
import { games } from './routes/games';
import { genres } from './routes/genres';
import { importRoute } from './routes/import';
import { me } from './routes/me';
import { type AuthVariables, requireAuth } from './routes/middleware/require-auth';
import { requireUploadPermission } from './routes/middleware/require-upload-permission';
import { platforms } from './routes/platforms';
import { createUploadRoute } from './routes/upload';
import { coverStorage, gameRepository } from './wiring';

const app = new Hono<{ Variables: AuthVariables }>();

attachProblemJsonErrorHandler(app);

app.use('*', logger());

app.use(
  '/api/*',
  cors({
    origin: 'http://localhost:5173',
    credentials: true,
    allowHeaders: ['Content-Type', 'Authorization'],
    allowMethods: ['POST', 'GET', 'OPTIONS', 'PUT', 'DELETE'],
    exposeHeaders: ['Content-Length'],
    maxAge: 600,
  }),
);

app.get('/', (c) => c.json({ name: 'apex-api', status: 'ok' }));
app.get('/api/health', (c) => c.json({ status: 'ok' }));

app.on(['POST', 'GET'], '/api/auth/**', (c) => auth.handler(c.req.raw));

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
app.route('/api/upload', createUploadRoute(coverStorage));

const port = Number(process.env.PORT ?? 3001);

export default {
  port,
  fetch: app.fetch,
};

console.log(`apex-api listening on http://localhost:${port}`);

const cleanup = new CleanupOrphans(coverStorage, gameRepository);

const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const cleanupTimer = setInterval(async () => {
  try {
    const result = await cleanup.run();
    console.log('[cleanup-orphans]', result);
  } catch (err) {
    console.error('[cleanup-orphans] failed', err);
  }
}, ONE_DAY_MS);

const shutdown = () => {
  clearInterval(cleanupTimer);
  process.exit(0);
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
