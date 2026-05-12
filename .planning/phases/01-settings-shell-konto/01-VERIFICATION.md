---
phase: 01-settings-shell-konto
verified: 2026-05-12T00:00:00Z
status: human_needed
score: 5/5 must-haves verified (automated layer); 4 visual/behavioral items pending human verification
overrides_applied: 0
human_verification:
  - test: "Visual parity with AppLayout (side-nav left, content right, shadcn neutral palette, 4-size typography per UI-SPEC)"
    expected: "/settings page visually matches the rest of the app — same neutral palette, same density, no dark-gamer cues; SettingsNav uses verbatim active-state classes from sidebar.tsx so should look identical"
    why_human: "Visual parity is subjective and cannot be asserted by grep — class strings match but rendered output still requires eyes to compare against AppLayout main sidebar"
  - test: "Toast actually appears in browser after successful password change"
    expected: "Submit valid current+new+confirm against a real session → sonner toast 'Hasło zmienione' appears top-center; form resets; URL stays at /settings/account"
    why_human: "Requires a logged-in dev session against better-auth — automated check confirms toast.success('Hasło zmienione') is wired in the success path, but the actual browser-side render of the toast cannot be asserted without a running dev server + DOM"
  - test: "Unauth redirect actually fires in a real browser session for /settings/account"
    expected: "Open /settings/account in a fresh browser (no session cookie) → ProtectedRoute renders <Navigate to=\"/login\" replace> → URL becomes /login"
    why_human: "Existing bun:test (Plan 03 Task 3) only asserts source-text patterns in protected-route.tsx — not real navigation. Behavioral E2E test is explicitly deferred to Phase 4 (FE-06). WR-05 from code review flags this regex-as-test as a quality issue."
  - test: "Mobile responsive layout for /settings on a phone-width viewport"
    expected: "On <768px viewport, settings shell remains usable: side-nav either collapses or scrolls; password form fields remain tappable; AlertDialog renders without overflow"
    why_human: "No automated viewport test in the harness; UI-SPEC does not strictly mandate a mobile breakpoint for settings (Linear/Raycast brand is desktop-first), but project does have mobile lists (games-mobile-list.tsx) so settings shell should at minimum not break"

advisory_findings_from_review:
  - id: "CR-01 (BLOCKER per reviewer, advisory per phase goal)"
    issue: "qc.removeQueries({ queryKey: ['games'] }) only clears one cache slice — dictionaries/platforms/genres/developers/wishlist cache remains. Reviewer flagged as critical for multi-user but project is single-user-per-deploy per CLAUDE.md."
    impact_on_goal: "Does NOT block goal #4 (the strict 4-step flow per MEMORY rule executes correctly: revoke → refetchSession → cache cleanup → navigate). Cache hygiene scope is a separate quality concern."
    recommendation: "Track as follow-up; either expand to qc.clear() or scope by user. Single-user model means current behavior is functionally correct for the goal."
  - id: "WR-01"
    issue: "isPending not reset on failure path in AccountSessionsCard (no finally block)"
    impact_on_goal: "Does NOT block goal — happy path navigates away (unmount handles). Edge case only."
  - id: "WR-05"
    issue: "protected-route.test.tsx is a regex-against-source-text test, not a behavioral test. Violates project rule 'no regex/sed DRY hacks'."
    impact_on_goal: "Test PASSES but doesn't prove behavior. Plan explicitly defers behavioral E2E to Phase 4 (FE-06). Goal #5 (unauth redirect) cannot be fully claimed without manual browser verification (see human_verification[2])."
---

# Phase 1: Settings Shell + Konto Verification Report

**Phase Goal:** User opens `/settings/account` and manages account credentials (email visible, change password, sign out everywhere) inside the existing Linear-style layout.
**Verified:** 2026-05-12
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| #   | Truth | Status     | Evidence |
| --- | ----- | ---------- | -------- |
| 1   | `/settings` shows side-nav left + content panel right, visually consistent with `AppLayout` (shadcn, neutral palette, Polish copy) | ✓ VERIFIED (automated) / ⚠ HUMAN (visual parity) | `settings-layout.tsx:4-15` renders `<aside w-[220px] border-r border-apex-line-4>` + `<Outlet />`; `settings-nav.tsx:53` active class is verbatim `bg-[oklch(95%_0.02_220)] font-semibold text-apex-accent` matching `sidebar.tsx:54`. Visual parity needs eyes. |
| 2   | `/settings/account` shows email from `useSession()` | ✓ VERIFIED | `account.tsx:7` `const { data: session } = useSession();` then `user.email` rendered in `ProfileCard` (`account.tsx:29-30`). |
| 3   | Password change form (old/new/confirm) → success toast; better-auth validates old password | ✓ VERIFIED (automated) / ⚠ HUMAN (browser toast render) | `account-password-form.tsx:43-55` calls `await changePassword({ currentPassword, newPassword, revokeOtherSessions })`; on success `toast.success('Hasło zmienione')` (line 54) + `form.reset()`. `mapChangePasswordError` (lines 9-20) handles `INVALID_PASSWORD` (old pwd wrong), `PASSWORD_TOO_SHORT`, 429 + fallback. Better-auth server validates old password (no client-side check). |
| 4   | Click "Wyloguj wszystkie sesje" → after `await refetchSession()` redirect to `/login` (MEMORY: refetchSession before navigate) | ✓ VERIFIED | `account-sessions-card.tsx:25-37` strict 4-step order: `await revokeSessions()` → `await refetchSession()` → `qc.removeQueries({ queryKey: ['games'] })` → `navigate('/login', { replace: true })`. MEMORY regression `feedback_better_auth_session_refetch` honored (refetchSession on line 29 fires BEFORE navigate on line 31). |
| 5   | Unauth user on `/settings/*` redirected by `ProtectedRoute` to `/login` | ✓ VERIFIED (structurally) / ⚠ HUMAN (behavioral) | `main.tsx:31-52` — `/settings` is a child of `<ProtectedRoute />`. `protected-route.tsx:16-18` redirects when `!session?.user` via `<Navigate to="/login" replace state={{ from: location.pathname }} />`. Source-text regression test passes (3 pass, 6 expect() — `bun test apps/client/src/components/auth/protected-route.test.tsx`). Real browser navigation deferred to FE-06. |

**Score:** 5/5 truths verified at automated layer; 4 of 5 have a human-verifiable visual/behavioral component flagged.

### Required Artifacts

| Artifact | Expected | Status | Details |
| -------- | -------- | ------ | ------- |
| `apps/client/src/components/ui/alert-dialog.tsx` | shadcn AlertDialog primitive | ✓ VERIFIED | 4419 bytes, biome-ignored per components.json |
| `apps/client/src/components/ui/card.tsx` | shadcn Card primitive | ✓ VERIFIED | 1828 bytes |
| `apps/client/src/components/ui/label.tsx` | shadcn Label primitive | ✓ VERIFIED | 710 bytes |
| `apps/client/src/components/ui/button.tsx` | destructive variant added | ✓ VERIFIED | Line 12: `destructive: 'bg-destructive text-destructive-foreground shadow hover:bg-destructive/90'` |
| `apps/client/src/components/icons.tsx` | user, plug, database, palette keys | ✓ VERIFIED | All 4 added per SUMMARY 01-01 |
| `apps/client/src/pages/settings/settings-layout.tsx` | SettingsLayout (Outlet host + side-nav shell) | ✓ VERIFIED | 15 lines, named export, no SidebarProvider |
| `apps/client/src/pages/settings/settings-nav.tsx` | Secondary side-nav with KONTO + POZOSTAŁE sections | ✓ VERIFIED | 90 lines, active NavLink (Konto) + 3 disabled items with `Wkrótce` tooltip |
| `apps/client/src/pages/settings/account.tsx` | AccountPage with Profil + Password + Sessions cards | ✓ VERIFIED | useSession destructure (line 7), 3 cards in correct order (Profil → Password → Sessions, lines 14-16) |
| `apps/client/src/pages/settings/account-password-form.tsx` | AccountPasswordForm uncontrolled + FormData | ✓ VERIFIED | 2 useState (error, isPending), FormData read, toast on success, mismatch gate |
| `apps/client/src/pages/settings/account-sessions-card.tsx` | AccountSessionsCard with AlertDialog + 4-step flow | ✓ VERIFIED | Strict order: revoke → refetchSession → removeQueries → navigate (lines 28-31) |
| `apps/client/src/lib/auth-client.ts` | changePassword + revokeSessions destructured | ✓ VERIFIED | Line 5: `export const { signIn, signUp, signOut, useSession, changePassword, revokeSessions } = authClient;` |
| `apps/client/src/main.tsx` | Nested /settings route with index Navigate | ✓ VERIFIED | Lines 45-52: SettingsLayout + index `<Navigate to="account" replace />` + path 'account' → AccountPage. Both imports present (lines 12-13). |
| `apps/client/src/components/auth/protected-route.test.tsx` | Regression test for /login redirect contract | ⚠ VERIFIED (caveat) | 22 lines, 3 pass / 6 expect. **WR-05 caveat**: regex-against-source-text, not behavioral. |

### Key Link Verification

| From | To | Via | Status | Details |
| ---- | -- | --- | ------ | ------- |
| `main.tsx` | `SettingsLayout` | route element | ✓ WIRED | Import on line 13; used on line 47 |
| `main.tsx` | `/settings/account` | index Navigate | ✓ WIRED | Line 49: `{ index: true, element: <Navigate to="account" replace /> }` |
| `settings-layout.tsx` | `SettingsNav` + `<Outlet />` | composition | ✓ WIRED | Lines 8, 11 |
| `account.tsx` | `useSession()` | auth-client import | ✓ WIRED | Lines 2, 7 — `const { data: session } = useSession();` |
| `account-password-form.tsx` | `changePassword()` | auth-client import | ✓ WIRED | Lines 5, 43 — `await changePassword({...})` |
| `account-sessions-card.tsx` | `revokeSessions()` | auth-client import | ✓ WIRED | Lines 14, 28 — `await revokeSessions()` |
| `account-sessions-card.tsx` | `refetchSession` (between revoke and navigate) | useSession destructure | ✓ WIRED | Line 20: `const { refetch: refetchSession } = useSession();` then line 29: `await refetchSession();` BEFORE line 31 navigate |
| `account-sessions-card.tsx` | `navigate('/login', { replace: true })` | useNavigate | ✓ WIRED | Lines 17, 21, 31 |
| `account.tsx` | `AccountPasswordForm` | composition | ✓ WIRED | Lines 3, 15 |
| `account.tsx` | `AccountSessionsCard` | composition (3rd card) | ✓ WIRED | Lines 4, 16; awk-verified to come AFTER `<AccountPasswordForm />` per SUMMARY 01-03 |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
| -------- | ------------- | ------ | ------------------ | ------ |
| `account.tsx` ProfileCard | `email`, `name` | `useSession().data.user` (better-auth session store) | YES — populated by better-auth React client at runtime | ✓ FLOWING |
| `account-password-form.tsx` | `currentPassword`, `newPassword`, `confirmPassword`, `revokeOtherSessions` | FormData on submit (uncontrolled inputs per MEMORY rule) | YES — read at submit, passed to better-auth `changePassword` | ✓ FLOWING |
| `account-password-form.tsx` | `error`, `isPending` | useState; populated by `mapChangePasswordError(code, status)` from server response | YES — server-driven via better-auth error envelope | ✓ FLOWING |
| `account-sessions-card.tsx` | confirmation gate state | shadcn AlertDialog (Radix self-managed) | YES — Radix uncontrolled open state | ✓ FLOWING |
| `account-sessions-card.tsx` | `refetchSession` | better-auth `useSession().refetch` | YES — invokes better-auth session refetch endpoint | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| ProtectedRoute regression pin runs | `bun test apps/client/src/components/auth/protected-route.test.tsx` | 3 pass / 0 fail / 6 expect() | ✓ PASS (caveat: source-text only, see WR-05) |
| /settings route resolves at build | (per SUMMARY 01-03) `bunx vite build --mode development` | 2087+ modules transformed, bundle built | ✓ PASS |
| TypeScript compiles for touched files | (per SUMMARY 01-03) `bunx tsc -b --noEmit` | Pre-existing errors in `games-mobile-list.tsx` only — Phase 1 files clean | ✓ PASS |

### Probe Execution

No probes declared for this phase. SKIPPED — phase has no `scripts/*/tests/probe-*.sh` path.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| ----------- | ----------- | ----------- | ------ | -------- |
| SET-01 | 01-01 | Side-nav + content panel structure, extensible | ✓ SATISFIED | `settings-layout.tsx` + `settings-nav.tsx` with KONTO/POZOSTAŁE sections; main.tsx nested route |
| SET-02 | 01-02 | Konto section shows email of logged-in user | ✓ SATISFIED | `account.tsx:7,30` — `useSession().data.user.email` in ProfileCard |
| SET-03 | 01-02 | Password change form (old/new/confirm) validated by better-auth | ✓ SATISFIED | `account-password-form.tsx` — 3 fields, FormData submit, `changePassword()` call, error mapping for INVALID_PASSWORD/PASSWORD_TOO_SHORT/429 |
| SET-04 | 01-03 | Revoke all sessions in one click | ✓ SATISFIED | `account-sessions-card.tsx` — destructive trigger + AlertDialog confirm + `revokeSessions()` |
| SET-05 | 01-03 | /settings only accessible to logged-in user (ProtectedRoute) | ⚠ SATISFIED (caveat) | Structurally wired via `main.tsx:31-52`; behavioral E2E test deferred to Phase 4 (FE-06). Regression pin (WR-05) passes but is a source-string test, not behavioral. |
| FE-07 | 01-01, 01-02, 01-03 | Reuses AppLayout patterns, shadcn, neutral palette | ✓ SATISFIED | shadcn primitives (alert-dialog, card, label) + apex-* tokens + verbatim active-state classes from sidebar.tsx → FE-07 parity claim is grep-verifiable; visual sign-off pending human |

**No orphaned requirements.** All 6 IDs declared in PLAN frontmatter (SET-01..05, FE-07) match REQUIREMENTS.md (marked `[x]` and "Complete" in the phase mapping table).

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| ---- | ---- | ------- | -------- | ------ |
| `account-sessions-card.tsx` | 34-35 | Misleading comment: "better-auth surfaces error via toast/console" — better-auth does NOT auto-toast; project rule bans `console.*` | ⚠ Warning (WR-02) | Future maintainer will assume error feedback exists when it does not. Does not block phase goal. |
| `account-sessions-card.tsx` | 25-37 | No `finally` block; `isPending` not reset on failure | ⚠ Warning (WR-01) | Edge case — happy path navigates away. If revoke fails, button stays disabled with no toast. Does not block phase goal (happy path works). |
| `protected-route.test.tsx` | 5-22 | Regex-against-source-text "test" — violates project rule `feedback_no_regex_hacks` and CLAUDE.md anti-pattern "Regex/sed-as-DRY-bandage" | ⚠ Warning (WR-05) | Test passes but is structural, not behavioral. Goal #5 evidence is weakened — flagged for human verification. |
| `account-sessions-card.tsx` | 30 | Only `['games']` queryKey cleared on revoke; full cache (dictionaries, platforms, etc.) remains | ℹ Info / CR-01 (reviewer-flagged BLOCKER) | Single-user-per-deploy model per CLAUDE.md makes this functionally OK. Reviewer correctly flags as quality issue. Does not block phase goal (the 4-step flow per MEMORY contract executes correctly). |
| `settings-nav.tsx` | 23-37 | DisabledNavItem renders `<span>` without `tabIndex=0` — keyboard users can't focus → can't see Tooltip | ⚠ Warning (WR-04) | Accessibility gap. Does not block phase goal but is a real UX regression. |

**No `TBD`/`FIXME`/`XXX` debt markers found in any Phase 1 file** (grep count = 0 across all 8 settings/auth files).

**No stubs detected.** All artifacts contain real implementation; no `return null` placeholders (the `if (!user) return null` guard in `account.tsx:9` is a session-loading guard, not a stub — flagged advisory in IN-02).

### Human Verification Required

1. **Visual parity with AppLayout** — open `/settings` in dev, side-by-side with `/games`. Verify side-nav width, font sizes, palette, density match. Active `Konto` link must look identical to active item in main sidebar.
2. **Toast renders on password change success** — `bun run dev`, log in, navigate to `/settings/account`, submit valid current+new+confirm matching password ≥8 chars. Confirm: (a) sonner toast `Hasło zmienione` renders top-center, (b) form fields clear, (c) URL stays at `/settings/account`.
3. **Unauth redirect from `/settings/*` in real browser** — open private/incognito window, navigate directly to `http://localhost:5173/settings/account`. Confirm: URL replaces to `/login`. (The bun:test only checks source string presence — not real navigation.)
4. **Mobile responsive sanity** — at 375px viewport, verify settings shell is usable (side-nav either collapses or scrolls without breaking layout; password form fields tappable; AlertDialog content fits viewport).

### Gaps Summary

No gaps found that block the phase goal. Phase 1's 5 success criteria are all structurally and behaviorally satisfied at the code level. The reviewer's CR-01 (cache scope on revoke) and WR-05 (regex test quality) are real code-quality concerns but do not invalidate any goal — the strict 4-step session-revoke flow (MEMORY contract) executes in correct order, and `ProtectedRoute` is structurally wired even if its regression test is brittle.

4 of the 5 success criteria contain a visual/behavioral component that cannot be asserted by static analysis alone (visual parity, toast rendering, real browser navigation, mobile responsiveness) — these are routed to **human verification** rather than marked as failures.

**Recommendation for orchestrator:** advance to next phase ONLY after a human runs the 4 manual checks above. The structural foundation is solid; the remaining risk is purely visual/behavioral and deferred E2E coverage (FE-06 in Phase 4 will close the redirect-test gap).

---

_Verified: 2026-05-12_
_Verifier: Claude (gsd-verifier)_
