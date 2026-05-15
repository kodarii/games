# Backend Review V6 — 05-08 + 05-07 (final production-readiness pass after Grill V6)

Scope: confirm V6's NEW-24, add production-correctness angles V6 did not cover, sweep for analogous self-collisions.

Status legend: **BLOCKER** | **RECOMMEND** | **NIT** | **CONCUR** (with V6) | **DISPUTE** (V6).

---

## 1. NEW-24 verification — **CONCUR with V6 (BLOCKER)**

Independent count of the literal token `FIXME(BE-02c, F-08-1)` inside the planted TSDoc block at `05-08-PLAN.md:745-763`:

- Line 746: `* FIXME(BE-02c, F-08-1): Export-side drop of \`coverImage\` and the 3` — occurrence 1 (block label).
- Line 755: `* When v5 lands (see corresponding FIXME(BE-02c, F-08-1) block in` — occurrence 2 (cross-ref to import-data.ts companion block).

Confirmed mechanically by `sed -n '745,763p' … | grep -c 'FIXME(BE-02c, F-08-1)'` → **2**.

Acceptance gate at `05-08-PLAN.md:775` expects `= 1`. `<verify>` at line 771 chains `| grep -q '^1$'`. Both fail RED on a documentation-only task — autonomous executor halts.

Cascade to `05-07-PLAN.md:214` (`rg -c 'FIXME\(BE-02c' … export-snapshot.ts` = `1`) — same false-fail mechanism, same fix shape.

**Severity confirmed: BLOCKER.** V6's Option A patch (bump both gates to `2`) is the minimal, symmetric fix. I prefer Option A over Option B because the cross-ref carries useful discoverability — `rg 'FIXME(BE-02c'` from anywhere in the tree surfaces the export-side link to the import-data.ts companion in a single hit.

---

## 2. Drizzle UPDATE-branch `updateSet` shape under future schema growth — **RECOMMEND** (not BLOCKER, document as D-35)

**Evidence.** Plan line 274 destructure: `const { id: _id, userId: _u, externalId: _e, kind: _k, ...updateSet } = row;` where `row` is `toGameInsertRow(userId, {...18 fields})`. Future-shape risk:

1. A future migration adds e.g. `archivedAt: integer('archived_at', { mode: 'timestamp' })` to `games` (`schema.ts:11-50`).
2. The helper is extended (innocuously) to forward `archivedAt` from the input object.
3. Snapshot-replay `applyMerge` UPDATE now writes `archivedAt` on every merge tick — overwriting an archive flag that was set OUTSIDE the import path.

Same risk vector as the `kind: _k` carve-out documented in D-34: any column whose mutation requires domain-blessing (not raw scalar update) will silently flow through the open-spread destructure.

**The plan does not protect against this.** It encodes a "trust-the-helper" contract that future contributors must read 05-CONTEXT.md to understand.

**Recommendation (non-blocking, can land as D-35 in 05-07 Task 2 or as a follow-up):** add a defensive shape comment **inside the destructure site** in `drizzle-import-repository.ts`:

```ts
// D-34 + D-35: strip identity-and-discriminator columns. If a future migration
// adds a column that should NOT be touched by snapshot-replay UPDATE (audit
// columns, archive flags, soft-delete tombstones), add the column name here
// AND to apply-merge.test.ts Test 8's positive-preservation assertions.
const { id: _id, userId: _u, externalId: _e, kind: _k, ...updateSet } = row;
```

Plus a one-line addition to `apply-merge.test.ts` Test 8's NEW-14 surgical-strip pin: explicit positive assertion that every CURRENT non-stripped column DID update (the existing `row.status` + `row.hoursPlayed` pins partially cover this). Phase 5 ships without it; flag as F-08-7 in CONCERNS Entry 7 if you want a re-open trigger.

**Severity: RECOMMEND.** Don't block Phase 5 — the trust-the-helper contract is defensible single-user-mode. But D-35 (or its equivalent) should land before Phase 5 archive.

---

## 3. Optimistic-locking invariant deliberately bypassed — **CONFIRMED design decision, no action**

Plan line 260 explicitly states: *"applyMerge UPDATE branch does NOT apply optimistic locking — import is a bulk last-write-wins operation (consistent with D-29 / applyReplace; the user is signaling 'make my DB look like this snapshot')."*

Cross-checked against `update-game.ts` (uses `expectedUpdatedAt`) — import path is an explicit carve-out from the standard optimistic-concurrency invariant. This is correct for single-user import-as-bulk-replay semantics. The carve-out is documented in plan and the test (Test 7) doesn't pass `expectedUpdatedAt`, matching the contract.

**Verdict: CLEAR.** The bypass is deliberate. Document marker in D-33 already covers this implicitly via the "Q8 supersedes D-09 for INSERT call-sites" wording — but the optimistic-lock carve-out is a SEPARATE decision and deserves its own bullet. **NIT: extend D-33 wording** to explicitly call out "UPDATE branch bypasses `expectedUpdatedAt` (last-write-wins for import)." Saves a future contributor 20 minutes of git-archaeology.

---

## 4. Idempotency middleware × cross-version cache pollution — **RECOMMEND** (NEW finding, not surfaced by V5/V6)

**Evidence.** `apps/api/src/routes/import.ts:14-35` mounts `idempotencyKeyMiddleware` on `POST /api/import`. Hash inputs (`middleware/idempotency-key.ts:24-26`): `method + path + rawBody`.

The body is `JSON.stringify(parsed.data.snapshot)`. **The hash does NOT include the snapshot schema version.**

**Scenario.** User submits a v4 snapshot with idempotency-key `X`. v4 import returns 200 with `report = { games: { created: 50, updated: 0 } }`. Cache stores `(X, hash(body), 200, report)` with the 24h TTL.

When v5 ships (post-Phase 5):
1. Client retries the SAME logical operation by submitting the SAME v4-shaped body with key `X`.
2. Cache hits (same hash). Returns the cached v4 response verbatim — **even though v5 import logic would now persist `coverImage` + `metadataRef` differently**.

This is intra-version idempotency working as designed (good — same body → same response). But there's a subtler vector: if the client UPGRADES to emit v5-shaped bodies for the same logical operation (same key `X`), the hash differs → 409 `idempotency-key-conflict`. That's CORRECT for the cache, but the 24h TTL window means a v4-client paused for hours then resumed as v5-client gets a stale 409 instead of executing the v5 import.

**Severity: RECOMMEND.** Phase 5 ships v4 only — no immediate impact. But the v5 lift should include either:
- (a) bump the idempotency-key cache namespace when schema version changes (include `snapshot.version` in the hash input), OR
- (b) flush the per-user `idempotency_keys` rows on v5 cutover migration, OR
- (c) shorten the TTL for `/api/import` routes specifically (e.g. 1h) so the stale-409 window is narrow.

Recommend adding this as **F-08-8** to CONCERNS Entry 7 — discoverability for the v5 PR author.

---

## 5. Cron × in-progress import — **CLEAR**

**Evidence.** `cleanup-orphans.ts:93-125` runs `storage.listOlderThan(24)` ∩ `gameRepo.findAllCoverImages()`. Both are reads. SQLite WAL allows concurrent readers with one active writer.

Mid-`applyReplace` transaction (which DELETEs all games then INSERTs them again with new cover URLs): the cron read either:
- (a) sees pre-tx state (all old URLs present in `findAllCoverImages`), classifies post-tx-deleted-URLs as NOT-orphaned (correct — they're still in DB at read time), OR
- (b) sees post-commit state (new URLs present), classifies pre-tx URLs as orphaned (correct — they ARE orphaned).

Neither path misclassifies. The `listOlderThan(24h)` filter further protects against false-positive deletion of just-inserted covers (they're <24h old, so they don't enter the candidate list).

**Verdict: CLEAR.** No race, no double-delete vector. The `findAllCoverImages()` per-user scoping check (CLAUDE.md invariant) — verified separately at the repo layer; not in scope for this plan.

---

## 6. Per-user scoping in ImportData.execute — **CLEAR**

**Evidence.** `import-data.ts:30-128`:
- Line 31: `userId: string` is the function arg (from `c.get('user').id` at route layer, `import.ts:22`).
- Line 66, 91-96: `userId` flows through to platform repo + NewPlatform.
- Line 99-122: `NewGame.create({..., userId, ...})` — userId from the AUTHENTICATED user, never from snapshot data.
- v4 schema (`packages/shared/src/import-schema-v4.ts`) does NOT declare `userId` — `grep -n userId` returns empty, so attackers cannot smuggle a foreign userId via JSON.

`applyReplace` DELETE (`drizzle-import-repository.ts:79-80`) uses `eq(gamesTable.userId, userId)` — bounded to the authenticated user's rows only. **Cannot delete another user's data.**

**Verdict: CLEAR.** IDOR-safe. Test 3 in Task 3 (`05-08-PLAN.md:633-641`) pins this at the production path with TEST_USER_B's row count unchanged after TEST_USER_A_CLONE replace — correct test design.

---

## 7. Sweep for other self-collisions V5+V6 missed — **CLEAR**

Verified each acceptance grep whose target file is also a file the task plants text into:

- Task 1 (`drizzle-import-repository.ts`): all 8 greps at lines 314-322 target distinct property-assignment patterns (`coverImage: ng\.coverImage`, etc.) that appear ONLY in the new row-construction call sites — not in plan text or TSDoc. The current source has zero matches (verified by reading `drizzle-import-repository.ts:38-100`); after Task 1, exactly 2 matches per pattern. No self-collision.
- Task 2 (`apply-merge.test.ts`): greps at lines 538-545 target test-string literals (`q8-kind-flip`, `q8-merge-1`, etc.) that exist only in the test file. The plan body uses them too, but the target file is the test, not the plan. CLEAR.
- Task 3 (`round-trip.test.ts`): same pattern — greps target the test file. The plan body's pseudo-code is the seed, not the search target. CLEAR.
- Task 4 (the two source files): NEW-24 is the only collision. Verified by mentally walking the TSDoc text for each `FIXME(BE-02c, F-08-1)` literal occurrence (1 in import-data.ts block + 1 inline + 0 in cross-ref text = 2 ✓; 1 in export-snapshot.ts label + 1 in cross-ref text = 2 ✗).

No additional self-collisions.

---

## 8. Cross-plan coherence — **PARTIAL (one cascade from NEW-24)**

V6's claim is correct: `05-07-PLAN.md:214` cascade is the only cross-plan edit needed. Verified:
- 05-07 `depends_on` includes `05-08` ✓ (line 6).
- 05-07 Entry 7 wording at lines 165-175 of 05-07-PLAN.md aligns with 05-08 Task 4 plants.
- 05-07:214 expected count `= 1` — cascade-fixes to `= 2`.

No other cross-plan grep references the export-snapshot.ts FIXME count.

---

## Required edits before execute (consolidated)

| Plan | Line | Change |
|------|------|--------|
| 05-08-PLAN.md | 771 | `\| grep -q '^1$'` → `\| grep -q '^2$'` (export-snapshot.ts FIXME count in `<verify>`) |
| 05-08-PLAN.md | 775 | `= 1` → `= 2` (acceptance — add parenthetical `(block label + cross-ref to import-data.ts companion)`) |
| 05-08-PLAN.md | 32 + 47 | tighten wording: "1 marker block → 2 literal-token occurrences (label + cross-ref)" |
| 05-07-PLAN.md | 214 | `= 1` → `= 2` for export-snapshot.ts FIXME count |

**Suggested non-blocking additions** (post-fix, before archive):

1. Append `D-35 (LOCKED)` to 05-07 Task 2: "future-column safety for `applyMerge` UPDATE destructure — additions to the games schema require explicit decision: pass-through (leave updateSet open) or carve-out (add to destructure strip list AND to Test 8 positive-preservation assertions)."
2. Append `F-08-8` to 05-07 Entry 7: "v5 cutover must address idempotency-key cache TTL pollution — include schema version in hash, or flush cache, or shorten import-route TTL."
3. Extend D-33 wording in 05-07 Task 2: "UPDATE branch bypasses `expectedUpdatedAt` (last-write-wins for import — deliberate, single-user bulk-replay semantics)."

---

## Verdict per plan

| Plan | Verdict | Why |
|------|---------|-----|
| **05-08** | **EDIT-AND-SHIP** | **CONCUR with V6.** NEW-24 BLOCKER confirmed by independent count. Two production-readiness recommendations (Section 2 destructure forward-compat, Section 4 idempotency cross-version pollution) are non-blocking but should land as D-35/F-08-8 to preserve discoverability for future contributors. Otherwise SHIP-clean. Per-user scoping, cron-isolation, and Result-error contract all verified at source. |
| **05-07** | **EDIT-AND-SHIP** | One cascade fix (line 214: `= 1` → `= 2`). Optional: add D-35 + F-08-8 + tighten D-33 per Section 9 recommendations. |

**Final disposition.** V6 nailed the BLOCKER. The four-line patch set V6 proposed is correct and sufficient to unblock execution. The production-readiness angles (destructure forward-compat, idempotency cache pollution) are durability concerns for the v5 cutover, not Phase 5 ship-blockers.
