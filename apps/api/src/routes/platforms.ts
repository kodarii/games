import { Hono } from 'hono';
import { CreatePlatform } from '../application/platforms/create-platform';
import { DeletePlatform } from '../application/platforms/delete-platform';
import { ListPlatforms } from '../application/platforms/list-platforms';
import { DrizzleGameRepository } from '../infrastructure/games/drizzle-game-repository';
import { DrizzlePlatformRepository } from '../infrastructure/platforms/drizzle-platform-repository';
import { domainProblem, internalProblem, zodIssuesToProblemJson } from './_problem-json';
import type { AuthVariables } from './middleware/require-auth';

const platformRepo = new DrizzlePlatformRepository();
const gameRepo = new DrizzleGameRepository();
const createPlatform = new CreatePlatform(platformRepo);
const listPlatforms = new ListPlatforms(platformRepo);
const deletePlatform = new DeletePlatform(platformRepo, gameRepo);

export const platforms = new Hono<{ Variables: AuthVariables }>();

platforms.get('/', async (c) => {
  const userId = c.get('user').id;
  const list = await listPlatforms.execute(userId);
  return c.json(list);
});

platforms.post('/', async (c) => {
  const userId = c.get('user').id;
  const body = await c.req.json();
  const result = await createPlatform.execute(body, userId);
  if (!result.ok) {
    const e = result.error;
    if (e.kind === 'invalid_input') return c.json(zodIssuesToProblemJson(e.issues), 400);
    if (e.kind === 'domain') return c.json(domainProblem(e.error), 400);
    if (e.kind === 'name_taken') return c.json({ error: 'name_taken' }, 409);
    return c.json(internalProblem('unknown error'), 500);
  }
  return c.json(result.value, 201);
});

platforms.delete('/:id', async (c) => {
  const id = Number(c.req.param('id'));
  if (!Number.isFinite(id)) return c.json({ error: 'Invalid id' }, 400);
  const userId = c.get('user').id;
  const result = await deletePlatform.execute(id, userId);
  if (!result.ok) {
    const e = result.error;
    if (e.kind === 'not_found') return c.json({ error: 'not found' }, 404);
    if (e.kind === 'in_use') return c.json({ error: 'in_use' }, 409);
    return c.json({ error: 'unknown error' }, 500);
  }
  return c.json(result.value);
});
