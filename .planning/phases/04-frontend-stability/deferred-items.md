# Phase 04 — Deferred Items

Pre-existing issues discovered during execution. Out of scope per scope boundary.

## Pre-existing TSC baseline errors (discovered in Plan 04-03)

`apps/client` baseline TSC reports 8 errors unrelated to Plan 04-03 changes. Verified by
running `bunx tsc -b --noEmit` BEFORE adding any Plan 04-03 files (clean HEAD = 86219e4).
These are pre-existing and NOT caused by this plan's refactor.

| File | Error | Note |
|------|-------|------|
| `apps/client/src/components/add-game-modal.tsx:122` | `Property 'onPointerDownOutside' does not exist on type 'AlertDialogContentProps'` | shadcn alert-dialog wrapper does not forward the Radix prop; `add-game-modal.tsx` calls it via prop spread |
| `apps/client/src/components/add-game-modal.tsx:122,123` | Implicit any on `e` parameter | Type narrowing failure cascading from above |
| `apps/client/src/components/delete-confirm-dialog.tsx:25` | Same `onPointerDownOutside` error | Same root cause |
| `apps/client/src/components/delete-confirm-dialog.tsx:25,26` | Implicit any on `e` | Cascade |
| `apps/client/src/pages/games-mobile-list.tsx:24,51` | `Argument of type 'string' is not assignable to parameter of type 'number'` | Type mismatch in mobile list |

Root cause for the AlertDialog errors: `apps/client/src/components/ui/alert-dialog.tsx`
`AlertDialogContent` wrapper does not pass-through `onPointerDownOutside` /
`onInteractOutside` to the underlying Radix Content. The shadcn pattern is to forward
these — recommend a follow-up plan to update the wrapper.

**Recommendation:** Address in a follow-up Phase 04 cleanup plan (after Plan 04-04) or
Phase 05 maintenance pass. Not blocking Plan 04-03 — Vite build succeeds with these
errors emitted as warnings only when TypeScript type-check is bypassed; production
deploys today already ship despite these (per main branch state at 86219e4).
