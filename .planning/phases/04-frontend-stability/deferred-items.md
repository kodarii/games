# Deferred Items — Phase 04 Frontend Stability

Items discovered during execution of Plans 04-01..04-04 that are out of scope per the executor scope-boundary rule. Tracked here for follow-up phases.

## Pre-existing TypeScript baseline errors (apps/client)

All four plans independently verified — present on clean HEAD `86219e4` BEFORE adding any 04 plan files. None introduced by Phase 04 changes.

| File | Error | Note |
|------|-------|------|
| `apps/client/src/components/add-game-modal.tsx:122-123` | `Property 'onPointerDownOutside' does not exist on AlertDialogContentProps` + implicit-any on `e` | shadcn `ui/alert-dialog.tsx` wrapper does not forward Radix `onPointerDownOutside` / `onInteractOutside` props |
| `apps/client/src/components/delete-confirm-dialog.tsx:25-26` | Same `onPointerDownOutside` issue + implicit-any cascade | Same root cause |
| `apps/client/src/pages/games-mobile-list.tsx:24,51` | `Argument of type 'string' is not assignable to parameter of type 'number'` | Type mismatch in mobile list |
| `apps/client/src/pages/wishlist-columns.tsx:74` | Implicit `any` on `row` | Strictness gap |
| `apps/client/src/pages/wishlist.tsx:57,68,106` | Implicit `any` | Strictness gap |
| `vite.config.ts` | Missing node + vite ambient types when running `tsc` from workspace root without `@types/node` | Not a runtime issue |

**Root cause for AlertDialog errors:** the shadcn wrapper at `apps/client/src/components/ui/alert-dialog.tsx` does not pass through `onPointerDownOutside` / `onInteractOutside` to the underlying Radix Content. Recommend a follow-up plan to extend the wrapper.

**Recommendation:** dedicated "TS-strict pass" plan after Phase 04 completes, or roll into Phase 05 maintenance pass. Aligns with PROJECT.md anti-`any` posture.

## Pre-existing test failures (baseline)

`bun test` on the worktree base (`86219e4`) reports **62 failures across 535 tests** — identical count with and without any Phase 04 plan changes (verified via `git stash` round trip during Plan 04-04). Top buckets:

- `apps/api/src/routes/__tests__/igdb-integration.int.test.ts` — multiple endpoint tests fail with `ReferenceError: Cannot access 'JsonLogger' before initialization` in `infrastructure/logging/logger.ts:124`. Class-hoisting bug likely introduced alongside the Phase 3 logger refactor.
- `apps/api/src/routes/__tests__/mutation-rate-limit.test.ts` — same JsonLogger init error.
- `apps/api/src/routes/__tests__/origin-guard.int.test.ts` — POST /api/games and friends fail (same logger init shadowing test app startup).
- `apps/client/src/components/__tests__/add-game-modal.regression.test.tsx` — single snapshot regression for the dynamic CTA footer.

None of these touch files modified by Phase 04 plans 04-01..04-04.

**Resolution path:** Phase 04 cleanup or Phase 05 follow-up. JsonLogger init order is highest-value fix (one root cause unblocks a large fraction of failures).

## Plan 04-03 manual UAT (deferred)

Task 7 (`checkpoint:human-verify`) for Plan 04-03 was approved with browser UAT deferred to post-merge. Full 25-point script in `04-03-PLAN.md §how-to-verify`. Highlights to run before claiming SC3/SC4/SC5 complete in user-acceptance terms:

- **A. Owned game** — dropdown open/close, keyboard nav (Tab/Arrow/Escape/Enter), `role="menu"` inspection, edit→save, delete→AlertDialog→Cancel→focus return to trigger, `focus-visible:ring-1` outline.
- **B. Wishlist** — Move-to-collection button + dropdown both visible; Move navigates to `/games/:id`.
- **C. Visual parity** — covers/badges/format chip render identically.
- **E. Build** — `bunx vite build` (sandbox blocked it during executor run; run on main after merge).

## Plan 04-04 import out-of-scope

`apps/client/src/hooks/use-import.ts` import flow keeps per-call inline keys (not migrated to useRef cache) — documented in source per c1d2541. Reason: import is a single-shot per-file user action, not a retryable mutation, so per-call generation matches semantics. Track if/when import grows retry semantics.
