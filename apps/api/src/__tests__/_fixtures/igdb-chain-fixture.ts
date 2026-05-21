import { afterAll, beforeAll } from 'bun:test';
import type { IgdbChain, IgdbChainHolder } from '../../infrastructure/igdb/igdb-chain-holder';

type ChainSnapshot = IgdbChain | null;

/**
 * Install a per-file fixture that disables the given chain holder for all
 * tests in the importing file. Snapshots the prior chain at `beforeAll` and
 * restores the EXACT same instance at `afterAll` via `__setChainForTest`.
 *
 * The holder is passed in (rather than imported from wiring) so the fixture
 * stays portable as the composition root moves from wiring.ts to app.ts.
 */
export function useDisabledIgdbChain(holder: IgdbChainHolder): void {
  let snapshot: ChainSnapshot = null;
  beforeAll(() => {
    snapshot = holder.get();
    holder.swap('fixture-user', null);
  });
  afterAll(() => {
    holder.__setChainForTest(snapshot);
  });
}

/**
 * Install a per-file fixture that primes the given chain holder with the
 * provided credentials for all tests in the importing file. See
 * `useDisabledIgdbChain` for the snapshot+restore semantics.
 */
export function usePrimedIgdbChain(
  holder: IgdbChainHolder,
  creds: { clientId: string; clientSecret: string },
): void {
  let snapshot: ChainSnapshot = null;
  beforeAll(() => {
    snapshot = holder.get();
    holder.swap('fixture-user', creds);
  });
  afterAll(() => {
    holder.__setChainForTest(snapshot);
  });
}
