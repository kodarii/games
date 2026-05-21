import { Hono } from 'hono';
import type { MiddlewareHandler } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { z } from 'zod';
import type { ImportData } from '../application/import/import-data';
import { domainProblem, invalidBodyProblem, payloadTooLargeProblem } from './_problem-json';
import type { AuthVariables } from './middleware/require-auth';

const BodySchema = z.object({
  mode: z.enum(['merge', 'replace']),
  snapshot: z.unknown(),
});

export interface ImportRouterDeps {
  readonly importData: ImportData;
  readonly idempotencyKey: MiddlewareHandler<{ Variables: AuthVariables }>;
}

export function createImportRouter(deps: ImportRouterDeps): Hono<{ Variables: AuthVariables }> {
  const route = new Hono<{ Variables: AuthVariables }>();
  route.post(
    '/',
    bodyLimit({
      maxSize: 5 * 1024 * 1024,
      onError: (c) => c.json(payloadTooLargeProblem('Import body exceeds 5MB limit'), 413),
    }),
    deps.idempotencyKey,
    async (c) => {
      const userId = c.get('user').id;
      const body = await c.req.json().catch(() => null);
      const parsed = BodySchema.safeParse(body);
      if (!parsed.success) {
        return c.json(invalidBodyProblem(parsed.error.issues), 400);
      }
      const rawJson = JSON.stringify(parsed.data.snapshot);
      const result = await deps.importData.execute(userId, rawJson, parsed.data.mode);
      if (!result.ok) {
        return c.json(domainProblem(result.error), 400);
      }
      return c.json(result.value);
    },
  );
  return route;
}
