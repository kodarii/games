# Phase 05-02 Summary — Centralize toGameInsertRow

**Phase:** 05-backend-correctness, plan 02 (BE-02)
**Date:** 2026-05-15
**Status:** complete

## Helper signature

```ts
// apps/api/src/infrastructure/db/schema.ts
export type GameRowInput = {
  kind: 'owned' | 'wishlist';
  externalId: string;
  title: string;
  genre: string;
  platform: string;
  format: string;
  developer?: string | null;
  releaseYear?: { value: number } | number | null;
  edition?: string | null;
  hoursPlayed?: { value: number } | number | null;
  status?: string | null;
  coverColor?: string | null;
  coverImage?: string | null;
  price?: { value: number } | number | null;
  purchasedAt?: { value: string } | string | null;
  notes?: string | null;
  metadataRef?: { providerName: string; providerId: string; matchedAt: Date } | null;
};

export function toGameInsertRow(userId: string, input: GameRowInput): NewGameRow;
```

Internally uses a private `unwrap<T>` helper that handles `{ value }` wrappers,
primitives, and `null | undefined` uniformly. Returns a 19-column row (userId +
18 user-managed columns) with explicit `null` for every omitted nullable field.
Does NOT set `id`, `createdAt`, `updatedAt` (auto-generated).

## Line counts BEFORE vs AFTER at the three INSERT call-sites

| Call-site | Before | After |
|---|---|---|
| `DrizzleGameRepository.create` (insert values block) | 23 lines (full inline `.values({…})`) | 27 lines (helper call with structured input — 4 lines wider only because the `metadataRef` is hand-shaped to drop the `ProviderName` brand) |
| `DrizzleImportRepository.applyMerge` INSERT branch | 12 lines (shared `values` const + `{ userId, externalId, ...values }`) | 14 lines (helper call with 12 explicit fields) |
| `DrizzleImportRepository.applyReplace` INSERT loop | 14 lines (full inline `.values({…})`) | 14 lines (helper call with 12 fields, no extra metadata) |

Pure-line totals went up slightly, but **knowledge duplication dropped from
3× to 1×** — a new column now requires editing only `toGameInsertRow` plus the
three call-site inputs (one new property per site, no logic). Before, every
column added needed three independent edits with three opportunities for drift
(D-06, D-08).

`update()` and `saveMetadata()` are byte-identical to HEAD (D-10 carve-out
preserved).

## Test output

Test file: `apps/api/src/infrastructure/db/__tests__/to-game-insert-row.test.ts`.

```
bun test v1.3.10 (30e609e0)

 6 pass
 0 fail
 38 expect() calls
Ran 6 tests across 1 file. [65.00ms]
```

The six `it(...)` blocks:

1. `returns identical column payload for owned game with all fields populated`
2. `nullable columns default to null when omitted`
3. `round-trip via .insert().returning() matches helper output (user-managed columns)`
4. `DrizzleGameRepository.create produces same shape as direct helper insert`
5. `PIN (BE-02 SC-2): dedup grep — \`kind: <var>.kind\` total occurrences match snapshot`
6. `PIN (D-10 carve-out): VO-unwrap pattern (.value ?? null) occurs exactly N times across helper + UPDATE call-sites`

Full API suite: **516 pass / 0 fail** across 59 files (regression-clean).

## Pin literal counts (measured after Tasks 1–2)

### Test 5 (BE-02 SC-2 dedup grep gate)

Pattern: `/kind: \w+\.kind/g` across `apps/api/src/**/*.ts`.

```
EXPECTED_KIND_DOT_KIND_COUNT = 23
```

Rationale (documented inline in the test): the plan's literal SC-2 (`= 1`) is
not achievable without rewriting all tests, route handlers, the export
snapshot, the IGDB metadata provider, the move-to-collection use-case, and
several other production sites that legitimately read a game's `.kind`. The
helper itself contributes 1 match (`kind: input.kind`); the three call-sites
contribute 4 (one in `repo.create`, one in `applyMerge` INSERT, one in
`applyMerge` UPDATE branch — D-10 carve-out — one in `applyReplace`). The
remaining 18 matches live in tests, route handlers, application use-cases,
and other domain-adjacent code. The snapshot pins the post-refactor total
and behaves like Test 6: drift in either direction surfaces in CI and forces
a deliberate decision (re-evaluate dedup vs. update the pin).

### Test 6 (D-10 VO-unwrap snapshot)

Pattern: `/\.value \?\? null/g` across:
- `apps/api/src/infrastructure/games/drizzle-game-repository.ts`
- `apps/api/src/infrastructure/db/schema.ts`

```
EXPECTED_VO_UNWRAP_COUNT = 5
```

Breakdown:
- `drizzle-game-repository.ts`: 5 (update() ×4 — releaseYear, hoursPlayed,
  price, purchasedAt; saveMetadata() ×1 — releaseYear). All inside the D-10
  carve-out (UPDATE/saveMetadata shapes deliberately not deduplicated until a
  3rd UPDATE call-site triggers promotion to a separate helper).
- `schema.ts`: 0 (the helper uses an `unwrap()` function, not the raw
  `.value ?? null` shorthand).

A 3rd UPDATE call-site adding new `.value ?? null` occurrences will bump this
count → test goes red → forces the engineer to choose: separate
`toGameUpdateRow` / `toGameMetadataRow` (per Q5: NOT a shared helper with
`toGameInsertRow`).

## Files touched

- `apps/api/src/infrastructure/db/schema.ts` — appended `GameRowInput` +
  `toGameInsertRow` after `NewGameRow`.
- `apps/api/src/infrastructure/games/drizzle-game-repository.ts` — imported
  `toGameInsertRow`; `create()` now delegates row construction.
- `apps/api/src/infrastructure/import/drizzle-import-repository.ts` —
  imported `toGameInsertRow`; both `applyMerge` INSERT branch and
  `applyReplace` INSERT loop now delegate. UPDATE branch in `applyMerge`
  retains inline `.set({…})` per D-10.
- `apps/api/src/infrastructure/db/__tests__/to-game-insert-row.test.ts` —
  new file, 6 `it(...)` blocks.

## CONCERNS update

Out of scope for this plan — deferred to plan 05-07 (Wave 3 CONCERNS sweep)
per Q5: partial-resolution wording lands there, not here.
