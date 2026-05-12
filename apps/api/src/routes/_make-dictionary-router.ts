import { Hono } from 'hono';
import type { DictionaryUseCases } from '../application/dictionary/make-dictionary-use-cases';
import type { DictionaryKind } from '../domain/dictionary/dictionary';
import { domainProblem, internalProblem, zodIssuesToProblemJson } from './_problem-json';
import type { AuthVariables } from './middleware/require-auth';

export interface MakeDictionaryRouterDeps<TKind extends DictionaryKind> {
  useCases: DictionaryUseCases<TKind>;
}

/**
 * Builds a `Hono` sub-router for any dictionary kind. Three endpoints:
 *   GET    /         — list user's entries.
 *   POST   /         — create a new entry. Returns 400 / 409 on validation or
 *                       duplicate, 201 + JSON on success.
 *   DELETE /:id      — delete by id. Returns 400 on bad id, 404 when not
 *                       owned, 409 when still referenced by a game.
 *
 * Kept thin so each dictionary route file is a single call to this factory.
 */
export function makeDictionaryRouter<TKind extends DictionaryKind>(
  deps: MakeDictionaryRouterDeps<TKind>,
): Hono<{ Variables: AuthVariables }> {
  const { useCases } = deps;
  const router = new Hono<{ Variables: AuthVariables }>();

  router.get('/', async (c) => {
    const userId = c.get('user').id;
    return c.json(await useCases.list.execute(userId));
  });

  router.post('/', async (c) => {
    const userId = c.get('user').id;
    const body = await c.req.json();
    const result = await useCases.create.execute(body, userId);
    if (!result.ok) {
      const e = result.error;
      if (e.kind === 'invalid_input') return c.json(zodIssuesToProblemJson(e.issues), 400);
      if (e.kind === 'domain') return c.json(domainProblem(e.error), 400);
      if (e.kind === 'name_taken') return c.json({ error: 'name_taken' }, 409);
      return c.json(internalProblem('unknown error'), 500);
    }
    return c.json(result.value, 201);
  });

  router.delete('/:id', async (c) => {
    const id = Number(c.req.param('id'));
    if (!Number.isFinite(id)) return c.json({ error: 'Invalid id' }, 400);
    const userId = c.get('user').id;
    const result = await useCases.delete.execute(id, userId);
    if (!result.ok) {
      const e = result.error;
      if (e.kind === 'not_found') return c.json({ error: 'not found' }, 404);
      if (e.kind === 'in_use') return c.json({ error: 'in_use' }, 409);
      return c.json({ error: 'unknown error' }, 500);
    }
    return c.json(result.value);
  });

  return router;
}
