import { Hono } from 'hono';
import type { GetIgdbIntegrationStatus } from '../application/integrations/get-igdb-integration-status';
import type { IgdbChainFactory } from '../infrastructure/igdb/igdb-chain-factory';
import { internalProblem, zodIssuesToProblemJson } from './_problem-json';
import type { AuthVariables } from './middleware/require-auth';

export interface GamesMetadataRouterDeps {
  readonly chainFactory: Pick<IgdbChainFactory, 'buildFor'>;
  readonly getStatus: Pick<GetIgdbIntegrationStatus, 'execute'>;
}

export function createGamesMetadataRouter(deps: GamesMetadataRouterDeps) {
  const r = new Hono<{ Variables: AuthVariables }>();

  r.get('/status', async (c) => {
    const userId = c.get('user').id;
    const status = await deps.getStatus.execute(userId);
    return c.json({ igdbConfigured: status.enabled }, 200);
  });

  r.get('/candidates', async (c) => {
    const userId = c.get('user').id;
    const chain = await deps.chainFactory.buildFor(userId);
    if (chain === null) {
      return c.json(
        {
          type: '/errors/feature-disabled',
          title: 'IGDB metadata feature disabled',
          status: 503,
          detail: 'IGDB credentials are not configured for this user.',
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
