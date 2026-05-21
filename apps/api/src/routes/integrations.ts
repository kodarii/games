import { Hono } from 'hono';
import type { MiddlewareHandler } from 'hono';
import type { ClearIgdbIntegration } from '../application/integrations/clear-igdb-integration';
import type { GetIgdbIntegrationStatus } from '../application/integrations/get-igdb-integration-status';
import { toIgdbIntegrationStatus } from '../application/integrations/igdb-integration-status-dto';
import type {
  SaveIgdbIntegration,
  SaveIgdbIntegrationError,
} from '../application/integrations/save-igdb-integration';
import { zodIssuesToProblemJson } from './_problem-json';
import type { AuthVariables } from './middleware/require-auth';

export interface IntegrationsRouterDeps {
  readonly saveIgdbIntegration: SaveIgdbIntegration;
  readonly clearIgdbIntegration: ClearIgdbIntegration;
  readonly getIgdbIntegrationStatus: GetIgdbIntegrationStatus;
  readonly idempotencyKeyMiddleware: MiddlewareHandler<{ Variables: AuthVariables }>;
}

function saveErrorToHttp(error: SaveIgdbIntegrationError): {
  status: 400 | 409 | 422 | 503 | 504;
  body: unknown;
} {
  switch (error.kind) {
    case 'invalid_input':
      return { status: 400, body: zodIssuesToProblemJson(error.issues) };
    case 'invalid_credentials':
      return {
        status: 422,
        body: {
          type: '/errors/invalid-credentials',
          title: 'Invalid IGDB credentials',
          status: 422,
          detail: 'Twitch rejected the provided IGDB credentials.',
          reason: error.reason,
        },
      };
    case 'twitch_unavailable':
      return {
        status: 503,
        body: {
          type: '/errors/twitch-unavailable',
          title: 'Twitch is unavailable',
          status: 503,
          detail: 'Twitch returned an error when verifying the IGDB credentials.',
          upstreamStatus: error.status,
        },
      };
    case 'network_unreachable':
      return {
        status: 504,
        body: {
          type: '/errors/twitch-timeout',
          title: 'Twitch verification timed out',
          status: 504,
          detail: 'The IGDB credentials verifier could not reach Twitch.',
          reason: error.reason,
        },
      };
    case 'storage_corrupt':
      return {
        status: 409,
        body: {
          type: '/errors/storage-corrupt',
          title: 'Stored IGDB secret is corrupt',
          status: 409,
          detail:
            'The encrypted IGDB secret stored on the server cannot be decrypted. Re-enter the client secret to recover.',
        },
      };
  }
}

const PUT_BODY_SCHEMA_REASON = 'Body must match the PUT /api/integrations/igdb contract';

export function createIntegrationsRouter(deps: IntegrationsRouterDeps) {
  const r = new Hono<{ Variables: AuthVariables }>();

  r.get('/igdb', async (c) => {
    const userId = c.get('user').id;
    return c.json(await deps.getIgdbIntegrationStatus.execute(userId), 200);
  });

  r.put('/igdb', deps.idempotencyKeyMiddleware, async (c) => {
    const userId = c.get('user').id;
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json(
        {
          type: '/errors/invalid-input',
          title: 'Invalid JSON body',
          status: 400,
          detail: PUT_BODY_SCHEMA_REASON,
        },
        400,
      );
    }
    const result = await deps.saveIgdbIntegration.execute(body, userId);
    if (!result.ok) {
      const mapped = saveErrorToHttp(result.error);
      return c.json(mapped.body, mapped.status);
    }
    return c.json(toIgdbIntegrationStatus(result.value.creds), 200);
  });

  r.delete('/igdb', deps.idempotencyKeyMiddleware, async (c) => {
    const userId = c.get('user').id;
    await deps.clearIgdbIntegration.execute(userId);
    return c.body(null, 204);
  });

  return r;
}
