# TESTING.md

*Last updated: 2026-05-12*

## Test Framework

**Runner:** `bun:test` (built into Bun). No Jest, Vitest, Mocha config — Bun's test runner is invoked directly.
- No `vitest.config.*` or `jest.config.*` files in repo
- Imports are always: `import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, test } from 'bun:test';`
- `it` and `test` are both used (`it` is preferred; `logger.test.ts` uses `test`)

**Assertions:** Bun's Jest-compatible matchers — `toBe`, `toEqual`, `toBeNull`, `toBeUndefined`, `toBeInstanceOf`, `toHaveLength`, `toThrow`, `toHaveProperty`, `not.*`.

**Run commands:**
```bash
bun test                       # all tests (auto-discovers *.test.ts under cwd)
bun test apps/api              # one workspace
bun test apps/api/src/domain   # one folder
bun test --watch               # watch mode
bun test path/to/file.test.ts  # single file
```
No `test` script in any `package.json` — tests are run via the `bun test` binary directly.

## Test File Organization

Two **co-existing** layouts (both are accepted):

1. **Co-located next to the SUT** — `apps/api/src/application/games/create-game.test.ts` sits next to `create-game.ts`. Used for older tests.
2. **Sibling `__tests__/` folder** — `apps/api/src/domain/games/__tests__/game.test.ts`. Used for newer tests and for grouping multiple suites. **Prefer this layout for new tests.**

Test-only utilities (fakes, in-memory repos) live in `__tests__/` so they ship only with tests — e.g. `apps/api/src/application/shared/__tests__/inline-transaction-runner.ts`.

Test categories observable from filename suffix:
- `*.test.ts` — unit/component tests, no external deps (most files)
- `*.int.test.ts` — integration tests that touch the real Drizzle DB (`apps/api/src/routes/__tests__/idempotency.int.test.ts`, `games-metadata.int.test.ts`)
- `*.explain.test.ts` — query-plan assertions against SQLite (`drizzle-game-repository.explain.test.ts`)
- `*.snapshot.test.ts` — snapshot validation tests
- `*.idor.test.ts` — IDOR / authorization regression tests (`games.idor.test.ts`)
- `*.optimistic.test.ts` — optimistic-locking regression tests (`update-game.optimistic.test.ts`)

## Test Structure

Standard AAA, plus result-type narrowing for `Result<T, E>`:

```ts
import { describe, expect, it } from 'bun:test';
import { Game } from '../game';

describe('NewGame.create', () => {
  it('happy path', () => {
    const result = NewGame.create(validProps());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.kind).toBe('owned');
      expect(result.value.title).toBe('Elden Ring');
    }
  });

  it('returns error for empty title', () => {
    const result = NewGame.create({ ...validProps(), title: '' });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe('title_empty');
    }
  });
});
```

Key idioms:
- **Test names are full English sentences.** `'returns 400 RFC 7807 when releaseYearFrom > releaseYearTo'`, `'second POST with the same Idempotency-Key returns the cached response and does not create a second game'`.
- **`Result` narrowing pattern:** check `result.ok`, then `if (result.ok) { ... }` or `if (!result.ok) return;` to narrow. Use `expect(result.error.kind).toBe('xxx')`.
- **Builder helpers** at the top of each file: `validProps()`, `wishlistProps()`, `makeWishlistGame(overrides)`, `baseOwned(overrides)`. Always returns a fresh object (function call, not module-level constant) so tests can mutate safely.
- **Shared `validRow` / `validProps` constants** define a canonical valid input; individual tests spread + override one field (`{ ...validProps(), title: '' }`).
- **Use `describe` per class/function, `describe` per scenario when nesting.**

## Mocking

**No mocking library is used.** The repo deliberately avoids `bun:test`'s `mock`/`spyOn` API. Instead, the codebase uses **hand-written fakes and stubs**, leveraging interface-driven design.

**Hand-written fakes** — implement domain interfaces with an in-memory `Map`:
```ts
class FakeGameRepository implements GameRepository {
  private store: Map<number, Game> = new Map();
  withTx = (_tx: unknown): GameRepository => this;
  findByExternalId = async (userId, externalId) => { /* in-memory lookup */ };
  // un-needed methods throw 'not implemented' to fail loudly if accidentally called
  list = async () => { throw new Error('not implemented'); };
}
```
See `apps/api/src/application/games/__tests__/move-to-collection.test.ts:12-83` and `enrich-game-metadata.test.ts:58+`.

**Test-only adapters** ship in `__tests__/`:
- `InlineTransactionRunner` — implements `TransactionRunner` by invoking the callback inline with a no-op tx token (`apps/api/src/application/shared/__tests__/inline-transaction-runner.ts`).

**Global `fetch` stubbing** — assign to `globalThis.fetch` directly and restore in `afterEach`:
```ts
const originalFetch = globalThis.fetch;
let calls: FetchCall[] = [];
function installFetch(impl) {
  globalThis.fetch = ((input, init?) => { calls.push({input, init}); return impl(input, init); }) as typeof fetch;
}
beforeEach(() => { calls = []; });
afterEach(() => { globalThis.fetch = originalFetch; });
```
See `apps/client/src/lib/__tests__/api-fetch.test.ts:1-25`.

**Injectable seams** in production code make this possible without mocking:
- Logger takes `sink: (line: string) => void` and `time: () => string` so tests capture lines and pin the clock (`logger.test.ts:9-25`).
- `CircuitBreaker` takes `now: () => number` for deterministic time.
- `IgdbHttpClient` takes `setTimeoutImpl` so tests can run backoff schedules instantly.
- `TokenBucketRateLimiter` takes time/refill knobs via constructor.

**What NOT to mock:**
- Never mock the `Result` type or domain value objects — construct real ones.
- Never mock Zod schemas — feed them real input.
- Avoid `mock.module` and `spyOn` — they're absent from the codebase; prefer constructor injection.

## Fixtures and Factories

- Inline builder functions per test file (`baseOwned`, `makeWishlistGame`, `validProps`).
- Database integration tests build an **in-memory SQLite** instance per test and apply the real Drizzle migrations:
  ```ts
  // apps/api/src/infrastructure/games/drizzle-game-repository.test.ts:18-23
  function makeTestDb() {
    const sqlite = new Database(':memory:');
    const db = drizzle({ client: sqlite, schema: { ...gameSchema, ...authSchema } });
    migrate(db, { migrationsFolder: MIGRATIONS_DIR });
    return { db, sqlite };
  }
  ```
- Route-level integration tests use the **real shared `db`** (`apps/api/src/infrastructure/db/client`) with a unique synthetic `userId` per file:
  ```ts
  const TEST_USER_ID = `test-user-routes-${crypto.randomUUID()}`;
  afterAll(async () => {
    await db.delete(gamesTable).where(eq(gamesTable.userId, TEST_USER_ID));
  });
  ```
- App-under-test factory pattern: `makeTestApp()` builds a fresh Hono app per `beforeAll`, mounting the real `games` router and a fake auth middleware that stamps `TEST_USER_ID`.

## Coverage

- No coverage thresholds are enforced.
- No coverage report config in repo.
- Generate ad-hoc with `bun test --coverage` if needed.

## Test Types

**Unit tests** — domain value objects, aggregates, pure helpers. Examples: `domain/games/__tests__/game.test.ts`, `domain/games/release-year-range.test.ts`, `infrastructure/metadata/__tests__/normalize-title.test.ts`.

**Use-case tests** — application classes wired with fake repositories and `InlineTransactionRunner`. Examples: `application/games/__tests__/move-to-collection.test.ts`, `application/games/__tests__/enrich-game-metadata.test.ts`.

**Repository tests** — real Drizzle against in-memory SQLite with migrations applied. Examples: `infrastructure/games/drizzle-game-repository.test.ts`, `drizzle-game-repository.explain.test.ts`.

**Route tests (`.test.ts`)** — Hono app instantiated in-process, requests via `app.request(...)`, assertions against problem+json bodies and DB state. Examples: `routes/games.test.ts`, `routes/games.idor.test.ts`, `routes/__tests__/health.test.ts`.

**Integration tests (`.int.test.ts`)** — touch the real shared DB, scoped by a generated `userId` and cleaned in `afterAll`. Examples: `routes/__tests__/idempotency.int.test.ts`, `routes/__tests__/games-metadata.int.test.ts`.

**Client tests** — pure logic and fetch-wrapper tests only. No React component rendering / RTL setup. Examples: `client/src/lib/__tests__/api-fetch.test.ts`, `client/src/lib/__tests__/game-draft.test.ts`.

**E2E:** none.

## Common Patterns

**Async testing** — every `execute()` is `async`; `await` the result and assert on `result.ok`:
```ts
const result = await useCase.execute('ext-wish-1', 'user-A');
expect(result.ok).toBe(true);
if (!result.ok) return;
expect(result.value.kind).toBe('owned');
```

**Error testing — `Result<T, E>`:**
```ts
expect(result.ok).toBe(false);
if (!result.ok) {
  expect(result.error.kind).toBe('release_year_out_of_range');
  const e = result.error as { kind: string; value: number };
  expect(e.value).toBe(1969);
}
```

**Error testing — `throw`:**
```ts
expect(() => ownedGame.moveToCollection()).toThrow(/already owned/);
```

**Problem+JSON assertions:**
```ts
const res = await app.request('/api/games?releaseYearFrom=2030&releaseYearTo=2000');
expect(res.status).toBe(400);
const body = (await res.json()) as Record<string, unknown>;
expect(body.type).toBe('/errors/validation');
expect(body.title).toBe('Invalid input');
expect(Array.isArray(body.issues)).toBe(true);
expect(body).not.toHaveProperty('error');  // legacy-shape leak guard
```

**Lifecycle hooks:**
- `beforeAll` — seed shared fixtures (platforms, app instance).
- `afterAll` — clean DB rows scoped by `TEST_USER_ID`.
- `beforeEach` — reset mutable state (e.g. `nextId = 1`, fresh in-memory SQLite).
- `afterEach` — close SQLite handle (`sqlite.close()`), restore `globalThis.fetch`.

**Type-safety in test data:**
- `as const` for literal-typed fields: `kind: 'owned' as const`, `platform: 'PS5' as const`.
- Cast invalid values explicitly to bypass the type system when testing invariant violations: `'Pending' as unknown as GameStatus`, `'cartridge' as unknown as GameFormat`.
