# CONVENTIONS.md

*Last updated: 2026-05-12*

## Tooling

**Formatter / Linter:** Biome 1.9.4 — single tool for format + lint.
- Config: `biome.json`
- Scripts: `bun run lint` (= `biome check .`), `bun run format` (= `biome format --write .`)

**TypeScript:** `^5.6.3`. Base: `tsconfig.base.json` — `strict: true`, `target: ES2022`, `module: ESNext`, `moduleResolution: Bundler`, `isolatedModules: true`. `noUncheckedIndexedAccess` is **off** — `arr[0]` is `T` not `T | undefined`, so guard manually at boundaries.

**Package manager:** Bun (workspaces `apps/*`, `packages/*`). No npm/pnpm lockfile. `bun.lock` is committed.

## Formatting Rules (Biome)

| Rule | Setting |
|---|---|
| Indent | 2 spaces |
| Line width | 100 |
| JS/TS quotes | single `'foo'` |
| JSX quotes | double `"foo"` |
| Semicolons | always |
| Trailing commas | all |
| Arrow parens | always `(x) => …` |
| Imports | auto-organized (`organizeImports.enabled = true`) |

**Linter rule overrides:**
- `style/noNonNullAssertion`: **off** — `!` allowed
- `suspicious/noExplicitAny`: **warn** — discouraged, not blocking. Add inline biome-ignore with rationale when used (see `apps/api/src/routes/_problem-json.ts:62`)
- `a11y/noSvgWithoutTitle`: off
- `complexity/noForEach`: off

**Lint/format ignores:** `**/dist`, `**/build`, `**/node_modules`, `**/.turbo`, `**/components/ui/**` (shadcn primitives — never lint these), `apps/api/src/infrastructure/db/auth-schema.ts` (better-auth generated), `apps/api/drizzle/**` (generated migrations).

## Naming Patterns

**Files:**
- TS modules: `kebab-case.ts` — `create-game.ts`, `drizzle-game-repository.ts`, `game-value-objects.ts`
- React components: `kebab-case.tsx` — `game-form.tsx`, `data-table.tsx`, `add-platform-dialog.tsx`
- Tests: `<name>.test.ts` (co-located OR sibling `__tests__/`) — both coexist; new tests prefer `__tests__/`
- Integration tests: `<name>.int.test.ts` (`apps/api/src/routes/__tests__/idempotency.int.test.ts`)
- Snapshot tests: `<name>.snapshot.test.ts`

**Directories:** lowercase `kebab-case`. API source layered DDD: `domain/<aggregate>/`, `application/<aggregate>/`, `infrastructure/<adapter>/`, `routes/`.

**Classes:** `PascalCase`. Aggregates and use-cases are classes. Use-cases have one `execute(...)` method.

**Functions/vars:** `camelCase`. React hooks: `use<Thing>` — `useGameDraft`, `useInfiniteGamesQuery`.

**Types/interfaces:** `PascalCase` — `CreateGameInput`, `GameRepository`, `ProblemJson`.

**Discriminated-union errors** use `kind:` literal in `snake_case`:
```ts
type CreateGameError =
  | { kind: 'invalid_input'; issues: z.ZodIssue[] }
  | { kind: 'domain'; error: GameValidationError };
```
Error `kind` examples: `'release_year_out_of_range'`, `'kind_invalid_state'`, `'purchased_at_in_future'`, `'optimistic_lock'`, `'not_found'`, `'conflict'`, `'already_owned'`.

**Constants:** module-level frozen arrays/values in `SCREAMING_SNAKE_CASE` — `GAME_FORMATS`, `STATUS_OPTS`, `ARRAY_PARAM_LIMIT`, `NETWORK_ERROR_STATUS`.

**Zod schemas:** `<Name>Schema` — `OwnedSchema`, `CreateGameInputSchema`, `ListGamesQuerySchema`.

## Import Organization

Biome auto-sorts. Observed grouping:
1. Node built-ins — `node:path`, `node:url`
2. External packages — `hono`, `zod`, `drizzle-orm`, `@tanstack/react-query`, `react`
3. Workspace packages — `@apex/shared`
4. Path-aliased internals (client only) — `@/components/...`, `@/hooks/...`, `@/lib/...`
5. Relative imports — `../../domain/games/game`, `./api`

**Type-only imports:** prefer `import type { ... }` when only types are used; mixed-form `import { type Result, ok, err } from '...'` is common.

**Path aliases:** client uses `@/*` → `apps/client/src/*` (`vite.config.ts`, `tsconfig.app.json`). API uses **only relative imports** — there is no `@/` alias on the server.

## Error Handling

**Domain/application — `Result<T, E>`** (`apps/api/src/domain/shared/result.ts`):
```ts
export type Result<T, E> = { ok: true; value: T } | { ok: false; error: E };
export const ok = <T>(value: T): Result<T, never> => ({ ok: true, value });
export const err = <E>(error: E): Result<never, E> => ({ ok: false, error });
```
- Validation/business-rule failures **return `err(...)`, never throw**.
- All use-case `execute()` signatures return `Promise<Result<Success, FooError>>`.
- Canonical usage: `apps/api/src/application/games/create-game.ts`.

**Programmer errors — `throw new Error(...)`** only for impossible-state invariants (e.g. `list-games.ts:44`, `Game.moveToCollection` when already-owned, `auth-config.ts` boot-time config errors, `uploadthing-cover-storage.ts:19`).

**HTTP — RFC 7807 problem+json** (`apps/api/src/routes/_problem-json.ts`): every error response is `{ type, title, status, detail, issues? }`. Helpers: `zodIssuesToProblemJson`, `domainProblem`, `optimisticLockProblem`, `payloadTooLargeProblem`, `internalProblem`. Mount `attachProblemJsonErrorHandler(app)` once per Hono app — it handles `ZodError → 400` and uncaught throws → 500. Tests assert `body.type === '/errors/validation'` etc.

**Client — `ApiError`** (`apps/client/src/lib/api-fetch.ts`): single `apiFetch()` wrapper parses problem+json bodies and throws `ApiError(message, status, body)`. Network failures get `status = 0`. UI branches via `instanceof ApiError`.

## Validation

Zod 4 (`zod ^4.3.6`) is the single validation library across all workspaces.
- Validation lives at the **application-layer boundary**, not in routes.
- Prefer `safeParse` + `Result` over `.parse()` (which throws).
- Tagged unions: `z.discriminatedUnion('kind', [OwnedSchema, WishlistSchema])`.
- Coerce strings at the edge: `z.coerce.number().int().min(1970).max(2100)`.
- Cross-field invariants: `.refine((d) => d.from <= d.to, { path: ['from'], message: '...' })`.

## Logging

**Structured JSON logger** — `apps/api/src/infrastructure/logging/logger.ts`. `Logger` interface: `event(name, fields?)`, `info/warn/error/debug({ event, ...fields })`, `child(bindings)`. One JSON line per call. Error fields auto-serialize to `{ name, message, stack }`.
- **No `console.*` in API production code.** The only `console.log` lives inside the logger module itself as the default sink (`logger.ts:127`); tests inject their own sink.
- Request-scoped child loggers attach `requestId`, `userId` via `requestContext()` middleware. Access via `c.get('logger') as Logger`.

Client: `console.error` is acceptable for unexpected `apiFetch` failures, but surface via TanStack Query state where possible.

## Function Design

- Pure where possible; side effects live in `infrastructure/` adapters and `routes/`.
- **Constructor-injected dependencies** for use-cases:
  ```ts
  export class CreateGame {
    constructor(
      private readonly repo: GameRepository,
      private readonly platformRepo: PlatformRepository,
    ) {}
    async execute(input: unknown, userId: string): Promise<Result<Game, CreateGameError>> { ... }
  }
  ```
- Single public method per use-case (`execute`).
- Aggregates are immutable; mutating methods return a new instance (`Game.applyMetadata` → `Result<Game, ...>`).
- Keep helpers module-private unless reused (e.g. `escapeLikeWildcards` in `list-games.ts`).

## Module Design

- **Named exports only.** No `export default` in `src/` (defaults appear only in `vite.config.ts`, `drizzle.config.ts`, etc.).
- **No barrel `index.ts` files** in API code — every import names the exact file (`from '../../domain/games/game'`). Maintains DDD-layer visibility.
- Shared cross-package types live in `@apex/shared` (`packages/shared/src/index.ts` re-exports import schemas/types).
- Client uses `@/components/...` / `@/lib/...` aliases; sub-folders (`components/ui`, `components/auth`, `components/layout`) imported by file, not via barrels.

## Comments

Comment the **why**, never the **what**.
- `apps/api/src/application/games/delete-game.ts:9-19` — long TSDoc explains why cover cleanup is intentionally deferred to a cron (race conditions).
- TSDoc on public domain methods and exported interfaces (`Game.moveToCollection`, `Logger`, `ApiError`, `apiFetch`).
- Biome-ignore directives are always accompanied by a rationale: `// biome-ignore lint/suspicious/noExplicitAny: Hono generic shape varies per app instance.`

Avoid: commented-out code, redundant comments restating the name, temporal markers ("recently changed").

## Domain Modelling Conventions

Observed in every aggregate under `apps/api/src/domain/` — follow when adding new aggregates:

- **Private constructor + static factory.** `new Game(...)` is private; callers use `Game.fromPersistence(row)` (trusted) or `NewGame.create(props)` (validating, returns `Result`).
- **Value objects wrap primitives** with `create(...)` (validates, returns `Result`) and `fromTrusted(...)` (skips validation, hydration only). Access raw via `.value`. Examples: `ReleaseYear`, `HoursPlayed`, `Price`, `PurchasedAt`, `CoverImageUrl`, `ExternalMetadataRef`.
- **Aggregates are immutable.** Mutating methods return a fresh instance wrapped in `Result`.
- **Repository interfaces live in `domain/`**, Drizzle implementations in `infrastructure/`.
- **Optimistic locking:** pass `expectedUpdatedAt: Date` on `update`/`delete`/`saveMetadata`. Infra throws `OptimisticLockError`; use-cases catch and return `err({ kind: 'conflict' })`.
