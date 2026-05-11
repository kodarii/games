import { Hono } from 'hono';
import type { SearchGameMetadata } from '../application/games/search-game-metadata';
import { internalProblem, zodIssuesToProblemJson } from './_problem-json';
import type { AuthVariables } from './middleware/require-auth';

export interface GamesMetadataRouterDeps {
  readonly searchGameMetadata: SearchGameMetadata;
}

export function createGamesMetadataRouter(deps: GamesMetadataRouterDeps) {
  const r = new Hono<{ Variables: AuthVariables }>();

  r.get('/candidates', async (c) => {
    const userId = c.get('user').id;
    const title = c.req.query('title') ?? '';
    const platform = c.req.query('platform') ?? '';
    console.log(JSON.stringify({ event: 'igdb.search.request', userId, title, platform }));
    const result = await deps.searchGameMetadata.execute({ title, platform });
    if (!result.ok) {
      if (result.error.kind === 'invalid_input') {
        return c.json(zodIssuesToProblemJson(result.error.issues), 400);
      }
      return c.json(internalProblem('unknown error'), 500);
    }
    return c.json(
      {
        candidates: result.value.candidates,
        degraded: result.value.degraded,
        ...(result.value.reason !== undefined ? { reason: result.value.reason } : {}),
        ...(result.value.staleAt !== undefined ? { staleAt: result.value.staleAt } : {}),
      },
      200,
    );
  });

  return r;
}
