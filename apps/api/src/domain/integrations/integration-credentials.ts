import { ClientId, type IntegrationKind } from './integration-value-objects';

/**
 * Aggregate root for per-user third-party integration credentials.
 *
 * Immutable: mutating helpers (`enable`, `disable`, `markVerified`,
 * `replaceSecret`, `replaceClientId`) return a fresh instance with a bumped
 * `updatedAt`.
 *
 * The plaintext client secret never enters the aggregate — only the already-
 * encrypted ciphertext does. Encryption is the responsibility of the
 * use-case layer (it depends on the `IntegrationCipher` port).
 */
export class IntegrationCredentials {
  private constructor(
    public readonly id: string,
    public readonly userId: string,
    public readonly integration: IntegrationKind,
    public readonly enabled: boolean,
    public readonly clientId: ClientId,
    public readonly clientSecretCiphertext: string,
    public readonly lastVerifiedAt: Date | null,
    public readonly createdAt: Date,
    public readonly updatedAt: Date,
  ) {}

  /** Trusted hydration from the persistence layer — no validation. */
  static fromPersistence(row: {
    id: string;
    userId: string;
    integration: IntegrationKind;
    enabled: boolean;
    clientId: string;
    clientSecretCiphertext: string;
    lastVerifiedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
  }): IntegrationCredentials {
    return new IntegrationCredentials(
      row.id,
      row.userId,
      row.integration,
      row.enabled,
      ClientId.fromTrusted(row.clientId),
      row.clientSecretCiphertext,
      row.lastVerifiedAt,
      row.createdAt,
      row.updatedAt,
    );
  }

  /**
   * Constructor surface used by the validating factory
   * (`NewIntegrationCredentials.create`) so the factory does not need access
   * to a private constructor. Treat input as trusted — validation happens in
   * the factory.
   */
  static buildTrusted(props: {
    id: string;
    userId: string;
    integration: IntegrationKind;
    enabled: boolean;
    clientId: ClientId;
    clientSecretCiphertext: string;
    lastVerifiedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
  }): IntegrationCredentials {
    return new IntegrationCredentials(
      props.id,
      props.userId,
      props.integration,
      props.enabled,
      props.clientId,
      props.clientSecretCiphertext,
      props.lastVerifiedAt,
      props.createdAt,
      props.updatedAt,
    );
  }

  enable(): IntegrationCredentials {
    return new IntegrationCredentials(
      this.id,
      this.userId,
      this.integration,
      true,
      this.clientId,
      this.clientSecretCiphertext,
      this.lastVerifiedAt,
      this.createdAt,
      new Date(),
    );
  }

  disable(): IntegrationCredentials {
    return new IntegrationCredentials(
      this.id,
      this.userId,
      this.integration,
      false,
      this.clientId,
      this.clientSecretCiphertext,
      this.lastVerifiedAt,
      this.createdAt,
      new Date(),
    );
  }

  replaceSecret(newCiphertext: string): IntegrationCredentials {
    return new IntegrationCredentials(
      this.id,
      this.userId,
      this.integration,
      this.enabled,
      this.clientId,
      newCiphertext,
      this.lastVerifiedAt,
      this.createdAt,
      new Date(),
    );
  }

  replaceClientId(newClientId: ClientId): IntegrationCredentials {
    return new IntegrationCredentials(
      this.id,
      this.userId,
      this.integration,
      this.enabled,
      newClientId,
      this.clientSecretCiphertext,
      this.lastVerifiedAt,
      this.createdAt,
      new Date(),
    );
  }

  markVerified(at: Date): IntegrationCredentials {
    return new IntegrationCredentials(
      this.id,
      this.userId,
      this.integration,
      this.enabled,
      this.clientId,
      this.clientSecretCiphertext,
      at,
      this.createdAt,
      new Date(),
    );
  }
}
