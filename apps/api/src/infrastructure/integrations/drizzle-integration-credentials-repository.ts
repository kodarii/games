import { and, eq } from 'drizzle-orm';
import { IntegrationCredentials } from '../../domain/integrations/integration-credentials';
import type { IntegrationCredentialsRepository } from '../../domain/integrations/integration-credentials-repository';
import type { IntegrationKind } from '../../domain/integrations/integration-value-objects';
import { db as defaultDb } from '../db/client';
import { integrationCredentials } from '../db/schema';
import type { IntegrationCredentialRow } from '../db/schema';

/**
 * Drizzle handle — accepts both the top-level `db` and a `tx` inside a
 * `db.transaction(...)` callback. Mirrors the convention from
 * `DrizzleGameRepository`.
 */
type DB = typeof defaultDb;
export type DrizzleHandle = DB | Parameters<Parameters<DB['transaction']>[0]>[0];

export class DrizzleIntegrationCredentialsRepository implements IntegrationCredentialsRepository {
  constructor(private readonly db: DrizzleHandle = defaultDb) {}

  withTx(tx: unknown): DrizzleIntegrationCredentialsRepository {
    return new DrizzleIntegrationCredentialsRepository(tx as DrizzleHandle);
  }

  private mapRow(row: IntegrationCredentialRow): IntegrationCredentials {
    return IntegrationCredentials.fromPersistence({
      id: row.id,
      userId: row.userId,
      integration: row.integration as IntegrationKind,
      enabled: row.enabled,
      clientId: row.clientId,
      clientSecretCiphertext: row.clientSecretCiphertext,
      lastVerifiedAt: row.lastVerifiedAt,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    });
  }

  async findByUserAndKind(
    userId: string,
    kind: IntegrationKind,
  ): Promise<IntegrationCredentials | null> {
    const [row] = await this.db
      .select()
      .from(integrationCredentials)
      .where(
        and(
          eq(integrationCredentials.userId, userId),
          eq(integrationCredentials.integration, kind),
        ),
      )
      .limit(1);
    return row ? this.mapRow(row) : null;
  }

  async save(creds: IntegrationCredentials): Promise<void> {
    await this.db
      .insert(integrationCredentials)
      .values({
        id: creds.id,
        userId: creds.userId,
        integration: creds.integration,
        enabled: creds.enabled,
        clientId: creds.clientId.value,
        clientSecretCiphertext: creds.clientSecretCiphertext,
        lastVerifiedAt: creds.lastVerifiedAt,
        createdAt: creds.createdAt,
        updatedAt: creds.updatedAt,
      })
      .onConflictDoUpdate({
        target: [integrationCredentials.userId, integrationCredentials.integration],
        set: {
          enabled: creds.enabled,
          clientId: creds.clientId.value,
          clientSecretCiphertext: creds.clientSecretCiphertext,
          lastVerifiedAt: creds.lastVerifiedAt,
          updatedAt: creds.updatedAt,
        },
      });
  }

  async delete(userId: string, kind: IntegrationKind): Promise<void> {
    await this.db
      .delete(integrationCredentials)
      .where(
        and(
          eq(integrationCredentials.userId, userId),
          eq(integrationCredentials.integration, kind),
        ),
      );
  }
}
