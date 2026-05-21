import { eq } from 'drizzle-orm';
import type {
  IntegrationTokenStorage,
  StoredIntegrationToken,
} from '../../domain/integrations/integration-token-storage';
import type { IntegrationKind } from '../../domain/integrations/integration-value-objects';
import { db as defaultDb } from '../db/client';
import { igdbOauthToken } from '../db/schema';

type DB = typeof defaultDb;
export type DrizzleTokenHandle = DB | Parameters<Parameters<DB['transaction']>[0]>[0];

const SINGLETON_ID = 1;

/**
 * TEMP: still single-tenant. Replaced by DrizzleIntegrationOauthTokenStorage
 * in Task 2 of the multi-tenant IGDB plan. Accepts (userId, kind) for port
 * conformance but ignores both — the underlying row is keyed by id=1.
 */
export class DrizzleIgdbTokenStorage implements IntegrationTokenStorage {
  constructor(private readonly db: DrizzleTokenHandle = defaultDb) {}

  withTx(tx: unknown): DrizzleIgdbTokenStorage {
    return new DrizzleIgdbTokenStorage(tx as DrizzleTokenHandle);
  }

  async clear(_userId: string, _kind: IntegrationKind): Promise<void> {
    await this.db.delete(igdbOauthToken).where(eq(igdbOauthToken.id, SINGLETON_ID));
  }

  async read(
    _userId: string,
    _kind: IntegrationKind,
  ): Promise<StoredIntegrationToken | null> {
    const [row] = await this.db
      .select()
      .from(igdbOauthToken)
      .where(eq(igdbOauthToken.id, SINGLETON_ID))
      .limit(1);
    if (!row) return null;
    return {
      accessToken: row.accessToken,
      expiresAt: row.expiresAt,
      obtainedAt: row.obtainedAt,
    };
  }

  async write(
    _userId: string,
    _kind: IntegrationKind,
    record: StoredIntegrationToken,
  ): Promise<void> {
    await this.db
      .insert(igdbOauthToken)
      .values({
        id: SINGLETON_ID,
        accessToken: record.accessToken,
        expiresAt: record.expiresAt,
        obtainedAt: record.obtainedAt,
      })
      .onConflictDoUpdate({
        target: igdbOauthToken.id,
        set: {
          accessToken: record.accessToken,
          expiresAt: record.expiresAt,
          obtainedAt: record.obtainedAt,
        },
      });
  }
}
