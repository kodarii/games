# Codebase Concerns

*Last updated: 2026-05-16*

## Tech Debt

**Stray phase-marker comment in client API wrapper**
- File: `apps/client/src/lib/api-fetch.ts:45`
- Comment references "fazy 5 idempotency middleware" — leftover Polish phase label (`fazy` = phases) from incremental rollout.
- Fix: replace with a neutral reference to `apps/api/src/routes/middleware/idempotency-key.ts`.

**Migrations run unconditionally on every process boot**
- File: `apps/api/src/infrastructure/db/client.ts:25-29`
- `migrate(db, ...)` is invoked synchronously at import time, guarded only by `globalThis.__apexDbMigrated` (re-entry within the same process). On horizontal scale-out each replica races to migrate; SQLite serializes them but ordering relative to first traffic is implicit. Also makes a read-only forensic boot impossible.
- **Resolved in Phase 5 (BE-01):** auto-migrate gated by `process.env.NODE_ENV !== 'production'` in `apps/api/src/infrastructure/db/client.ts`. Production migrations run via versioned `scripts/deploy.sh` ahead of `sudo systemctl restart apex-api`. Deploy script takes a `VACUUM INTO` snapshot (`apps/api/scripts/backup.ts`) before each migration and uses `trap restore_and_exit ERR` to roll the DB back to the snapshot on failure — so a half-migrated state cannot persist. Retention: last 10 snapshots in `apps/api/data/backups/`.

**Row-builder for games/platforms duplicated 3×**
- Files: `apps/api/src/infrastructure/import/drizzle-import-repository.ts:39-50` (`applyMerge`), `:85-99` (`applyReplace`), and `apps/api/src/infrastructure/games/drizzle-game-repository.ts:165-187` (`create`).
- A future column gets silently dropped if only one site is updated.
- **Partially resolved in Phase 5 (BE-02):** INSERT row-builder zdedplikowany do `toGameInsertRow(userId, input)` w `apps/api/src/infrastructure/db/schema.ts`; trzy INSERT call-sites (`DrizzleGameRepository.create`, `applyMerge` INSERT branch, `applyReplace` INSERT loop) używają helpera. **Świadomie pozostawione jako duplikat (D-10):** `DrizzleGameRepository.update()` i `saveMetadata()` — to dwa różne use-case'y (user PATCH vs system enrichment z IGDB) niewspółmierne z INSERT shape. Pin: `apps/api/src/infrastructure/db/__tests__/to-game-insert-row.test.ts` (6 it blocks: 4 functional + dedup grep gate + VO-unwrap snapshot counter).
- **Re-open trigger:** gdy dodajemy nową kolumnę do `games` table — zweryfikuj wszystkie trzy miejsca z VO-unwrap (helper INSERT + update() set + saveMetadata() set). Snapshot counter test wybuchnie jeśli przegapisz.
- **Promotion trigger:** jeśli zostanie dodany 3. UPDATE call-site z VO-unwrap pattern, wprowadzić `toGameUpdateRow` / `toGameMetadataRow` jako **osobne** helpery (NIE jeden wspólny — `update` to user PATCH, `saveMetadata` to system event, premature unification = pierwsza zmiana scope'u rozwala wspólny helper).
- **Future work (v2 aggregate redesign):** `saveMetadata` to mały DDD smell — powinno być osobną metodą aggregate'a emitującą `GameMetadataEnriched` event, repo eksponuje pojedyncze `save(game)` z diffem. Out of scope dla Phase 5; zostawione na radarze.

**Hand-rolled action dropdown duplicates Radix capability**
- File: `apps/client/src/pages/game-view.tsx:88-170`
- Custom click-outside menu with inline SVGs while `@radix-ui/react-dropdown-menu` is already a dependency. No keyboard nav, no `role="menu"`, no Escape handling.
- Fix: replace with the Radix dropdown primitive; reuse `@/components/icons`.

**`game-view.tsx` is 669 lines of mixed concerns**
- File: `apps/client/src/pages/game-view.tsx`
- Owns page shell, edit/view toggle, dropdown, format chip, status badges, field editors, and 4 query/mutation wires in one component.
- Fix: split into `game-view-header.tsx`, `game-view-actions.tsx`, `game-view-fields.tsx`.

**Inline SVG icons re-declared in `game-view.tsx`**
- File: `apps/client/src/pages/game-view.tsx:36-77, 117-160`
- Despite a 511-line centralized `apps/client/src/components/icons.tsx`.
- Fix: add missing glyphs to `icons.tsx`, reference via `<Icon.x />`.

**No central form-driver for credential pages**
- Files: `apps/client/src/pages/login.tsx:14-37`, `apps/client/src/pages/register.tsx`
- Each page hand-rolls `new FormData(form)` + `String(data.get(...) ?? '')` + pending/error state. MEMORY note `feedback_react_autofill_uncontrolled.md` makes uncontrolled+FormData the convention but there's no shared helper.
- Fix: extract `useCredentialsForm({ fields, onSubmit })` in `apps/client/src/hooks/`.

## Known Bugs

No production bugs observed in source. Recent fix commits (`fix login and register`, `fix register`, `fix prod`) indicate active stabilization; no `FIXME`/`HACK` comments remain.

## Security Considerations

**Upload allowlist read at module import — restart-only**
- File: `apps/api/src/infrastructure/cover-storage/upload-allowlist.ts:1-4`
- `UPLOAD_ALLOWED_EMAILS` parsed at module top; revoking an email requires full restart.
- Mitigation: requires authenticated session via `requireAuth`.
- Recommendation: wrap read in a function and re-evaluate per request, or document the restart-only contract.

**No CSRF defense beyond cookie-credentialed CORS allowlist**
- Files: `apps/api/src/index.ts:42-52`, `apps/api/src/infrastructure/auth/auth.ts`
- All mutating routes rely on session cookies + CORS allowlist. No CSRF token, no `Sec-Fetch-Site` check.
- Mitigation: CORS rejects unknown origins; better-auth `trustedOrigins`; rate-limit 5/min on `/sign-in/email`.
- Recommendation: enable better-auth's CSRF helper, set `SameSite=Strict` on session cookies, verify `Origin`/`Sec-Fetch-Site` in middleware.

**No external error sink — only stdout JSON logs**
- File: `apps/api/src/infrastructure/logging/logger.ts:127`
- `internalProblem` catches every unhandled error and logs via `console.log`. No Sentry/Datadog.
- Recommendation: wire an error-tracking integration before production scale.

**Default `BETTER_AUTH_SECRET` sentinel ships in repo and passes validation**
- Files: `apps/api/.env.example` (`BETTER_AUTH_SECRET=replace-with-32-byte-random-aaaaaaaaaa`), `apps/api/src/infrastructure/config/env.ts:30`
- The example is exactly 32 chars and passes `z.string().min(32)`. A careless deploy that copies the example boots with a publicly known secret.
- Recommendation: add a deny-list in `auth-config.ts` (`validateAuthConfig`) rejecting `replace-with-...`-style sentinels.

**LIKE-escape coupling is fragile**
- Files: `apps/api/src/application/games/list-games.ts:30-33`, `apps/api/src/infrastructure/games/drizzle-game-repository.ts:74-80`
- `escapeLikeWildcards` and `ESCAPE '\\'` clause live in two different modules. Drizzle parameterizes the pattern (no SQLi), but a refactor of one without the other silently breaks the escape contract.
- Recommendation: co-locate or document with a cross-reference.

## Performance Bottlenecks

**Import-merge is N+1 reads inside a transaction**
- File: `apps/api/src/infrastructure/import/drizzle-import-repository.ts:14-67`
- One SELECT per platform and per game inside `applyMerge`.
- **Resolved in Phase 5 (BE-03):** `applyMerge` reads all matching rows via `inArray(externalId, [...])` — 2 SELECTs total (jeden dla `platforms`, jeden dla `games`) + in-memory `Map<externalId, row>` lookup. Per-row UPDATEs retained intentionally (D-13). Per-user scoping preserved via `and(eq(table.userId, userId), inArray(...))`. Empty-array guard sidesteps SQLite `IN ()` syntax error. Semantic regression pin: `apps/api/src/infrastructure/import/__tests__/apply-merge.test.ts` (100 games + 5 platforms + per-user isolation + empty plan edge case). **Q4 architectural guard:** `grep -E '\.where\(eq\(.*externalId.*\)\)' apps/api/src/infrastructure/import/drizzle-import-repository.ts` returns 0 — pinuje że per-row `externalId` lookup pattern nie wraca do tego pliku.

**Missing indices for some sort fields**
- File: `apps/api/src/infrastructure/db/schema.ts:46-52`
- `(user_id, kind, title)` is indexed, but sorting by `hoursPlayed`, `genre`, `format`, `status` (`apps/api/src/infrastructure/games/drizzle-game-repository.ts:113-122`) is not.
- **Resolved in Phase 5 (BE-04, accepted cost):** block comment over `games` table in `apps/api/src/infrastructure/db/schema.ts` documents ~10ms full-scan sort cost on `hoursPlayed`/`genre`/`status` for single-user ≤5k rows. Already-indexed sort fields: `title`, `platform`, `format`, `releaseYear` (each scoped by `(user_id, kind, ...)`). Revisit when schema stabilises. See `feedback_no_premature_indices`.

**Orphan-cover cleanup lists full UploadThing bucket every hour**
- File: `apps/api/src/infrastructure/cover-storage/uploadthing-cover-storage.ts:43-60`
- Paginates 500-at-a-time through every file, in-memory filters by `uploadedAt`.
- Fix: if UploadThing exposes a server-side date filter use it; otherwise short-circuit pagination once first non-stale entry is seen (assuming newest-first).

**`game-view.tsx` re-renders on every keystroke in edit mode**
- Files: `apps/client/src/pages/game-view.tsx`, `apps/client/src/hooks/use-game-draft.ts`
- Monolithic 669-line component; no field-level isolation.
- Fix: split into field-scoped editor sub-components.

## Fragile Areas

**Singleton wiring graph in `apps/api/src/wiring.ts` (242 lines, process-shared state)**
- File: `apps/api/src/wiring.ts`
- Every service constructed at module top level. Circuit breakers, rate limiters, cron lock, token stores share state across requests. Tests importing wiring inherit production singletons.
- Safe modification: append-only; never reorder.
- **Test gap closed in Phase 5 (BE-06):** `apps/api/src/__tests__/wiring.test.ts` pins (a) `igdbConfigured === false` → 503 z `body.type='/errors/feature-disabled'` na `GET /api/games/metadata/candidates`, (b) 503 na `PATCH /api/games/:externalId/metadata`, (c) **architectural singleton pin** via `Bun.spawnSync(rg)` — 0 trafień dla `new (DrizzleGameRepository|DrizzleTransactionRunner|IgdbChainHolder)\(` poza `wiring.ts`. To pinuje anti-pattern z CLAUDE.md ("Skipping wiring.ts and new-ing dependencies in routes") wykonywalnym testem, NIE tautologicznym `await import().toBe()` (które przeszłoby przez ESM module cache niezależnie od singleton intent). Clean swap fixture (`beforeEach: swap(null)` + `afterEach: swap(snapshot)` bez throw) działa na dev maszynie z IGDB creds seeded.

### Production import path silently drops `coverImage` + `metadataRef` — BE-02c
- **File:** `apps/api/src/application/import/import-data.ts:101` (NewGame.create call) + `apps/api/src/application/export/export-snapshot.ts` (ExportedGame shape)
- **Description:** `ImportData.execute` builds `NewGame.create(...)` from a v4 snapshot that does NOT carry `coverImage` or `metadataRef` (verified — `packages/shared/src/import-schema-v4.ts` does not declare them; `export-snapshot.ts` does not emit them). `DrizzleImportRepository.applyMerge` / `applyReplace` were extended in Phase 5 (BE-02b, plan 05-08) to persist these fields when supplied — but `g.coverImage` and `g.metadataRef` arrive as `undefined` at the call site. The repo-layer fix is dead code on this production path.
- **Documented in Phase 5 (BE-02c, OPEN — blocked on ExportSnapshotV5):** plan 05-08 Task 4 plants three signposts so the gap survives discovery: (a) TSDoc block above the `for` loop in `import-data.ts` listing the v5 unblocking work step-by-step; (b) inline `FIXME(BE-02c, F-08-1)` markers at both the `import-data.ts` call site AND the `export-snapshot.ts` ExportedGame shape; (c) round-trip test `apps/api/src/infrastructure/import/__tests__/round-trip.test.ts` Test 1 asserts `not.toHaveProperty('coverImage')` etc. — which will fail when v5 adds them, forcing a conscious decision to flip those to positive preservation assertions and update this entry to "Resolved".
- **Unblocking work (out of Phase 5):** (1) bump snapshot schema to `ExportSnapshotV5` with `coverImage`, `metadataProvider`, `metadataProviderId`, `metadataMatchedAt` (additive — keep v4 readable); (2) extend `exportSnapshot` to emit them; (3) add `coverImage: g.coverImage ?? null` + `metadataRef: g.metadataRef ?? null` to `NewGame.create` call; (4) flip `not.toHaveProperty` → positive preservation in `round-trip.test.ts` Test 1; (5) update 05-CONTEXT.md D-33 to mark BE-02c resolved.
- **Discovery search:** `rg 'FIXME\(BE-02c' apps/api/src` returns ≥3 hits across `application/import/import-data.ts` (TSDoc block + inline `// FIXME` at the `NewGame.create` call site), `application/export/export-snapshot.ts` (TSDoc block above ExportedGame shape), and `infrastructure/import/__tests__/round-trip.test.ts` (test-level marker on the `not.toHaveProperty` assertions).

**Hono route ordering is registration-sensitive**
- File: `apps/api/src/routes/games.ts:142-145`
- Comment warns `/metadata/*` MUST register before `/:externalId`. No test enforces it.
- **Resolved in Phase 5 (BE-05):** `describe('route ordering pin')` w `apps/api/src/routes/games.test.ts` zawiera 2 it bloki: (1) **body-shape pin** — `GET /api/games/metadata/candidates` zwraca status ≠ 404, a gdy 503 to `body.type === '/errors/feature-disabled'` (stabilny discriminator generowany WYŁĄCZNIE przez `games-metadata` sub-router, nie przez `:externalId` handler); (2) **counter-weight** — `GET /api/games/:externalId` dla non-reserved slug nadal trafia w single-game handler. RED jest dowiedziony konstrukcyjnie przez kształt asercji (body.type), nie przez manual swap routes — test failuje w momencie regresji bez ingerencji w `apps/api/src/routes/games.ts`.

**Optimistic-locking discipline scattered across use cases**
- Files: `apps/api/src/application/games/update-game.ts`, `enrich-game-metadata.ts`, `delete-game.ts`, `move-to-collection.ts`; `apps/api/src/infrastructure/games/drizzle-game-repository.ts:97-100, 138-141`
- Each use case must thread `expectedUpdatedAt` and handle `OptimisticLockError`/`null` return. Skipping any step silently disables the protection.
- Mitigation: covered by tests (`update-game.test.ts`).

**Cron timer started at module top with no kill-switch**
- File: `apps/api/src/index.ts:91-114`
- Hardcoded `setInterval(... 1h)`; cannot be disabled for local dev or tests.
- Fix: gate behind `DISABLE_CRON` env flag.

**`globalThis.__apexDbMigrated` flag**
- File: `apps/api/src/infrastructure/db/client.ts:27-30`
- Depends on module identity; HMR semantics in `bun run --hot` may or may not reset it.

## Scaling Limits

**Single SQLite file**
- File: `apps/api/data/apex.db`, schema `apps/api/src/infrastructure/db/schema.ts`, WAL mode enabled at `client.ts:21`.
- Single writer; horizontal scale-out impossible.
- Scaling path: migrate to Postgres (`drizzleAdapter(db, { provider: 'pg' })`); custom `sql\`...\`` LIKE-escape and NULLS-LAST sort at `drizzle-game-repository.ts:74-80, 130` will need Postgres equivalents.

**In-memory rate limiter and circuit breaker**
- Files: `apps/api/src/infrastructure/igdb/`, `apps/api/src/infrastructure/metadata/`
- Process-local; N replicas multiply the effective IGDB token rate.
- Scaling path: Redis-backed shared limiter, or accept lower per-replica capacity.

**Idempotency, metadata cache, cron locks all share SQLite writer**
- Files: `idempotency_keys`, `metadata_cache`, `cron_locks` tables in `apps/api/src/infrastructure/db/schema.ts`
- Idempotency writes happen on every mutating request, competing for the single writer.

**Import body cap 5 MB**
- File: `apps/api/src/routes/import.ts:14-18`
- Thousands of games could exceed; no client-side warning before upload.

## Dependencies at Risk

**`lucide-react ^1.14.0`** (`apps/client/package.json`) — unusual major version, ecosystem is on 0.4xx+; likely a typo or stale spec. Audit and align.

**`better-auth` version drift** — API uses `^1.6.9`, client uses exact `1.6.9` (`apps/api/package.json` vs `apps/client/package.json`). Pin both exact and bump in lockstep.

**`zod ^4.3.6`** — Zod 4 is recent; many adjacent libraries still expect Zod 3 type shapes. Vet new dependencies for v4 support.

## Missing Critical Features

**No request-rate limiting on mutating routes** — only `/sign-in/email` rate-limited (`apps/api/src/infrastructure/auth/auth.ts:23-30`). `POST /api/games`, `PATCH /api/games/:externalId/metadata`, `POST /api/upload/cover` are unbounded.

**No structured error tracking/alerting** — only stdout JSON logs.

**No visible CI workflow** — `.github/` exists but `package.json` `lint`/`format` not gated on PR.

**No client-side `ErrorBoundary`** — any uncaught render error blanks the page.

## Test Coverage Gaps

**Wiring composition** — `apps/api/src/wiring.ts`. No test asserts that `igdbConfigured === false` causes 503s, or that singleton identity holds. Priority: Medium.

**Graceful shutdown** — `apps/api/src/index.ts:117-155`. SIGTERM drain, `SHUTDOWN_DRAIN_MS` timeout, DB-close failure not tested. Priority: Medium.

**Cron timer lifecycle** — `apps/api/src/index.ts:94-115`. `clearInterval` on shutdown and failure resilience not tested. Priority: Low.

**Client React components** — only `apps/client/src/lib/__tests__/` exists. No tests for pages (`game-view.tsx`, `games.tsx`, `dictionaries.tsx`), forms (`game-form.tsx`, `add-game-dialog.tsx`), or `data-table.tsx`. Priority: High.

**Login/register regression tests** — two real bugs occurred here (`9681cf0 fix register`, `ec235b4 fix login and register`) and are documented in MEMORY (`feedback_better_auth_session_refetch.md`, `feedback_react_autofill_uncontrolled.md`). No test pins the fix. Priority: High.

**CSRF / cookie-flag assertions** — no test asserts `SameSite`/`Secure` cookie flags or that non-allowlisted origin POSTs are rejected. Priority: Medium.
