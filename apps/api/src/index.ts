import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { auth } from './infrastructure/auth/auth';
import { games } from './routes/games';
import { type AuthVariables, requireAuth } from './routes/middleware/require-auth';

const app = new Hono<{ Variables: AuthVariables }>();

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

const port = Number(process.env.PORT ?? 3001);

export default {
  port,
  fetch: app.fetch,
};

console.log(`apex-api listening on http://localhost:${port}`);
