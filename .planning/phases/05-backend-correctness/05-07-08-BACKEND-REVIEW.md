# Backend final-pass review — 05-07 + 05-08

Date: 2026-05-15
Reviewer: enterprise-web-expert (final pass, post-grill)
Scope: findings **NOT** already raised in `05-07-08-GRILL.md`. Where I agree with grill, I say so explicitly and move on.

Grill verdicts referenced:
- 05-07 → EDIT-AND-SHIP (one blocker: Q5 D-30..D-33 transcription target)
- 05-08 → REWORK (Q-DDD-1 UPDATE branch silent-drop; Q-A vacuous round-trip; Q-B TEST_USER_C)

I agree with all three blockers. The findings below are **additional**.

---

## Plan 05-08 — new findings

### F-08-1 — `import-data.ts` (production import flow) does NOT plumb `coverImage` or `metadataRef` into `NewGame.create` — Q8 fix is dead code on the production path **[BLOCKER]**

**Evidence:**
- `apps/api/src/application/import/import-data.ts:101-120` — the call to `NewGame.create({...})` passes 14 fields (kind, userId, title, developer, genre, releaseYear, platform, hoursPlayed, status, format, edition, coverColor, price, purchasedAt, notes). It does **NOT** pass `coverImage`, does **NOT** pass `metadataRef`.
- `apps/api/src/domain/games/new-game.ts:40,44` — `_coverImage` and `_metadataRef` fields exist on the aggregate but the production `ImportData` use-case never populates them.
- `apps/api/src/application/export/export-snapshot.ts:12-28` — `ExportedGame` does NOT contain `coverImage`, `metadataProvider`, `metadataProviderId`, or `metadataMatchedAt`. (This was Q-A's snapshot-side observation — but the import-side mirror is what makes the bug fix vacuous in production.)
- `packages/shared/src/import-schema-v4.ts:8-12` — v4 schema only carries `notes` of the 5 Q8 fields (price/purchasedAt come from v3).

**Why grill missed it:** Grill diagnosed the bug at the repo layer (`drizzle-import-repository`) and at the snapshot layer (export drops 4 of 5 fields). Grill did not trace the third end of the same data path — the `ImportData` use-case that builds `NewGame` instances from the parsed snapshot. The result is that even after 05-08 lands:
1. `applyMerge` INSERT branch passes `ng.coverImage` to the DB.
2. But `ng.coverImage` is **always `undefined`** when the import path is `POST /api/games/import` because `ImportData.execute` never sets it.
3. The repo-level fix only activates if a caller other than `ImportData` constructs `NewGame` with `coverImage` set. **No such caller exists** in the production graph (verified — `wiring.ts:144` wires `ImportData` as the only consumer of `importRepository`).

**Consequence:** The plan's stated invariant "Apex preserves its own data shape through its own snapshot mechanism" is **structurally false** until BOTH the snapshot schema AND `ImportData.execute` are extended. Plan 05-08 alone moves the silent-drop from the repo to the use-case — same bug, one layer up.

**Suggested fix (one of):**
- **(A) Scope honestly.** Re-title plan 05-08 as "INSERT field-fidelity at the repo boundary for callers that supply the 5 fields" and document explicitly that the production import path does NOT yet supply them. Acceptance criterion adjusted; round-trip test scoped to the 3 fields v4 actually carries (price/purchasedAt/notes — matching grill Q-A).
- **(B) Extend scope (recommended).** Add a Task 4 to 05-08: extend `ExportSnapshotV5` (or v4 if backward-compat is acceptable) with `coverImage`, `metadataProvider`, `metadataProviderId`, `metadataMatchedAt`; extend `ImportData.execute` to pass them. Then the round-trip test becomes meaningful. Cost: ~30 lines.
- **(C) Carve out the repo fix as a defensive layer.** Land 05-08 as written; document that it's a **boundary defense** for future callers; explicitly do NOT claim round-trip integrity. This is honest but weak — grill's Q-A already pushes toward (A).

**Severity:** BLOCKER. The plan's `must_haves.truths` line 30 ("Round-trip invariant: starting from a saved snapshot (any v1..v4) → ImportPlan.games preserves ALL fields") is unfalsifiable as written — it will pass vacuously because `ng.coverImage`/`ng.metadataRef` are `undefined` going INTO `applyMerge`. The test in Task 2 (Test 5/6) bypasses this by calling `NewGame.create({ coverImage: '...', metadataRef: {...} })` directly — but that's a synthetic path the production code never exercises.

---

### F-08-2 — `ng.coverImage` is `string | undefined` (NOT `string | null`) — Drizzle `.values({ coverImage: undefined })` omits the column entirely **[RECOMMEND]**

**Evidence:**
- `apps/api/src/domain/games/new-game.ts:40` — `private readonly _coverImage: string | undefined`
- `apps/api/src/domain/games/new-game.ts:131-133` — getter returns `string | undefined`
- 05-08 Task 1 action shows `coverImage: ng.coverImage` raw — relying on grill Q-E "trust the helper from 05-02 coerces undefined→null"
- 05-02 helper does not yet exist; its coercion contract is asserted but not verified against this getter's `undefined` (not `null`) optionality

**Why grill missed it:** Q-E concluded "trust the helper" without checking the helper hasn't shipped. The helper's behavior on `coverImage: undefined` vs `coverImage: null` may differ — Drizzle's `bun-sqlite` driver treats `undefined` in `.values()` as "omit column" (column gets DB DEFAULT) while `null` means "explicit NULL". For nullable columns with no DEFAULT, both produce NULL, but the path is different.

**Consequence:** Subtle. If a future migration ever adds a DEFAULT to `cover_image`, the import path silently picks up the default instead of NULL. Probabilistically low for this column, but a brittle pattern to enshrine.

**Suggested fix:** Either:
- Helper from 05-02 has an explicit `coverImage: input.coverImage ?? null` line — Task 1 of 05-02 should pin this with a test (helper-direct unit test that passes `coverImage: undefined` and asserts `row.coverImage === null` post-insert).
- Or 05-08 Task 1 coerces at call-site: `coverImage: ng.coverImage ?? null`. Grill Q-E flags this as "premature coercion" but that's only true if helper guarantees it.

**Severity:** RECOMMEND. Add helper-side coercion test to 05-02 Task 3 OR call-site `?? null` in 05-08. Pick one explicitly.

---

### F-08-3 — Round-trip test bypasses `wiring.ts` and `ImportData` — divergence from production wiring masks F-08-1 **[RECOMMEND]**

**Evidence:**
- 05-08 Task 3 Step 1: in-memory `:memory:` DB + `new DrizzleImportRepository(db)` direct instantiation (Q7 DI).
- The test calls `repo.apply(TEST_USER_A, plan, 'replace')` directly with a hand-built `ImportPlan` (Step 3: `const plan: ImportPlan = snapshotToImportPlan(snapshot1)`).
- Production path: `POST /api/games/import` → `ImportData.execute(snapshot)` → builds `NewGame` instances → `importRepository.apply(plan)`. The middle step is what drops 4 of 5 Q8 fields.
- `apps/api/src/wiring.ts:144` — `importData = new ImportData(...)` is the production composition.

**Why grill missed it:** Q-G and Q7 validated the DI shape, not the bypass effect on the round-trip claim. Q-A noticed the snapshot drops 4 fields but missed that the test sidesteps the use-case that would also drop those fields.

**Consequence:** The round-trip test, as written, gives **false confidence**. It pins `applyReplace` round-trip but NOT `ImportData.execute → applyReplace` round-trip. If someone reads only the test name ("export → import → re-export → diff = ∅") they will conclude the production import preserves data shape. It does not (see F-08-1).

**Suggested fix:** 
- Add a second round-trip test that goes through the **real** `ImportData` use-case: `await importData.execute({ snapshot: snapshot1, mode: 'replace', userId })`. Compare snapshot2 to snapshot1. This will **fail** until F-08-1 is resolved — which is the point: the test should fail until the real production path round-trips correctly.
- OR document explicitly in TSDoc that this test pins the **repo-level** invariant, NOT the use-case-level invariant, and reference 05-CONTEXT.md D-33 for the use-case scope.

**Severity:** RECOMMEND. Pick (a) honest scoping in TSDoc OR (b) add real-use-case test. Current plan does neither.

---

### F-08-4 — `import-data.ts` import path does NOT use `TransactionRunner` — `applyMerge`/`applyReplace` run in their own `db.transaction(...)` outside any cross-aggregate boundary **[NOTE]**

**Evidence:**
- `apps/api/src/infrastructure/import/drizzle-import-repository.ts:14, 69` — each method opens its own `db.transaction(async (tx) => { ... })`.
- `apps/api/src/application/import/import-data.ts:126` — `await this.importRepo.apply(userId, plan, mode)` is called once; no outer transaction wrapping it.
- `apps/api/src/application/shared/transaction-runner.ts` — exists as a port for multi-aggregate atomicity.

**Why grill missed it:** Not in scope of Q-DDD-1/2/3; the transaction model wasn't questioned.

**Consequence:** The Q8 expansion (5 more columns per INSERT) does not change transaction boundaries. The single `db.transaction` per `apply()` call already covers all platform + game writes atomically. SQLite WAL serializes writes; no deadlock risk. **However**: if a future caller wants to atomic-write across `ImportData.execute` + something else (e.g. emit a domain event via outbox), the current design pre-empts the outer transaction because `drizzle-import-repository` opens its own. This is pre-existing (not introduced by 05-08) but worth noting because the round-trip test as written never exercises an outer transaction either.

**Suggested fix:** Not for 05-08. Add to "Future Work" in CONCERNS.md (alongside the saveMetadata DDD smell from Q-DDD-3): "`DrizzleImportRepository.apply` opens its own transaction; if outbox/event publishing is ever co-required with import, refactor to accept a `TransactionRunner` and run as `withTx(tx)` like `DrizzleGameRepository`."

**Severity:** NOTE.

---

### F-08-5 — `applyReplace` DELETE+INSERT in a single transaction holds a global write lock for the duration; large snapshots scale linearly and block all writes **[NOTE]**

**Evidence:**
- `apps/api/src/infrastructure/import/drizzle-import-repository.ts:79-101` — `DELETE games` + `DELETE platforms` + N × `INSERT` inside `db.transaction(...)`.
- SQLite serializes writes at the database level (BEGIN IMMEDIATE / EXCLUSIVE during transaction). A 5000-row import on a single-user device holds the writer lock for the full duration.
- 05-08 adds 5 more columns per INSERT row → slightly larger payload, marginally longer hold time. Not material at single-user scale.

**Why grill missed it:** Operational concern outside the Q-DDD code-shape questions.

**Consequence:** None for single-user Apex. Documented for completeness. If this codebase ever forks to multi-user, the `applyReplace` strategy needs revisiting (chunked transactions, or accept downtime).

**Severity:** NOTE.

---

### F-08-6 — Round-trip test does not verify per-user isolation across snapshots (potential IDOR regression vector in test fixture) **[RECOMMEND]**

**Evidence:**
- 05-08 Task 3 acceptance criteria do not require asserting that snapshot1 for TEST_USER_A does not contain rows belonging to any other user.
- `apps/api/src/routes/games.idor.test.ts` exists to pin per-user scoping on routes, but the new in-memory round-trip test instantiates the repo directly — bypassing routes and Better-Auth user resolution.
- Plan does not mention seeding a second user's data and asserting `buildSnapshotV4(db, TEST_USER_A)` excludes it.

**Why grill missed it:** Q-B focused on TEST_USER_C for test isolation (fixture mechanics), not IDOR regression vectors in `buildSnapshotV4`.

**Consequence:** If the future `buildSnapshotV4` helper (Task 3 Step 5) is written without `eq(games.userId, userId)` in its SELECT, the test still passes (only TEST_USER_A seeded), but production export will leak. The test does not gate this.

**Suggested fix:** Add to Task 3 acceptance:
- Seed TEST_USER_A with N rows AND TEST_USER_B with M different rows in `beforeAll`.
- Assert `snapshot1.games.length === N` (NOT N+M) — pins that `buildSnapshotV4` filters by userId.
- This is a 3-line addition that turns the test from "round-trip works" to "round-trip is per-user scoped".

**Severity:** RECOMMEND. Cheap, high signal-to-noise.

---

### F-08-7 — `NewGame.create` re-stamps `metadataRef.matchedAt` to `new Date()` — duplicate `externalId` in a single ImportPlan would be undetected by tests **[NOTE]**

**Evidence:**
- `apps/api/src/domain/games/new-game.ts:60` — `matchedAt: new Date()` unconditionally.
- 05-08 Task 3 doesn't mention duplicate-externalId behavior within a single `ImportPlan.games[]`.
- `applyMerge` line 32-37 (current code): looks up existing row by externalId per game. If `plan.games` has two entries with the same externalId, the first inserts, the second sees the just-inserted row and updates it. Behavior: "last write wins within the plan."
- `applyReplace` line 85-101: DELETE first, then INSERT all → SQLite unique constraint `(user_id, kind, external_id)` (verify in schema) — second insert with same externalId in same kind would fail with UNIQUE violation, rolling back the entire transaction.

**Why grill missed it:** Q-DDD-2 covered matchedAt re-stamping in round-trip context, not duplicate-key behavior within a plan.

**Consequence:** A malformed snapshot with duplicate externalIds blows up `applyReplace` with a SQLite error mid-transaction (caller sees ImportData error). For `applyMerge` it silently uses last-write-wins. Asymmetric behavior between modes. Not a Phase 5 fix — it's a pre-existing design.

**Suggested fix:** Add a domain-level guard in `ImportData.execute` that pre-checks `plan.games` for duplicate `(kind, externalId)` pairs and returns `err({ kind: 'duplicate_external_id', ... })`. Out of scope for 05-08 — flag for Future Work.

**Severity:** NOTE.

---

### F-08-8 — Idempotency middleware at route level shields against retry duplication, but `applyReplace` is NOT itself idempotent — a partial-failure retry could double-delete then re-insert with stale state **[NOTE]**

**Evidence:**
- `apps/api/src/routes/middleware/idempotency-key.ts` — middleware caches response by hash; replays are short-circuited at HTTP layer.
- `applyReplace` (current) — wipes all user data then inserts plan. If the transaction crashes between DELETE and INSERT (process kill, OOM), SQLite rolls back the entire `db.transaction(...)` block automatically (single transaction, atomic). Good.
- However, if the retry comes from a *new* idempotency key (client regenerates UUID per logical operation, but a UI bug could send two different keys for same intent), the second call DELETEs again then INSERTs again. Each call individually atomic; collectively they DROP any data the user added between calls.

**Why grill missed it:** Not in scope; idempotency assumed sufficient.

**Consequence:** Only realizes if client mishandles idempotency keys. The CLAUDE.md guidance ("Clients generate one UUID per logical operation, reuse on retry") prevents this. Defense-in-depth would put an `applyReplace`-specific lock — overkill for single-user.

**Suggested fix:** Document this contract in `import-data.ts` TSDoc: "`applyReplace` is destructive and depends on the route-level idempotency middleware to deduplicate retries. The repository itself does NOT enforce idempotency."

**Severity:** NOTE.

---

## Plan 05-07 — new findings

### F-07-1 — Wave 3 CONCERNS sweep trusts prior commits without re-running acceptance gates; a regressed prior plan would produce a "Resolved" marker that lies **[BLOCKER]**

**Evidence:**
- 05-07 `depends_on: ['05-01' .. '05-06']` — declares ordering only, not invariant verification.
- 05-07 Task 1 `<verify>` block is a `grep -c` on the CONCERNS marker strings — it verifies the marker was written, NOT that the underlying code state still matches.
- 05-07 `<acceptance_criteria>` (lines 147-162) — all are grep-on-CONCERNS.md assertions. None re-run any of:
  - `bun test apps/api/src/infrastructure/db/__tests__/to-game-insert-row.test.ts` (BE-02 helper test)
  - `bun test apps/api/src/infrastructure/import/__tests__/apply-merge.test.ts` (BE-03 batched-read test)
  - `bun test apps/api/src/__tests__/wiring.test.ts` (BE-06 singleton test)
  - The architectural grep gates (BE-02 dedup grep gate, BE-03 grep guard, BE-06 architectural rg)
- The whole "Resolved in Phase 5" narrative depends on those acceptance gates being still-green at the moment of 05-07 commit. If, e.g., a 05-03 commit later regressed (rebase squashing, conflict resolution), 05-07 still happily writes "Resolved in Phase 5 (BE-03)".

**Why grill missed it:** Q1 validated the structural ordering decision; Q5 caught D-30..D-33 transcription gap. Neither asked "does the sweep VERIFY the prior work is still intact, or only assume it?".

**Consequence:** A CONCERNS entry that says "Resolved" while the underlying invariant test is red is worse than a CONCERNS entry that says "to be done". It induces false confidence in maintainers reading the doc six months later.

**Suggested fix:** Extend 05-07 Task 1 `<verify>` block to run:

```bash
bun test apps/api/src/infrastructure/db/__tests__/to-game-insert-row.test.ts \
         apps/api/src/infrastructure/import/__tests__/apply-merge.test.ts \
         apps/api/src/__tests__/wiring.test.ts \
         apps/api/src/routes/games.test.ts
```

Plus the three architectural grep gates (BE-02 dedup, BE-03 lookup pattern, BE-06 singleton rg). Acceptance criterion: all four test files exit 0 AND all three greps return their expected counts. Cost: one bash block; gate now matches the promises made in the markdown.

**Severity:** BLOCKER. This is the difference between "Resolved" being a verb (action verified at commit time) vs an adjective (state asserted, hopefully true).

---

### F-07-2 — `Last updated: 2026-05-15` stamp is hard-coded; 05-07 must commit on 2026-05-15 or the stamp lies **[NOTE]**

**Evidence:**
- 05-07 Task 1 action line 140: literal `*Last updated: 2026-05-15*`.
- Grill Q4 covered this with "1-day skew is noise; add executor instruction if >7 days drift."

**Why grill called it NOTE:** Correct.

**Consequence:** None at the noise level. Mention here only to confirm I considered it.

**Suggested fix:** Add the 7-day drift rule grill suggested directly to 05-07 Task 1 `<action>` as a literal pre-commit check. Currently it lives only in the grill report.

**Severity:** NOTE.

---

## Cross-cutting findings (both plans)

### F-X-1 — Phase 5 has no `bun test` full-suite green gate before declaring phase complete **[RECOMMEND]**

**Evidence:**
- 05-07 acceptance: greps only.
- 05-08 acceptance (Task 1): runs `bun run --filter=@apex/api typecheck`.
- 05-08 acceptance (Tasks 2-3): runs `bun test <specific file>`.
- No acceptance criterion anywhere runs `bun test` against the full `apps/api/src` tree to catch incidental regressions in routes/integration tests that the new INSERT column expansion could break (e.g. `routes/__tests__/integrations.int.test.ts`, snapshot tests).

**Why grill missed it:** Each Q was scoped to one plan; no Q asked "what about the rest of the suite?".

**Consequence:** A 5-column expansion to INSERT statements is plausibly silent. But the new columns include `metadataProvider` etc. — these are also targeted by routes that PATCH metadata. If a route test happens to rely on a Game row state where `metadata_provider IS NULL` and 05-08 changes that on the import path, the route test could go red without anyone noticing until deploy.

**Suggested fix:** Add to 05-08 `<verification>`:

```bash
bun test apps/api/src --timeout 30000
```

For 05-07, see F-07-1.

**Severity:** RECOMMEND.

---

### F-X-2 — Neither plan addresses `Game` aggregate's optimistic-locking column (`updatedAt`) consistency between INSERT (no expectedUpdatedAt) and applyMerge UPDATE branch (also no expectedUpdatedAt) **[NOTE]**

**Evidence:**
- `apps/api/src/infrastructure/games/drizzle-game-repository.ts` — `update()` and `saveMetadata()` use `expectedUpdatedAt` for optimistic concurrency control.
- `applyMerge` UPDATE branch (current `drizzle-import-repository.ts:55`) — `await tx.update(gamesTable).set(values).where(eq(gamesTable.id, existing.id));` — no `expectedUpdatedAt` check.
- If grill Q-DDD-1 is accepted (extend UPDATE branch to cover 5 Q8 fields), the question of optimistic locking on snapshot-replay UPDATE comes into play: should snapshot-replay overwrite user concurrent edits silently, or should it fail loudly?

**Why grill missed it:** Q-DDD-1 framed UPDATE branch as "make row look like this entry" — implicitly assumed last-write-wins. Optimistic locking question not raised.

**Consequence:** Design choice, not a bug. Documented snapshot semantics: import (especially `replace` mode) is destructive by design — last-write-wins is consistent with "restore from backup". But it's worth a CONCERNS.md line so future contributors don't accidentally add `expectedUpdatedAt` checks to `applyMerge` UPDATE and confuse the semantics.

**Suggested fix:** In 05-07 CONCERNS sweep, BE-02 entry partial-resolution wording should mention: "snapshot-replay paths in `applyMerge`/`applyReplace` deliberately bypass optimistic locking — last-write-wins is the import contract." One line.

**Severity:** NOTE.

---

### F-X-3 — Both plans omit a `git diff --stat` byte-count gate to verify "files_modified" list **[NOTE]**

**Evidence:**
- 05-07 `files_modified: [.planning/codebase/CONCERNS.md]` — single file. Acceptance criteria mention `git diff --stat` but only loosely.
- 05-08 `files_modified: [drizzle-import-repository.ts, apply-merge.test.ts, round-trip.test.ts]` — Task 4 also edits 05-02-PLAN.md and 05-07-PLAN.md, which are NOT in `files_modified`. Minor metadata inconsistency.

**Why grill missed it:** Plan metadata hygiene wasn't questioned.

**Consequence:** Reproducibility / audit trail. A plan executor expecting only 3 files modified will see 5 changed and may flag a deviation.

**Suggested fix:** Add `.planning/phases/05-backend-correctness/05-02-PLAN.md` and `.planning/phases/05-backend-correctness/05-07-PLAN.md` to 05-08's `files_modified`. Trivial.

**Severity:** NOTE.

---

## Final verdicts

| Plan | Verdict (this review) | Agreement with grill |
|------|----------------------|----------------------|
| **05-07** | **REWORK** | Grill said EDIT-AND-SHIP; I escalate to REWORK because F-07-1 (Wave 3 sweep doesn't verify prior commits' tests still pass) is a structural correctness gap, not just a missing task. Combined with grill's Q5 (D-30..D-33 transcription), 05-07 needs two new tasks: (a) re-run prior plan acceptance gates, (b) edit 05-CONTEXT.md with decision markers. |
| **05-08** | **REWORK** | Same verdict as grill, but for an additional reason. Grill identified Q-DDD-1 (UPDATE branch silent-drop) + Q-A (vacuous round-trip). I add F-08-1 (production import path doesn't plumb the fixed fields anyway — `ImportData.execute` drops `coverImage` and `metadataRef` before they ever reach the repo). Without resolving F-08-1, the entire plan is a defensive patch with no production-observable effect. |

---

## Summary (under 250 words)

**New findings (not in grill): 11**
- 05-08: F-08-1 (BLOCKER), F-08-2 (RECOMMEND), F-08-3 (RECOMMEND), F-08-4..F-08-8 (NOTE × 5)
- 05-07: F-07-1 (BLOCKER), F-07-2 (NOTE)
- Cross-cutting: F-X-1 (RECOMMEND), F-X-2 (NOTE), F-X-3 (NOTE)

**Top 3 by severity:**
1. **F-08-1 (BLOCKER) — Production import path drops `coverImage` + `metadataRef` in `ImportData.execute`** (`apps/api/src/application/import/import-data.ts:101`) before the data ever reaches the repo. Plan 05-08's `applyMerge`/`applyReplace` fix is structurally inert on the production path. Round-trip "preserves ALL fields" claim is vacuously false. Either narrow scope honestly (3 fields v4 carries) or extend to snapshot v5 + `ImportData`.
2. **F-07-1 (BLOCKER) — 05-07 Wave 3 sweep trusts that prior commits are still green** without re-running acceptance gates. A regressed prior plan would still produce a "Resolved in Phase 5" marker. Sweep must re-verify, not just assert.
3. **F-08-3 (RECOMMEND) — Round-trip test bypasses `ImportData`** (uses repo directly) — false confidence that the production export→import path round-trips when it does not (F-08-1).

**Final verdicts:**
- 05-07: **REWORK** (grill said EDIT-AND-SHIP; F-07-1 escalates)
- 05-08: **REWORK** (agree with grill; F-08-1 is independent reason)
