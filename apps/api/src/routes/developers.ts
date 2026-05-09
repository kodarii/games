import { Hono } from 'hono';
import { CreateDeveloper } from '../application/developers/create-developer';
import { DeleteDeveloper } from '../application/developers/delete-developer';
import { ListDevelopers } from '../application/developers/list-developers';
import { DrizzleDeveloperRepository } from '../infrastructure/developers/drizzle-developer-repository';
import { DrizzleGameRepository } from '../infrastructure/games/drizzle-game-repository';
import { domainProblem, internalProblem, zodIssuesToProblemJson } from './_problem-json';
import type { AuthVariables } from './middleware/require-auth';

const developerRepo = new DrizzleDeveloperRepository();
const gameRepo = new DrizzleGameRepository();
const listDevelopers = new ListDevelopers(developerRepo);
const createDeveloper = new CreateDeveloper(developerRepo);
const deleteDeveloper = new DeleteDeveloper(developerRepo, gameRepo);

export const developers = new Hono<{ Variables: AuthVariables }>();

developers.get('/', async (c) => {
  const userId = c.get('user').id;
  return c.json(await listDevelopers.execute(userId));
});

developers.post('/', async (c) => {
  const userId = c.get('user').id;
  const body = await c.req.json();
  const result = await createDeveloper.execute(body, userId);
  if (!result.ok) {
    const e = result.error;
    if (e.kind === 'invalid_input') return c.json(zodIssuesToProblemJson(e.issues), 400);
    if (e.kind === 'domain') return c.json(domainProblem(e.error), 400);
    if (e.kind === 'name_taken') return c.json({ error: 'name_taken' }, 409);
    return c.json(internalProblem('unknown error'), 500);
  }
  return c.json(result.value, 201);
});

developers.delete('/:id', async (c) => {
  const id = Number(c.req.param('id'));
  if (!Number.isFinite(id)) return c.json({ error: 'Invalid id' }, 400);
  const userId = c.get('user').id;
  const result = await deleteDeveloper.execute(id, userId);
  if (!result.ok) {
    const e = result.error;
    if (e.kind === 'not_found') return c.json({ error: 'not found' }, 404);
    if (e.kind === 'in_use') return c.json({ error: 'in_use' }, 409);
    return c.json({ error: 'unknown error' }, 500);
  }
  return c.json(result.value);
});
