# Deferred Items — Phase 04 frontend-stability

Items discovered during execution that are out-of-scope for the current plan and not auto-fixed.

## From Plan 04-02 execution

### Pre-existing TypeScript errors (not introduced by 04-02)

`apps/client` has unrelated TS strict-mode errors that pre-exist this plan. They do NOT touch any
file 04-02 modifies (`login.tsx`, `register.tsx`, `use-credentials-form.ts`):

- `src/components/add-game-modal.tsx:122` — `onPointerDownOutside` prop type mismatch on
  AlertDialogContent + implicit-any handlers.
- `src/components/delete-confirm-dialog.tsx:25` — same `onPointerDownOutside` issue.
- `src/pages/games-mobile-list.tsx:24,51` — `string` argument passed where `number` is expected.

These are tracked here so they are not lost; they should be addressed in a follow-up plan focused
on TS strictness clean-up. Out of 04-02 scope per executor SCOPE BOUNDARY rule.
