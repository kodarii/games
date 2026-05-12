import { Hono } from 'hono';
import { exportData } from '../wiring';
import type { AuthVariables } from './middleware/require-auth';

export const exportRoute = new Hono<{ Variables: AuthVariables }>();

exportRoute.get('/', async (c) => {
  const userId = c.get('user').id;
  const snapshot = await exportData.execute(userId);
  const date = snapshot.exportedAt.slice(0, 10);
  c.header('Content-Type', 'application/json; charset=utf-8');
  c.header('Content-Disposition', `attachment; filename="apex-export-${date}.json"`);
  return c.body(JSON.stringify(snapshot, null, 2));
});
