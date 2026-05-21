import { Hono } from 'hono';
import type { IgdbChainHolder } from '../infrastructure/igdb/igdb-chain-holder';
import { internalProblem, zodIssuesToProblemJson } from './_problem-json';
import type { AuthVariables } from './middleware/require-auth';

export interface GamesMetadataRouterDeps {
  readonly chainHolder: Pick<IgdbChainHolder, 'get' | 'isConfigured'>;
}

export function createGamesMetadataRouter(deps: GamesMetadataRouterDeps) {
  const r = new Hono<{ Variables: AuthVariables }>();

  r.get('/status', (c) => c.json({ igdbConfigured: deps.chainHolder.isConfigured() }, 200));

  r.get('/candidates', async (c) => {
    const chain = deps.chainHolder.get();
    if (chain === null) {
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
    const result = await chain.searchGameMetadata.execute({ title, platform });
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
