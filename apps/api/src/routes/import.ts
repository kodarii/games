import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { z } from 'zod';
import { ImportData } from '../application/import/import-data';
import { DrizzleGameRepository } from '../infrastructure/games/drizzle-game-repository';
import { DrizzlePlatformRepository } from '../infrastructure/platforms/drizzle-platform-repository';
import { DrizzleImportRepository } from '../infrastructure/import/drizzle-import-repository';
import type { AuthVariables } from './middleware/require-auth';

const gameRepo = new DrizzleGameRepository();
const platformRepo = new DrizzlePlatformRepository();
const importRepo = new DrizzleImportRepository();
const importData = new ImportData(gameRepo, platformRepo, importRepo);

const BodySchema = z.object({
  mode: z.enum(['merge', 'replace']),
  snapshot: z.unknown(),
});

export const importRoute = new Hono<{ Variables: AuthVariables }>();

importRoute.post(
  '/',
  bodyLimit({
    maxSize: 5 * 1024 * 1024,
    onError: (c) => c.json({ error: 'payload_too_large' }, 413),
  }),
  async (c) => {
    const userId = c.get('user').id;
    const body = await c.req.json().catch(() => null);
    const parsed = BodySchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: 'invalid_body', issues: parsed.error.issues }, 400);
    }
    const rawJson = JSON.stringify(parsed.data.snapshot);
    const result = await importData.execute(userId, rawJson, parsed.data.mode);
    if (!result.ok) {
      return c.json({ error: result.error.kind, detail: result.error }, 400);
    }
    return c.json(result.value);
  },
);
