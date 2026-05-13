# IGDB integration tile — Phase 5: Routes + env cleanup

## Goal
Expose the use-cases over HTTP:
- `GET    /api/integrations/igdb`
- `PUT    /api/integrations/igdb`
- `DELETE /api/integrations/igdb`

Plug the idempotency middleware on `PUT`/`DELETE`. Remove `IGDB_CLIENT_ID`
and `IGDB_CLIENT_SECRET` from the env schema (and from any CI/`.env.example`
file). Make `GET /api/games/metadata/status` read the chain holder's live
state instead of a boot-time constant.

## Definition of Done
- [ ] Integration tests pass: `bun --filter @apex/api test apps/api/src/routes/__tests__/integrations.int.test.ts`
- [ ] All previous tests still pass: `bun --filter @apex/api test`
- [ ] `bun --filter @apex/api run typecheck` + `bun --filter @apex/api run lint` clean
- [ ] App boots without `IGDB_CLIENT_ID`/`IGDB_CLIENT_SECRET` set in env
- [ ] `curl http://localhost:3001/api/games/metadata/status` returns
      `{ igdbConfigured: false }` on a fresh DB, `{ igdbConfigured: true }`
      after a successful `PUT /api/integrations/igdb`

## Context
**Runtime:** Bun. `bun --filter @apex/api ...`.
**HTTP framework:** Hono. Sub-routers live in `apps/api/src/routes/`.
Sub-routers are mounted in `apps/api/src/index.ts`. Middleware composition
lives in `apps/api/src/routes/middleware/`.
**Error shape:** RFC 7807 problem+json (see `apps/api/src/routes/_problem-json.ts`).

## Design decisions
- Endpoints (all behind `requireAuth`, user comes from `c.get('user').id`):

  `GET /api/integrations/igdb` → 200:
  ```ts
  {
    status: 'not-configured' | 'configured',
    enabled: boolean,
    clientIdMasked: string | null,   // 'apex-public-…d9f2' style, null when not-configured
    hasSecret: boolean,
    lastVerifiedAt: string | null,   // ISO-8601
    updatedAt: string | null,
  }
  ```

  `PUT /api/integrations/igdb` body:
  ```ts
  {
    clientId: string,                  // required, trimmed, 1..128
    clientSecret: string | null,       // null means "keep existing"; required on first save
    enabled: boolean,
  }
  ```
  Headers: `Idempotency-Key: <uuid>` required (per project convention).
  Responses:
  - 200 with the same shape as `GET` — saved + verified.
  - 400 problem+json `type:/errors/invalid-input` — Zod validation failure.
  - 422 problem+json `type:/errors/invalid-credentials` + `{ reason: 'client_id'|'client_secret'|'unknown' }` — Twitch said no.
  - 503 problem+json `type:/errors/twitch-unavailable` + `{ status }` — 5xx from Twitch.
  - 504 problem+json `type:/errors/twitch-timeout` — verifier timed out / network unreachable.
  - 409 problem+json `type:/errors/storage-corrupt` — decrypt failed (shouldn't happen in practice).

  `DELETE /api/integrations/igdb`:
  - 204 No Content on success.
  - `Idempotency-Key` required.

- Client ID masking: pure function `maskClientId(value: string): string`.
  Format: take first 12 chars, append `…`, append last 4 chars. If the
  string is ≤16 chars, mask to `…<last 4>`. Implement in
  `apps/api/src/routes/integrations.ts` (route-local helper — no need to
  pollute the domain).
- Status endpoint update: `r.get('/status', ...)` reads
  `igdbChainHolder.isConfigured()` at request time, not from a boot-time const.

## Relevant files (edit only these)
- `apps/api/src/routes/integrations.ts` — new sub-router (factory function returning the Hono instance)
- `apps/api/src/routes/__tests__/integrations.int.test.ts` — integration test
- `apps/api/src/index.ts` — mount the new router at `/api/integrations`
- `apps/api/src/wiring.ts` — instantiate the two use-cases, expose them on the wiring exports
- `apps/api/src/routes/games-metadata.ts` — change `/status` to use `igdbChainHolder.isConfigured()`
- `apps/api/src/infrastructure/config/env.ts` — DELETE `IGDB_CLIENT_ID` and `IGDB_CLIENT_SECRET` lines (keep `IGDB_TIMEOUT_MS`, `IGDB_CACHE_TTL_DAYS`)
- `.env.example` (if it exists) — remove the two env entries with a comment block explaining the migration
- `CLAUDE.md` — update the env-vars section to reflect the removal (small surgical edit)

## Files to read but NOT edit
- `apps/api/src/routes/middleware/require-auth.ts` — auth gate pattern
- `apps/api/src/routes/middleware/idempotency-key.ts` — middleware signature
- `apps/api/src/routes/_problem-json.ts` — helpers for problem responses
- `apps/api/src/routes/games.ts` — canonical route module shape (sub-router + factory)
- Phase 4 use-cases (`SaveIgdbIntegration`, `ClearIgdbIntegration`)
- `apps/api/src/wiring.ts` — how `idempotencyKeyMiddleware` is constructed

## Constraints
- Route handlers are THIN: parse → call use-case → map Result to HTTP. Max ~25
  lines per handler. Logic in the use-case.
- Zod validation runs at the route entry (parse `await c.req.json()` with
  `safeParse`). On failure, return the `zodIssuesToProblemJson` helper.
- DO NOT trust the body's `userId` (there isn't one in the schema). User
  always comes from `c.get('user').id`.
- Idempotency-Key middleware ONLY on `PUT` and `DELETE`. `GET` doesn't need it.
- DELETE returns 204 with no body. The frontend reads success from the status code.
- The integration test uses a fresh in-memory sqlite + a fake verifier
  injected via the wiring's `createApp({...})` factory — DO NOT make real
  Twitch HTTP calls from a test.

## Steps

### Step 1: Sub-router skeleton + Zod schemas + status endpoint update
**Files:**
- `apps/api/src/routes/integrations.ts`
- `apps/api/src/routes/games-metadata.ts` (small edit)

In `integrations.ts`, write the router factory:
```ts
export interface IntegrationsRouterDeps {
  readonly saveIgdbIntegration: SaveIgdbIntegration;
  readonly clearIgdbIntegration: ClearIgdbIntegration;
  readonly integrationCredentialsRepository: IntegrationCredentialsRepository;
}

export function createIntegrationsRouter(deps: IntegrationsRouterDeps) {
  const r = new Hono<{ Variables: AuthVariables }>();
  // GET /igdb — see Step 2
  // PUT /igdb — see Step 3
  // DELETE /igdb — see Step 3
  return r;
}
```

Define the PUT body schema:
```ts
const putBodySchema = z.object({
  clientId: z.string().trim().min(1).max(128),
  clientSecret: z.union([z.string().min(1).max(128), z.null()]).default(null),
  enabled: z.boolean(),
});
```

Update `games-metadata.ts:14` from
```ts
r.get('/status', (c) => c.json({ igdbConfigured: deps.igdbConfigured }, 200));
```
to take a function:
```ts
export interface GamesMetadataRouterDeps {
  readonly searchGameMetadata: () => SearchGameMetadata | null;
  readonly igdbConfigured: () => boolean;
}
// ...
r.get('/status', (c) => c.json({ igdbConfigured: deps.igdbConfigured() }, 200));
```
And update `wiring.ts` to pass `() => igdbChainHolder.isConfigured()` and
`() => igdbChainHolder.get()?.searchGameMetadata ?? null`. This decouples
the router from boot-time constants. (The `/candidates` route's `null`
check then runs against the live chain.)

Mount the new router in `apps/api/src/index.ts`:
```ts
app.route('/api/integrations', createIntegrationsRouter({
  saveIgdbIntegration,
  clearIgdbIntegration,
  integrationCredentialsRepository,
}));
```
Apply `requireAuth` to the sub-router as a whole (look at how
`/api/games` does it).

Boot once with `bun --filter @apex/api run dev`, smoke-test
`curl http://localhost:3001/api/integrations/igdb` and the metadata-status
endpoint with no row in the DB. Stop the dev server.

### Step 2: GET endpoint + integration test scaffolding (RED)
**Files:**
- `apps/api/src/routes/integrations.ts` (add handler)
- `apps/api/src/routes/__tests__/integrations.int.test.ts` (new)

Implement `GET /api/integrations/igdb`:
- Fetch existing row via `repo.findByUserAndKind(userId, 'igdb')`.
- If `null` → respond `{ status: 'not-configured', enabled: false, clientIdMasked: null, hasSecret: false, lastVerifiedAt: null, updatedAt: null }`.
- Else → `{ status: 'configured', enabled: row.enabled, clientIdMasked: maskClientId(row.clientId.value), hasSecret: true, lastVerifiedAt: row.lastVerifiedAt?.toISOString() ?? null, updatedAt: row.updatedAt.toISOString() }`.

Implement `maskClientId`:
- `value.length <= 16` → return `'…' + value.slice(-4)`.
- else → `value.slice(0, 12) + '…' + value.slice(-4)`.

**Integration test scaffolding** — copy the structure from
`apps/api/src/routes/__tests__/idempotency.int.test.ts` or a similar
`*.int.test.ts` file. The test must:
- Spin up a fresh `:memory:` sqlite per test.
- Construct the wiring with a `FakeIgdbCredentialsVerifier` (matching the port).
- Sign in a test user (mirror how existing int tests bootstrap the auth session).
- Use `app.request(...)` to hit endpoints, asserting on JSON bodies.

**Test cases for GET:**
- `GET /api/integrations/igdb on a fresh DB → 200 with status: 'not-configured'`
- `GET /api/integrations/igdb after seeding a row → 200 with status: 'configured', clientIdMasked matches the format`
- `GET without auth → 401` (require-auth middleware behavior)

Run the test → first cases green; PUT/DELETE cases (added in Step 3) RED.

### Step 3: PUT + DELETE handlers + idempotency + full test sweep
**Files:**
- `apps/api/src/routes/integrations.ts` (extend)
- `apps/api/src/routes/__tests__/integrations.int.test.ts` (extend)

Map `SaveIgdbIntegrationError` → HTTP:
```
invalid_input         → 400 /errors/invalid-input
invalid_credentials   → 422 /errors/invalid-credentials { reason }
twitch_unavailable    → 503 /errors/twitch-unavailable  { upstreamStatus }
network_unreachable   → 504 /errors/twitch-timeout      { reason }
storage_corrupt       → 409 /errors/storage-corrupt
```
PUT 200 returns the same shape as GET (re-run the read after save).

DELETE 204, no body. Idempotent by nature; second call returns 204 too.

Apply `idempotencyKeyMiddleware` to `PUT` and `DELETE` only:
```ts
r.put('/igdb', idempotencyKeyMiddleware, async (c) => { ... });
r.delete('/igdb', idempotencyKeyMiddleware, async (c) => { ... });
```

**Test cases to add:**
- `PUT with valid body + verifier OK → 200 with status: 'configured', enabled: true, lastVerifiedAt set, hasSecret: true`
- `PUT a second time with clientSecret: null + verifier OK → 200, updatedAt bumped, ciphertext unchanged in DB (assert by re-reading the row directly through the repo and comparing to what was stored after the first PUT)`
- `PUT with empty clientId → 400 invalid-input`
- `PUT without Idempotency-Key → 400 (whatever the existing idempotency middleware returns)`
- `PUT with bad creds (verifier returns invalid_credentials) → 422 with body.reason === 'client_secret'`
- `PUT when Twitch is 5xx → 503`
- `PUT when verifier reports timeout → 504`
- `Idempotent PUT replay: same Idempotency-Key + same body → second response identical to first, and the use-case is NOT executed a second time (verify by checking the fake verifier was only called once)`
- `DELETE on configured row → 204, then GET returns status: 'not-configured'`
- `DELETE on not-configured → 204 (no-op success)`
- `DELETE without Idempotency-Key → 400`
- `IDOR: user B saves creds, user A's GET still says not-configured, user A's DELETE does NOT affect user B's row`
- `After PUT success, GET /api/games/metadata/status returns { igdbConfigured: true }`
- `After DELETE, GET /api/games/metadata/status returns { igdbConfigured: false }`

Implement until green.

### Step 4: Env cleanup + docs
**Files:**
- `apps/api/src/infrastructure/config/env.ts`
- `.env.example` (if present at repo root)
- `CLAUDE.md`

In `env.ts`:
- DELETE the lines `IGDB_CLIENT_ID: optionalNonEmpty` and `IGDB_CLIENT_SECRET: optionalNonEmpty`.
- Keep `IGDB_TIMEOUT_MS` and `IGDB_CACHE_TTL_DAYS`.
- Update the comment block above (lines 19-22) to say credentials moved to DB and are configured in the settings UI.

In `.env.example` (if it exists): remove the two lines.

In `CLAUDE.md`:
- Remove the `IGDB_CLIENT_ID` / `IGDB_CLIENT_SECRET` lines from the
  "Configuration" section.
- Add a one-line note under that section: `IGDB credentials are stored in the database (configured via Settings UI), not env.`
- The line about "one-time seed dla IGDB env-varów" in the Constraints
  block becomes incorrect — replace with: `Existing deploys lose IGDB integration on deploy; user must reconfigure in Settings.`

Re-run the full test suite: `bun --filter @apex/api test`. All green.
Run `bun --filter @apex/api run lint` and `bun --filter @apex/api run typecheck`.
Clean.

Boot the app one more time with `BETTER_AUTH_SECRET`/`CORS_ORIGIN`/etc.
set but `IGDB_*` UNSET — confirm it starts without errors.

## If you get stuck
If the idempotency middleware test starts flaking because the fake verifier
isn't shared between request 1 and the replay, double-check the middleware
caches the response BEFORE invoking the handler chain (idempotency stores
the response body for the second hit; the use-case should NOT run twice).

If after 2 attempts something fails:
```
STUCK at Step <N>: <what failed, what error, what hypothesis>
```
