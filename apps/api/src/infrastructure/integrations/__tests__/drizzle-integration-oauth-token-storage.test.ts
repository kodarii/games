import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { eq, inArray } from 'drizzle-orm';
import { db } from '../../db/client';
import { DrizzleTransactionRunner } from '../../db/drizzle-transaction-runner';
import { integrationOauthToken } from '../../db/schema';
import { DrizzleIntegrationOauthTokenStorage } from '../drizzle-integration-oauth-token-storage';

const USER_A = `tok-a-${crypto.randomUUID()}`;
const USER_B = `tok-b-${crypto.randomUUID()}`;

async function cleanup(): Promise<void> {
  await db
    .delete(integrationOauthToken)
    .where(inArray(integrationOauthToken.userId, [USER_A, USER_B]));
}

describe('DrizzleIntegrationOauthTokenStorage', () => {
  let storage: DrizzleIntegrationOauthTokenStorage;

  beforeEach(async () => {
    await cleanup();
    storage = new DrizzleIntegrationOauthTokenStorage();
  });
  afterEach(cleanup);

  it('read on empty table returns null', async () => {
    expect(await storage.read(USER_A, 'igdb')).toBeNull();
  });

  it('write then read round-trips', async () => {
    const record = {
      accessToken: 'tok-A',
      expiresAt: new Date('2030-01-01T00:00:00Z'),
      obtainedAt: new Date('2026-01-01T00:00:00Z'),
    };
    await storage.write(USER_A, 'igdb', record);
    const got = await storage.read(USER_A, 'igdb');
    expect(got).toEqual(record);
  });

  it('write is upsert on (user_id, integration)', async () => {
    await storage.write(USER_A, 'igdb', {
      accessToken: 'first',
      expiresAt: new Date('2030-01-01T00:00:00Z'),
      obtainedAt: new Date('2026-01-01T00:00:00Z'),
    });
    await storage.write(USER_A, 'igdb', {
      accessToken: 'second',
      expiresAt: new Date('2031-01-01T00:00:00Z'),
      obtainedAt: new Date('2026-06-01T00:00:00Z'),
    });
    const rows = await db
      .select()
      .from(integrationOauthToken)
      .where(eq(integrationOauthToken.userId, USER_A));
    expect(rows.length).toBe(1);
    expect(rows[0]?.accessToken).toBe('second');
  });

  it('per-user isolation: user A cannot read user B', async () => {
    await storage.write(USER_B, 'igdb', {
      accessToken: 'B-tok',
      expiresAt: new Date('2030-01-01T00:00:00Z'),
      obtainedAt: new Date('2026-01-01T00:00:00Z'),
    });
    expect(await storage.read(USER_A, 'igdb')).toBeNull();
    expect(await storage.read(USER_B, 'igdb')).not.toBeNull();
  });

  it('clear only removes the targeted (userId, kind)', async () => {
    const sample = {
      accessToken: 't',
      expiresAt: new Date('2030-01-01T00:00:00Z'),
      obtainedAt: new Date('2026-01-01T00:00:00Z'),
    };
    await storage.write(USER_A, 'igdb', sample);
    await storage.write(USER_B, 'igdb', sample);
    await storage.clear(USER_A, 'igdb');
    expect(await storage.read(USER_A, 'igdb')).toBeNull();
    expect(await storage.read(USER_B, 'igdb')).not.toBeNull();
  });

  it('withTx propagates writes through the transaction handle', async () => {
    const runner = new DrizzleTransactionRunner(db);
    await runner.run(async (tx) => {
      const txStorage = storage.withTx(tx);
      await txStorage.write(USER_A, 'igdb', {
        accessToken: 'tx-tok',
        expiresAt: new Date('2030-01-01T00:00:00Z'),
        obtainedAt: new Date('2026-01-01T00:00:00Z'),
      });
    });
    expect((await storage.read(USER_A, 'igdb'))?.accessToken).toBe('tx-tok');
  });
});
