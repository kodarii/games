# 05-08 Backend Review V4 — Final Pass

**Date:** 2026-05-15
**Scope:** Verify grill v4's claims against source; surface anything grill v4 missed.
**Method:** Direct file reads against `apps/api/src/infrastructure/db/schema.ts`, `apps/api/src/infrastructure/db/auth-schema.ts`, `apps/api/src/domain/games/game.ts`, `apps/api/src/domain/games/game-invariants.ts`, `apps/api/src/domain/shared/result.ts`, and full re-read of `05-08-PLAN.md`.

---

## Part 1 — Verification of grill v4's three claims

### NEW-9 BLOCKER — F-2 platform seed snippet ❌ CONFIRMED (both defects)

**Source of truth:** `apps/api/src/infrastructure/db/schema.ts:56-72` — `platforms` table:

```ts
export const platforms = sqliteTable('platforms', {
  id: integer('id').primaryKey({ autoIncrement: true }),   // INTEGER autoIncrement
  userId: text('user_id').notNull().references(() => user.id, ...),
  name: text('name').notNull(),
  externalId: text('external_id').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
  // NO updatedAt column. NO kind column.
}, ...);
```

**Plan line 609 (05-08-PLAN.md):**

```ts
db.insert(platformsTable).values([
  { id: 'p-pc', userId: TEST_USER_A, name: 'PC', externalId: 'p-pc', createdAt, updatedAt },
  { id: 'p-ps5', userId: TEST_USER_A, name: 'PS5', externalId: 'p-ps5', createdAt, updatedAt }
])
```

**Defect 1 — `id: 'p-pc'` (string) vs schema `integer autoIncrement`:** CONFIRMED. Drizzle infers `NewPlatformRow.id` as `number | undefined` (autoIncrement). String literal `'p-pc'` is a TypeScript compile error. Even if TS were bypassed, SQLite would either coerce silently to integer 0 (collision on second insert) or throw at runtime depending on column affinity.

**Defect 2 — `updatedAt` column does not exist:** CONFIRMED. `platforms` schema has NO `updatedAt`. Drizzle `$inferInsert` therefore does not accept `updatedAt`. Property does not exist → TS2353 ("Object literal may only specify known properties").

**Verdict:** BLOCKER — grill v4 correct. Plan inline snippet directly contradicts its own caveat ("use real schema column types — integer autoIncrement IDs"). The remediation: drop both `id` and `updatedAt` from the values literal:

```ts
db.insert(platformsTable).values([
  { userId: TEST_USER_A, name: 'PC', externalId: 'p-pc' },
  { userId: TEST_USER_A, name: 'PS5', externalId: 'p-ps5' },
])
```

`createdAt` may be omitted too (column has `$defaultFn(() => new Date())`); explicit `createdAt: new Date()` works but adds noise.

---

### NEW-12 nit — `Game.fromPersistence` IS exposed ✓ CONFIRMED (drop the hedge)

**Source of truth:** `apps/api/src/domain/games/game.ts:42-101` — `static fromPersistence(row: {...}): Game` is a public static method with full row shape declaration. No private modifier, no internal-only marker.

**Plan line 606 (Task 3 Step 4):**

> "(mapped to `Game` aggregates via `Game.fromPersistence` if available; else passes the rows through a thin adapter)."

**Verdict:** NIT. The "if available" hedge is dead conditional — `Game.fromPersistence` is unconditionally exported. Plan should say "mapped via `Game.fromPersistence`" without the fallback clause, OR simplify further per the plan's own next sentence: "simpler path: use `gameRepo.listAll(userId)` and `platformRepo.list(userId)` directly." Recommendation: pick the simpler path explicitly; the hedge introduces ambiguity into the executor's decision tree.

---

### NEW-13 nit — D-34 should explicitly say "narrows D-09" ✓ CONFIRMED (clarify cross-reference)

**Source of truth:** `05-07-PLAN.md:245` (D-34 entry):

> "**D-34 (Q-DDD-1 / F-1, LOCKED):** `applyMerge` UPDATE branch destructure list strips `id`, `userId`, `externalId`, AND `kind` from the helper output before `.set(updateSet)`. The `kind` strip is DELIBERATE — `Game.moveToCollection()` is the only domain-blessed kind-transition path..."

D-09 (per 05-08-PLAN.md interfaces section + 05-02 Task 2 prose) says: "import does not carry the 5 fields → helper defaults them to null". D-33 then says it SUPERSEDES D-09 for INSERT call-sites. D-34 talks about UPDATE column behavior but does not cite the D-09/D-33 chain.

**Verdict:** NIT. D-34 could close the cross-reference loop by adding one sentence: "Narrows D-09 for the `kind` column on UPDATE: helper output includes `kind`, but UPDATE-side destructure strips it." This makes the policy graph self-explanatory when a future contributor greps for "kind" in 05-CONTEXT.md.

---

## Part 2 — New findings beyond grill v4

### NEW-14 RECOMMEND — Test 8 wishlist seed bypasses domain invariants intentionally; document or audit assertion shape

**Source of truth:** `apps/api/src/domain/games/game-invariants.ts:91-100` — wishlist invariants:

```ts
if (input.kind === 'wishlist') {
  if (input.status != null) return err({ kind: 'wishlist_must_have_null_status' });
  if (input.hoursPlayed != null) return err({ kind: 'wishlist_must_have_null_hours_played' });
  if (input.purchasedAt != null) return err({ kind: 'wishlist_must_have_null_purchased_at' });
}
```

**Plan Test 8 seed (line 466-476):**

```ts
await db.insert(games).values({
  userId: TEST_USER_A,
  externalId: 'q8-kind-flip',
  kind: 'wishlist',
  title: 'old wishlist title',
  genre: 'rpg',
  platform: 'PC',
  format: 'digital',
  status: null,
  hoursPlayed: null,
  // purchasedAt omitted — schema column is nullable text → defaults to NULL
});
```

The seed is schema-compatible (all required columns provided, nullable ones set null). The wishlist invariants in the domain layer are satisfied (`status=null`, `hoursPlayed=null`, `purchasedAt=null`). This bypasses NewGame.create entirely, which is **deliberate and correct** — Test 8 needs a pre-existing wishlist row that the import then attempts to flip via merge.

**Concern:** After `repo.apply(...)`, the read-back row will have `status: 'Playing'` and `hoursPlayed: 10` (from the NewGame `kind: 'owned'` build), but `kind: 'wishlist'` (stripped by D-34). This means the row violates the domain wishlist invariant in DB (wishlist + status + hours), which **only ever surfaces if someone later reads the row through `Game.fromPersistence`** — and `Game.fromPersistence` does NOT re-validate invariants (it uses `fromTrusted` VO factories). The test's `expect(row.kind).toBe('wishlist')` + `expect(row.title).toBe('flip attempt')` does not assert anything about status/hoursPlayed.

**Verdict:** RECOMMEND. Either (a) tighten Test 8's NewGame.create to use `kind: 'wishlist'` with `status: null, hoursPlayed: null` (so post-merge row stays domain-valid even after the strip) — simpler, no invariant breach. OR (b) keep the kind-flip attempt but add assertions `expect(row.status).toBe('Playing'); expect(row.hoursPlayed).toBe(10)` to pin that the OTHER fields DID update while kind stayed — this is what the test prose at line 511 already implies ("Other mutable scalar fields DID update — proves the destructure-strip is surgical"). Option (b) keeps the test's stated purpose; option (a) closes a latent invariant-bypass smell.

**Severity:** RECOMMEND (not BLOCKER) because the post-merge invariant-broken row only lives inside the test DB and is not read back through `Game.fromPersistence`. But the asymmetric assertion ("kind unchanged" + "title changed", but nothing about status/hoursPlayed/purchasedAt) leaves the surgicality claim under-proven.

---

### NEW-15 RECOMMEND — Test 7 seed for `kind: 'owned'` is schema-valid but could be tightened

**Source of truth:** Plan line 407-418, schema lines 11-51.

```ts
await db.insert(games).values({
  userId: TEST_USER_A,
  externalId: 'q8-update-target',
  kind: 'owned',
  title: 'old title',
  genre: 'rpg',
  platform: 'PC',
  format: 'digital',
  hoursPlayed: 1,
  status: 'Backlog',
});
```

All required NOT NULL columns are present (`userId`, `title`, `genre`, `platform`, `externalId`; `kind`/`format` have defaults but explicit values are fine). `hoursPlayed`/`status` columns are nullable in schema — explicit non-null values match an owned row. No schema breach.

**Verdict:** No defect. NOTE only — this is fine as-is.

---

### NEW-16 RECOMMEND — Auth user seed columns are minimally correct but `emailVerified: false` is redundant

**Source of truth:** `apps/api/src/infrastructure/db/auth-schema.ts:4-19`. Required NOT NULL columns on `user`:
- `id` (text PK, no default)
- `name` (text)
- `email` (text, unique)
- `emailVerified` (integer boolean, default `false`)
- `createdAt` (default `unixepoch * 1000`)
- `updatedAt` (default `unixepoch * 1000`)

**Plan line 354 (Task 2 Step 2):**

```ts
{ id: TEST_USER_C, email: 'c@test', name: 'C', emailVerified: false, createdAt: new Date(), updatedAt: new Date() }
```

All required fields provided. `emailVerified: false` matches default. `createdAt: new Date()` works because column is `mode: 'timestamp_ms'` and Drizzle accepts `Date` objects (serialized to epoch ms internally).

**Plan line 593-594 (Task 3 round-trip Step 3):** "seed 3 users (TEST_USER_A, TEST_USER_A_CLONE, TEST_USER_B) in auth.user" — no explicit values block shown in the plan, just prose. Executor will need to follow the same shape as apply-merge.test.ts beforeAll (which 05-03 lands).

**Verdict:** No defect. NOTE — explicit values match schema. If the executor copies the shape verbatim from 05-03's apply-merge.test.ts beforeAll, both files stay consistent.

---

### NEW-17 NOTE — F-2 result.ok assertion shape is correct

**Source of truth:** `apps/api/src/domain/shared/result.ts`:

```ts
export type Result<T, E> = { ok: true; value: T } | { ok: false; error: E };
```

Discriminator is literal `ok: boolean`. Plan's `expect(result.ok).toBe(true)` is correct (line 612, 629). On failure path, `result.error` would carry `{ kind: 'unknown_platform', platform, gameIndices }` per import-data.ts:88. If the executor wants a richer failure signal when the assertion fails, optional extra `if (!result.ok) console.error(result.error)` would help debugging — but not required for correctness.

**Verdict:** No defect. Plan shape matches type.

---

### NEW-18 NOTE — `bun test` Step 0 gate timing in 05-07

**Source of truth:** I measured a representative test file (`apps/api/src/routes/games.test.ts`) — runs in ~150ms (it currently fails because env vars aren't set in this shell, but the runner overhead is the cost we care about). 05-07 Step 0 runs 4 files:
- `to-game-insert-row.test.ts` — pure helper, no DB → fast (sub-100ms)
- `apply-merge.test.ts` — in-memory SQLite with migrations + 8 it blocks → ~500ms-2s
- `wiring.test.ts` — boots Hono app, possibly spawns `rg` via `Bun.spawnSync` for the architectural pin → ~1-3s
- `games.test.ts` — routes test, in-memory db → ~500ms

**Estimate:** 3-7s wall-clock for the full Step 0 gate. Well under any realistic timeout. No concern.

**Verdict:** NOTE — confirms 05-07 Step 0 is operationally cheap. Grill v4's implicit concern (if any) about gate latency is unfounded.

---

### NEW-19 BLOCKER — Round-trip Test 1's `not.toHaveProperty` assertions on `snapshot1` are tautological if `Game.fromPersistence` is used in the seed-side helper

**Source of truth:** Plan line 614-617:

```
expect(snapshot1.games[0]).not.toHaveProperty('coverImage');
// likewise for snapshot2; likewise for metadataProvider, metadataProviderId, metadataMatchedAt
```

`snapshot1` is produced by `exportSnapshotForUser(TEST_USER_A)`, which (per plan line 606) "Calls `toSnapshot(...)`". `toSnapshot` maps rows to `ExportedGame` shape (verified by interfaces section (6): "Drops: coverImage, metadataProvider, metadataProviderId, metadataMatchedAt"). So **of course** `snapshot1.games[0]` does not have `coverImage` — `toSnapshot` does not emit it. The assertion succeeds regardless of whether the seeded DB row has `coverImage` populated.

**Plan line 610 hedges this:** "At least one game should have a non-null `coverImage` and a `metadataRef` in the SEED — these will NOT round-trip (proves Q4 honesty), but their presence in the seed makes the not.toHaveProperty on snapshot1 a real test, not a tautology."

**Counter:** The presence of `coverImage` IN THE DB does not make the `not.toHaveProperty('coverImage')` assertion on SNAPSHOT1 non-tautological. Snapshot1 is built by `toSnapshot`, which structurally cannot emit `coverImage` regardless of DB state. The plan's own caveat is wrong.

The assertion IS load-bearing for **snapshot2** (post-import re-export): if v5 ever lands and `toSnapshot` starts emitting `coverImage`, both snapshot1 AND snapshot2 will gain the property simultaneously. So the discoverability signal IS real — but the framing in the plan is slightly off.

**Verdict:** NOTE/RECOMMEND (not BLOCKER, mis-categorized initially after re-reading). The assertions still serve as v5 tripwires (they'll go RED when `toSnapshot` is extended). But the comment block at line 617 should be honest: "These assert that the v4 `ExportSnapshot` shape does not emit those 4 fields. When v5 lands and `toSnapshot` emits them, these go RED — surfacing a discoverable signal that the v5 PR must also extend `ImportData.execute` (see FIXME(BE-02c, F-08-1) markers)." The "real test, not a tautology" framing in the plan is misleading.

**Downgrade to RECOMMEND** — fix comment wording at line 617; no code change required.

---

### NEW-20 RECOMMEND — Plan-internal contradiction at line 609: prose says "use real schema column types" but the literal snippet uses wrong types

**Source of truth:** Plan line 609 — the F-2 platform seed snippet. The prose embedded in parentheses explicitly says "(use real schema column types — integer autoIncrement IDs for the actual `platforms.id` column; see schema for exact shape)" — yet the snippet hardcodes `id: 'p-pc'` (string).

This is a **self-contradicting instruction**. The executor reading top-to-bottom sees the snippet first, then the caveat. A naive copy-paste lands the wrong shape; the caveat says "see schema for exact shape" — the executor has to make a decision the plan should have made for them.

**Verdict:** RECOMMEND (paired with NEW-9 BLOCKER fix). When fixing NEW-9, also tighten the prose: replace the parenthetical caveat with the corrected snippet. Reduces executor cognitive load and prevents a re-introduction of the bug if the executor reads only the snippet.

---

## Part 3 — Final verdict

**Status: EDIT-AND-SHIP**

The plan is structurally sound — 4 tasks, clean separation, real Result type, real signatures, well-pinned acceptance criteria. The one BLOCKER (NEW-9) is a localized string-literal/missing-column defect in a 2-line snippet that the prose already self-contradicts (NEW-20). Two minor clarifications (NEW-12 hedge, NEW-13 cross-ref) tighten policy graph. One asymmetric-assertion smell (NEW-14) deserves a recommendation but is not blocking.

### Required edits before SHIP

1. **NEW-9 (BLOCKER):** At plan line 609, change the platform-seed snippet to:
   ```ts
   db.insert(platformsTable).values([
     { userId: TEST_USER_A, name: 'PC', externalId: 'p-pc' },
     { userId: TEST_USER_A, name: 'PS5', externalId: 'p-ps5' },
   ])
   ```
   Drop `id` (integer autoIncrement — SQLite picks it). Drop `updatedAt` (column does not exist). `createdAt` may be omitted (defaulted by `$defaultFn`).

2. **NEW-20 (RECOMMEND, paired with NEW-9):** Remove the misleading parenthetical caveat "(use real schema column types — integer autoIncrement IDs for the actual `platforms.id` column; see schema for exact shape)" — replaced by the correct snippet itself.

### Strongly suggested edits

3. **NEW-12 (NIT):** Drop "if available" hedge at plan line 606. `Game.fromPersistence` IS exposed.

4. **NEW-13 (NIT):** In `05-07-PLAN.md` D-34 entry (line 245), add a sentence: "Narrows D-09 for the `kind` column on UPDATE: helper output includes `kind`, but UPDATE-side destructure strips it."

5. **NEW-14 (RECOMMEND):** Either tighten Test 8 NewGame.create to `kind: 'wishlist'` (cleaner, no invariant breach), OR add positive assertions for `status`/`hoursPlayed` on the post-merge row to prove the surgicality claim that the plan's prose makes at line 511.

6. **NEW-19 (RECOMMEND):** Fix comment wording at plan line 617 — the `not.toHaveProperty` assertions are NOT made "non-tautological by seed presence"; they're tripwires that flip when `toSnapshot` is extended in v5.

### Not required

- NEW-15, NEW-16, NEW-17, NEW-18: NOTE-level confirmations. No edits.

---

## Verdict summary

| Severity | Count | IDs |
|----------|-------|-----|
| BLOCKER  | 1     | NEW-9 (F-2 platform seed: 2 schema defects) |
| RECOMMEND| 4     | NEW-14, NEW-19, NEW-20, NEW-13 |
| NIT      | 1     | NEW-12 |
| NOTE     | 4     | NEW-15, NEW-16, NEW-17, NEW-18 |

Grill v4 verified count: **3/3** (NEW-9 CONFIRMED both defects; NEW-12 CONFIRMED; NEW-13 CONFIRMED).
New findings beyond grill v4: **7** (1 BLOCKER-downgraded-to-RECOMMEND, 3 RECOMMEND, 3 NOTE).

**Final: EDIT-AND-SHIP.** Fix NEW-9 (mandatory). Apply NEW-12, NEW-13, NEW-14, NEW-19, NEW-20 (strongly suggested clarifications). After those, plan is shippable.
