import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { z } from 'zod';
import { idempotencyKeyMiddleware, importData } from '../wiring';
import type { AuthVariables } from './middleware/require-auth';

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
  idempotencyKeyMiddleware,
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
