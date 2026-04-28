import { Hono } from 'hono';
import { CreateGame } from '../application/games/create-game';
import { DeleteGame } from '../application/games/delete-game';
import { GetGame } from '../application/games/get-game';
import { ListGames } from '../application/games/list-games';
import { UpdateGame } from '../application/games/update-game';
import type { Game } from '../domain/games/game';
import { DrizzleGameRepository } from '../infrastructure/games/drizzle-game-repository';
import { DrizzlePlatformRepository } from '../infrastructure/platforms/drizzle-platform-repository';
import type { AuthVariables } from './middleware/require-auth';

const repo = new DrizzleGameRepository();
const platformRepo = new DrizzlePlatformRepository();
const createGame = new CreateGame(repo, platformRepo);
const deleteGame = new DeleteGame(repo);
const listGames = new ListGames(repo);
const getGame = new GetGame(repo);
const updateGame = new UpdateGame(repo, platformRepo);

export const games = new Hono<{ Variables: AuthVariables }>();

games.get('/', async (c) => {
  const userId = c.get('user').id;
  const result = await listGames.execute(
    {
      search: c.req.query('search'),
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
