# Deferred Items — Phase 04 Frontend Stability

Items discovered during execution that are **out of scope** for the current plan but
should be addressed later.

## Pre-existing TypeScript errors (baseline)

Observed during Plan 04-04 execution. **NOT caused** by Plan 04-04 changes — present on
the `main` baseline (verified via `git stash` round-trip while running `tsc -b --noEmit`
in `apps/client`).

- `src/components/add-game-modal.tsx:122` — `onPointerDownOutside` / `onInteractOutside`
  props do not exist on `AlertDialogContentProps`. Likely Radix UI typings drift; the
  events fire at runtime but TS rejects them.
- `src/components/delete-confirm-dialog.tsx:25` — same pattern.
- `src/pages/games-mobile-list.tsx:24,51` — `string` passed where `number` expected.
- `src/pages/wishlist-columns.tsx:74` — implicit `any` on `row`.
- `vite.config.ts` — missing node + vite ambient types when running `tsc` from
  workspace root without `@types/node` available; not a runtime issue.

These do not block Plan 04-04 verify gates because every grep invariant and runtime
behavior (refactor pass-through of a new parameter) is independent of the failing files.

**Resolution path:** treat as a follow-up cleanup in Phase 04 Plan 04-02 or a dedicated
"TS-strict pass" plan; aligns with the existing PROJECT.md anti-`any` posture.

## Pre-existing test failures (baseline)

`bun test` on the worktree base (`86219e4`) reports **62 failures across 535 tests**
(identical count with and without Plan 04-04 changes — verified via `git stash` round
trip). Top buckets:

- `apps/api/src/routes/__tests__/igdb-integration.int.test.ts` — multiple endpoint
  tests fail with `ReferenceError: Cannot access 'JsonLogger' before initialization` in
  `infrastructure/logging/logger.ts:124`. Looks like a class-hoisting bug introduced
  alongside the Phase 3 logger refactor.
- `apps/api/src/routes/__tests__/mutation-rate-limit.test.ts` — same JsonLogger init
  error.
- `apps/api/src/routes/__tests__/origin-guard.int.test.ts` — POST /api/games and friends
  fail (likely the same logger init shadowing the test app startup).
- `apps/client/src/components/__tests__/add-game-modal.regression.test.tsx` — single
  snapshot regression for the dynamic CTA footer.

None of these touch `apps/client/src/lib/api.ts`, `apps/client/src/lib/queries.ts`,
`apps/client/src/hooks/use-igdb-integration.ts`, `apps/client/src/hooks/use-import.ts`,
or `apps/client/src/components/settings/igdb-integration-card.tsx` — i.e. they are
outside Plan 04-04's scope.

**Resolution path:** Phase 04 / Phase 05 follow-up. The JsonLogger init order is the
highest-value fix (one root cause unblocks a large fraction of the failures).
