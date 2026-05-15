---
phase: 04-frontend-stability
fixed_at: 2026-05-15T00:00:00Z
review_path: .planning/phases/04-frontend-stability/04-REVIEW.md
iteration: 1
findings_in_scope: 6
fixed: 6
skipped: 0
status: all_fixed
---

# Phase 04 — Code Review Fix Report

**Fixed at:** 2026-05-15
**Source review:** `.planning/phases/04-frontend-stability/04-REVIEW.md`
**Iteration:** 1

**Summary:**
- Findings in scope: 6 (all Warning-tier; 0 Critical; 9 Info skipped per `fix_scope: critical_warning`)
- Fixed: 6
- Skipped: 0

All in-scope findings were addressed and committed atomically. Each fix was
verified with a re-read (Tier 1) and `bunx tsc --noEmit` over the full
`apps/client` workspace (Tier 2). The login/register source-pin tests pass
(`bun test src/pages/__tests__/login.test.tsx src/pages/__tests__/register.test.tsx`
→ 10/10 pass).

## Fixed Issues

### WR-01: `useCredentialsForm` overwrites local fieldErrors with server fieldErrors silently

**Files modified:** `apps/client/src/hooks/use-credentials-form.ts`
**Commit:** b6480e6
**Applied fix:** On validator-only short-circuit, also `setError(null)` so a
stale banner from a previous submission is cleared. Replaced the conditional
`if (result?.error) setError(result.error)` / `if (result?.fieldErrors) setFieldErrors(result.fieldErrors)`
pattern with unconditional `setError(result?.error ?? null)` /
`setFieldErrors(result?.fieldErrors ?? {})` so missing fields explicitly
reset state instead of merging into prior local validator errors.

### WR-02: `useCredentialsForm.handleSubmit` does not catch exceptions from `args.onSubmit`

**Files modified:** `apps/client/src/hooks/use-credentials-form.ts`
**Commit:** d12fb73
**Applied fix:** Wrapped `args.onSubmit` in `try { … } catch { … } finally { setIsPending(false); }`.
On throw, sets a generic banner (`'Something went wrong. Try again.'`) — the
ErrorBoundary cannot catch promise rejections in event handlers, so this is
the only way to avoid the stuck-button state.

### WR-03: `GameViewFields` notes textarea autosize effect deps incomplete

**Files modified:** `apps/client/src/components/game-view/game-view-fields.tsx`
**Commit:** 5ea7e73
**Applied fix:** Added `draft.notes` to the `useEffect` dependency array so
the autosize effect runs on any external (non-keystroke) change to the note
text while edit mode is open.

### WR-04: `useUploadCoverMutation` has no error handling / cache invalidation

**Files modified:** `apps/client/src/lib/queries.ts`
**Commit:** dd56ba3
**Applied fix:** Set `retry: 0` on the cover-upload mutation, overriding the
default `query-client.ts` `retry: 1`. UploadThing is not idempotent
server-side: a 5xx after the file is persisted would replay the FormData and
upload a duplicate on retry. The retry stance is now explicit and a comment
documents the rationale.

### WR-05: `useMoveToCollectionMutation` optimistic update uses loose typing

**Files modified:** `apps/client/src/lib/queries.ts`
**Commit:** 7411ec2
**Applied fix:** Introduced a named `PagedGames` type and replaced the
`(old: unknown) => { … }` mutator with a typed
`(old: PagedGames | undefined) => …` so future page-shape changes are caught
by the type checker rather than silently spreading garbage. Added an inline
comment documenting why we deliberately do NOT insert into
`['games', 'owned']` here (lazy refetch via `onSettled` is sufficient given
the immediate post-success `navigate('/games/:id')` in `game-view.tsx`).

### WR-06: `GameDetailsGrid` Save button has no feedback on empty platform

**Files modified:** `apps/client/src/components/game-view/game-view-header.tsx`, `apps/client/src/pages/game-view.tsx`
**Commit:** cb27763
**Applied fix:** Added an optional `canSave?: boolean` (default `true`) prop
to `GameViewHeader` and disabled the Save button when `!canSave || isSaving`.
Kept `canSave` distinct from `isSaving` so the button label remains `'Save'`
when blocked by validation but flips to `'Saving…'` only while a mutation is
in flight. `game-view.tsx` computes `canSave = !!draft.platform.trim()` and
passes it through. Users no longer click Save with no feedback when the
platform field is empty.

---

_Fixed: 2026-05-15_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
