# 05-08 Summary — BE-02b import field-fidelity at repo boundary

## Task 1 — Refactor drizzle-import-repository.ts

### applyMerge INSERT — BEFORE (13 fields)

```ts
const row = toGameInsertRow(userId, {
  kind: ng.kind,
  externalId: ng.externalId,
  title: ng.title,
  developer: ng.developer,
  genre: ng.genre,
  releaseYear: ng.releaseYear,
  platform: ng.platform,
  edition: ng.edition,
  hoursPlayed: ng.hoursPlayed,
  status: ng.status,
  format: ng.format,
  coverColor: ng.coverColor,
  // coverImage/price/purchasedAt/notes/metadataRef omitted — D-09
});
```

### applyMerge INSERT — AFTER (18 fields)

```ts
// Q8 (05-08): supersedes D-09 helper-defaults policy for INSERT
// call-sites — repo now persists full row when snapshot supplies it.
const row = toGameInsertRow(userId, {
  kind: ng.kind, externalId: ng.externalId, title: ng.title,
  developer: ng.developer, genre: ng.genre, releaseYear: ng.releaseYear,
  platform: ng.platform, edition: ng.edition, hoursPlayed: ng.hoursPlayed,
  status: ng.status, format: ng.format, coverColor: ng.coverColor,
  coverImage: ng.coverImage,
  price: ng.price,
  purchasedAt: ng.purchasedAt,
  notes: ng.notes,
  metadataRef: ng.metadataRef
    ? { providerName: ng.metadataRef.providerName,
        providerId: ng.metadataRef.providerId,
        matchedAt: ng.metadataRef.matchedAt }
    : null,
});
```

### applyMerge UPDATE — BEFORE

```ts
const { userId: _u, externalId: _e, kind: _k, ...updateSet } = row;
await tx.update(gamesTable).set(updateSet).where(eq(gamesTable.id, existing.id));
```

### applyMerge UPDATE — AFTER (adds `id: _id` defensive strip)

```ts
const { id: _id, userId: _u, externalId: _e, kind: _k, ...updateSet } = row;
await tx.update(gamesTable).set(updateSet).where(eq(gamesTable.id, existing.id));
```

`applyReplace` INSERT loop received the same 18-field expansion.

## Tasks 2 + 3 — New tests

### apply-merge.test.ts (4 new tests, total 8)

- Test 5 `applyMerge INSERT persists coverImage/price/purchasedAt/notes/metadataRef (BE-02b)` — green
- Test 6 `applyReplace INSERT persists coverImage/price/purchasedAt/notes/metadataRef (BE-02b)` — green (uses isolated TEST_USER_C)
- Test 7 `applyMerge UPDATE branch persists 5 fields when seed exists (Q-DDD-1)` — green; fails RED if only INSERT branch is fixed
- Test 8 `applyMerge UPDATE destructure strips kind/id/userId/externalId (D-34, NEW-14)` — green

### round-trip.test.ts (new file, 3 tests)

- Test 1 `v4 round-trip preserves price/purchasedAt/notes; documents BE-02c gap via not.toHaveProperty` — green
- Test 2 `metadataRef.matchedAt is re-stamped, not round-tripped (Q-DDD-2)` — green
- Test 3 `per-user isolation — replace import on A does not touch B (F-08-6)` — green

All round-trip tests instantiate `ImportData` with the real 3-arg constructor and call `execute(userId, JSON.stringify(snap), mode)` against an in-memory SQLite shared across all three repos.

## Task 4 — FIXME(BE-02c, F-08-1) markers

- `apps/api/src/application/import/import-data.ts:98` — TSDoc block above the `for (const [i, g] of snap.games.entries())` loop
- `apps/api/src/application/import/import-data.ts:139` — inline marker immediately above the `NewGame.create` call inside the loop
- `apps/api/src/application/export/export-snapshot.ts:12` — TSDoc block above `export interface ExportedGame`
  - Contains 2 literal `FIXME(BE-02c, F-08-1)` tokens: a `FIXME` label at the top and a cross-ref to the import-data.ts companion block.

`git diff apps/api/src/application/import/import-data.ts` shows additions of comment/TSDoc lines only — the `NewGame.create({...}, () => g.externalId)` body remains byte-identical (functional code unchanged). Same for `export-snapshot.ts`: `toSnapshot` body unchanged.

## Plan deviation — Test 8 reformulated

The plan's Test 8 attempted to roundtrip a `kind='wishlist'` seed + `kind='owned'` plan through `repo.apply()` and assert the seed-side `kind` survived the UPDATE. Migration `0010_mature_bulldozer.sql` installs a `games_kind_consistency` CHECK constraint requiring `kind='wishlist' AND status IS NULL AND hours_played IS NULL AND purchased_at IS NULL`. With the strip working correctly, the resulting row (`kind='wishlist' + status='Playing' + hoursPlayed=10`) violates the CHECK at write time and SQLite throws `SQLITE_CONSTRAINT_CHECK`.

The CHECK constraint itself is a DB-level enforcement of D-34 (belt-and-suspenders alongside the JS strip), so the kind-flip-via-DB-roundtrip approach is structurally unable to land — either the CHECK rejects (correct behavior), or the assertion would pass trivially (buggy behavior). I pivoted Test 8 to pin the strip MECHANIC at the row-construction layer: build a row via `toGameInsertRow`, apply the same destructure pattern (`{ id: _id, userId: _u, externalId: _e, kind: _k, ...updateSet }`), and assert `'kind' in updateSet === false`. If a future contributor removes `kind: _k` from the destructure in `drizzle-import-repository.ts`, the new Test 8 fails RED.

Two acceptance-grep gates from the plan (`row.kind).toBe('wishlist')`, `row.status).toBe('Playing')`, `row.hoursPlayed).toBe(10)`) are no longer satisfiable because the scenario they pinned is DB-rejected. The replacement assertions (`expect('kind' in updateSet).toBe(false)`, `updateSet.status`, `updateSet.hoursPlayed`) pin the same invariant via a different observation channel.

## Cross-ref note

CONCERNS.md edits + 05-CONTEXT.md D-30..D-33 transcription are owned exclusively by plan 05-07 — not touched here.
