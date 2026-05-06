import { Hono } from 'hono';
import { CreateGame } from '../application/games/create-game';
import { DeleteGame } from '../application/games/delete-game';
import { GetGame } from '../application/games/get-game';
import { ListGames } from '../application/games/list-games';
import { MoveToCollection } from '../application/games/move-to-collection';
import { UpdateGame } from '../application/games/update-game';
import type { Game } from '../domain/games/game';
import { DrizzlePlatformRepository } from '../infrastructure/platforms/drizzle-platform-repository';
import { coverStorage, gameRepository } from '../wiring';
import type { AuthVariables } from './middleware/require-auth';

const platformRepo = new DrizzlePlatformRepository();
const createGame = new CreateGame(gameRepository, platformRepo);
const deleteGame = new DeleteGame(gameRepository, coverStorage);
const listGames = new ListGames(gameRepository);
const getGame = new GetGame(gameRepository);
const updateGame = new UpdateGame(gameRepository, platformRepo, coverStorage);
const moveToCollection = new MoveToCollection(gameRepository);

export const games = new Hono<{ Variables: AuthVariables }>();

games.get('/', async (c) => {
  const userId = c.get('user').id;
  const result = await listGames.execute(
    {
      search: c.req.query('search'),
      kind: c.req.query('kind'),
      page: c.req.query('page'),
      perPage: c.req.query('perPage'),
      sort: c.req.query('sort'),
      dir: c.req.query('dir'),
    },
    userId,
  );
  return c.json(result);
});

games.get('/:id', async (c) => {
  const id = Number(c.req.param('id'));
  if (!Number.isFinite(id)) {
    return c.json({ error: 'Invalid id' }, 400);
  }

  const userId = c.get('user').id;
  const result = await getGame.execute(id, userId);

  if (!result.ok) {
    return c.json({ error: 'not found' }, 404);
  }

  return c.json(result.value);
});

games.put('/:id', async (c) => {
  const id = Number(c.req.param('id'));
  if (!Number.isFinite(id)) {
    return c.json({ error: 'Invalid id' }, 400);
  }

  const userId = c.get('user').id;
  const body = await c.req.json();
  const result = await updateGame.execute(id, body, userId);

  if (!result.ok) {
    const e = result.error;
    if (e.kind === 'not_found') return c.json({ error: 'not found' }, 404);
    if (e.kind === 'invalid_input') return c.json({ error: 'validation', issues: e.issues }, 400);
    if (e.kind === 'domain') return c.json({ error: 'validation', domain: e.error }, 400);
    return c.json({ error: 'unknown error' }, 500);
  }

  return c.json(result.value);
});

games.post('/', async (c) => {
  const userId = c.get('user').id;
  const body = await c.req.json();
  const result = await createGame.execute(body, userId);

  if (!result.ok) {
    const err = result.error;
    if (err.kind === 'invalid_input') {
      return c.json({ error: 'validation', issues: err.issues }, 400);
    }
    if (err.kind === 'domain') {
      return c.json({ error: 'validation', domain: err.error }, 400);
    }
    return c.json({ error: 'unknown error' }, 500);
  }

  const game: Game = result.value;
  return c.json(game, 201);
});

games.post('/:externalId/move-to-collection', async (c) => {
  const userId = c.get('user').id;
  const externalId = c.req.param('externalId');
  const result = await moveToCollection.execute(externalId, userId);
  if (!result.ok) {
    if (result.error.kind === 'not_found') return c.json({ error: 'not_found' }, 404);
    if (result.error.kind === 'already_owned') return c.json({ error: 'already_owned' }, 409);
    return c.json({ error: 'invalid', details: result.error.error }, 422);
  }
  return c.json({ game: result.value.toJSON() }, 200);
});

games.delete('/:id', async (c) => {
  const id = Number(c.req.param('id'));
  if (!Number.isFinite(id)) {
    return c.json({ error: 'Invalid id' }, 400);
  }

  const userId = c.get('user').id;
  const result = await deleteGame.execute(id, userId);

  if (!result.ok) {
    return c.json({ error: 'not found' }, 404);
  }

  return c.json(result.value);
});
