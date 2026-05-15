# Grill V5 — 05-08 (post-cycle-4 fixes: NEW-9, NEW-14, NEW-19)

Format per finding: **status** | evidence (file:line) | recommendation.

Status legend:
- **FIXED v4 fix held** — cycle-4 edit applied correctly, no regression
- **OPEN v4 fix incomplete** — cycle-4 edit did not fully resolve the v4 finding
- **NEW** — newly discovered in v5

---

## Verification of cycle-4 fixes

### NEW-9 (platforms seed shape) — **FIXED v4 fix held**

**Cycle-4 edit (05-08-PLAN.md:618):**
```
db.insert(platformsTable).values([
  { userId: TEST_USER_A, name: 'PC',  externalId: 'pc'  },
  { userId: TEST_USER_A, name: 'PS5', externalId: 'ps5' },
])
```

**Schema verification (`apps/api/src/infrastructure/db/schema.ts:56-72`):**
- `id`: integer autoIncrement (line 59) — omitted → SQLite assigns. ✓
- `userId`: text notNull (line 60-62) — present. ✓
- `name`: text notNull (line 63) — present. ✓
- `externalId`: text notNull (line 64) — present. ✓
- `createdAt`: integer timestamp with `$defaultFn(() => new Date())` (line 65) — omitted, default fires. ✓
- **No `updatedAt` column** on platforms — correctly absent from seed. ✓

**Cross-reference with `apps/api/src/infrastructure/dictionary/make-drizzle-dictionary-repository.ts:107-113`:** the dictionary factory's own `create()` writes exactly `{ externalId, userId, name }` — the cycle-4 seed mirrors the production write contract. No drift between test-seed shape and production-write shape.

**Unique-index check (`schema.ts:69-70`):** `(userId, name)` unique and `(userId, externalId)` unique. Seed has 2 rows with distinct names ('PC', 'PS5') and distinct externalIds ('pc', 'ps5'). No collision possible within the seed.

**No latent regression in Step 5 acceptance grep:** the plan's banned-pattern grep `grep -cE "values\\(\\s*\\[?\\s*\\{[^}]*id:\\s*['\\\"]" round-trip.test.ts = 0` (line 165 of grill-v4 report) is not in the current acceptance criteria block. The current Task 3 acceptance criteria (lines 656-670) do not include a platforms-id-banned grep. **OPEN-NIT**: defensively add the platforms-id-banned grep to acceptance criteria so a future contributor cannot re-introduce a string-id seed.

### NEW-14 (Test 8 surgical-strip positive assertions) — **FIXED v4 fix held**

**Cycle-4 edit (05-08-PLAN.md:519-520):**
```
expect(row.status).toBe('Playing');
expect(row.hoursPlayed).toBe(10);
```

**Column-name verification (`schema.ts:25-26`):**
- `hoursPlayed: integer('hours_played')` — Drizzle `$inferSelect` exposes the **JS property name** (`hoursPlayed`, camelCase), not the SQL column name. `db.select().from(games)` returns rows keyed by `hoursPlayed`. ✓
- `status: text('status')` — both JS and SQL column name are `status`. ✓

**Type compatibility:**
- `hoursPlayed` column is `integer` not null-absent (nullable). Seed at line 466-476 sets `hoursPlayed: null`. NewGame.create at line 487 supplies `hoursPlayed: 10` (`kind: 'owned'` requires non-null per `game-invariants.ts:101-108`). Post-merge, the UPDATE branch writes `hoursPlayed: HoursPlayed(10)` which `toGameInsertRow` unwraps to `10`. Read-back row has `hoursPlayed === 10` as integer. `expect(row.hoursPlayed).toBe(10)` matches. ✓
- `status` column is text. NewGame.create supplies `status: 'Playing'`. UPDATE branch writes `'Playing'`. Read-back row has `status === 'Playing'`. ✓

**Surgical-strip pin holds:** if a future contributor edits the destructure to also strip `status` or `hoursPlayed`, those columns would retain their seed values (`null` / `null`) — both `expect(...).toBe('Playing')` and `expect(...).toBe(10)` would fail RED. Test mechanic is sound.

**Acceptance grep (line 538):** `grep -c "row.status).toBe('Playing')" = 1` and `grep -c "row.hoursPlayed).toBe(10)" = 1` are precise and uniquely identify these assertions; no collision with other test code (Tests 1-7 do not assert status/hoursPlayed values directly on the read-back row in this exact pattern).

### NEW-19 (v5 tripwire framing in round-trip Test 1) — **FIXED v4 fix held**

**Cycle-4 edit (05-08-PLAN.md:619, 626):**
> "v5 tripwire. These assertions are structurally true today because `ExportedGame` (the result type of `toSnapshot`) lacks these keys. They fail RED the moment a v5 PR adds those keys to `ExportedGame`. That RED signal forces the v5 author to consciously decide whether to (a) extend `ImportData.execute` to consume the new fields and flip the assertions to positive preservation, OR (b) document why round-trip intentionally skips them."

**`ExportedGame` shape verification (`apps/api/src/application/export/export-snapshot.ts:12-28`):**
Carries: `externalId, kind, title, developer, genre, releaseYear, platform, hoursPlayed, status, format, edition?, coverColor?, price, purchasedAt, notes`. Confirmed absent: `coverImage, metadataProvider, metadataProviderId, metadataMatchedAt` (the four `not.toHaveProperty` targets).

**Tripwire mechanic:** the reframed comment correctly states the assertions are tautological today *because* `ExportedGame` lacks those keys. The actionable v5 intent — extend or document — is named explicitly with two concrete alternatives. The comment also cross-references the FIXME marker pipeline (line 626) so a v5 author reading the test can locate the corresponding source-side markers via `rg 'FIXME(BE-02c'`.

**Improvement over v4:** v4 wording said "real test not tautology" — actively misleading because the assertions ARE tautologies today. v5 wording owns the tautology and pins its forward-looking purpose. No abstractness drift; the comment is more accurate AND more useful.

---

## New regression checks (prompt items 4–6)

### Prompt item 4 — domain-invariant license misreading risk — **NO REGRESSION**

**Cycle-4 explanatory paragraph (05-08-PLAN.md:513-517):**
> "NOTE: the resulting row (kind='wishlist' + status='Playing' + hoursPlayed=10) intentionally violates wishlist domain invariants — this test pins the STRIP MECHANIC, not end-state validity. Domain invariants are enforced at NewGame.create time; the test bypasses that channel deliberately to exercise the UPDATE strip in isolation."

**Misread risk assessment:** the paragraph explicitly says invariants are "enforced at NewGame.create time" and that the test "bypasses that channel deliberately to exercise the UPDATE strip in isolation". A reader looking for license to bypass `NewGame.create` elsewhere would find the opposite signal: this comment *names* `NewGame.create` as the enforcement channel.

**Source-of-violation localization:** the test's own NewGame.create call (lines 479-491) constructs a perfectly valid `kind: 'owned'` aggregate with `status: 'Playing'` and `hoursPlayed: 10` — domain-valid at creation. The wishlist violation emerges purely from the UPDATE strip dropping `kind` while keeping `status`/`hoursPlayed`. The end-state inconsistency is a property of `applyMerge UPDATE`'s deliberate "kind is sacred, all else last-write-wins" policy (D-34), not of any test-side bypass. The comment accurately describes this. ✓

**No license-creep risk.** Wording stays within the four corners of the UPDATE-branch strip mechanic.

### Prompt item 5 — round-trip diff platform `id` volatility — **NO REGRESSION**

**`ExportedPlatform` shape verification (`export-snapshot.ts:7-10`):**
```
interface ExportedPlatform { externalId: string; name: string; }
```
**No `id` field on the exported platform.** `toSnapshot` at line 40 builds `{ externalId, name }` only.

**Implication for round-trip diff (Test 1, plan line 624):** `snapshot1` is built from TEST_USER_A's platforms (SQLite-assigned ids = 1, 2). `snapshot2` is built from TEST_USER_A_CLONE's platforms after `ImportData.execute` re-inserts them (SQLite-assigned ids = different integers, probably 3, 4 given AUTOINCREMENT semantics). But the **snapshot layer** never carries `id`, so `stripVolatile(snapshot2).toEqual(stripVolatile(snapshot1))` compares only `{externalId, name}` for platforms and the v4 `ExportedGame` shape for games. Integer-id divergence is invisible to the diff. ✓

**No volatile-strip helper needed for platform id** — the volatility is filtered structurally by the `ExportedPlatform` shape.

### Prompt item 6 — Test 7 vs Test 8 shared-state — **NO REGRESSION (already verified in v4)**

**v4 finding (grill-v4 lines 97-103) re-verified:** Test 7 uses externalId `'q8-update-target'`; Test 8 uses `'q8-kind-flip'`. Both seed under TEST_USER_A. The `(userId, externalId)` unique index at `schema.ts:44` does not collide on these distinct externalIds.

**Order-independence:**
- Test 7's `rows.length === 1` query is scoped by `externalId = 'q8-update-target'` — Test 8's seed row never matches.
- Test 8's `rows.length === 1` query is scoped by `externalId = 'q8-kind-flip'` — Test 7's seed row never matches.

bun:test honors source order, so Test 7 runs before Test 8 (line 405 < line 464 in the plan's append order). Test 7's writes to its externalId do not affect Test 8's query scope. Test 8's seed and assertions are isolated by externalId. ✓

**No interaction with Test 5/6:** Tests 5/6 use externalIds `'q8-merge-1'` and `'q8-replace-1'` respectively; Test 6 uses TEST_USER_C (separate user). No cross-test row contamination on the externalIds the assertions read back.

---

## Newly discovered

### NEW-20 (defensive grep gap for platforms-id-banned seed) — **NEW NIT**

**Current acceptance criteria (lines 656-670) do NOT include a banned-pattern grep for `platformsTable).values({id: ...})`.** The v4 grill report explicitly recommended one (grill-v4 line 165):
```
grep -cE "platformsTable\\)\\.values\\(\\s*\\[?\\s*\\{[^}]*id:\\s*['\\\"]" round-trip.test.ts = 0
```

The NEW-9 fix corrected the plan's seed snippet, but did not add a banned-pattern gate to prevent a future executor (or local-agent re-render) from re-introducing `id: 'p-pc'`. The general games-id grep at line 544 (`values\\(\\s*\\{[^}]*id:\\s*['\\\"]` for the games table seed) does not apply to platforms because the grep is on the file scope, not table-qualified. Re-reading: the grep at line 544 is actually file-wide. So if any `values({ id: 'string', ... })` appears anywhere in round-trip.test.ts, it would be caught — but that grep is in apply-merge.test.ts (line 544), NOT round-trip.test.ts.

**Severity:** NIT. The plan body (line 618) is correct; this is purely about belt-and-suspenders. Add to Task 3 acceptance criteria:
```
grep -cE "values\\(\\s*\\[?\\s*\\{[^}]*id:\\s*['\\\"]" apps/api/src/infrastructure/import/__tests__/round-trip.test.ts = 0
```

**Recommendation:** add the grep, but do not block ship on it — execution will follow the plan's correct snippet at line 618.

### NEW-21 (acceptance grep mismatch: `id: _id` count) — **NEW NIT, not a v4-fix regression**

**Plan line 320:** `grep -c 'id: _id' apps/api/src/infrastructure/import/drizzle-import-repository.ts = 1`

**Risk:** the destructure at line 298 reads `const { id: _id, userId: _u, externalId: _e, kind: _k, ...updateSet } = row;` — only one occurrence in the file (applyMerge UPDATE branch). `applyReplace` has no UPDATE branch (D-29 DELETE-then-INSERT), so the count is genuinely 1.

But the grep `'id: _id'` is fragile: it would also match a hypothetical comment string `// id: _id is destructured here` or any future TSDoc that mentions the pattern. Non-blocking — current behavior is correct, just brittle. Could be tightened to `grep -cE '\\bconst\\s*\\{[^}]*id:\\s*_id' = 1`. **NIT only.**

### NEW-22 (Test 1 game-sort determinism under identical seeds) — **NOT A BUG, NOTE**

`toSnapshot` sorts games by `title.localeCompare(b.title)`, then by `releaseYear` (export-snapshot.ts:43-49). For Test 1's diff to compare snapshot1 vs snapshot2 element-by-element via `toEqual`, the sort must be stable across the two exports. Both snapshots come from the same set of games (TEST_USER_A → TEST_USER_A_CLONE via replace import), so titles and release years are identical. Sort is deterministic. ✓

**No issue.** Just noting: if the executor seeds two games with the same title AND same release year, sort order between them is undefined per ECMAScript `Array.prototype.sort` semantics (engine-dependent). Recommendation: ensure the 3 seeded games in Test 1 have distinct titles. The plan does not specify titles; left to executor. Non-blocking.

---

## Final verdict

| Plan | Verdict | Why |
|------|---------|-----|
| **05-08** | **SHIP** | All three cycle-4 fixes (NEW-9, NEW-14, NEW-19) held under verification against schema, exported types, and adjacent test mechanics. No regression introduced by the explanatory paragraph (item 4). The round-trip diff is structurally safe against platform-id volatility (item 5) and externalId-distinct test isolation (item 6). The only newly surfaced items (NEW-20, NEW-21, NEW-22) are nit-tier defensive grep tightening and a sort-determinism note — none block execution. |

**Required edits before execute: NONE.**

**Recommended nits (all non-blocking):**
- **NEW-20**: Add `grep -cE "values\\(\\s*\\[?\\s*\\{[^}]*id:\\s*['\\\"]" apps/api/src/infrastructure/import/__tests__/round-trip.test.ts = 0` to Task 3 acceptance criteria for belt-and-suspenders against a future re-introduction of string-id platform seeds.
- **NEW-21**: Tighten Task 1 grep on `id: _id` to `grep -cE '\\bconst\\s*\\{[^}]*id:\\s*_id'`.
- **NEW-22**: Specify three distinct titles for the Test 1 seed games (e.g. 'Alpha', 'Beta', 'Gamma') in Task 3 Step 5 to remove any engine-dependent sort-tie.

Plan 05-08 is SHIP-clean. Ship it.
