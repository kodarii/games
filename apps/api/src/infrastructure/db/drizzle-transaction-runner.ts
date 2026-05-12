import type { TransactionRunner } from '../../application/shared/transaction-runner';
import { db as defaultDb } from './client';

/**
 * Structural shape of a Drizzle SQLite handle this runner needs.
 *
 * Drizzle's real `transaction` is typed with a concrete `SQLiteBunTransaction`
 * parameter; our callback uses `unknown`. Function-parameter contravariance
 * makes a `(tx: unknown) => Promise<T>` callback assignable into Drizzle's
 * stricter slot, so the real `db` satisfies this shape without a cast.
 */
export interface DbWithTransaction {
  transaction: <T>(cb: (tx: unknown) => Promise<T>) => Promise<T>;
}

/**
 * Adapts a Drizzle bun-sqlite database to the application-layer
 * `TransactionRunner` port. SQLite opens a BEGIN IMMEDIATE inside
 * `db.transaction(cb)`, serializing concurrent writes; if `cb` throws,
 * the transaction is rolled back and the error rethrows.
 */
export class DrizzleTransactionRunner implements TransactionRunner {
  constructor(private readonly db: DbWithTransaction = defaultDb) {}

  async run<T>(cb: (tx: unknown) => Promise<T>): Promise<T> {
    return this.db.transaction(cb);
  }
}
