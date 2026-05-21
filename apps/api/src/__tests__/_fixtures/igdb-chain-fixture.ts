import { afterAll, beforeAll } from 'bun:test';
import type { IgdbChain } from '../../infrastructure/igdb/igdb-chain-holder';
import { igdbChainHolder } from '../../wiring';

type ChainSnapshot = IgdbChain | null;

/**
 * Install a per-file fixture that disables `igdbChainHolder` for all tests
 * in the importing file. Snapshots the prior chain at `beforeAll` and
 * restores the EXACT same instance at `afterAll` (via the test-only
 * `__setChainForTest` escape hatch — NOT via `swap(creds)`, which would
 * rebuild sub-components and break identity).
 *
 * Why per-file (beforeAll/afterAll) instead of per-test (beforeEach/afterEach):
 * `bun test` runs all files in a single process with one ESM module cache,
 * so `igdbChainHolder` is shared. With `bun test --randomize` file order
 * is non-deterministic, so each file must leave the holder in the same
 * state it found. File-scope snapshot+restore is the right granularity.
 *
 * Usage (at top of test file, NOT inside describe/it):
 *   import { useDisabledIgdbChain } from '../__tests__/_fixtures/igdb-chain-fixture';
 *   useDisabledIgdbChain();
 *   describe('my tests', () => { ... });
 */
export function useDisabledIgdbChain(): void {
  let snapshot: ChainSnapshot = null;
  beforeAll(() => {
    snapshot = igdbChainHolder.get();
    igdbChainHolder.swap(null);
  });
  afterAll(() => {
    igdbChainHolder.__setChainForTest(snapshot);
  });
}

/**
 * Install a per-file fixture that primes `igdbChainHolder` with the given
 * placeholder credentials for all tests in the importing file. See
 * `useDisabledIgdbChain` for the snapshot+restore semantics — identical
 * lifecycle, just the target state is "primed" rather than "null".
 *
 * Use this when tests need the IGDB feature to NOT return 503 but ALSO
 * don't need the chain to actually hit the network (e.g. IDOR resistance
 * tests that exercise the route past the 503 gate but never make outbound
 * requests).
 */
export function usePrimedIgdbChain(creds: {
  clientId: string;
  clientSecret: string;
}): void {
  let snapshot: ChainSnapshot = null;
  beforeAll(() => {
    snapshot = igdbChainHolder.get();
    igdbChainHolder.swap(creds);
  });
  afterAll(() => {
    igdbChainHolder.__setChainForTest(snapshot);
  });
}
