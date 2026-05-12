/**
 * Application-layer port for atomic write blocks.
 *
 * Use-cases depend on this rather than the concrete Drizzle `db` so they
 * stay framework-free. The infrastructure layer adapts the real db to this
 * port (see `infrastructure/db/drizzle-transaction-runner.ts`).
 *
 * Contract:
 *   - `cb` is invoked exactly once with an opaque `tx` token.
 *   - Throwing from `cb` rolls the transaction back; the error propagates.
 *   - The returned value is the cb's resolved value when it succeeds.
 *
 * The `tx` argument is `unknown` at the port level — repositories
 * downcast it via `repo.withTx(tx)`, which knows what shape to expect.
 */
export interface TransactionRunner {
  run<T>(cb: (tx: unknown) => Promise<T>): Promise<T>;
}
