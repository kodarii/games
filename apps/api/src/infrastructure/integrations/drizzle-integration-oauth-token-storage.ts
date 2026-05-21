import { and, eq } from 'drizzle-orm';
import type {
  IntegrationTokenStorage,
  StoredIntegrationToken,
} from '../../domain/integrations/integration-token-storage';
import type { IntegrationKind } from '../../domain/integrations/integration-value-objects';
import { db as defaultDb } from '../db/client';
import { integrationOauthToken } from '../db/schema';

type DB = typeof defaultDb;
export type DrizzleTokenHandle = DB | Parameters<Parameters<DB['transaction']>[0]>[0];

/**
 * Generic Drizzle adapter for `IntegrationTokenStorage`. Rows are keyed on
 * `(user_id, integration)`; writes use `INSERT … ON CONFLICT(user_id, integration)
 * DO UPDATE` so the table cannot grow beyond one row per (user, integration).
 *
 * `withTx(tx)` returns a fresh adapter bound to a Drizzle transaction handle
 * so the storage can participate in atomic multi-step writes (used by
 * ClearIgdbIntegration to delete the row alongside the credentials row).
 */
export class DrizzleIntegrationOauthTokenStorage implements IntegrationTokenStorage {
  constructor(private readonly db: DrizzleTokenHandle = defaultDb) {}

  withTx(tx: unknown): DrizzleIntegrationOauthTokenStorage {
    return new DrizzleIntegrationOauthTokenStorage(tx as DrizzleTokenHandle);
  }

  async read(userId: string, kind: IntegrationKind): Promise<StoredIntegrationToken | null> {
    const [row] = await this.db
      .select()
      .from(integrationOauthToken)
      .where(
        and(
          eq(integrationOauthToken.userId, userId),
          eq(integrationOauthToken.integration, kind),
        ),
      )
      .limit(1);
    if (!row) return null;
    return {
      accessToken: row.accessToken,
      expiresAt: row.expiresAt,
      obtainedAt: row.obtainedAt,
    };
  }

  async write(
    userId: string,
    kind: IntegrationKind,
    record: StoredIntegrationToken,
  ): Promise<void> {
    await this.db
      .insert(integrationOauthToken)
      .values({
        userId,
        integration: kind,
        accessToken: record.accessToken,
        expiresAt: record.expiresAt,
        obtainedAt: record.obtainedAt,
      })
      .onConflictDoUpdate({
        target: [integrationOauthToken.userId, integrationOauthToken.integration],
        set: {
          accessToken: record.accessToken,
          expiresAt: record.expiresAt,
          obtainedAt: record.obtainedAt,
        },
      });
  }

  async clear(userId: string, kind: IntegrationKind): Promise<void> {
    await this.db
      .delete(integrationOauthToken)
      .where(
        and(
          eq(integrationOauthToken.userId, userId),
          eq(integrationOauthToken.integration, kind),
        ),
      );
  }
}
