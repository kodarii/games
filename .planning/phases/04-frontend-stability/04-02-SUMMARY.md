---
phase: 04-frontend-stability
plan: 02
subsystem: client/auth-forms
tags: [react, hooks, forms, formdata, uncontrolled, better-auth, regression, bun-test, source-pin]
requires: []
provides:
  - hook:useCredentialsForm
  - test:fe-06-source-pin
affects:
  - apps/client/src/pages/login.tsx
  - apps/client/src/pages/register.tsx
tech_stack_added: []
patterns:
  - Auth-agnostic uncontrolled-form driver hook (FormData + e.currentTarget sync capture)
  - Source-pin regression test via readFileSync (no jsdom / RTL)
key_files_created:
  - apps/client/src/hooks/use-credentials-form.ts
  - apps/client/src/pages/__tests__/login.test.tsx
  - apps/client/src/pages/__tests__/register.test.tsx
  - .planning/phases/04-frontend-stability/deferred-items.md
key_files_modified:
  - apps/client/src/pages/login.tsx
  - apps/client/src/pages/register.tsx
decisions:
  - Hook is AUTH-AGNOSTIC (signIn / signUp / session refetch / navigate stay in caller). Pulling refetch into the hook would defeat the FE-06 source-pin test that observes page semantics.
  - Per-field `validate` callbacks chosen over a single global validator — keeps fieldErrors keyed correctly.
metrics:
  duration_minutes: ~12
  tasks_completed: 3
  tasks_total: 3
  checkpoints_remaining: 1
  files_touched: 5
  completed_date: 2026-05-15
requirements_completed: [FE-02, FE-06]
sc_completed: [2, 6]
---

# Phase 04 Plan 02: useCredentialsForm + FE-06 regression tests Summary

One-liner: extracted login + register form driver to `useCredentialsForm` (auth-agnostic, uncontrolled inputs + FormData) and pinned both MEMORY bugs (`feedback_better_auth_session_refetch`, `feedback_react_autofill_uncontrolled`) with source-pin `bun:test` regression tests that fail if anyone reverts either fix.

## Tasks Executed

| # | Task | Commit | Phase |
|---|------|--------|-------|
| 1 | Source-pin regression tests for login + register (FE-06) | `d11a1d6` | RED — 2 failing assertions confirmed |
| 2 | `useCredentialsForm` hook (auth-agnostic FormData driver) | `4d009af` | impl |
| 3 | Refactor `login.tsx` + `register.tsx` to use the hook | `47d0321` | GREEN — 10/10 tests pass |

## LOC

| File | Before | After |
|------|--------|-------|
| `apps/client/src/pages/login.tsx` | 89 | 88 |
| `apps/client/src/pages/register.tsx` | 144 | 130 |
| `apps/client/src/hooks/use-credentials-form.ts` | — | 97 (new) |
| `apps/client/src/pages/__tests__/login.test.tsx` | — | 45 (new) |
| `apps/client/src/pages/__tests__/register.test.tsx` | — | 42 (new) |

Net page delta: −15 LOC across `login.tsx` + `register.tsx` (97 LOC of duplicated state/submit machinery → 97 LOC of shared hook). Hook is now the single source of truth for FormData capture, validators, pending/error state.

## Test Counts

`bun test apps/client/src/pages/__tests__/login.test.tsx apps/client/src/pages/__tests__/register.test.tsx`:

- 5 `test()` cases in `login.test.tsx` (imports hook, imports signIn, refetchSession-before-navigate ordering, uncontrolled inputs present, no controlled `value={` on email/password).
- 5 `test()` cases in `register.test.tsx` (analogous; adds `name` and `confirmPassword` field checks).
- **Total: 10 / 10 pass, 0 fail, 26 expect() calls** (final run after Task 3).

## Behaviors Preserved

- Error code mapping in caller `onSubmit`:
  - `INVALID_EMAIL_OR_PASSWORD` → `'Invalid email or password.'` (login).
  - Unknown errors → `'Something went wrong. Try again.'` (login + register).
  - `USER_ALREADY_EXISTS` → `fieldErrors.email = 'This email is already registered.'` (register).
- Client-side validators (now in per-field `validate` callbacks):
  - `name` required (non-empty, post-trim).
  - `password` ≥ 8 chars.
  - `password === confirmPassword`.
- `from` fallback from `location.state` for post-login redirect → `/games`.
- `autoComplete` attributes intact (`email`, `current-password`, `new-password`, `name`).
- `e.currentTarget` synced before any `await` (sync FormData capture inside the hook — moved out of page).
- `await refetchSession()` is awaited **before** `navigate(...)` in both pages — pinned by FE-06 source-pin test (`refetchIdx < navigateIdx`).
- Uncontrolled inputs: no `value={` or `onChange=` on credential `<Input>`s — browser autofill works.

## Sanity Checks (Post-Refactor)

- `grep -c 'new FormData' apps/client/src/pages/login.tsx apps/client/src/pages/register.tsx` → `0 0` (FE-02 dedup confirmed; FormData lives only in hook).
- `grep -E '<Input[^>]*name="(email|password|name|confirmPassword)"[^>]*value=\\{' apps/client/src/pages/{login,register}.tsx` → no match (no controlled inputs introduced).
- Hook is auth-agnostic: `grep -E 'signIn|signUp|refetchSession|navigate\\(' apps/client/src/hooks/use-credentials-form.ts` → no match (TSDoc comment was rephrased to avoid bare tokens — see Deviations).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 — Blocking] Reworded TSDoc to satisfy hook-purity grep**

- **Found during:** Task 2 verify step.
- **Issue:** The plan's `<action>` body for `use-credentials-form.ts` contained the literal token `refetchSession` inside the TSDoc rationale comment. The Task 2 `<verify>` script asserts `! grep -q "refetchSession" apps/client/src/hooks/use-credentials-form.ts`, which would have failed on the docstring even though the hook does not *call* `refetchSession`.
- **Fix:** Rephrased the TSDoc to refer to "the better-auth session refetch" / "session refetch" instead of the bare identifier `refetchSession`. Semantics of the comment are unchanged; the hook still is auth-agnostic. No code logic changed.
- **Files modified:** `apps/client/src/hooks/use-credentials-form.ts`.
- **Commit:** `4d009af` (the corrected version was committed; the literal-docstring version was never committed).

**2. [Out-of-scope — logged not fixed] Pre-existing TypeScript strictness errors**

- **Found during:** Task 2 + Task 3 tsc verify.
- **Issue:** `bunx tsc -b --noEmit` reports errors in unrelated files (`add-game-modal.tsx`, `delete-confirm-dialog.tsx`, `games-mobile-list.tsx`). None of these files are touched by 04-02.
- **Decision:** Out of SCOPE BOUNDARY (executor rule). Logged in `.planning/phases/04-frontend-stability/deferred-items.md` for a follow-up plan.
- **Verified my files compile clean:** `grep -E 'login\\.tsx|register\\.tsx|use-credentials-form' tsc-output` → empty.

### Authentication Gates

None — this plan made no network / auth API calls; tests are pure source-pin.

## Manual Smoke (Task 4 checkpoint) — Deferred to Orchestrator / User

Task 4 in the plan is `checkpoint:human-verify` requiring a live browser smoke test (DevTools Network panel: sign-in → get-session → redirect; password-manager autofill behaviour). This agent runs in a parallel worktree without a running dev server or browser, so the manual UAT cannot be performed here.

**Automated coverage delivered by this wave is the source-pin tests** (10/10 green); the manual UAT remains as a recommended human verification step before deploy. The plan explicitly notes (lines 750–752) that the test run is the automated confirmation, and the manual scenarios are the behavioural source of truth.

## Self-Check

Created files:
- FOUND: `apps/client/src/hooks/use-credentials-form.ts`
- FOUND: `apps/client/src/pages/__tests__/login.test.tsx`
- FOUND: `apps/client/src/pages/__tests__/register.test.tsx`
- FOUND: `.planning/phases/04-frontend-stability/deferred-items.md`

Modified files:
- FOUND: `apps/client/src/pages/login.tsx`
- FOUND: `apps/client/src/pages/register.tsx`

Commits:
- FOUND: `d11a1d6` test(04-02): add FE-06 source-pin regression tests (RED)
- FOUND: `4d009af` feat(04-02): add useCredentialsForm hook
- FOUND: `47d0321` refactor(04-02): wire login.tsx + register.tsx through useCredentialsForm (GREEN)

## TDD Gate Compliance

- RED gate: `test(04-02): ...` commit `d11a1d6` — observed 2 failing assertions before any implementation.
- GREEN gate: `feat(04-02): ...` commit `4d009af` (hook) + `refactor(04-02): ...` commit `47d0321` (page wiring). After Task 3, the same tests run 10/10 pass.
- REFACTOR gate: not required (no additional refactor was needed; the hook implementation is minimal).

## Self-Check: PASSED
