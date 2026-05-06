import { Hono } from 'hono';
import { CreateGenre } from '../application/genres/create-genre';
import { DeleteGenre } from '../application/genres/delete-genre';
import { ListGenres } from '../application/genres/list-genres';
import { DrizzleGameRepository } from '../infrastructure/games/drizzle-game-repository';
import { DrizzleGenreRepository } from '../infrastructure/genres/drizzle-genre-repository';
import type { AuthVariables } from './middleware/require-auth';

const genreRepo = new DrizzleGenreRepository();
const gameRepo = new DrizzleGameRepository();
const listGenres = new ListGenres(genreRepo);
const createGenre = new CreateGenre(genreRepo);
const deleteGenre = new DeleteGenre(genreRepo, gameRepo);

export const genres = new Hono<{ Variables: AuthVariables }>();

genres.get('/', async (c) => {
  const userId = c.get('user').id;
  return c.json(await listGenres.execute(userId));
});

genres.post('/', async (c) => {
  const userId = c.get('user').id;
  const body = await c.req.json();
  const result = await createGenre.execute(body, userId);
  if (!result.ok) {
    const e = result.error;
    if (e.kind === 'invalid_input') return c.json({ error: 'validation', issues: e.issues }, 400);
    if (e.kind === 'domain') return c.json({ error: 'validation', domain: e.error }, 400);
    if (e.kind === 'name_taken') return c.json({ error: 'name_taken' }, 409);
    return c.json({ error: 'unknown error' }, 500);
  }
  return c.json(result.value, 201);
});

genres.delete('/:id', async (c) => {
  const id = Number(c.req.param('id'));
  if (!Number.isFinite(id)) return c.json({ error: 'Invalid id' }, 400);
  const userId = c.get('user').id;
  const result = await deleteGenre.execute(id, userId);
  if (!result.ok) {
    const e = result.error;
    if (e.kind === 'not_found') return c.json({ error: 'not found' }, 404);
    if (e.kind === 'in_use') return c.json({ error: 'in_use' }, 409);
    return c.json({ error: 'unknown error' }, 500);
  }
  return c.json(result.value);
});
