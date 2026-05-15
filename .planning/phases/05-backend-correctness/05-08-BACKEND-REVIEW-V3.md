# Backend Review V3 — 05-08-PLAN.md (BE-02b fresh rewrite)

Cross-checked against source after grill V3. Format: claim → evidence → verdict.

---

## Part 1 — Verification of grill v3's 2 new claims

### NEW-1 — UPDATE branch silently drops `kind` mutation
**Status: CONFIRMED (real regression vs current main)**

Evidence (verbatim source):
- `apps/api/src/infrastructure/import/drizzle-import-repository.ts:38-55` — current code today:
  ```
  const values = { kind: ng.kind, title: ng.title, developer: ng.developer ?? null, ... };
  if (!existing) { await tx.insert(...).values({ userId, externalId: ng.externalId, ...values }); }
  else { await tx.update(...).set(values).where(eq(gamesTable.id, existing.id)); }
  ```
  The shared `values` block at line 38 EXPLICITLY includes `kind: ng.kind` (line 39), and line 55 feeds the same `values` block to UPDATE. Today, re-importing a row whose snapshot says `kind: 'owned'` over an existing wishlist row WILL flip the persisted kind.
- Plan 05-08 Task 1 Step 3 (`05-08-PLAN.md:297`): `const { id: _id, userId: _u, externalId: _e, kind: _k, ...updateSet } = row;` — strips `kind` from the UPDATE payload.
- Plan 05-03 Task 1 Step 2(F) (`05-03-PLAN.md:151`) — ORIGINATING site — also includes `kind: _k` in the destructure. So the regression is introduced by 05-03 and re-affirmed by 05-08.

Verdict: **CONFIRMED**. The fix replaces a (kind-mutating) UPDATE with a (kind-frozen) UPDATE — a silent behavior regression. Grill V3's NEW-1 recommendation (a) — drop `kind: _k` from the destructure — is the natural fix.

**Senior reviewer note**: see Part 2 finding F-1 for the deeper semantic question this exposes.

### NEW-2 — `gameRepo.list(userId)` is wrong API
**Status: CONFIRMED**

Evidence (`apps/api/src/domain/games/game-repository.ts:49-60`):
```
list(query: ListGamesQuery): Promise<ListGamesResult>;
listAll(userId: string): Promise<Game[]>;
```
`list` requires a `ListGamesQuery` object containing `userId`, `dir`, `page`, `perPage`. A bare `list(userId)` call is a typecheck failure (`Argument of type 'string' is not assignable to parameter of type 'ListGamesQuery'`).

Plan 05-08 Task 3 Step 4 (`05-08-PLAN.md:550`): *"simpler path: use `gameRepo.list(userId)` and `platformRepo.list(userId)` directly."* — the `platformRepo.list(userId)` portion is correct (dictionary repos take a plain userId); `gameRepo.list(userId)` is a broken hint.

Verdict: **CONFIRMED**. Replace with `gameRepo.listAll(userId)`. Grill V3 recommendation accepted in full.

---

## Part 2 — New findings beyond grill v3

### F-1 — BLOCKER — Plan grants import the power to flip `kind` without going through `Game.moveToCollection`

This is the deeper layer underneath grill V3's NEW-1.

Evidence:
- `apps/api/src/domain/games/game.ts:217-246` — `Game.moveToCollection()` is the ONLY domain-blessed kind transition. It is guarded:
  - throws if already-owned (`already owned` programmer-error)
  - resets `status` to `'Backlog'` and `hoursPlayed` to `0`
  - clears `purchasedAt`
  - returns a `GameUpdate` (not a raw row), which the repository persists.
- No `moveToWishlist()` (or analogous owned→wishlist transition) exists in the aggregate. The domain has decided that owned→wishlist is NOT a supported transition.
- The plan's proposed UPDATE branch — if `kind: _k` is removed per grill V3 NEW-1 (a) — would allow:
  1. **owned→wishlist via import**: bypasses the missing domain transition entirely (no validation, no field reset).
  2. **wishlist→owned via import**: bypasses `moveToCollection`'s field-reset semantics (status, hoursPlayed, purchasedAt). Import would carry whatever was in the snapshot.
- The bypass is not theoretical — `import-data.ts:99-120` constructs `NewGame.create({ kind: g.kind, ..., hoursPlayed: isWishlist ? null : g.hoursPlayed, ... })` from raw snapshot fields. The application-layer invariants here are `NewGame`'s, not `Game`'s — and `NewGame` correctly enforces "owned must have non-null status+hoursPlayed", but **`NewGame` is constructor-blind to the existing row's kind**, so it cannot enforce the domain transition rules that `moveToCollection` encodes.

Why it matters (failure mode):
A user clicks "move to collection" on a wishlist game in the UI; `Game.moveToCollection()` correctly resets fields. Then the user re-imports an older snapshot in merge mode. The import would silently revert the kind AND simultaneously bypass the field-reset guard — leaving e.g. a freshly-owned row with stale `purchasedAt` from the original wishlist or with the `hoursPlayed: 0` reset undone. Worst case: `kind: 'owned'` with `status: null`, which the schema permits at the column level but the domain forbids (`game-invariants.ts` requires non-null status for owned).

Three options for the planner, ranked by safety:

1. **Recommended — keep `kind` stripped from UPDATE (the plan's current behavior post-fix), AND document the decision**. Import becomes "field updates only, kind transitions go through the UI". Add a 05-CONTEXT.md decision (`D-34: import UPDATE branch does not toggle kind — kind transitions are domain operations through Game.moveToCollection, and import bypasses domain transitions by design`). Add a Test 8 to apply-merge.test.ts: seed a wishlist row, run merge with a snapshot row of the same externalId but `kind: 'owned'` — assert the persisted row's kind is UNCHANGED (`wishlist`). This pins the new behavior. Risk: violates D-09's last-write-wins for kind on UPDATE — needs the explicit decision entry.

2. **Drop `kind: _k` from the destructure (grill V3 NEW-1 (a))**. Restores on-master behavior. Risk: a snapshot with `kind: 'owned'` over a wishlist row produces a kind-transitioned row WITHOUT the field reset (`Game.moveToCollection` would clear status/hours/purchasedAt; import would not). Potentially produces a row that violates `GameInvariants.validate` if re-read through the aggregate. Need a separate test to PROVE this is benign, or alternatively a runtime check before UPDATE that detects kind mutation and either rejects or routes through `moveToCollection`.

3. **Reject snapshots that would flip kind on existing rows**. The cleanest semantic — import refuses to silently change a domain-significant transition. Requires changes to `ImportData.execute` (read existing row first, detect kind diff, return `{ kind: 'kind_transition_not_allowed', externalId }`). Out of Phase 5 scope.

**Action**: Phase 5 must NOT ship option 2 silently. Either choose option 1 (cheap; needs D-34 + Test 8) or hold for option 3 in Phase 6.

### F-2 — RECOMMEND — `unknown_platform` failure mode in round-trip Test 1 is real and undocumented

Evidence:
- `apps/api/src/application/import/import-data.ts:77-89` — replace mode treats `userPlatforms` as empty (`mode === 'merge' ? ... : []` at line 66), so ALL game `platform` strings must appear in `snap.platforms` to pass the `unknownByPlatform` check, otherwise execute returns `err({ kind: 'unknown_platform', ... })`.
- Plan 05-08 Task 3 Step 5 (`05-08-PLAN.md:552-561`) instructs "Seed TEST_USER_A with 2 platforms + 3 games" without pinning that the seeded games' `platform` strings match a seeded platform `name`.
- The plan's `toSnapshot(games_a, platforms_a, fixedNow)` call is correct for export — `ExportSnapshotV4` carries platforms — but the executor needs explicit guidance that the seeded games' `platform` field must be one of `['PC','Switch']` (or whatever the seeded platform names are).

Failure mode: Test 1 throws / fails on a misleading assertion because `result.ok === false` was never checked. The plan does not enforce `expect(result.ok).toBe(true)` — confirmed by grill V3 NEW-6.

**Action**: Tighten Task 3 Step 5 with two literal requirements: (a) seeded platform `name` values are `['PC','Switch']`; seeded games pick `platform` from that set; (b) every `await importData.execute(...)` call is followed by `expect(result.ok).toBe(true)` before any read-back. Add acceptance grep: `grep -c "expect(result.ok).toBe(true)" round-trip.test.ts ≥ 3` (3 execute calls in the file per current test count).

### F-3 — RECOMMEND — TEST_USER_C is NOT seeded by 05-03 today; plan claims it might be

Evidence:
- 05-03 Task 2 Step 3 (`05-03-PLAN.md:235-238`) seeds EXACTLY two users:
  ```
  { id: TEST_USER_A, ... }, { id: TEST_USER_B, ... }
  ```
- 05-08 Task 2 Step 2 (`05-08-PLAN.md:348-353`) instructs: *"Extend the beforeAll user-insert to include TEST_USER_C ... if 05-03 has not yet added TEST_USER_C, this task adds it; otherwise reuses"* — the conditional wording is a footgun. The agent must edit 05-03's beforeAll block to add the third user.
- This is benign because 05-08 owns both the edit and the assertion, but the plan's hedge wording invites the executor to skip the step if it misreads 05-03's state.

**Action**: Replace the conditional sentence in 05-08 Task 2 Step 2 with: *"Extend 05-03's beforeAll user-insert array to add TEST_USER_C (TEST_USER_C carries zero seeded games — required for Test 6's replace-mode isolation)."* Drop the "if/otherwise" branch entirely.

### F-4 — NOTE — Cross-plan wave ordering risk is real

Evidence (`05-03-PLAN.md` and `05-08-PLAN.md` both `wave: 2`):
- 05-08 acceptance lines 320 (Task 1) and 595 (Task 3) grep for `this.db.transaction(` count = 2 and `new DrizzleImportRepository(db)` count = 1, both produced by 05-03.
- 05-08 explicitly carries `depends_on: ['05-02', '05-03']`. Most executors honor `depends_on` even within a wave, but the convention is not formally enforced by run-plan tooling in all setups.

Grill V3 NEW-7 flagged the same risk. Confirmed.

**Action**: Either bump 05-08 to `wave: 3` (cleanest), OR explicitly serialize via a one-line note at the top of 05-08-PLAN.md frontmatter: `# Hard-serialized: 05-08 MUST follow 05-03 within Wave 2 (typecheck cannot pass without 05-03 Q7 DI).` Phase-5 executor logs will surface the conflict if 05-08 starts first.

### F-5 — NOTE — Test 7's RED-on-half-fix claim depends on order, not on test isolation

Evidence:
- 05-08 Task 2 Step 5 (`05-08-PLAN.md:402-457`) seeds a row via `db.insert(games).values({ ... title: 'old title', hoursPlayed: 1, status: 'Backlog' })` for TEST_USER_A with externalId `'q8-update-target'`.
- Tests 1-4 from 05-03 already insert ~125 rows for TEST_USER_A. Tests 5-7 from 05-08 add more. There is no `beforeEach` cleanup — state accumulates within the suite. This is fine for the test as written, but if Test 7 ever runs alone (`bun test -t 'Test 7'`), the previously-inserted q8-update-target row from another run is gone, but the assertion *still passes* because Test 7 itself seeds the row.
- More subtle: Test 7's assertion `rows.length === 1` (line 446) proves UPDATE, not duplicate INSERT. This is the load-bearing part. ✓

Verdict: Documented for the executor. No change needed; just be aware that the suite accumulates state and assertions must remain count-relative, not absolute.

### F-6 — NOTE — FIXME marker grep counts are BRE-safe and absolute-path-safe

Evidence:
- 05-08 Task 4 `<verify>` block (line 704) uses `grep -c 'FIXME(BE-02c, F-08-1)'` with single quotes. In BRE, `(` and `)` are literal — confirmed safe.
- All paths in acceptance criteria are repo-root-relative (e.g. `apps/api/src/application/import/import-data.ts`). The plan does not pin `cwd`; if the executor runs greps from a non-root directory, the relative paths will miss.

This is a minor execution hazard but standard for the codebase. Not blocking. If the executor uses `pwd` of repo root (which is the GSD convention) the greps work.

### F-7 — NOTE — DI option (c) verification — all source claims accurate

Cross-checked against source:
- `apps/api/src/infrastructure/games/drizzle-game-repository.ts:29-30` — `constructor(private readonly db: DrizzleHandle = defaultDb) {}` ✓ confirmed (plan claim accurate).
- `apps/api/src/infrastructure/dictionary/make-drizzle-dictionary-repository.ts:41-45` — `function makeDrizzleDictionaryRepository<TKind>(deps)` with `const db: DrizzleHandle = deps.db ?? defaultDb;` ✓ confirmed.
- `DrizzleImportRepository` Q7 DI lands in 05-03 ✓ (confirmed by reading 05-03 Task 1 Step 1.5).

No widening required for Phase 5. Option (c) is the right call.

---

## Final verdict

**EDIT-AND-SHIP** (with one BLOCKER decision required before execute).

| ID | Severity | Action |
|----|----------|--------|
| F-1 | BLOCKER | Decide between options 1/2/3 above; if option 1 (recommended), add D-34 + Test 8. If option 2, add a runtime-invariant test. Cannot ship silently. |
| NEW-1 (grill) | Subsumed by F-1 | — |
| NEW-2 (grill) | EDIT | Replace `gameRepo.list(userId)` with `gameRepo.listAll(userId)` in Task 3 Step 4. Add banned-pattern grep. |
| F-2 | RECOMMEND | Pin platform name set in Task 3 Step 5; require `expect(result.ok).toBe(true)` after every execute. |
| F-3 | RECOMMEND | Drop the conditional "if/otherwise" wording in Task 2 Step 2 — make 05-08 unconditionally add TEST_USER_C. |
| F-4 | RECOMMEND | Bump 05-08 to wave 3 OR add explicit serialization note. |
| F-5 | NOTE | No action — informational. |
| F-6 | NOTE | No action — informational. |
| F-7 | NOTE | No action — option (c) verified accurate. |

The plan correctly closes the 6 prior blockers from V1/V2 — its drafting discipline (interfaces pasted verbatim, banned-pattern greps, helper-output destructure) is genuinely better than V2.

The remaining BLOCKER (F-1) is a semantic question the planner cannot resolve mechanically: import is being granted a domain-significant power (kind mutation) it does not have today AT THE DOMAIN LEVEL (only `moveToCollection` can flip kind, and only in one direction with guards). The plan must answer this question explicitly — and the answer determines whether `kind: _k` stays in the destructure or comes out.
