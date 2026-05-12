# Deferred Items — Phase 01

Out-of-scope discoveries logged during plan execution. NOT fixed in this phase.

## Pre-existing TypeScript errors (out of scope for Plan 01-01)

Discovered during Task 1 verification (`bunx tsc -b --noEmit` in `apps/client`):

- `apps/client/src/pages/games-mobile-list.tsx(24,41)`: TS2345 — `Argument of type 'string' is not assignable to parameter of type 'number'`
- `apps/client/src/pages/games-mobile-list.tsx(51,40)`: TS2345 — `Argument of type 'string' is not assignable to parameter of type 'number'`

**Why deferred:** Plan 01-01 does not touch `games-mobile-list.tsx`. Errors predate this plan (last commit `18246a7 add price and purchase date`). Scope-boundary rule: only auto-fix issues directly caused by the current task's changes.

**Suggested owner:** Phase 4 (Frontend Stability) — bundle into a sweep of leftover type errors.

## Pre-existing Biome format errors in `apps/client/src/components/icons.tsx`

Discovered during Task 1/Task 3 lint pass:

- `rows`, `grid`, `cal`, `coffee`, `folder`, `users`, `zap`, `file`, `support`, `bell` etc. icon entries: Biome's formatter wants single-line `<path />` / `<rect />` / `<circle />` JSX where they currently span multiple lines.
- Two `<>` fragments around single children are flagged as redundant (`rows` and `gift` style entries).

**Why deferred:** Plan 01-01 added 4 new icons (`user`, `plug`, `database`, `palette`) which are biome-clean. The format violations are in pre-existing icon definitions untouched by this plan. Auto-formatting them now would balloon the commit with cosmetic diffs unrelated to the plan's intent.

**Suggested owner:** A standalone `chore(client): run biome format on icons.tsx` commit, OR Phase 4 (Frontend Stability) bundle.

