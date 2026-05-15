
## Pre-existing TypeScript errors observed during Plan 04-01 execution

These errors exist on the main branch BEFORE Plan 04-01 changes; they are out of scope per executor scope boundary rules:

- `apps/client/src/components/add-game-modal.tsx:122-123` — `onPointerDownOutside` not on AlertDialogContentProps
- `apps/client/src/components/delete-confirm-dialog.tsx:25-26` — same `onPointerDownOutside` issue
- `apps/client/src/pages/games-mobile-list.tsx:24,51` — string-not-assignable-to-number
- `apps/client/src/pages/wishlist-columns.tsx:74` — implicit any
- `apps/client/src/pages/wishlist.tsx:57,68,106` — implicit any

Verified by `git stash && bunx tsc -b --noEmit` would yield the same errors. Not fixing within Plan 04-01 (scope boundary). Track for future cleanup phase.
