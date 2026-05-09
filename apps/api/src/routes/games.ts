import { Hono } from 'hono';
import type { Game } from '../domain/games/game';
import {
  createGame,
  deleteGame,
  getGame,
  listGames,
  moveToCollection,
  updateGame,
} from '../wiring';
import {
  domainProblem,
  internalProblem,
  payloadTooLargeProblem,
  zodIssuesToProblemJson,
} from './_problem-json';
import type { AuthVariables } from './middleware/require-auth';

type GameResponse = {
  id: string;
  kind: string;
  title: string;
  developer: string | null;
  genre: string;
  releaseYear: number | null;
  platform: string;
  edition: string | undefined;
  hoursPlayed: number | null;
  status: string | null;
  format: string;
  coverColor: string | undefined;
  coverImage: string | null;
  price: number | null;
  purchasedAt: string | null;
  notes: string | null;
};

function toGameResponse(game: Game): GameResponse {
  return {
    id: game.externalId,
    kind: game.kind,
    title: game.title,
    developer: game.developer,
    genre: game.genre,
    releaseYear: game.releaseYear?.value ?? null,
    platform: game.platform,
    edition: game.edition,
    hoursPlayed: game.hoursPlayed?.value ?? null,
    status: game.status,
    format: game.format,
    coverColor: game.coverColor,
    coverImage: game.coverImage ?? null,
    price: game.price?.value ?? null,
    purchasedAt: game.purchasedAt?.value ?? null,
    notes: game.notes,
  };
}

const ARRAY_PARAM_LIMIT = 100;

export const games = new Hono<{ Variables: AuthVariables }>();

games.get('/', async (c) => {
  const userId = c.get('user').id;
  const t0 = Date.now();

  const rawPlatforms = c.req.queries('platforms');
  const rawFormats = c.req.queries('formats');

  if (
    (rawPlatforms?.length ?? 0) > ARRAY_PARAM_LIMIT ||
    (rawFormats?.length ?? 0) > ARRAY_PARAM_LIMIT
  ) {
    return c.json(
      payloadTooLargeProblem(
        `platforms/formats must each have at most ${ARRAY_PARAM_LIMIT} entries`,
      ),
      413,
    );
  }

  const search = c.req.query('search') ?? '';
  const sort = c.req.query('sort');
  const dir = c.req.query('dir');
  const releaseYearFrom = c.req.query('releaseYearFrom');
  const releaseYearTo = c.req.query('releaseYearTo');

  const result = await listGames.execute(
    {
      search,
      kind: c.req.query('kind'),
      page: c.req.query('page'),
      perPage: c.req.query('perPage'),
      sort,
      dir,
      platforms: rawPlatforms,
      formats: rawFormats,
      releaseYearFrom,
      releaseYearTo,
    },
    userId,
  );

  const filterShape = {
    hasSearch: search.length > 0,
    searchLen: search.length,
    platforms: rawPlatforms?.length ?? 0,
    formats: rawFormats?.length ?? 0,
    hasYearRange: !!(releaseYearFrom || releaseYearTo),
  };
  console.log(
    JSON.stringify({
      event: 'games.list',
      userId,
      durationMs: Date.now() - t0,
      total: result.total,
      page: result.page,
      sort,
      dir,
      filterShape,
    }),
  );

  return c.json({ ...result, items: result.items.map(toGameResponse) });
});

games.post('/', async (c) => {
  const userId = c.get('user').id;
  const body = await c.req.json();
  const result = await createGame.execute(body, userId);
  if (!result.ok) {
    const e = result.error;
    if (e.kind === 'invalid_input') return c.json(zodIssuesToProblemJson(e.issues), 400);
    if (e.kind === 'domain') return c.json(domainProblem(e.error), 400);
    return c.json(internalProblem('unknown error'), 500);
  }
  return c.json(toGameResponse(result.value), 201);
});

games.post('/:externalId/move-to-collection', async (c) => {
  const userId = c.get('user').id;
  const externalId = c.req.param('externalId');
  const result = await moveToCollection.execute(externalId, userId);
  if (!result.ok) {
    if (result.error.kind === 'not_found') return c.json({ error: 'not_found' }, 404);
    return c.json({ error: 'already_owned' }, 409);
  }
  return c.json({ game: toGameResponse(result.value) }, 200);
});

games.get('/:externalId', async (c) => {
  const externalId = c.req.param('externalId');
  const userId = c.get('user').id;
  const result = await getGame.execute(externalId, userId);
  if (!result.ok) return c.json({ error: 'not found' }, 404);
  return c.json(toGameResponse(result.value));
});

games.put('/:externalId', async (c) => {
  const externalId = c.req.param('externalId');
  const userId = c.get('user').id;
  const body = await c.req.json();
  const result = await updateGame.execute(externalId, body, userId);
  if (!result.ok) {
    const e = result.error;
    if (e.kind === 'not_found') return c.json({ error: 'not found' }, 404);
    if (e.kind === 'invalid_input') return c.json(zodIssuesToProblemJson(e.issues), 400);
    if (e.kind === 'domain') return c.json(domainProblem(e.error), 400);
    return c.json(internalProblem('unknown error'), 500);
  }
  return c.json(toGameResponse(result.value));
});

games.delete('/:externalId', async (c) => {
  const externalId = c.req.param('externalId');
  const userId = c.get('user').id;
  const result = await deleteGame.execute(externalId, userId);
  if (!result.ok) return c.json({ error: 'not found' }, 404);
  return c.json(toGameResponse(result.value));
});
