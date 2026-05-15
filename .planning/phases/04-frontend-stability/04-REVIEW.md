---
phase: 04-frontend-stability
reviewed: 2026-05-15T00:00:00Z
depth: standard
status: issues_found
files_reviewed: 19
files_reviewed_list:
  - apps/client/src/components/error-boundary.tsx
  - apps/client/src/components/game-view/game-view-actions.tsx
  - apps/client/src/components/game-view/game-view-fields-grid.tsx
  - apps/client/src/components/game-view/game-view-fields.tsx
  - apps/client/src/components/game-view/game-view-header.tsx
  - apps/client/src/components/icons.tsx
  - apps/client/src/components/settings/igdb-integration-card.tsx
  - apps/client/src/components/ui/dropdown-menu.tsx
  - apps/client/src/hooks/use-credentials-form.ts
  - apps/client/src/hooks/use-igdb-integration.ts
  - apps/client/src/hooks/use-import.ts
  - apps/client/src/lib/api.ts
  - apps/client/src/lib/queries.ts
  - apps/client/src/main.tsx
  - apps/client/src/pages/__tests__/login.test.tsx
  - apps/client/src/pages/__tests__/register.test.tsx
  - apps/client/src/pages/game-view.tsx
  - apps/client/src/pages/login.tsx
  - apps/client/src/pages/register.tsx
findings:
  critical: 0
  warning: 6
  info: 9
  total: 15
---

# Phase 04 — Frontend Stability: Code Review Report

**Reviewed:** 2026-05-15
**Depth:** standard
**Files Reviewed:** 19
**Status:** issues_found

## Summary

Phase 04 implementations are largely well-structured and align with the plans (FE-01 through FE-06, plus T-04-21 idempotency-key caching). No Critical defects were found: there is no XSS, no eval/innerHTML usage, no hardcoded secrets, and the per-user scoping on the API side is preserved (this review is client-only). The fallback UI correctly avoids rendering `error.message` and `componentStack` per the threat model.

The Warning-tier findings cluster around a few real risks worth fixing before merge:
1. **The `useCredentialsForm` hook silently drops the cross-field `confirmPassword` error** because validators run sequentially over the fields array and the password validator returns `null` while confirmPassword's validator depends on `password` — but in practice this is fine; *however* the hook never re-validates after `await args.onSubmit`, so any client errors returned via `fieldErrors` from the server (e.g. `USER_ALREADY_EXISTS`) and the local validators are mutually overwriting (see WR-01).
2. **`handleSubmit` in `use-credentials-form.ts` does not catch exceptions from `args.onSubmit`** — a thrown error mid-submit leaves `isPending=true` permanently (button stuck on "Signing in…", see WR-02).
3. **`AppErrorFallback` is typed `ReactNode` but React 18 components should return `JSX.Element | null`** — minor, but combined with the unused `private reset` method (see IN-01) it suggests the optional reset pattern was abandoned without cleanup.
4. **`game-view.tsx` still uses `window.alert(...)` on delete failure** — flagged as pre-existing in the deferred-items list, not counted here.
5. **`useUploadCoverMutation` has no `onError` handling and silently swallows failures in the UI layer** (see WR-04).

The Info-tier items are dead code (commented-out `settings`/`gamepad` SVGs in `icons.tsx`), an unused `Props.fallback` function-variant in `ErrorBoundary`, and minor inconsistencies (mixed import quote styles in `dropdown-menu.tsx`, missing `aria-hidden` on the green checkmark SVG markup, etc.).

---

## Warnings

### WR-01: `useCredentialsForm` overwrites local fieldErrors with server fieldErrors silently

**File:** `apps/client/src/hooks/use-credentials-form.ts:80-91`
**Issue:** After client-side validators populate `errs` and the hook short-circuits (line 80-83), it returns *without* clearing previously-displayed `error` / `fieldErrors` state from an earlier submission. Worse, on a subsequent successful submission path the hook calls `resetErrors()` then *unconditionally* writes `setError(result.error)` and `setFieldErrors(result.fieldErrors)` if the server returns either. Because `setFieldErrors` is called with the server payload, any **client-side** validator errors that the user would have seen had they fixed one issue are nuked. But more importantly: when both `result.error` and `result.fieldErrors` arrive (server returns both), only `error` banner + the partial fieldErrors render — there is no merge with the existing local map. For register, if the server returns `USER_ALREADY_EXISTS` for `email` and the user's `confirmPassword` validator triggered earlier in the same session, only the email error is displayed.

Additionally, the early-return at line 83 does **not** clear `error` (the banner), so an old "Invalid email or password." banner stays visible while the user fixes only the password length and resubmits — banner is stale until network call completes.

**Fix:** Clear stale banner on validator-only early-return, and replace the unconditional setters with explicit merging:

```ts
if (Object.keys(errs).length > 0) {
  setError(null); // clear stale banner
  setFieldErrors(errs as Partial<Record<keyof T, string>>);
  return;
}

resetErrors();
setIsPending(true);
const result = await args.onSubmit(values as T);
setIsPending(false);

setError(result?.error ?? null);
setFieldErrors(result?.fieldErrors ?? {});
```

### WR-02: `useCredentialsForm.handleSubmit` does not catch exceptions from `args.onSubmit` — button gets stuck

**File:** `apps/client/src/hooks/use-credentials-form.ts:86-91`
**Issue:** `args.onSubmit(values as T)` is awaited but not wrapped in try/finally. If the callback throws (e.g. `better-auth` network failure that surfaces as an unhandled rejection — or any synchronous mapper inside the page-level `onSubmit` throws), `setIsPending(false)` is never called. The submit button stays disabled with copy "Signing in…" / "Creating account…" and the user is stuck. The error is also not caught by the global `ErrorBoundary` because it's a promise rejection in an event handler.

**Fix:**

```ts
resetErrors();
setIsPending(true);
try {
  const result = await args.onSubmit(values as T);
  setError(result?.error ?? null);
  setFieldErrors(result?.fieldErrors ?? {});
} catch (err) {
  setError('Something went wrong. Try again.');
  // Optional: console.error('[useCredentialsForm] onSubmit threw', err);
} finally {
  setIsPending(false);
}
```

### WR-03: `GameViewFields` notes textarea autosize effect depends only on `editMode`, not on `draft.notes`

**File:** `apps/client/src/components/game-view/game-view-fields.tsx:54-59`
**Issue:** The `useEffect` recomputes the textarea height only when `editMode` toggles. If `draft.notes` is mutated externally (e.g. by an undo, a reset() in the parent that swaps the draft to the saved value), the textarea will not resize until the user types or toggles edit mode. The keystroke-driven autosize inside `onChange` (line 189-191) hides this for the common case, but the boundary case (opening edit on a long pre-existing note) works only because the effect already runs once on `editMode=true`. However if `liveCoverImage` or another prop change triggers a re-render *while* `editMode` is true, the effect does NOT re-run, leaving height stale only after a programmatic `set('notes', ...)`. Today no caller does that, so this is latent — but the dep-array omission is incorrect.

**Fix:** Add `draft.notes` to the dep array (or use a ResizeObserver). Minimal fix:

```ts
useEffect(() => {
  if (editMode && notesRef.current) {
    notesRef.current.style.height = 'auto';
    notesRef.current.style.height = `${notesRef.current.scrollHeight}px`;
  }
}, [editMode, draft.notes]);
```

### WR-04: `useUploadCoverMutation` has no error handling / cache invalidation

**File:** `apps/client/src/lib/queries.ts:234-242`
**Issue:** The mutation rotates the idempotency key on success but does nothing on error. The caller (presumably `<UploadCoverButton>`) is responsible for surfacing the error, but more critically: if upload fails after the server stored partial state (very unlikely with UploadThing, but possible if Cover delete races), there's no cache invalidation. More importantly, there is no `onError` to clean up local state, no `retry: 0` override, and the default TanStack Query `retry: 1` from `query-client.ts:8` will replay with the same idempotency key — which is correct *only* if the original upload truly failed at the network layer. If the server actually returned 5xx after persisting the file, the retry replays the FormData and the same key but UploadThing will upload again (it's not idempotent server-side without explicit caching).

**Fix:** Either set `retry: 0` for `useUploadCoverMutation`, or document that retry is intentional and ensure the server-side `/api/upload/cover` handler is wired through `idempotencyKeyMiddleware` (it must be, per Phase 3 baseline, but verify). At minimum add a comment explaining the retry stance:

```ts
return useMutation({
  mutationFn: (file: File) => uploadCover(file, idempotencyKeyRef.current),
  retry: 0, // file uploads should not auto-retry; user retries explicitly
  onSuccess: () => {
    idempotencyKeyRef.current = newIdempotencyKey();
  },
});
```

### WR-05: `useMoveToCollectionMutation` optimistic update uses object identity on `id` that may not match

**File:** `apps/client/src/lib/queries.ts:249-265`
**Issue:** The `onMutate` filter `items.filter((g) => g.id !== externalId)` removes the wishlist entry. But `g.id` is the Game aggregate id (string), and `externalId` is also a string (function arg type). This is correct, but the optimistic UPDATE only removes from `['games', 'wishlist']` queries — it does NOT insert into `['games', 'owned']`. Until the `onSettled` invalidate fires, the owned list still shows stale data and the wishlist shows the row gone. If `onSettled` runs before the user navigates, fine; but in `game-view.tsx:87-91` the success handler calls `navigate('/games/${id}')` immediately. This race is benign in current UX but is a real consistency hole — TanStack Query will refetch `owned` lazily.

Secondary concern: the `setQueriesData` cast `(old: unknown) => {...}` swallows shape issues. If a future page change adds a new field to the page shape, this mutator silently mismatches and the spread leaves garbage.

**Fix:** Use a typed callback and consider invalidating `owned` in `onMutate` too (or accept the lazy refetch). Document the choice if accepted.

### WR-06: `GameDetailsGrid` Select for Platform uses falsy default that breaks "" platform value

**File:** `apps/client/src/components/game-view/game-view-fields-grid.tsx:141-148`
**Issue:** `<Select value={draft.platform} ...>` with `<option value="">Select platform</option>` is correct for an empty initial state. However, in `game-view.tsx:65` `saveEdit` checks `if (!draft.platform) return;` and silently aborts — no error message is shown to the user. The save button does not become disabled in `GameViewHeader`, so the user clicks "Save", nothing happens, no feedback. The header's `disabled={isSaving}` is only mutation pending, not validation. Real bug: a user can wipe the platform value and click Save infinitely with no feedback.

**Fix:** Either disable the Save button when `!draft.platform`, or show an inline error in the platform field. Recommended:

```ts
// game-view.tsx GameViewBody:
const canSave = !!draft.platform && !!draft.title;
// in header:
isSaving={updateMutation.isPending || !canSave}
// or pass canSave separately and show validation message inline
```

---

## Info

### IN-01: `ErrorBoundary.reset` method is dead code

**File:** `apps/client/src/components/error-boundary.tsx:37-39`
**Issue:** The `private reset = () => this.setState({ hasError: false })` exists and is exposed via the `fallback` function-variant on line 44 (`typeof fallback === 'function' ? fallback(this.reset) : fallback`). But the only call site (`main.tsx:73`) passes a plain `ReactNode` fallback — not a function. The `reset` method is unreachable. Also `AppErrorFallback` itself only uses `window.location.assign` (full navigation), not a soft reset. The dual-API surface (ReactNode OR function) and the `reset` method are unused.

**Fix:** If the function-variant is for future flexibility, leave a comment. Otherwise simplify:

```ts
interface Props {
  fallback: ReactNode;
  children: ReactNode;
}
// remove private reset = ...
// render(): return this.state.hasError ? this.props.fallback : this.props.children;
```

### IN-02: `AppErrorFallback` return type is `ReactNode` instead of `JSX.Element`

**File:** `apps/client/src/components/error-boundary.tsx:50`
**Issue:** `export function AppErrorFallback(): ReactNode` — components conventionally return `JSX.Element` (or `ReactElement`). `ReactNode` includes `null | undefined | string | number | boolean`, which can cause subtle issues when consumed as a JSX child via `{<AppErrorFallback />}` (this isn't even how it's used — it's `<AppErrorFallback />`, which works, but the type is loose).
**Fix:** Change return to `JSX.Element` (or remove the annotation entirely and let TS infer).

### IN-03: Commented-out code in `icons.tsx`

**File:** `apps/client/src/components/icons.tsx:279-290, 397-414`
**Issue:** Two large blocks of commented-out alternative `settings` and `gamepad` SVG definitions. Per CLAUDE.md style (Biome auto-organize), this is dead code that should be deleted, not left as commentary. If the alternatives are meant to be swappable variants, they belong in a docs comment or a sibling file.
**Fix:** Delete both commented-out blocks.

### IN-04: `IgdbIntegrationCard` inline SVG should use `Icon` registry

**File:** `apps/client/src/components/settings/igdb-integration-card.tsx:165-174`
**Issue:** A raw `<svg viewBox="0 0 8 8">` for the connected-checkmark badge is inlined here, while Phase 04 SC5 explicitly moved inline SVGs in `game-view.tsx` to `Icons.tsx`. The same pattern should apply for consistency — add `Icon.check` to the registry. Not a bug (the SVG works and has `aria-hidden`), but inconsistent.
**Fix:** Add `Icon.check` to `icons.tsx` and use it here.

### IN-05: `Icon.settings` and `Icon.gamepad` use raw `width={size}` with default 24 instead of 16

**File:** `apps/client/src/components/icons.tsx:260-278, 375-396`
**Issue:** The `svg()` factory defaults `size = 16`, but the bespoke `settings` and `gamepad` icons default to `size = 24`. This is a silent inconsistency: callers expecting `<Icon.foo />` to render at 16px will get 24px for these two. Hardcoded `viewBox="0 0 24 24"` reinforces the mismatch.
**Fix:** Either standardize to `size = 16` for all icons, or document the exception.

### IN-06: `GameViewHeader` accepts `rightSlot` but only renders when `!editMode` — silent feature

**File:** `apps/client/src/components/game-view/game-view-header.tsx:52-73`
**Issue:** The `rightSlot?: React.ReactNode` prop is silently ignored when `editMode` is true (line 53-73: editMode branch shows Cancel/Save and discards the slot). This is documented in the TSDoc ("when NOT in edit mode") but the prop being optional + silently dropped is fragile. A future caller that passes a non-edit-mode slot expecting it to stay rendered will be confused.
**Fix:** Either rename to `actionsWhenNotEditing` or document the omission with a runtime comment.

### IN-07: `dropdown-menu.tsx` uses double quotes — inconsistent with Biome config

**File:** `apps/client/src/components/ui/dropdown-menu.tsx:1-90`
**Issue:** Entire file uses double quotes for strings (`"react"`, `"@radix-ui/react-dropdown-menu"`, className strings). Biome config in `biome.json` mandates single quotes (`'foo'`) for JS/TS. This file is ignored by Biome per CLAUDE.md note (`**/components/ui/**` is in the ignore list), so this is not a lint failure, but it diverges from project style. Acceptable for shadcn-generated files per the ignore rule.
**Fix:** None required — flagged for awareness; the ignore is intentional.

### IN-08: `use-credentials-form.ts` does not memoize `args.fields` consumers — but useCallback dep array includes `args` object

**File:** `apps/client/src/hooks/use-credentials-form.ts:93`
**Issue:** `useCallback(..., [args, resetErrors])` — `args` is an object literal at call sites (login.tsx:12-31, register.tsx:11-43). Every render of the page creates a fresh `args` object → `handleSubmit` is recreated every render. This is acknowledged in the TSDoc (RESEARCH §Pitfall 6) and accepted for submit-cadence handlers. Calling out for visibility: form children passed `onSubmit={handleSubmit}` will see a new ref each render, but since `<form>` is a host element it doesn't bail out via memo. No bug, just confirming the accepted trade-off.
**Fix:** None — documented intent.

### IN-09: `LoginPage` does not clear stale error banner when user starts typing

**File:** `apps/client/src/pages/login.tsx:38-42`
**Issue:** After a failed login, the red error banner ("Invalid email or password.") stays visible until the next submit. The user can type a new email/password and the banner remains, which is mildly confusing UX. This is a UX-tier observation rather than a code defect; `useCredentialsForm` exposes `resetErrors` which could be wired to an `onChange` on the form, but is not.
**Fix:** Optional — wire `onChange={resetErrors}` on the `<form>` or accept the current UX.

---

## Notes — Items Explicitly NOT Flagged

Per the deferred-items.md and instructions:
- `apps/client/src/pages/game-view.tsx:82` `alert('Failed to delete: ...')` — pre-existing, tracked as FE-V2-01.
- `apps/client/src/components/ui/dropdown-menu.tsx` double quotes — file matches `**/components/ui/**` Biome ignore.
- AlertDialog `onPointerDownOutside` / `onInteractOutside` Radix forwarding gap — not present in the reviewed files, but acknowledged as a pre-existing baseline.
- JsonLogger init order in API logger — out of scope (API file, not in this review).
- `bun test` baseline of 62 failures in API tests — out of scope.

Per CLAUDE.md MEMORY rule about regex/sed/perl hacks: I checked for >2× repeated patterns in the reviewed files. The mutation hook idempotency-key pattern (useRef + onSuccess reset) is repeated 4 times in `queries.ts` plus 2 times in `use-igdb-integration.ts` — total 6 hooks. This is arguably above the >2× threshold, but the per-hook customization (different `onSuccess` cache invalidation logic, different mutationFn signatures) makes a generic helper marginal. **Flagged as borderline IN-tier, not raised separately**: if a 7th mutation joins, consider a `useIdempotentMutation(options)` wrapper.

Per CLAUDE.md per-user scoping rule: this is client-side code, so the rule applies indirectly via `useGameQuery(id)` / `fetchGame(id)` — these go through `apiFetch` which carries the session cookie, and the API enforces per-user filtering server-side. **No client-side IDOR concern in scope.**

---

_Reviewed: 2026-05-15_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
