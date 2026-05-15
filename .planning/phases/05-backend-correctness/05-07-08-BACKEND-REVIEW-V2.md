# Backend Review V2 — 05-07 + 05-08 Plans

*Reviewer: enterprise-web-expert-agent. Date: 2026-05-15. Source-truth: actual repo files as of HEAD.*

---

## Part A — Verification of Grill V2's 3 Open Blockers

### Claim 1 — Q-DDD-1 STILL OPEN (Tests 5/6/7 vacuous) — **CONFIRMED, partially worse than grill v2 thought**

**Evidence:**

1. `apps/api/src/domain/games/new-game.ts:21-23`:
   ```ts
   export type NewGameProps = GameInvariantsInput & {
     metadataRef?: { providerName: string; providerId: string };
   };
   ```
   `NewGameProps` does **not** declare `externalId`. `GameInvariantsInput`
   (`apps/api/src/domain/games/game-invariants.ts:24-41`) also has no
   `externalId` field. So in Tests 5/6/7 (`05-08-PLAN.md:303-321, 350-398`)
   the literal `externalId: 'q8-merge-1'` (etc.) inside the `NewGame.create({...})`
   first-arg literal is **a TypeScript error** with `strict: true` enabled —
   not a runtime "silently ignored" property as grill v2 framed it. The plan
   won't compile, let alone fail RED. The build fails before the test runs.

2. `apps/api/src/domain/games/new-game.ts:47-50`:
   ```ts
   static create(
     props: NewGameProps,
     idGenerator: () => string = () => crypto.randomUUID(),
   ): Result<NewGame, GameValidationError>
   ```
   `externalId` is set inside the constructor at line 70 from `idGenerator()`.
   The correct pattern (used in production import-data.ts:101-120) is to
   pass externalId via the **second arg**: `NewGame.create({...}, () => g.externalId)`.
   Tests 5/6/7 omit the second arg entirely, so each test would generate a
   random UUID — which would never match the seeded `externalId: 'q8-update-target'`
   in Test 7 (the seed row would not be located, Test 7 falls into INSERT
   instead of UPDATE → vacuous, just as grill v2 said, **assuming the file
   even compiles**).

3. `apps/api/src/domain/games/game-invariants.ts:60-61`:
   ```ts
   coverColor: string | undefined;
   coverImage: string | undefined;
   ```
   But Tests 5/6/7 (and the existing `interfaces` block at `05-08-PLAN.md:119-121`)
   describe `coverImage: string | null`. Wrong nullability — another typecheck
   error. `string | undefined` and `string | null` are mutually exclusive under
   `strict: true`. `notes` and `purchasedAt` are likewise `string | null` in
   the invariants type but tests pass them as `Date` objects (`new Date('2025-12-24')`)
   — and `PurchasedAt.create` (per `game-value-objects`) accepts a string. So
   even the type of `purchasedAt` is wrong end-to-end.

4. `apps/api/src/infrastructure/db/schema.ts:14`:
   ```ts
   id: integer('id').primaryKey({ autoIncrement: true }),
   ```
   Confirmed integer autoincrement. Test 7 seed `id: 'seed-update-target'`
   (`05-08-PLAN.md:353`) is a `string`. Drizzle's `$inferInsert` for an
   `integer` column has type `number | undefined` — so this is **another
   typecheck error**, distinct from claim 1 above. (Note: this is the table
   primary key. `externalId` is a **separate** notNull column at line 36 —
   grill v2 conflated the two but they're independent. The fix is to delete
   `id: 'seed-update-target'` entirely; autoincrement supplies it.)

**Net:** grill v2 correctly identifies that Test 7 cannot exercise the UPDATE
branch, but the failure mode is "won't compile" not "compiles but tests
vacuous". Test 5/6/7 each have **three** independent typecheck errors.
The plan's `<verify>` block runs `bun test`, not `tsc --noEmit`. Bun's
in-process test runner type-erases — these will fail at **runtime** with
"externalId is undefined" + drizzle insert constraint violation. Same
outcome, but harder to diagnose.

---

### Claim 2 — F-08-3 round-trip test won't compile — **CONFIRMED**

**Evidence — `apps/api/src/application/import/import-data.ts:22-34`:**

```ts
export class ImportData {
  constructor(
    private readonly gameRepo: GameRepository,
    private readonly platformRepo: PlatformRepository,
    private readonly importRepo: ImportRepository,
    private readonly idGenerator: () => string = () => crypto.randomUUID(),
  ) {}

  async execute(
    userId: string,
    rawJson: string,
    mode: ImportMode,
  ): Promise<Result<ImportReport, ImportError>>
```

Production constructor takes **3 required deps + 1 optional idGenerator**.
Production execute signature is `(userId, rawJson: string, mode)` — string
arg is parsed via `JSON.parse(rawJson)` (`parse-import.ts:21`). Plan
`05-08-PLAN.md:482` says `new ImportData(repo)` and `05-08-PLAN.md:469, 508`
says `importData.execute({ snapshot: snapshot1, mode: 'replace', userId: TEST_USER_A })`.
Both are **structurally wrong**:

- Constructor: missing `platformRepo` + `importRepo`. The test needs both —
  `platformRepo.list` is called when `mode === 'merge'` (line 66), and
  `importRepo.apply` is the actual delegation (line 126). Cannot stub these
  without real adapters or fakes.
- Execute: arg-shape mismatch. `mode` is the third positional, not a property
  of an object. The snapshot must be JSON-stringified before being passed.

Production wiring confirms (`apps/api/src/wiring.ts:144`):
```ts
export const importData = new ImportData(gameRepository, platformRepository, importRepository);
```

**Required correction:** Test must do
`new ImportData(new DrizzleGameRepository(db), new DrizzlePlatformRepository(db), new DrizzleImportRepository(db))`
(after Q7 DI lands for ALL THREE repos — not just the import one) and
`await importData.execute(TEST_USER_A, JSON.stringify(snapshot1), 'replace')`.

That has follow-on cost: **Q7 DI is currently only spec'd for `DrizzleImportRepository`**
in plan 05-03. To support production-path testing, **`DrizzleGameRepository`
and `DrizzlePlatformRepository` also need the optional-`db` constructor**. That
work is not in any 05-XX plan — it's an unscoped dependency of F-08-3.

---

### Claim 3 — Truth #8 contradicts Task 4 — **CONFIRMED**

**Evidence:**

- `05-08-PLAN.md:37` (must_haves.truths #8):
  > `ImportData.execute (apps/api/src/application/import/import-data.ts:101) ALSO passes coverImage + metadataRef to NewGame.create — F-08-1 fix.`

- `05-08-PLAN.md:607` (Task 4 behavior):
  > `Task 4 deliberately does NOT extend the v4 snapshot schema, does NOT extend export-snapshot.ts to emit new fields, does NOT extend ImportData.execute to consume them.`

- `05-08-PLAN.md:681` (Task 4 acceptance):
  > `grep -c 'coverImage:' apps/api/src/application/import/import-data.ts = 0 (NOT plumbed in Phase 5 — v5 unblocks)`

These three statements are mutually unsatisfiable. Truth #8 asserts ImportData
**does** plumb the two fields. Task 4 asserts it **does not**, and the
acceptance criterion grep insists on 0 occurrences. A reviewer (or audit run)
verifying `must_haves.truths` against the diff will conclude the plan failed
because Truth #8 is false. A reviewer verifying Task 4 acceptance will conclude
the plan succeeded because the grep is 0. Same plan, opposite outcomes.

**Fix direction (not for me to write):** Truth #8 must either be deleted or
re-worded to match Task 4's "FIXME signposts planted, runtime unchanged"
posture. Probably: *"ImportData.execute carries FIXME(BE-02c, F-08-1) markers
documenting the coverImage + metadataRef gap; runtime plumbing deferred to v5."*

---

## Part B — Additional Findings (not in grill v2)

### B-1 — Task 1 destructure list misses `id` — **BLOCKER**

Plan `05-08-PLAN.md:230`:
```ts
const { userId: _u, externalId: _e, kind: _k, createdAt: _c, updatedAt: _ua, ...updateSet } = insertRow;
```

`insertRow` is typed `NewGameRow` (= `typeof games.$inferInsert`).
`games.id` is `integer('id').primaryKey({ autoIncrement: true })` — so on
the **insert** type, `id` is `number | undefined`. When the plan calls
`toGameInsertRow(userId, { ... })`, the helper most likely does NOT set
`id` (autoincrement supplies it) — so `insertRow.id` is `undefined`.
Spreading `{...updateSet}` then includes `id: undefined`. Calling
`tx.update(games).set({ ...id: undefined, ... })` causes either:

- Drizzle silently strips `undefined` from the `SET` clause (current
  `drizzle-orm` behavior, **but version-dependent and not contractual**), OR
- The update overwrites `id` to `NULL` and SQLite rejects it (notNull PK), OR
- Future Drizzle change makes this misbehave.

**Fix direction:** add `id: _id` to the destructure list. Also `externalId`
is already destructured AS `_e` — fine. But this is the kind of bug that
ships green for six months and then explodes when drizzle minor-bumps.

### B-2 — Q7 DI scope was undersized for F-08-3 — **BLOCKER**

The round-trip test in Task 3 cannot be constructed with a `DrizzleImportRepository`
alone. It needs all three persistence adapters wired to the same in-memory
DB. **05-03 only ships Q7 DI for `DrizzleImportRepository`.** Plan 05-08
Task 3 implicitly depends on a wider Q7 — either:

- Tests use direct `db.insert(...)` for seed (already in the plan), AND
- Production `gameRepository` / `platformRepository` get an optional-`db`
  ctor arg — but **no plan in Phase 5 lands this**, AND
- Production `wiring.ts` is unchanged — also fine, but the test must
  construct the repos itself.

The cleanest fix is a separate sub-task in 05-03 (or 05-08) that adds the
optional-`db` arg to the other two repos. Without it, Task 3 cannot land
production-path coverage and degrades to repo-boundary coverage (which is
already in apply-merge.test.ts) — i.e. **the test loses its reason to exist**.

### B-3 — Truth #8 / Task 4 contradiction is a symptom, not the cause — **RECOMMEND**

The deeper issue: there are **two valid resolutions** to F-08-1 and the plan
leaves both half-implemented:

- **(A) Full fix:** bump to v5, plumb the fields, flip `not.toHaveProperty`
  to positive preservation. This is what Truth #8 implies.
- **(B) Document-and-defer:** FIXME signposts only, keep v4, repo-boundary
  test only. This is what Task 4 implements.

The plan should commit to one. Truth #8 reads like a leftover from an
earlier draft where the plan chose (A); Task 4 reads like a later commit
where someone chose (B). Both should be the same.

### B-4 — Snapshot stringification cost is negligible, but parse path is risky — **NOTE**

`importData.execute(userId, JSON.stringify(snapshot), mode)` is a fine
contract — `parseImport` uses `JSON.parse` then version-envelope detection
(`parse-import.ts:14-36`). The parse path is **safeParse**, not throwing
parse — that's the right pattern (`safeParse` returns `Result`, no try/catch).
No unsafe-parse risk.

Stringification overhead at typical test snapshot sizes (10s of KB) is sub-ms.
Not a perf concern. Just worth knowing the contract is what it is for
historical reasons (file upload endpoint feeds raw JSON in directly).

### B-5 — Entry 7 grep regex parenthesis — **NOTE**

`05-07-PLAN.md:196`: `rg -c 'FIXME(BE-02c' apps/api/src/application/import/import-data.ts = 2`

`rg` uses Rust's regex engine, which **does** treat `(` as a special metachar.
An unmatched `(` in a regex causes ripgrep to error out with
`regex parse error: unclosed group`. The acceptance criterion as written
**won't run** — it returns a parse error, not `2`.

**Fix direction:** either escape: `'FIXME\(BE-02c'`, or pass `-F` for
fixed-string mode: `rg -cF 'FIXME(BE-02c' ...`.

(The `05-08-PLAN.md:670-674` Task 4 verify block uses `grep -c` which is
**BRE** by default — `(` is literal there. So that one works. But 05-07
Task 1 acceptance criterion is broken.)

### B-6 — D-32 wording extension is scope-creep into a locked decision — **RECOMMEND**

`05-03-PLAN.md:219-220` (the plan that originally locked the test-user
convention) only mentions TEST_USER_A and TEST_USER_B. `05-07-PLAN.md:224`
transcribes D-32 as:
> `Test users use STATIC string IDs (TEST_USER_A = 'user-a', TEST_USER_B = 'user-b', TEST_USER_C = 'user-c').`

TEST_USER_C is introduced by 05-08 Task 2 Step 3 — **after** D-30..D-32 were
notionally locked in 05-03. Two clean options:

- (a) Add D-32 as written but reference 05-08 as the "extension" source —
  i.e. acknowledge D-32 was widened mid-phase. Honest.
- (b) Add D-34 specifically for TEST_USER_C and keep D-32 = A+B. Cleaner
  audit trail.

Choosing (a) silently bakes a scope expansion into a "milestone-locked"
decision marker. A future contributor reading D-32 would have no way to
tell that the C-user came in via 05-08, not 05-03. Minor but real.

### B-7 — Sweep ordering risk — **NOTE / RECOMMEND**

`05-07-PLAN.md:266-267`:
> *Task 1 F-07-1 re-verification gate: `bun test` on the four BE-XX test files exits 0 BEFORE the sweep marker text is written.*

This is asserted in plan prose but **not enforced by tooling**. If an
implementer commits the markers first (single CONCERNS.md edit + commit)
without first running `bun test`, the gate is bypassed. There is no
pre-commit hook in the repo (verified — `.husky/`, `lefthook.yml`, etc. not
present in git status); the only enforcement is the plan reviewer's
discipline. For an autonomous-execute plan (`autonomous: true`) the
executor agent has no out-of-band reminder.

**Fix direction:** make the `<verify>` block's `bun test` step a **prerequisite**
in the `<action>` body (run before any Edit calls). The current `<verify>`
runs after the action by convention. Or: explicitly put the test step in
the action prose with "DO NOT proceed if non-zero exit".

### B-8 — Transactional model of UPDATE branch — **NOTE (clean)**

The new `tx.update(games).set(updateSet).where(...)` runs inside the existing
`db.transaction(async (tx) => {...})` envelope around `applyMerge`. SQLite
in WAL mode serializes writes anyway; no deadlock risk; no new lock
escalation. The destructure-and-update pattern is byte-equivalent at the
SQL level to the previous shared-`values` block (just with 5 extra columns).
**No transactional concern.**

### B-9 — `expectedUpdatedAt` deliberate omission is correct — **NOTE (clean)**

`05-08-PLAN.md:163` explicitly leaves out optimistic locking on the
applyMerge UPDATE branch ("snapshot-replay is last-write-wins by design").
This is the right call: import is a bulk-restore operation, the user has
implicitly accepted "overwrite my state with this file". Forcing an
`expectedUpdatedAt` check would make merge fail for any row that's been
touched since the file was generated — defeating the purpose.

Same call as the D-29 carve-out for `applyReplace`. Consistent.

---

## Part C — Final Verdict Per Plan

### 05-07-PLAN.md — **CONDITIONAL APPROVE**

The plan does what it says (CONCERNS.md sweep + D-30..D-33 transcription).
Two issues:

1. **B-5 BLOCKER**: acceptance criterion grep at line 196 will not run as
   written. Escape the paren or use `-F`.
2. **B-6 RECOMMEND**: D-32 wording silently expands a locked decision —
   either acknowledge the expansion source or split out D-34.
3. **B-7 RECOMMEND**: ordering of the F-07-1 re-verification gate is asserted
   in prose but unenforced; promote the `bun test` step into the action.

None of these block delivery if a human reviewer corrects them inline.

### 05-08-PLAN.md — **REJECT (DO NOT EXECUTE)**

Three independent blockers, each of which makes the plan fail on first
contact with the codebase:

1. **Claim 1 CONFIRMED** (Tests 5/6/7 typecheck errors × 3 each): NewGame.create
   API mismatch + integer-PK seed mismatch + nullability mismatches.
2. **Claim 2 CONFIRMED** (Task 3 won't compile): ImportData constructor +
   execute signature wrong. Also unscoped Q7 DI dependency on GameRepository
   + PlatformRepository (B-2 BLOCKER).
3. **Claim 3 CONFIRMED** (Truth #8 vs Task 4 contradiction): plan
   self-contradicts on F-08-1 disposition.
4. **B-1 BLOCKER**: destructure list misses `id` — silent future bug.

The plan needs a structured rewrite of Tasks 1-3 against the **actually
verified** signatures before it can be executed. The "use Q7 DI" claim
implicitly assumes Q7 DI lands for all three repos, but only one is spec'd
in 05-03. Either expand 05-03 or shrink 05-08 Task 3 to repo-boundary tests
only.

Recommend: bounce 05-08 back to plan-phase for one more revision pass with
the actual source signatures embedded as `<interfaces>` text (currently
they're paraphrased and the paraphrases are wrong).
