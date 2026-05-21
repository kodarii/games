import type { IntegrationCredentials } from '../../domain/integrations/integration-credentials';

export type IgdbIntegrationStatusResponse =
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

export function toIgdbIntegrationStatus(
  row: IntegrationCredentials | null,
): IgdbIntegrationStatusResponse {
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
