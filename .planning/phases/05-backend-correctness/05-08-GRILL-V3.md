# Grill V3 — 05-08-PLAN.md (BE-02b fresh rewrite)

Cross-checked against source (not planner self-check). Status legend:
- FIXED — prior blocker closed by the rewrite
- OPEN — prior blocker still alive
- NEW — newly discovered by this review

## Prior-blocker disposition (the six from V1/V2)

### B-1 — `NewGame.create` signature
**Status: FIXED**

Evidence:
- `apps/api/src/domain/games/new-game.ts:47-50` — `static create(props: NewGameProps, idGenerator: () => string = () => crypto.randomUUID())`.
- `apps/api/src/domain/games/new-game.ts:21-23` — `NewGameProps` does NOT carry `externalId`.
- Plan Task 2 every snippet uses 2-arg form (`NewGame.create({...props no externalId}, () => 'externalId')`). Snippets at plan lines 358-378, 401-436 verified.
- Plan Task 2 acceptance line 478 greps for `NewGame.create({...externalId...})` count = 0 (banned).
- Banned-pattern note in Task 2 action (line 463) restates the rule explicitly.

### B-2 — Integer-PK seed in Test 7
**Status: FIXED**

Evidence:
- `apps/api/src/infrastructure/db/schema.ts:14` — `id: integer('id').primaryKey({ autoIncrement: true })`.
- Plan Test 7 snippet at line 405-416 omits `id` from seed values entirely — relies on SQLite autoIncrement. Read-back locates row by `(userId, externalId)`, not by `id`.
- Plan acceptance line 479 greps for `values({ id: '...' })` count = 0.
- Plan also includes the order pin (Test 7 after Test 4).

### B-3 — `ImportData` constructor + execute signature
**Status: FIXED**

Evidence:
- `apps/api/src/application/import/import-data.ts:22-34` — verified 4-param constructor (3 required + optional idGenerator), and `execute(userId, rawJson, mode)`.
- Plan `<interfaces>` block (lines 150-174) pastes the source verbatim.
- Plan Task 3 Step 5 wires `new ImportData(gameRepo, platformRepo, importRepo)` and calls `importData.execute(TEST_USER_A_CLONE, JSON.stringify(snapshot1), 'replace')` — matches source exactly.
- Plan acceptance lines 593-594 grep for the 3-arg form and the `JSON.stringify` positional call; banned single-arg and object-bag forms (lines 598-599).

### B-4 — UPDATE destructure missing `id`
**Status: FIXED for the immediate concern; see NEW-1 below for `kind` regression**

Evidence:
- Plan Task 1 line 297 specifies `const { id: _id, userId: _u, externalId: _e, kind: _k, ...updateSet } = row;`.
- Plan acceptance line 319 greps `id: _id` count = 1.
- Rationale (line 298) notes B-1 finding from BACKEND-REVIEW-V2 about Drizzle's version-dependent behavior on `set({ id: undefined })`.

### B-5 — Q7 DI scope decision (option c — no widening)
**Status: FIXED**

Evidence cross-checked against source:
- `apps/api/src/infrastructure/games/drizzle-game-repository.ts:29-30` — `class DrizzleGameRepository implements GameRepository { constructor(private readonly db: DrizzleHandle = defaultDb) {} }`. Confirmed.
- `apps/api/src/infrastructure/dictionary/make-drizzle-dictionary-repository.ts:41-45` — `function makeDrizzleDictionaryRepository<TKind>(deps: MakeDrizzleDictionaryRepositoryDeps<TKind>): ... const db: DrizzleHandle = deps.db ?? defaultDb;`. Confirmed.
- `DrizzleImportRepository` Q7 DI lands in 05-03 (wave=2, same wave as 05-08). 05-08 `depends_on: ['05-02','05-03']` makes the prerequisite explicit. Plan correctly relies on it without proposing new widening.

### B-6 — `rg` paren regex parse error
**Status: FIXED**

Evidence:
- 05-08 verify block (line 704) uses plain `grep -c 'FIXME(BE-02c, F-08-1)'` — BRE treats `(` as literal. Safe.
- Plan's B-5 note (line 709) explicitly addresses this.
- 05-07 (cross-plan) uses `rg -c 'FIXME\(BE-02c'` with backslash escape — also safe. Counts compatible (05-07 expects 2 in import-data.ts and 1 in export-snapshot.ts; 05-08 plants exactly that — see line 707-708 and CONCERNS-side criteria in 05-07 line 196).

---

## NEW findings a senior reviewer would catch

### NEW-1 — UPDATE branch silently drops `kind` mutation (regression vs current main)
**Status: NEW — REWORK or DOCUMENT-AND-ACCEPT decision required**

Evidence:
- Current source `apps/api/src/infrastructure/import/drizzle-import-repository.ts:38-55` — the shared `values` block INCLUDES `kind: ng.kind`, and the UPDATE branch at line 55 calls `tx.update(gamesTable).set(values)`. So on master today, re-importing a row with a changed `kind` (e.g. wishlist→owned) WILL update the persisted `kind`.
- Plan Task 1 Step 3 (line 297) destructures `kind: _k` off `updateSet`, then runs `set(updateSet)`. Post-fix: UPDATE branch NO LONGER touches `kind`.
- Same pattern is already in 05-03 Task 1 Step 2(F) — likely originated there. But 05-08 reaffirms it.
- The plan's justification (line 297-298) only addresses `id`. There is NO documented rationale for stripping `kind`. `Game.moveToCollection` (domain layer) explicitly allows kind mutation, and snapshot v4 carries `kind: z.enum(['owned','wishlist'])`.

Why it matters: a user who exports their library, moves 5 games wishlist→owned in the UI, then imports a snapshot from before the move (merge mode) expects the snapshot's `kind` to win (D-09 last-write-wins). The plan breaks this for the UPDATE path.

Recommendation: either (a) DO NOT strip `kind` from `updateSet` (drop `kind: _k` from the destructure — leave it for Drizzle to set), or (b) add an explicit decision entry to 05-CONTEXT.md justifying why import cannot toggle kind on existing rows, and add a test pinning the new behavior. Option (a) is the natural fix and preserves current behavior.

### NEW-2 — `gameRepo.list(userId)` does not exist
**Status: NEW — EDIT before SHIP**

Evidence:
- `apps/api/src/domain/games/game-repository.ts:49-60` — `GameRepository` exposes `list(query: ListGamesQuery)` (paginated query DTO with userId+sort+page) and `listAll(userId: string): Promise<Game[]>`. There is NO `list(userId)`.
- Plan Task 3 Step 4 (line 550) instructs: *"If `Game.fromPersistence` is not exposed, simpler path: use `gameRepo.list(userId)` and `platformRepo.list(userId)` directly."*
- `platformRepo.list(userId)` IS correct (dictionary repo). `gameRepo.list(userId)` is NOT — typecheck would fail with arity/shape mismatch.

Recommendation: replace the "simpler path" hint with `gameRepo.listAll(userId)` (which returns `Promise<Game[]>` directly — perfect for feeding into `toSnapshot`). Also worth pinning in acceptance criteria: `grep -c 'gameRepo.list(userId)' round-trip.test.ts = 0` so the executor cannot quietly take the broken hint.

### NEW-3 — Round-trip Test 1 platform-validation may reject the snapshot
**Status: NEW — verify or document**

Evidence:
- `ImportData.execute` lines 65-89 — in `replace` mode, `userPlatforms` is empty (`mode === 'merge' ? ... : []`). The `unknownByPlatform` check at lines 77-89 fails the import with `kind: 'unknown_platform'` if ANY game's `platform` string isn't in `snap.platforms` AND isn't in `platformsInUser` (empty for replace).
- Plan Task 3 Step 5 says "Seed TEST_USER_A with 2 platforms + 3 games" and uses platform 'PC' in seeds — fine as long as the seeded games' `platform` field matches a name in `snap.platforms`. The plan does not specify the seeded platform names explicitly — risk of an executor seeding `platform: 'PC'` for a game but a platform row with `name: 'Windows PC'`.
- The plan's Test 1 assertion structure assumes the snapshot is accepted; the test will throw or hit `domain_error` / `unknown_platform` if names diverge.

Recommendation: add a concrete name-match requirement to Step 5: *"Seeded platform names MUST match the `platform` field on the seeded games byte-for-byte. Suggested: platform names `['PC','Switch']`, game platforms picked from that set."* Also assert `result.ok === true` after `importData.execute` and unwrap explicitly (the plan currently does not check the Result return value from execute).

### NEW-4 — `metadataRef.matchedAt` discrepancy between schema and DI seed
**Status: NEW — minor; verify**

Evidence:
- Schema: `metadataMatchedAt: text('metadata_matched_at')` (line 35) — stored as TEXT (ISO string).
- `toGameInsertRow` (per 05-02 plan line 117): given `metadataRef.matchedAt: Date`, returns `metadataMatchedAt: '2026-01-01T00:00:00.000Z'` (i.e. helper calls `toISOString()`).
- `ExternalMetadataRef.matchedAt: Date` (external-metadata-ref.ts:20).
- Plan Task 1 line 261 passes `matchedAt: ng.metadataRef.matchedAt` — a `Date`. The helper does the toISOString conversion. ✓ Consistent.
- Round-trip Test 2 line 565: `db.insert(games).values({..., metadataMatchedAt: '2020-01-01T00:00:00.000Z'})`. Schema is `text` — accepts string. ✓ Direct seed bypasses the helper, so the literal string is fine.
- However: `Drizzle-bun-sqlite` may stringify Dates via `JSON.stringify` if the column type is text + no mode hint. Worth a sanity check during execution. If the helper outputs `Date` (not `Date.toISOString()`) the column will store `"[object Date]"` or coerce via SQLite's TEXT affinity. The 05-02 plan explicitly says helper calls `toISOString()`, so this is fine — but the 05-08 plan does NOT re-pin that. Worth a one-line note: *"Helper output for `metadataMatchedAt` is the ISO string produced by toISOString() — pinned by 05-02 Test 1."*

### NEW-5 — Test 1 RED-on-half-fix not asserted
**Status: NEW — minor**

Evidence:
- Plan emphasizes Test 7's RED-on-half-fix for the UPDATE path (good — confirms the Q-DDD-1 closure).
- No equivalent claim for Test 5 (INSERT half-fix). If Task 1 only fixes UPDATE (the inverse failure mode), Tests 5 and 6 would still go RED — that's correct, but the plan does not state it explicitly. Worth one sentence saying "Test 5 fails RED if Task 1 only addresses UPDATE; Test 6 same for applyReplace".

### NEW-6 — `Result` unwrap in round-trip test not specified
**Status: NEW — minor**

Evidence:
- `ImportData.execute` returns `Promise<Result<ImportReport, ImportError>>`. Plan Task 3 Step 5 calls `await importData.execute(...)` but does not check `.ok` before continuing — silent failures (e.g. unknown_platform per NEW-3, or a domain_error) would skip the import and the read-back snapshot would be empty, surfacing as a `length === 0` assertion failure with a misleading message.
- Banned-patterns list at line 580-585 catches the wrong-shape recreations, but does not require `expect(result.ok).toBe(true)`.

Recommendation: append to Task 3 acceptance criteria: *"After every `importData.execute(...)` call, the test asserts `expect(result.ok).toBe(true)` before reading back."*

### NEW-7 — 05-03 Wave-2 ordering creates an executable risk
**Status: NEW — process, not source**

Evidence:
- 05-03 and 05-08 both `wave: 2`. 05-08 `depends_on: ['05-02','05-03']`. Within a single wave, parallel execution is allowed unless an inter-plan dependency is enforced by the executor.
- 05-08 Task 1 grep `grep -c 'this.db.transaction(' apps/api/src/infrastructure/import/drizzle-import-repository.ts = 2` (acceptance line 320) — this only passes AFTER 05-03 lands the DI constructor. 05-08 Task 2 grep `grep -c 'new DrizzleImportRepository(db)' = 1` (line 595) — same dependency.
- Risk: if the executor runs 05-08 before 05-03 within Wave 2, the typecheck and acceptance gates fail with a confusing error message.

Recommendation: change 05-08's wave to `wave: 3` OR add an explicit serialization note to 05-CONTEXT.md / 05-VALIDATION.md that 05-08 must run AFTER 05-03 within Wave 2.

### NEW-8 — Test 6 `replace` mode capture point ambiguity
**Status: NEW — minor**

Evidence:
- Plan Task 2 Step 4 (line 399) says: *"capture `a_count_before` BEFORE `repo.apply(TEST_USER_C, ..., 'replace')`, then assert `a_count_after === a_count_before` AFTER."*
- This guards against an IDOR-style cross-user delete. Replace mode in current source (line 79) does `delete(games).where(eq(games.userId, userId))` — scoped to TEST_USER_C only. ✓ Plan's pin is correct and useful for regression.
- Subtle issue: Test 5 (which runs before Test 6 in append order) just inserted one row for TEST_USER_A with externalId 'q8-merge-1'. So `a_count_before` is `seed-50 + 75 (from 05-03 Test 1) + 1 (Test 5) = 126`. Plan doesn't say the literal — just `=== a_count_before`. ✓ Adequate. But Test 1's 75 inserts assume Test 1 runs before Test 5 — confirmed by source order. Brittle but correct.

---

## Cross-plan staleness checks

- 05-07 Task 1 line 196: expects `rg -c 'FIXME\(BE-02c' apps/api/src/application/import/import-data.ts` = 2 and `= 1` for export-snapshot.ts. 05-08 Task 4 acceptance lines 707-708 plant exactly those counts. ✓ Consistent.
- 05-07 Task 1 line 198: `grep -cE '\.where\(eq\(.*externalId.*\)\)' apps/api/src/infrastructure/import/drizzle-import-repository.ts = 0`. 05-08 Task 1's `tx.update(gamesTable).set(updateSet).where(eq(gamesTable.id, existing.id))` uses `existing.id`, not `externalId`. ✓ Compatible.
- 05-08 line 73 states "Depends on plan 05-02 (`toGameInsertRow` helper signature) and plan 05-03 (`DrizzleImportRepository(db?)` Q7 DI constructor + apply-merge.test.ts in-memory harness with TEST_USER_A/B)" — 05-02 + 05-03 both deliver these. Truthful.
- 05-08 truth #10 (line 32): "Three FIXME(BE-02c, F-08-1) markers exist in source (2 in import-data.ts, 1 in export-snapshot.ts)". Task 4 plants exactly that. ✓

---

## Final verdict

**EDIT-AND-SHIP.**

The plan correctly closes all 6 prior blockers from V1/V2 by pasting source signatures verbatim and pinning them with acceptance greps. The destructure list, integer-PK seed, NewGame.create 2-arg form, ImportData 3-arg+positional execute, Q7 DI scope, and grep-paren safety are all sound.

Two required edits before execution:

1. **NEW-1 (regression):** drop `kind: _k` from the UPDATE destructure in Task 1 Step 3 — OR add explicit 05-CONTEXT.md decision + test pinning that import cannot toggle `kind` on existing rows. The current plan silently regresses on-master UPDATE behavior.

2. **NEW-2 (broken hint):** Task 3 Step 4 fallback path mentions `gameRepo.list(userId)` which does not typecheck. Replace with `gameRepo.listAll(userId)` and add a banned-pattern grep (`grep -c 'gameRepo.list(userId)' round-trip.test.ts = 0`).

Nice-to-have edits (not blocking):

3. NEW-3: Tighten round-trip Test 1 platform-name match requirement and assert `result.ok === true` after every `execute`.
4. NEW-6: Pin the `expect(result.ok).toBe(true)` discipline in Task 3 acceptance criteria.
5. NEW-7: Either bump 05-08 to `wave: 3` or document the within-Wave-2 ordering (05-03 before 05-08).
6. NEW-5: One-sentence note in Task 2 that Tests 5/6 also fail RED on the inverse half-fix.

With (1) and (2) applied the plan is shippable. Without (1), the plan trades a fixed data-loss bug for a silent behavior regression on `kind` mutation via merge import.
