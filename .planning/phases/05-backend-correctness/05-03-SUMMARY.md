# 05-03 Summary — applyMerge: N+1 → batched SELECT

## BEFORE (per-row SELECT, 1+N reads inside the transaction)

```typescript
private async applyMerge(userId: string, plan: ImportPlan): Promise<ImportReport> {
  return db.transaction(async (tx) => {
    let pCreated = 0, pUpdated = 0;
    for (const np of plan.platforms) {
      const [existing] = await tx
        .select()
        .from(platformsTable)
        .where(and(eq(platformsTable.userId, userId), eq(platformsTable.externalId, np.externalId)))
        .limit(1);
      // INSERT or UPDATE per-row …
    }
    let gCreated = 0, gUpdated = 0;
    for (const ng of plan.games) {
      const [existing] = await tx
        .select()
        .from(gamesTable)
        .where(and(eq(gamesTable.userId, userId), eq(gamesTable.externalId, ng.externalId)))
        .limit(1);
      // inline UPDATE shape (kind/title/developer/genre/releaseYear/…) per D-10
    }
  });
}
```

## AFTER (two batched SELECTs + in-memory Map + DI-injected `this.db`)

```typescript
private async applyMerge(userId: string, plan: ImportPlan): Promise<ImportReport> {
  return this.db.transaction(async (tx) => {
    const platformExternalIds = plan.platforms.map((p) => p.externalId);
    const existingPlatforms =
      platformExternalIds.length === 0
        ? []
        : await tx.select().from(platformsTable).where(
            and(eq(platformsTable.userId, userId),
                inArray(platformsTable.externalId, platformExternalIds)));
    const platformByExternalId = new Map(existingPlatforms.map((r) => [r.externalId, r]));
    // … per-row INSERT/UPDATE off the Map (Map.get, not SELECT) …

    const gameExternalIds = plan.games.map((g) => g.externalId);
    const existingGames =
      gameExternalIds.length === 0
        ? []
        : await tx.select().from(gamesTable).where(
            and(eq(gamesTable.userId, userId),
                inArray(gamesTable.externalId, gameExternalIds)));
    const gameByExternalId = new Map(existingGames.map((r) => [r.externalId, r]));
    // UPDATE branch destructures the helper-built row and strips userId/externalId/kind.
  });
}
```

Total reads dropped from `1 + N_platforms + N_games` to a constant **2** (one for
platforms, one for games), with the empty-array guard skipping the `IN ()`
syntax error trap (Pitfall 1).

## Test outcomes (`bun test apps/api/src/infrastructure/import/__tests__/apply-merge.test.ts`)

| # | Name | Result |
|---|------|--------|
| 1 | `merges 100 games + 5 platforms with correct upsert counts (75 new, 25 update)` | pass (`games.created=75`, `games.updated=25`, `platforms.created=2`, `platforms.updated=0`) |
| 2 | `does not touch user B's rows when merging for user A (T-5-03 isolation pin)` | pass (B count unchanged at 5) |
| 3 | `empty plan does not error and reports zeros (empty-array IN () guard)` | pass (`{ mode: 'merge', platforms: {0,0}, games: {0,0} }`) |
| 4 | `updates existing row fields (upsert semantics on existing externalId)` | pass (`row.hoursPlayed === 42`, `row.title === 'Seed Game 0 — updated'`) |

**Test 1 count assertion:** `count(*) from games where user_id = TEST_USER_A` → `125`
(50 seeded + 75 newly inserted). Locked.

## Q4 grep guard

```
$ grep -nE '\.where\(eq\(.*externalId.*\)\)' \
    apps/api/src/infrastructure/import/drizzle-import-repository.ts | wc -l
       0
```

Zero hits — no per-row `externalId` lookup pattern remains in this file. Future
regressions (e.g. a `fetchPlatformById(externalId)` re-added in a loop) trip
this guard. File-scoped by design (Q4 trade-off).

## Out of scope (handled elsewhere)

- CONCERNS.md update for "Import-merge is N+1 reads" — Wave 3 sweep (plan 05-07).
- `applyReplace` structure: byte-identical to HEAD post-05-02 EXCEPT for the
  single `db.transaction` → `this.db.transaction` substitution required by the
  Q7 DI constructor (D-32 reinterpretation of D-29).
- `wiring.ts`: untouched — default constructor arg keeps `new DrizzleImportRepository()`
  call-site (line 78) valid.
