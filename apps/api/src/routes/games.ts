import { Hono } from 'hono';
import type { Game } from '../domain/games/game';
import {
  createGame,
  deleteGame,
  enrichGameMetadata,
  getGame,
  idempotencyKeyMiddleware,
  igdbConfigured,
  listGames,
  moveToCollection,
  searchGameMetadata,
  updateGame,
} from '../wiring';
import {
  domainProblem,
  internalProblem,
  optimisticLockProblem,
  payloadTooLargeProblem,
  zodIssuesToProblemJson,
} from './_problem-json';
import { createGamesMetadataRouter } from './games-metadata';
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
  c.get('logger').event('games.list', {
    durationMs: Date.now() - t0,
    total: result.total,
    page: result.page,
    sort: sort ?? null,
    dir: dir ?? null,
    filterShape,
  });

  return c.json({ ...result, items: result.items.map(toGameResponse) });
});

games.post('/', idempotencyKeyMiddleware, async (c) => {
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

games.post('/:externalId/move-to-collection', idempotencyKeyMiddleware, async (c) => {
  const userId = c.get('user').id;
  const externalId = c.req.param('externalId');
  const result = await moveToCollection.execute(externalId, userId);
  if (!result.ok) {
    const e = result.error;
    if (e.kind === 'not_found') return c.json({ error: 'not_found' }, 404);
    if (e.kind === 'conflict') return c.json(optimisticLockProblem(), 409);
    return c.json({ error: 'already_owned' }, 409);
  }
  return c.json({ game: toGameResponse(result.value) }, 200);
});

// Metadata sub-router MUST be registered before `/:externalId` — Hono uses
// registration order and `/metadata/candidates` would otherwise be swallowed
// by the `:externalId` route as `externalId === 'metadata'`.
games.route('/metadata', createGamesMetadataRouter({ searchGameMetadata, igdbConfigured }));

// PATCH `/:externalId/metadata` — different verb + extra segment, so no
// collision with the GET/PUT/DELETE `/:externalId` routes below. Belongs
// here logically with its sibling `:externalId` routes.
const PATCH_METADATA_ROUTE = 'PATCH /games/:externalId/metadata';
games.patch('/:externalId/metadata', async (c) => {
  const externalId = c.req.param('externalId');
  const userId = c.get('user').id;
  const t0 = Date.now();
  const body = await c.req.json();
  const result = await enrichGameMetadata.execute(externalId, body, userId);
  if (!result.ok) {
    const e = result.error;
    if (e.kind === 'not_found') {
      c.get('logger').warn({
        event: 'security.idor_attempt',
        externalId,
        route: PATCH_METADATA_ROUTE,
      });
      return c.json({ error: 'not found' }, 404);
    }
    if (e.kind === 'invalid_input') return c.json(zodIssuesToProblemJson(e.issues), 400);
    if (e.kind === 'domain') return c.json(domainProblem(e.error), 400);
    if (e.kind === 'conflict') return c.json(optimisticLockProblem(), 409);
    if (e.kind === 'snapshot_mismatch') {
      const fields = [...e.fields];
      c.get('logger').warn({
        event: 'igdb.enrich.snapshot_mismatch',
        externalId,
        route: PATCH_METADATA_ROUTE,
        mismatchedFields: fields,
      });
      return c.json(
        {
          type: '/errors/snapshot-stale',
          title: 'Stale or tampered snapshot',
          status: 400,
          detail:
            'Snapshot does not match the cached provider response. Re-fetch metadata candidates and retry.',
          fields,
        },
        400,
      );
    }
    if (e.kind === 'cache_miss') {
      return c.json(
        {
          type: '/errors/cache-miss',
          title: 'Metadata cache miss',
          status: 409,
          detail: 'No cached candidate for this providerId. Refresh metadata candidates and retry.',
        },
        409,
      );
    }
    return c.json(internalProblem('unknown error'), 500);
  }
  const providerId =
    typeof body === 'object' && body !== null && 'providerId' in body
      ? String((body as { providerId: unknown }).providerId)
      : null;
  c.get('logger').event('igdb.enrich', {
    externalId,
    providerId,
    durationMs: Date.now() - t0,
  });
  return c.json(toGameResponse(result.value), 200);
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
    if (e.kind === 'conflict') return c.json(optimisticLockProblem(), 409);
    return c.json(internalProblem('unknown error'), 500);
  }
  return c.json(toGameResponse(result.value));
});

games.delete('/:externalId', async (c) => {
  const externalId = c.req.param('externalId');
  const userId = c.get('user').id;
  const result = await deleteGame.execute(externalId, userId);
  if (!result.ok) {
    if (result.error.kind === 'conflict') return c.json(optimisticLockProblem(), 409);
    return c.json({ error: 'not found' }, 404);
  }
  return c.json(toGameResponse(result.value));
});
