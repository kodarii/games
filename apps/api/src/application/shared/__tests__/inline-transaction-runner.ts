import type { TransactionRunner } from '../transaction-runner';

/**
 * Test double that invokes the callback inline with a no-op tx token.
 * Use in unit tests where the use-case logic — not the atomicity — is
 * being verified. Production code uses `DrizzleTransactionRunner`.
 */
export class InlineTransactionRunner implements TransactionRunner {
  async run<T>(cb: (tx: unknown) => Promise<T>): Promise<T> {
    return cb({});
  }
}
