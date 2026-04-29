import { Hono } from 'hono';
import { ExportData } from '../application/export/export-data';
import { DrizzleGameRepository } from '../infrastructure/games/drizzle-game-repository';
import { DrizzlePlatformRepository } from '../infrastructure/platforms/drizzle-platform-repository';
import type { AuthVariables } from './middleware/require-auth';

const gameRepo = new DrizzleGameRepository();
const platformRepo = new DrizzlePlatformRepository();
const exportData = new ExportData(gameRepo, platformRepo);

export const exportRoute = new Hono<{ Variables: AuthVariables }>();

exportRoute.get('/', async (c) => {
  const userId = c.get('user').id;
  const snapshot = await exportData.execute(userId);
  const date = snapshot.exportedAt.slice(0, 10);
  c.header('Content-Type', 'application/json; charset=utf-8');
  c.header('Content-Disposition', `attachment; filename="apex-export-${date}.json"`);
  return c.body(JSON.stringify(snapshot, null, 2));
});
