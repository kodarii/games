import { Hono } from 'hono';
import type { MiddlewareHandler } from 'hono';
import type { ClearIgdbIntegration } from '../application/integrations/clear-igdb-integration';
import type {
  SaveIgdbIntegration,
  SaveIgdbIntegrationError,
} from '../application/integrations/save-igdb-integration';
import type { IntegrationCredentials } from '../domain/integrations/integration-credentials';
import type { IntegrationCredentialsRepository } from '../domain/integrations/integration-credentials-repository';
import { zodIssuesToProblemJson } from './_problem-json';
import type { AuthVariables } from './middleware/require-auth';

export interface IntegrationsRouterDeps {
  readonly saveIgdbIntegration: SaveIgdbIntegration;
  readonly clearIgdbIntegration: ClearIgdbIntegration;
  readonly integrationCredentialsRepository: IntegrationCredentialsRepository;
  readonly idempotencyKeyMiddleware: MiddlewareHandler<{ Variables: AuthVariables }>;
}

type GetIgdbResponse =
  | {
      status: 'not-configured';
      enabled: false;
      clientId: null;
      clientIdMasked: null;
      hasSecret: false;
      lastVerifiedAt: null;
      updatedAt: null;
    }
  | {
      status: 'configured';
      enabled: boolean;
      clientId: string;
      clientIdMasked: string;
      hasSecret: true;
      lastVerifiedAt: string | null;
      updatedAt: string;
    };

/**
 * Masks an IGDB client ID for display. The first 12 chars + `…` + last 4 chars
 * keep the identifier recognisable to the owner while hiding the bulk of the
 * value in logs / screenshots. Inputs of ≤16 chars collapse to `…<last 4>`.
 */
export function maskClientId(value: string): string {
  if (value.length <= 16) {
    return `…${value.slice(-4)}`;
  }
  return `${value.slice(0, 12)}…${value.slice(-4)}`;
}

function toGetResponse(row: IntegrationCredentials | null): GetIgdbResponse {
  if (row === null) {
    return {
      status: 'not-configured',
      enabled: false,
      clientId: null,
      clientIdMasked: null,
      hasSecret: false,
      lastVerifiedAt: null,
      updatedAt: null,
    };
  }
  return {
    status: 'configured',
    enabled: row.enabled,
    clientId: row.clientId.value,
    clientIdMasked: maskClientId(row.clientId.value),
    hasSecret: true,
    lastVerifiedAt: row.lastVerifiedAt?.toISOString() ?? null,
    updatedAt: row.updatedAt.toISOString(),
  };
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
    const row = await deps.integrationCredentialsRepository.findByUserAndKind(userId, 'igdb');
    return c.json(toGetResponse(row), 200);
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
    return c.json(toGetResponse(result.value.creds), 200);
  });

  r.delete('/igdb', deps.idempotencyKeyMiddleware, async (c) => {
    const userId = c.get('user').id;
    await deps.clearIgdbIntegration.execute(userId);
    return c.body(null, 204);
  });

  return r;
}
