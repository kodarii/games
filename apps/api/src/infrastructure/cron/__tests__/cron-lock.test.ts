import Database from 'bun:sqlite';
import { describe, expect, it } from 'bun:test';
import { drizzle } from 'drizzle-orm/bun-sqlite';
import * as authSchema from '../../db/auth-schema';
import * as gameSchema from '../../db/schema';
import { CronLock } from '../cron-lock';

function makeClock(start = 1_700_000_000_000) {
  let current = start;
  return {
    now: () => current,
    advance: (ms: number) => {
      current += ms;
    },
  };
}

function makeDb() {
  const sqlite = new Database(':memory:');
  sqlite.exec(
    'CREATE TABLE cron_locks (name TEXT PRIMARY KEY NOT NULL, locked_until INTEGER NOT NULL, owner TEXT NOT NULL);',
  );
  // Match the production DB's schema typing so CronLock's parameter type
  // accepts it without casts. Only the `cron_locks` table is created above —
  // the rest of the schema is never queried in these tests.
  return drizzle({ client: sqlite, schema: { ...gameSchema, ...authSchema } });
}

describe('CronLock', () => {
  it('first acquirer wins; concurrent second acquirer is rejected while lock is held', async () => {
    const db = makeDb();
    const clock = makeClock();
    const a = new CronLock({ db, owner: 'owner-a', now: clock.now });
    const b = new CronLock({ db, owner: 'owner-b', now: clock.now });

    expect(await a.tryAcquire('cleanup-orphans', 60_000)).toBe(true);
    expect(await b.tryAcquire('cleanup-orphans', 60_000)).toBe(false);
  });

  it('second acquirer succeeds after TTL expires', async () => {
    const db = makeDb();
    const clock = makeClock();
    const a = new CronLock({ db, owner: 'owner-a', now: clock.now });
    const b = new CronLock({ db, owner: 'owner-b', now: clock.now });

    expect(await a.tryAcquire('job', 1_000)).toBe(true);
    expect(await b.tryAcquire('job', 1_000)).toBe(false);

    clock.advance(1_100);
    expect(await b.tryAcquire('job', 1_000)).toBe(true);
  });

  it('release frees the lock for the owner', async () => {
    const db = makeDb();
    const clock = makeClock();
    const a = new CronLock({ db, owner: 'owner-a', now: clock.now });
    const b = new CronLock({ db, owner: 'owner-b', now: clock.now });

    expect(await a.tryAcquire('job', 60_000)).toBe(true);
    await a.release('job');
    expect(await b.tryAcquire('job', 60_000)).toBe(true);
  });

  it('release by non-owner is a no-op (does not steal another holder lock)', async () => {
    const db = makeDb();
    const clock = makeClock();
    const a = new CronLock({ db, owner: 'owner-a', now: clock.now });
    const b = new CronLock({ db, owner: 'owner-b', now: clock.now });

    expect(await a.tryAcquire('job', 60_000)).toBe(true);
    await b.release('job'); // wrong owner — lock should still be held by A
    expect(await b.tryAcquire('job', 60_000)).toBe(false);
  });
});
