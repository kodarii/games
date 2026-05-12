import { Hono } from 'hono';
import type { SearchGameMetadata } from '../application/games/search-game-metadata';
import { internalProblem, zodIssuesToProblemJson } from './_problem-json';
import type { AuthVariables } from './middleware/require-auth';

export interface GamesMetadataRouterDeps {
  readonly searchGameMetadata: SearchGameMetadata | null;
  readonly igdbConfigured: boolean;
}

export function createGamesMetadataRouter(deps: GamesMetadataRouterDeps) {
  const r = new Hono<{ Variables: AuthVariables }>();

  r.get('/status', (c) => c.json({ igdbConfigured: deps.igdbConfigured }, 200));

  r.get('/candidates', async (c) => {
    const { searchGameMetadata } = deps;
    if (searchGameMetadata === null) {
      return c.json(
        {
          type: '/errors/feature-disabled',
          title: 'IGDB metadata feature disabled',
          status: 503,
          detail: 'IGDB credentials are not configured on this server.',
        },
        503,
      );
    }
    const title = c.req.query('title') ?? '';
    const platform = c.req.query('platform') ?? '';
    // Title is end-user input; PII risk is low (game titles) but bound the
    // logged payload anyway and surface the length for shape analysis.
    c.get('logger').event('igdb.search.request', {
      titleLength: title.length,
      title: title.slice(0, 100),
      platform,
    });
    const result = await searchGameMetadata.execute({ title, platform }, c.get('logger'));
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
