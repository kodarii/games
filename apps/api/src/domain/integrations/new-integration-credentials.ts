import type { Result } from '../shared/result';
import { ok } from '../shared/result';
import { IntegrationCredentials } from './integration-credentials';
import { ClientId, type ClientIdError, type IntegrationKind } from './integration-value-objects';

/**
 * Input contract for the validating factory. `now` is injected so callers can
 * pin a deterministic clock (tests) or pass `new Date()` in production.
 *
 * `clientSecretCiphertext` is already encrypted by the use-case before
 * reaching the domain — the aggregate never sees plaintext.
 */
export interface NewIntegrationCredentialsProps {
  id: string;
  userId: string;
  integration: IntegrationKind;
  clientId: string;
  clientSecretCiphertext: string;
  now: Date;
}

export const NewIntegrationCredentials = {
  create(props: NewIntegrationCredentialsProps): Result<IntegrationCredentials, ClientIdError> {
    const clientIdResult = ClientId.create(props.clientId);
    if (!clientIdResult.ok) return clientIdResult;

    return ok(
      IntegrationCredentials.buildTrusted({
        id: props.id,
        userId: props.userId,
        integration: props.integration,
        enabled: false,
        clientId: clientIdResult.value,
        clientSecretCiphertext: props.clientSecretCiphertext,
        lastVerifiedAt: null,
        createdAt: props.now,
        updatedAt: props.now,
      }),
    );
  },
};
