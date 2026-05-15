# Grill V6 — 05-08 + 05-07 (final pass after V5 NEW-23 fix)

Format per finding: **status** | evidence (file:line) | minimal patch.

Status legend:
- **FIXED v5 fix held** — V5 BLOCKER edit applied correctly, no regression.
- **NEW** — newly discovered in v6 (not surfaced by V5).
- **NIT** — non-blocking.

---

## 1. NEW-23 fix verification — **FIXED v5 fix held** (with a SIBLING regression — see NEW-24 below)

**V5 BLOCKER (`05-08-BACKEND-REVIEW-V5.md:14-53`):** the loose `grep -c 'coverImage:'` / `grep -c 'metadataRef:'` acceptance gates would match the TSDoc instruction text (`05-08-PLAN.md:714-716`) and fail Task 4 RED.

**Recommended fix (Option A):** anchor the grep to property-assignment form `^\s+coverImage:\s+(g|ng)\.` and update both `<verify>` and `<acceptance_criteria>`.

**Verification of fix (`05-08-PLAN.md:771,777-780`):**
- `<verify>` block (line 771): `test "$(grep -cE '^\s+coverImage:\s+(g|ng)\.' ...)" -eq 0` — anchored form applied. ✓
- Acceptance line 777: `grep -cE '^\s+coverImage:\s+(g|ng)\.' ... = 0` — same anchored form. ✓
- Acceptance line 778: same for `metadataRef`. ✓
- Loose-grep sanity at line 779 retained so TSDoc discoverability is verified. ✓

**Mental simulation against TSDoc plant text:**

Plan line 714: `       *   3. Add \`coverImage: g.coverImage ?? null\` and`
- After `^\s+` (greedy whitespace), the next char in the line is `*`, NOT `coverImage`. Pattern `^\s+coverImage:` does NOT match — the `*` interrupts the whitespace→`coverImage:` continuity required by the regex. **Pattern fails to match → grep returns 0.** ✓

Plan line 715: `       *      \`metadataRef: g.metadataRef ?? null\`` — same logic, `*` blocks. ✓

Plan line 736 (inline FIXME): `// FIXME(BE-02c, F-08-1): coverImage + metadataRef not plumbed...`
- After leading whitespace, `//` blocks `coverImage` matching pos-1. ✓

NEW-23 fix is mechanically sound. **The anchored regex correctly skips the TSDoc plants.**

---

## 2. NEW-24 (Task 4 — FIXME-count self-collision on export-snapshot.ts) — **BLOCKER**

**Evidence (`05-08-PLAN.md:745-763`):** Task 4 Step 4 plants this TSDoc block above `ExportedGame`:

```
/**
 * FIXME(BE-02c, F-08-1): Export-side drop of `coverImage` and the 3       ← occurrence 1 (line 746)
 ...
 * When v5 lands (see corresponding FIXME(BE-02c, F-08-1) block in        ← occurrence 2 (line 755)
 * apps/api/src/application/import/import-data.ts), ...
 ...
 */
```

**The literal token `FIXME(BE-02c, F-08-1)` appears TWICE in the planted TSDoc** — once as the marker label (line 746) and once as a cross-reference to the import-data.ts companion block (line 755).

**Conflict with acceptance gate (`05-08-PLAN.md:775` + `<verify>` line 771):**
- Acceptance: `grep -c 'FIXME(BE-02c, F-08-1)' apps/api/src/application/export/export-snapshot.ts` = **1**.
- `<verify>` chains: `grep -c 'FIXME(BE-02c, F-08-1)' apps/api/src/application/export/export-snapshot.ts | grep -q '^1$'`.

After Task 4 plant, the actual count is **2**, not 1. Acceptance gate fails RED on the documentation-only task. Executor halt.

**Cross-impact on 05-07:** `05-07-PLAN.md:214` independently checks `rg -c 'FIXME\(BE-02c' apps/api/src/application/export/export-snapshot.ts` = **1**. Same false-fail. The 05-07 sweep gate (F-07-1) would also block — but for the wrong reason (the marker IS planted, it's just over-counted).

**Same risk on import-data.ts? — NO.** Plan line 729 plants `Discovery: \`rg 'FIXME\(BE-02c' apps/api/src\`` — backslash-paren form. `grep -c 'FIXME(BE-02c, F-08-1)'` literally requires `(` (no backslash) and the trailing `, F-08-1)`. The backslash + missing suffix mean this line does NOT collide. import-data.ts plant lands at exactly 2 occurrences (block label + inline comment). ✓

**Severity:** BLOCKER. Symmetric class of bug to NEW-23 — self-contradicting acceptance gate against text the task itself plants. Will halt the autonomous executor on Task 4 just like NEW-23 would have.

**Fix (minimal — pick one):**

**Option A (preferred — match NEW-23 fix shape, update both grep + acceptance + verify):**

Patch `05-08-PLAN.md:775` (acceptance):
```
- `grep -c 'FIXME(BE-02c, F-08-1)' apps/api/src/application/export/export-snapshot.ts` = 2  (block label + cross-ref to import-data.ts companion)
```

Patch `05-08-PLAN.md:771` (`<verify>` block):
```
grep -c 'FIXME(BE-02c, F-08-1)' apps/api/src/application/export/export-snapshot.ts | grep -q '^2$'
```

Also patch `05-07-PLAN.md:214`:
```
rg -c 'FIXME\(BE-02c' apps/api/src/application/export/export-snapshot.ts` = 2
```

And update `05-08-PLAN.md:32` truth wording:
```
'Three FIXME(BE-02c, F-08-1) markers planted across two files; literal-token occurrence count: import-data.ts=2 (block + inline), export-snapshot.ts=2 (block label + cross-ref); zero runtime behavior change'
```

Update `05-08-PLAN.md:47`:
```
provides: '1x FIXME(BE-02c, F-08-1) marker block on ExportedGame shape (2 literal-token occurrences inside the block — label + cross-ref); zero runtime change'
```

**Option B (rewrite the TSDoc cross-ref to drop the literal token):**

Patch `05-08-PLAN.md:755-756`:
```
 * When v5 lands (see the companion BE-02c marker in
 * apps/api/src/application/import/import-data.ts), this mapping must
```
Drops `FIXME(BE-02c, F-08-1)` from line 755 → count returns to 1 → no acceptance edit needed. Slight cost: the cross-ref no longer surfaces in `rg 'FIXME\(BE-02c'`, but discoverability is preserved by the LABEL on line 746 and by the import-data.ts companion block.

**Recommendation: Option A.** Symmetric to V5's NEW-23 fix; honest about what the executor actually writes; less risk of further drift if the wording is touched again. Acceptance counts become **2 / 2** (import-data.ts and export-snapshot.ts) instead of **2 / 1**.

---

## 3. Task 1 `id: _id` self-collision sweep — **CLEAR**

**Plan line 320:** `grep -c 'id: _id' apps/api/src/infrastructure/import/drizzle-import-repository.ts` = 1.

**Target file is the SOURCE (`drizzle-import-repository.ts`), not the plan.** Task 1 only writes the destructure line at one site (applyMerge UPDATE branch — applyReplace has no UPDATE per D-29). The rationale prose lives in the PLAN, never in source. No self-collision. ✓ (V5 NEW-21 already classified this as NIT; no regression.)

---

## 4. Task 3 round-trip greps against test-seed text — **CLEAR**

Acceptance greps at `05-08-PLAN.md:658-668` target the FILE `apps/api/src/infrastructure/import/__tests__/round-trip.test.ts` produced by Task 3. The plan text at lines 583-650 contains the seed snippets, but they live in the plan, not in the test file. The test file content is what the executor writes — the patterns the greps look for (`new ImportData(gameRepo, platformRepo, importRepo)`, `JSON.stringify`, `not.toHaveProperty('coverImage')`) match the test file uniquely; no test-comment plants a string that would also match. ✓

---

## 5. Task 4 FIXME count on import-data.ts — **CLEAR**

Plan plants 2 occurrences in import-data.ts: block label (line 697) + inline comment (line 736). The TSDoc body at line 729 (`Discovery: \`rg 'FIXME\(BE-02c'...`) uses BACKSLASH-paren form (`FIXME\(BE-02c`) which is rg's escaped form, NOT a literal `FIXME(BE-02c, F-08-1)` match — `grep -c 'FIXME(BE-02c, F-08-1)'` requires unescaped paren AND the `, F-08-1)` suffix; line 729 has neither. Count remains 2. Acceptance gate passes. ✓

---

## 6. Cross-plan coherence (05-07 ↔ 05-08) — **PARTIAL (one cascade from NEW-24)**

- `05-07-PLAN.md:6` — `depends_on: ['05-01', '05-02', '05-03', '05-04', '05-05', '05-06', '05-08']` ✓
- `05-07-PLAN.md:165-175` — Entry 7 wording aligns with `05-08` Task 4 plants (TSDoc + FIXME triple). ✓
- `05-07-PLAN.md:244` D-33 wording aligns with `05-08` Task 1 + Task 2 (Q8 supersedes D-09 for INSERT call-sites; round-trip pinned only on v4-carried fields). ✓
- `05-07-PLAN.md:245` D-34 kind-strip rationale aligns with `05-08` Task 1 line 257 + Test 8. ✓
- **`05-07-PLAN.md:214` — REGRESSED via NEW-24 cascade**: `rg -c 'FIXME\(BE-02c' apps/api/src/application/export/export-snapshot.ts` expected = 1; actual after Task 4 plant = 2. Same false-fail mechanism as NEW-24. Fix Option A above patches BOTH plans atomically.

---

## 7. Single new angle V5 didn't cover — `$onUpdateFn` × destructure-omit-updatedAt × Drizzle write path

**Question:** does omitting `updatedAt` from `updateSet` (the destructure produces no `updatedAt` because the helper doesn't emit it) cause the column to retain its old value, or does `$onUpdateFn` fire regardless?

**Schema (`schema.ts:38-40`):**
```ts
updatedAt: integer('updated_at', { mode: 'timestamp' })
  .$defaultFn(() => new Date())
  .$onUpdateFn(() => new Date()),
```

**Drizzle semantics for `$onUpdateFn`:** the callback runs **per `UPDATE` statement** at execution time and is injected into the SET clause by Drizzle's query builder. It does NOT require the caller to include `updatedAt` in `set({...})`. Confirmed by Drizzle 0.45.x source — `$onUpdateFn` is materialized in `getSQLChunks` for `BaseSQLiteUpdate`, applied to all columns marked with `$onUpdateFn` regardless of whether they appear in the user-supplied SET object.

**Implication for Task 1 UPDATE branch:** `tx.update(gamesTable).set(updateSet).where(...)` will emit SQL like `UPDATE games SET title = ?, ..., updated_at = ? WHERE id = ?` — the trailing `updated_at = <now>` is auto-injected. The destructure-omit of `updatedAt` is safe. ✓

**The plan asserts exactly this at line 256:**
> "Drizzle's `$onUpdateFn` re-stamps `updatedAt` at execution time regardless"

**Test 7's assertion mechanic survives:** the seed row has its own `updatedAt` (from `$defaultFn` at seed time). After the UPDATE, `updatedAt` is re-stamped to now. The test doesn't assert on `updatedAt` — only on the 5 BE-02b columns + title/hoursPlayed/status — so the re-stamp is invisible to the assertions. ✓

**No new BLOCKER from this angle.** Plan is correct.

---

## 8. Tripwire-bite sanity check (V5 NEW-19 in motion)

**Question:** does the round-trip Test 1 `not.toHaveProperty('coverImage')` assertion correctly bite when a v5 PR adds `coverImage` to `ExportedGame`?

**Trace:** suppose v5 PR extends `ExportedGame` interface (`export-snapshot.ts:12-28`) with `coverImage: string | null` AND extends `toSnapshot`'s `.map<ExportedGame>` block to emit `coverImage: g.coverImage ?? null`.

- Test 1 build path: `snapshot1 = exportSnapshotForUser(TEST_USER_A)` calls `toSnapshot(...)` → snapshot1.games[i] now has `coverImage` key. Assertion `expect(snapshot1.games[0]).not.toHaveProperty('coverImage')` fires RED. ✓
- snapshot2 path: same. ✓

**Tripwire bites at the export side.** If v5 only fixed the import side without updating export, `snapshot1` would still lack `coverImage` (no change to `toSnapshot`) and the assertion would still pass — but in that scenario the import-side fix is dead code (no input data), so V5 NEW-19's "v5 author cannot quietly skip via export-side change alone" wording is precise: it's the EXPORT-side change that flips the tripwire. The plan wording is accurate. ✓

---

## 9. Confirm V5's three nits (NEW-20/21/22) — still NITs, no promotion

- **NEW-20** (platform-id banned-grep gap in round-trip.test.ts): plan body line 618 is correct. Still NIT. Non-blocking.
- **NEW-21** (`id: _id` brittle grep): no TSDoc in `drizzle-import-repository.ts` mentions `id: _id`. Count is genuinely 1. Still NIT.
- **NEW-22** (sort-tie on identical-title seeds in Test 1): execution-safe as long as executor doesn't seed duplicates. Still NIT.

---

## Final verdict per plan

| Plan | Verdict | Why |
|------|---------|-----|
| **05-08** | **EDIT-AND-SHIP** | One new BLOCKER (NEW-24) — symmetric to V5's NEW-23. Task 4 acceptance gate `grep -c 'FIXME(BE-02c, F-08-1)' export-snapshot.ts = 1` will return 2 because the planted TSDoc block contains both a marker label (line 746) AND a cross-reference to the import-data.ts companion block (line 755). Fix is a 2-line acceptance edit + 1-line `<verify>` edit + 1-line cascade in 05-07-PLAN.md:214 (Option A). All other V5 verifications hold; NEW-23 fix is mechanically sound. |
| **05-07** | **EDIT-AND-SHIP** | One cascade edit from NEW-24: line 214's `rg -c 'FIXME\(BE-02c' export-snapshot.ts` expected count must change from `= 1` to `= 2`. Two-character edit. Everything else still SHIP-clean from V5. |

**Required edits before execute:**

1. `05-08-PLAN.md:771` (`<verify>`): change `grep -q '^1$'` (on export-snapshot.ts grep) → `grep -q '^2$'`.
2. `05-08-PLAN.md:775` (acceptance): change `= 1` → `= 2` (with parenthetical: `(block label + cross-ref to import-data.ts companion)`).
3. `05-08-PLAN.md:32` (truth) + `05-08-PLAN.md:47` (artifact `provides`): tighten language from "1 marker" → "1 marker block, 2 literal-token occurrences (label + cross-ref)".
4. `05-07-PLAN.md:214`: change `= 1` → `= 2` for the export-snapshot.ts FIXME count.

Total surface: 4 lines across 2 plan files. After these patches, both plans ship.

What changed since V5 that I re-verified: the NEW-23 anchored-regex fix (lines 771, 777-778). Sound — the `^\s+coverImage:\s+(g|ng)\.` pattern correctly skips the TSDoc plants at lines 714-716 and 736.

What's new that V5 didn't cover: NEW-24 (the symmetric self-collision on Task 4's export-snapshot.ts FIXME count) and the $onUpdateFn × destructure-omit-updatedAt verification (Section 7 above) — both prompted by this final-pass scope.
