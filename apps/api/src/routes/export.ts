import { Hono } from 'hono';
import type { ExportData } from '../application/export/export-data';
import type { AuthVariables } from './middleware/require-auth';

export interface ExportRouterDeps {
  readonly exportData: ExportData;
}

export function createExportRouter(deps: ExportRouterDeps): Hono<{ Variables: AuthVariables }> {
  const route = new Hono<{ Variables: AuthVariables }>();
  route.get('/', async (c) => {
    const userId = c.get('user').id;
    const snapshot = await deps.exportData.execute(userId);
    const date = snapshot.exportedAt.slice(0, 10);
    c.header('Content-Type', 'application/json; charset=utf-8');
    c.header('Content-Disposition', `attachment; filename="apex-export-${date}.json"`);
    return c.body(JSON.stringify(snapshot, null, 2));
  });
  return route;
}
