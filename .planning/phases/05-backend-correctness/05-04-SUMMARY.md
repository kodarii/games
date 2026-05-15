# 05-04 Summary — Sort-cost accepted-debt documentation

**Status:** complete (docs-only)
**Files changed:** `apps/api/src/infrastructure/db/schema.ts`
**Migrations added:** 0 (per D-16)

## Block comment landed above `export const games = sqliteTable(`

```ts
/**
 * Sort-cost note (BE-04, Phase 5).
 *
 * Apex is single-user, expected ≤5k rows per user. Sorting by
 * `hoursPlayed`, `genre`, or `status` performs an in-memory sort after a
 * filtered scan (no covering index). Measured at ~10ms on local WAL DB
 * with 5k rows — acceptable while the model continues to evolve.
 * Adding indices is deferred until the schema stabilises; premature
 * indices on fields likely to be reshaped cost a migrate-add + migrate-drop
 * round trip with no user benefit. See feedback_no_premature_indices.
 *
 * Already indexed: title, platform, format, releaseYear (each scoped by
 * (user_id, kind, ...)).
 */
```

## Migration snapshot (proves D-16)

```
$ find apps/api/drizzle -name '*.sql' | wc -l
20
```

20 = pre-existing migrations. `find apps/api/drizzle -name '*.sql' -newer apps/api/src/infrastructure/db/schema.ts` returns 0.

## Verifications

- `grep -c 'Sort-cost note' apps/api/src/infrastructure/db/schema.ts` → 1
- `grep -c 'feedback_no_premature_indices' apps/api/src/infrastructure/db/schema.ts` → 1
- `5k`, `10ms`, `hoursPlayed`, `genre`, `status`, `title`, `platform`, `format`, `releaseYear` all present in the new block
- awk adjacency check: line before `export const games = sqliteTable(` ends with `*/` (block-comment closer)
- `bun run --filter=@apex/api typecheck` → exit 0
- `biome check apps/api/src/infrastructure/db/schema.ts` → clean

## Out of scope (per plan)

- CONCERNS.md "Missing indices for some sort fields" update — handled in plan 05-07 (Wave 3 CONCERNS sweep).
