# 05-08 Backend Review V5 — Final Pass

## Verdict on grill v5's SHIP claim: **REVISE — one new BLOCKER found, all other grill v5 verifications hold**

Grill v5's three cycle-4 fix verifications (NEW-9, NEW-14, NEW-19) are correct against source. Independent reads of `schema.ts:56-72`, `make-drizzle-dictionary-repository.ts:106-119`, `export-snapshot.ts:7-28`, `import-data.ts:23-27` all corroborate grill v5's claims:

- Platform seed `{ userId, name, externalId }` byte-matches production write contract in `dictionary` factory `create()`.
- `ExportedPlatform` has no `id` field — round-trip diff is structurally safe against integer-PK divergence.
- `ExportedGame` has no `coverImage` / `metadata*` keys — `not.toHaveProperty` assertions are tautologically true today, RED tripwire for v5.
- `ImportData` constructor positional order is `(gameRepo, platformRepo, importRepo, idGenerator?)` — matches Task 3 acceptance grep at line 658.
- `applyMerge` UPDATE destructure including `id: _id` is sound: `$onUpdateFn` stamps `updatedAt` at exec time; `createdAt`/`updatedAt` absence from `updateSet` is fine.
- Round-trip Test 1 platform seed satisfies `NewPlatformRow` minus the autoIncrement `id` and `$defaultFn`'d `createdAt`.

## NEW FINDING — BLOCKER

### NEW-23 (Task 4 acceptance gate vs Task 4 planted text — self-contradicting) — **BLOCKER**

**Evidence:** Task 4 Step 1 TSDoc body (plan lines 714-716) instructs the executor to plant this text inside `import-data.ts`:

```
3. Add `coverImage: g.coverImage ?? null` and
   `metadataRef: g.metadataRef ?? null` to the `NewGame.create`
   call below.
```

That string literally contains `coverImage:` and `metadataRef:` (inside the backticks).

**Task 4 acceptance criteria (plan lines 777-778):**
- `grep -c 'coverImage:' apps/api/src/application/import/import-data.ts` = 0
- `grep -c 'metadataRef:' apps/api/src/application/import/import-data.ts` = 0

After executing Task 4 verbatim, both greps return **1**, not 0. Task 4's `<verify>` block (line 771) also chains these as `test "$(grep -c 'coverImage:' ...)" -eq 0` — execution **fails RED on the documentation-only task**, blocking Task 4 ship.

**Severity:** BLOCKER. This is not a stylistic nit — it is a self-contradicting acceptance gate that will halt the autonomous executor mid-phase. The intent of the gate (no runtime plumbing of those keys) is correct; the regex is just too loose.

**Fix (minimal — pick one):**

Option A (preferred — tighten the regex to target actual code, not docstring backticks):

Replace lines 777-778:
```
- `grep -cE '^\\s*coverImage:\\s+(g|ng)\\.' apps/api/src/application/import/import-data.ts` = 0
- `grep -cE '^\\s*metadataRef:\\s+(g|ng)\\.' apps/api/src/application/import/import-data.ts` = 0
```
This matches a property assignment at line-start (after indentation) of the form `coverImage: g.coverImage` or `coverImage: ng.coverImage`, which is exactly the v5-runtime-plumbing shape. The TSDoc occurrence is preceded by a literal `* ` (TSDoc star prefix) and a backtick, so it does not match `^\s*`.

Also fix the `<verify>` block on line 771 to use the tightened pattern.

Option B (rewrite the TSDoc to dodge the regex):

Reword the TSDoc step 3 to: ``3. Plumb `g.coverImage` and `g.metadataRef` into the `NewGame.create` props (with `?? null` fallbacks).`` — drops the `coverImage:` / `metadataRef:` substring. Less elegant; loses the precise instruction shape.

Recommendation: **Option A**. It hardens the gate against the actual failure mode (runtime plumbing) instead of contorting the docstring.

## The 3 grill v5 nits — concurrence

- **NEW-20** (no banned-pattern grep for platform-id seed in round-trip.test.ts): concur **NIT**. Plan body at line 618 is correct. Non-blocking — execution will follow the correct snippet.
- **NEW-21** (`grep -c 'id: _id' = 1` is brittle to TSDoc collision): concur **NIT**. Currently no TSDoc in `drizzle-import-repository.ts` mentions `id: _id`, so the count is genuinely 1. Non-blocking.
- **NEW-22** (sort-tie on identical-title games in Test 1): concur **NIT/NOTE**. Recommendation to seed 3 distinct titles is sensible but execution-safe either way as long as the executor doesn't accidentally seed duplicates.

None of NEW-20/21/22 should be promoted to RECOMMEND.

## Cross-plan coherence

- 05-07 `depends_on` includes `'05-08'` (verified line 6). ✓
- 05-07 Entry 7 (lines 165-175) names the 3 FIXME(BE-02c) markers planted by 05-08 Task 4. ✓
- 05-07 D-33 wording (line 244) aligns with 05-08 Task 1 + Test 8 design (Q8 supersedes D-09 for INSERT call-sites; UPDATE-branch destructure; v4 carries only `price`/`purchasedAt`/`notes`). ✓
- D-34 wording in 05-07 (kind-strip rationale) aligns with 05-08 Task 1 line 257 + Task 2 Test 8. ✓
- 05-07 acceptance line 214 verifies `rg -c 'FIXME\(BE-02c'` returns 2 in `import-data.ts` + 1 in `export-snapshot.ts` — matches 05-08 Task 4 plant counts. ✓

## Final verdict per plan

| Plan | Verdict | Why |
|------|---------|-----|
| **05-08** | **EDIT-AND-SHIP** | One small but real BLOCKER (NEW-23) — Task 4's `coverImage:` / `metadataRef:` grep gates will fail against the TSDoc text Task 4 itself plants. Fix is a 2-line acceptance-criteria edit (Option A above). All other grill v5 verifications hold. |
| **05-07** | **SHIP** | Cross-references to 05-08 still valid; no further edits needed. SHIP held from prior cycle. |
