import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { games } from './routes/games';

const app = new Hono();

app.use('*', logger());
app.use('/api/*', cors());

app.get('/', (c) => c.json({ name: 'apex-api', status: 'ok' }));
app.get('/api/health', (c) => c.json({ status: 'ok' }));

app.route('/api/games', games);

const port = Number(process.env.PORT ?? 3001);

export default {
  port,
  fetch: app.fetch,
};

console.log(`apex-api listening on http://localhost:${port}`);
