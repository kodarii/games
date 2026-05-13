# Deferred items — 260513-ds2

Out-of-scope failures that pre-existed on the base branch
(`bbdc0dae1301279a444e391561e7c0689d4b1627`) and are NOT introduced by this
plan. They are not fixed here per the executor scope boundary.

## Lint (Biome)
- Baseline: 47 errors, 7 warnings.
- Post-plan: 43 errors, 7 warnings (the four-error drop is incidental — the
  two deleted dialog files contained no lint errors; the formatter just re-
  organized counts).
- Files (all api side, untouched by this plan):
  - `apps/api/src/domain/games/__tests__/game.test.ts` — multiple
    `lint/suspicious/noExplicitAny`.
  - `apps/api/src/infrastructure/import/drizzle-import-repository.ts` —
    multiple `lint/style/useSingleVarDeclarator`.

## bun test
- Baseline: 390 pass / 37 fail / 2 errors.
- Post-plan: 391 pass / 36 fail / 2 errors (12 new client regression tests
  added by this plan, all passing; one of the pre-existing fails turned green
  incidentally — not a regression).
- Failing test areas (all api side, untouched by this plan):
  - `apps/api/src/routes/middleware/__tests__/idempotency-key.test.ts`
  - `apps/api/src/routes/__tests__/idempotency.int.test.ts`
  - `apps/api/src/routes/__tests__/metadata-candidates.int.test.ts`
  - `apps/api/src/routes/__tests__/metadata-status.int.test.ts`
  - `apps/api/src/application/games/__tests__/search-game-metadata.test.ts`
  - `apps/api/src/infrastructure/metadata/__tests__/caching-*.test.ts`
  - `apps/api/src/infrastructure/logging/__tests__/logger.test.ts`

Recommended cleanup: schedule a dedicated `lint-and-test-debt` plan for the
API side. They are out of scope for `260513-ds2` which is a pure client UI
refactor.
