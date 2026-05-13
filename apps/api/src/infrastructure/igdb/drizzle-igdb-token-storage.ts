import { eq } from 'drizzle-orm';
import { db as defaultDb } from '../db/client';
import { igdbOauthToken } from '../db/schema';
import type { IgdbTokenStorage, StoredIgdbToken } from './igdb-token-store';

type DB = typeof defaultDb;
export type DrizzleTokenHandle = DB | Parameters<Parameters<DB['transaction']>[0]>[0];

const SINGLETON_ID = 1;

/**
 * Single-row Drizzle adapter for `IgdbTokenStorage`. The `igdb_oauth_token`
 * table holds at most one row keyed by id=1. Writes use INSERT … ON
 * CONFLICT(id) DO UPDATE so we never grow the table.
 *
 * `withTx(tx)` returns a fresh adapter bound to a Drizzle transaction handle
 * so the storage can participate in atomic multi-step writes.
 */
export class DrizzleIgdbTokenStorage implements IgdbTokenStorage {
  constructor(private readonly db: DrizzleTokenHandle = defaultDb) {}

  withTx(tx: unknown): DrizzleIgdbTokenStorage {
    return new DrizzleIgdbTokenStorage(tx as DrizzleTokenHandle);
  }

  async clear(): Promise<void> {
    await this.db.delete(igdbOauthToken).where(eq(igdbOauthToken.id, SINGLETON_ID));
  }

  async read(): Promise<StoredIgdbToken | null> {
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

  async write(record: StoredIgdbToken): Promise<void> {
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
