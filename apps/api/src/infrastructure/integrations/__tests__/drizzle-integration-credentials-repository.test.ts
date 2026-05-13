import Database from 'bun:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { drizzle } from 'drizzle-orm/bun-sqlite';
import { migrate } from 'drizzle-orm/bun-sqlite/migrator';
import type { IntegrationCredentials } from '../../../domain/integrations/integration-credentials';
import { ClientId } from '../../../domain/integrations/integration-value-objects';
import { NewIntegrationCredentials } from '../../../domain/integrations/new-integration-credentials';
import * as authSchema from '../../db/auth-schema';
import { user as userTable } from '../../db/auth-schema';
import * as gameSchema from '../../db/schema';
import { DrizzleIntegrationCredentialsRepository } from '../drizzle-integration-credentials-repository';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = resolve(__dirname, '../../../../drizzle');

type TestDb = ReturnType<typeof makeTestDb>['db'];

function makeTestDb() {
  const sqlite = new Database(':memory:');
  const db = drizzle({ client: sqlite, schema: { ...gameSchema, ...authSchema } });
  migrate(db, { migrationsFolder: MIGRATIONS_DIR });
  return { db, sqlite };
}

async function seedUser(db: TestDb, id: string): Promise<void> {
  await db.insert(userTable).values({
    id,
    name: `user-${id}`,
    email: `${id}@example.com`,
    emailVerified: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
}

function buildCreds(overrides: {
  id?: string;
  userId: string;
  clientId?: string;
  clientSecretCiphertext?: string;
}): IntegrationCredentials {
  const result = NewIntegrationCredentials.create({
    id: overrides.id ?? `cred-${overrides.userId}`,
    userId: overrides.userId,
    integration: 'igdb',
    clientId: overrides.clientId ?? 'twitch-id',
    clientSecretCiphertext: overrides.clientSecretCiphertext ?? 'cipher-blob',
    now: new Date('2026-05-01T12:00:00.000Z'),
  });
  if (!result.ok) throw new Error('test setup failed');
  return result.value;
}

describe('DrizzleIntegrationCredentialsRepository', () => {
  let db: TestDb;
  let sqlite: Database;
  let repo: DrizzleIntegrationCredentialsRepository;

  beforeEach(async () => {
    const t = makeTestDb();
    db = t.db;
    sqlite = t.sqlite;
    repo = new DrizzleIntegrationCredentialsRepository(db);
    await seedUser(db, 'user-A');
    await seedUser(db, 'user-B');
  });

  afterEach(() => {
    sqlite.close();
  });

  it('save then findByUserAndKind returns the same aggregate', async () => {
    const creds = buildCreds({ userId: 'user-A' });
    await repo.save(creds);

    const found = await repo.findByUserAndKind('user-A', 'igdb');
    expect(found).not.toBeNull();
    if (!found) return;
    expect(found.id).toBe(creds.id);
    expect(found.userId).toBe('user-A');
    expect(found.integration).toBe('igdb');
    expect(found.enabled).toBe(false);
    expect(found.clientId.value).toBe('twitch-id');
    expect(found.clientSecretCiphertext).toBe('cipher-blob');
    expect(found.lastVerifiedAt).toBeNull();
    expect(found.createdAt).toEqual(creds.createdAt);
    expect(found.updatedAt).toEqual(creds.updatedAt);
  });

  it('findByUserAndKind returns null when no row exists', async () => {
    const found = await repo.findByUserAndKind('user-A', 'igdb');
    expect(found).toBeNull();
  });

  it('findByUserAndKind for other user does not leak (IDOR isolation)', async () => {
    const credsA = buildCreds({ userId: 'user-A' });
    await repo.save(credsA);

    const foundForB = await repo.findByUserAndKind('user-B', 'igdb');
    expect(foundForB).toBeNull();
  });

  it('save twice on same (user, kind) overwrites — upsert keyed on unique index', async () => {
    const original = buildCreds({ userId: 'user-A', clientId: 'first-id' });
    await repo.save(original);

    const replaced = original
      .replaceClientId(ClientId.fromTrusted('second-id'))
      .replaceSecret('second-cipher')
      .enable();
    await repo.save(replaced);

    const found = await repo.findByUserAndKind('user-A', 'igdb');
    expect(found).not.toBeNull();
    if (!found) return;
    expect(found.clientId.value).toBe('second-id');
    expect(found.clientSecretCiphertext).toBe('second-cipher');
    expect(found.enabled).toBe(true);
  });

  it('save persists lastVerifiedAt after markVerified', async () => {
    const verifiedAt = new Date('2026-05-02T08:00:00.000Z');
    const creds = buildCreds({ userId: 'user-A' }).markVerified(verifiedAt);
    await repo.save(creds);

    const found = await repo.findByUserAndKind('user-A', 'igdb');
    expect(found).not.toBeNull();
    if (!found) return;
    expect(found.lastVerifiedAt).toEqual(verifiedAt);
  });

  it('delete removes the row for the matching user+kind', async () => {
    await repo.save(buildCreds({ userId: 'user-A' }));
    await repo.delete('user-A', 'igdb');

    const found = await repo.findByUserAndKind('user-A', 'igdb');
    expect(found).toBeNull();
  });

  it('delete on other user does NOT affect user A (IDOR isolation)', async () => {
    await repo.save(buildCreds({ userId: 'user-A' }));
    await repo.save(buildCreds({ id: 'cred-B', userId: 'user-B' }));

    await repo.delete('user-B', 'igdb');

    const foundA = await repo.findByUserAndKind('user-A', 'igdb');
    const foundB = await repo.findByUserAndKind('user-B', 'igdb');
    expect(foundA).not.toBeNull();
    expect(foundB).toBeNull();
  });

  it('withTx returns a new repo bound to the supplied transaction handle', async () => {
    await db.transaction(async (tx) => {
      const txRepo = repo.withTx(tx);
      expect(txRepo).not.toBe(repo);
      await txRepo.save(buildCreds({ userId: 'user-A' }));
    });

    const found = await repo.findByUserAndKind('user-A', 'igdb');
    expect(found).not.toBeNull();
  });
});
