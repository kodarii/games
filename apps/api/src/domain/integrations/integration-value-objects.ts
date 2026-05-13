import { err, ok } from '../shared/result';
import type { Result } from '../shared/result';

/**
 * Discriminator for the third-party integration. Currently only IGDB exists,
 * but the column accepts any string so future providers can be added without
 * a migration. Validation happens at the boundary (HTTP / use-case).
 */
export type IntegrationKind = 'igdb';

export type ClientIdError = { kind: 'invalid_client_id'; reason: 'empty' | 'too_long' };
export type ClientSecretError = {
  kind: 'invalid_client_secret';
  reason: 'empty' | 'too_long';
};

const MAX_CREDENTIAL_LENGTH = 128;

type CredentialErrorKind = 'invalid_client_id' | 'invalid_client_secret';

function validateCredential(
  raw: string,
  kind: CredentialErrorKind,
): Result<string, { kind: CredentialErrorKind; reason: 'empty' | 'too_long' }> {
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    return err({ kind, reason: 'empty' });
  }
  if (trimmed.length > MAX_CREDENTIAL_LENGTH) {
    return err({ kind, reason: 'too_long' });
  }
  return ok(trimmed);
}

export class ClientId {
  private constructor(public readonly value: string) {}

  static create(raw: string): Result<ClientId, ClientIdError> {
    const result = validateCredential(raw, 'invalid_client_id');
    if (!result.ok) {
      return err(result.error as ClientIdError);
    }
    return ok(new ClientId(result.value));
  }

  /** Trusted: only from `IntegrationCredentials.fromPersistence` — value already validated. */
  static fromTrusted(value: string): ClientId {
    return new ClientId(value);
  }
}

export class ClientSecret {
  private constructor(public readonly value: string) {}

  static create(raw: string): Result<ClientSecret, ClientSecretError> {
    const result = validateCredential(raw, 'invalid_client_secret');
    if (!result.ok) {
      return err(result.error as ClientSecretError);
    }
    return ok(new ClientSecret(result.value));
  }

  /** Trusted: only when hydrating after decryption inside a use-case — already validated upstream. */
  static fromTrusted(value: string): ClientSecret {
    return new ClientSecret(value);
  }
}
