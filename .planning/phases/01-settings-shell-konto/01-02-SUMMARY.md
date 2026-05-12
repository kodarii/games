---
phase: 01-settings-shell-konto
plan: 02
subsystem: client/settings
tags: [react, better-auth, forms, password-change, settings, ui-credentials]

dependency_graph:
  requires:
    - "Plan 01-01 shadcn primitives (Card*, Label) and Button destructive variant (button.tsx)"
    - "Plan 01-01 SettingsLayout + /settings/account route already wired"
    - "Better-auth React client createAuthClient() exposing changePassword({ currentPassword, newPassword, revokeOtherSessions })"
    - "Sonner Toaster already mounted in main.tsx (richColors)"
  provides:
    - "AccountPasswordForm component (uncontrolled credential form + FormData + sonner toast + inline error banner)"
    - "Profil card (read-only Email + optional Nazwa) in AccountPage"
    - "Re-export of changePassword from @/lib/auth-client"
    - "Module-private mapChangePasswordError(code, status) Polish copy mapper"
  affects:
    - "apps/client/src/lib/auth-client.ts (added changePassword to destructured re-export)"
    - "apps/client/src/pages/settings/account.tsx (replaced stub with Profil + AccountPasswordForm)"

tech_stack:
  added: []
  patterns:
    - "Uncontrolled credential form: only 2 useState entries (error, isPending), all field values read via FormData on submit"
    - "Submit button placed inside CardFooter, linked to the form via form='account-password-form' id (allows CardFooter visual separation while keeping HTML form submit semantics)"
    - "Module-private error-mapping helper for hard-coded Polish copy keyed off better-auth error.code + error.status"

key_files:
  created:
    - "apps/client/src/pages/settings/account-password-form.tsx (133 lines)"
  modified:
    - "apps/client/src/lib/auth-client.ts (+1 destructure entry: changePassword)"
    - "apps/client/src/pages/settings/account.tsx (8 -> 40 lines; Profil card + AccountPasswordForm composition)"

decisions:
  - "Native <input type='checkbox' name='revokeOtherSessions' defaultChecked> instead of shadcn Checkbox primitive — keeps the form strictly uncontrolled so FormData picks up 'on'/absent natively (D-11 + MEMORY feedback_react_autofill_uncontrolled)"
  - "Submit button lives in CardFooter and is linked to the form via form='account-password-form' attribute — preserves Card visual hierarchy without losing native HTML form-submit semantics"
  - "Inline error banner uses mb-4 margin (banner sits inside CardContent above the form) instead of login.tsx's mt-6 (which sits above the form at page top)"
  - "Profil card renders as <dl><dt><dd> grid (grid-cols-[120px_1fr] gap-y-2) — definition-list semantics for label/value rendering, read-only per D-18"
  - "Early-return if (!user) return null guard in AccountPage even though ProtectedRoute gates the route — silences TS noise on user.email access + prevents flicker if useSession resolves to undefined transiently (mirrors sidebar.tsx:110)"

metrics:
  duration_minutes: 5
  completed_date: "2026-05-12"
  tasks_completed: 3
  files_created: 1
  files_modified: 2
  commits: 3
---

# Phase 01 Plan 02: Profil + Zmień hasło Summary

Stub `AccountPage` z Plan 01-01 ustępuje miejsca dwóm kartom: `Profil` (read-only email + opcjonalna `Nazwa` z `useSession`) i `Zmień hasło` (3-polowy uncontrolled form + checkbox `Wyloguj wszystkie inne sesje` defaultChecked + accent CTA `Zapisz hasło`). `auth-client.ts` re-eksportuje `changePassword`. Po sukcesie better-auth — sonner toast `Hasło zmienione` + `form.reset()`, użytkownik zostaje na `/settings/account` (brak refetchSession, brak navigate per D-12). Karta `Bezpieczeństwo` (revoke-sessions + AlertDialog) odłożona do Plan 01-03 zgodnie z planem.

## Tasks Completed

| # | Task | Commit | Files |
|---|------|--------|-------|
| 1 | Extend auth-client with changePassword | `d426a0d` | `apps/client/src/lib/auth-client.ts` |
| 2 | Create AccountPasswordForm (uncontrolled + FormData) | `19a295a` | `apps/client/src/pages/settings/account-password-form.tsx` |
| 3 | Replace AccountPage stub with Profil card + AccountPasswordForm | `42d174f` | `apps/client/src/pages/settings/account.tsx` |

## Context7 verification of better-auth changePassword

Queried `/better-auth/better-auth` Context7 + cross-verified against the locally pinned `better-auth@1.6.9` dist (`node_modules/.bun/better-auth@1.6.9+2ac47ed16662f5a1/node_modules/better-auth/dist/`):

- Method name on the React client: `changePassword` — confirmed (docs: `await authClient.changePassword({...})`).
- Input shape: `{ currentPassword: string, newPassword: string, revokeOtherSessions?: boolean }` — confirmed (`packages/better-auth/dist/.../types`, server endpoint POST /change-password, request body schema). Note: the docs say `revokeOtherSessions` defaults to `true` on the server but the React client does NOT auto-default — we explicitly pass `data.get('revokeOtherSessions') === 'on'` from the FormData (the checkbox is `defaultChecked` so the default is also `true` from the UX side).
- Error code strings: `BASE_ERROR_CODES.INVALID_PASSWORD` and `BASE_ERROR_CODES.PASSWORD_TOO_SHORT` — confirmed via grep of the installed dist (`BASE_ERROR_CODES.PASSWORD_TOO_SHORT` thrown from `if (ctx.body.newPassword.length < minLength) throw APIError.from("BAD_REQUEST", BASE_ERROR_CODES.PASSWORD_TOO_SHORT)`).
- Error envelope shape: `{ code: string, status: number, message?: string }` — typed via better-fetch's error union; we read `error.code` and `error.status`.

**Deviation from PATTERNS.md guess:** None. Both `INVALID_PASSWORD` and `PASSWORD_TOO_SHORT` matched the planner's mapping verbatim. The helper `mapChangePasswordError(code, status)` ships as-written in the plan.

## Final structure of AccountPasswordForm

**State vars (2 — strict per D-11):**
- `error: string | null` (`useState<string | null>(null)`)
- `isPending: boolean` (`useState(false)`)

No per-field controlled state; all field values come from `new FormData(form)` on submit.

**Error-mapping helper signature (module-private, above the component):**

```ts
function mapChangePasswordError(code: string | undefined, status: number | undefined): string
```

Mapping (verbatim from the UI-SPEC Copywriting Contract):
- `code === 'INVALID_PASSWORD'` → `Aktualne hasło jest nieprawidłowe.`
- `code === 'PASSWORD_TOO_SHORT'` → `Hasło musi mieć co najmniej 8 znaków.`
- `status === 429` → `Zbyt wiele prób. Spróbuj ponownie za chwilę.`
- fallback → `Coś poszło nie tak. Spróbuj ponownie.`

**Submit handler order (canonical login.tsx-derived):**
1. `e.preventDefault()`
2. Read four values via FormData (`currentPassword`, `newPassword`, `confirmPassword`, `revokeOtherSessions`)
3. `setError(null)`
4. **Client-side mismatch gate (only client validation per D-10 exception):** `if (newPassword !== confirmPassword) → setError + return` (no network call fires)
5. `setIsPending(true)` then `await changePassword({...})`
6. On `changeError`: `setIsPending(false) + setError(mapChangePasswordError(code, status)) + return`
7. On success: `setIsPending(false) + toast.success('Hasło zmienione') + form.reset()` — no `refetchSession`, no `navigate`

## Checkbox decision: bare `<input>` not shadcn `Checkbox`

**Choice:** Bare native `<input type="checkbox" name="revokeOtherSessions" defaultChecked>`.

**Rationale (D-11 + MEMORY `feedback_react_autofill_uncontrolled`):** shadcn's Radix-wrapped `<Checkbox>` requires a `Controller` or controlled `checked` / `onCheckedChange` to surface a value into `FormData`. Going controlled for this single field would erode the uncontrolled contract guarding browser autofill on the three password inputs (MEMORY rule). A native input with `defaultChecked` is intercepted naturally by `FormData` as `'on'` (checked) or absent (unchecked), which the submit handler converts via `data.get('revokeOtherSessions') === 'on'`.

Cost: visual deviation from shadcn checkbox primitive (slightly different border / focus ring). Class set kept close (`h-4 w-4 rounded border-apex-line-4 text-apex-accent focus:ring-apex-accent`) — apex palette parity, accent on check / focus.

## Layout / visual contract delivered

- Page container: `mx-auto w-full max-w-[720px] space-y-6 px-8 py-8` (UI-SPEC Spacing — `max-w-[720px]`, 24px between cards, 32px gutters).
- Page heading: `<h2 className="text-2xl font-semibold text-apex-ink">Konto</h2>` (UI-SPEC Typography).
- Card titles: `<CardTitle className="text-sm font-semibold text-apex-ink">…</CardTitle>` for `Profil` and `Zmień hasło` (UI-SPEC 4-size typography contract).
- Field labels: `text-sm text-apex-ink` (regular weight per UI-SPEC two-weight rule — drops login.tsx's `font-medium`).
- Accent CTA: `<Button variant="primary" />` picks up `bg-apex-accent` from existing button-variant token.
- Inline error banner inside CardContent: `mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800` (login.tsx classes verbatim except margin token swap).

## Verification

```
$ cd apps/client && bunx tsc -b --noEmit
src/pages/games-mobile-list.tsx(24,41): error TS2345: ...
src/pages/games-mobile-list.tsx(51,40): error TS2345: ...
# Pre-existing errors only; logged to deferred-items.md by Plan 01-01.

$ cd apps/client && bunx vite build --mode development
✓ 2091 modules transformed.
dist/assets/index-DGR2q3jc.js   747.16 kB │ gzip: 222.72 kB
✓ built in 1.38s
# Production-quality bundle resolves.

$ bunx biome check apps/client/src/pages/settings/account-password-form.tsx apps/client/src/pages/settings/account.tsx apps/client/src/lib/auth-client.ts
Checked 3 files. No fixes applied.
# All three touched files are biome-clean.
```

Grep gates from plan (all pass):

```
grep -q "export const { signIn, signUp, signOut, useSession, changePassword } = authClient;" apps/client/src/lib/auth-client.ts  # OK
grep -q "export function AccountPasswordForm" apps/client/src/pages/settings/account-password-form.tsx  # OK
grep -q "new FormData(form)" apps/client/src/pages/settings/account-password-form.tsx  # OK
grep -q "Nowe hasło i potwierdzenie muszą być identyczne." apps/client/src/pages/settings/account-password-form.tsx  # OK
grep -q "toast.success('Hasło zmienione')" apps/client/src/pages/settings/account-password-form.tsx  # OK
grep -q 'autoComplete="current-password"' apps/client/src/pages/settings/account-password-form.tsx  # OK
grep -q 'autoComplete="new-password"' apps/client/src/pages/settings/account-password-form.tsx  # OK
grep -q 'name="revokeOtherSessions"' apps/client/src/pages/settings/account-password-form.tsx  # OK
grep -q "defaultChecked" apps/client/src/pages/settings/account-password-form.tsx  # OK
grep -cE 'useState<|useState\(' apps/client/src/pages/settings/account-password-form.tsx  # 2 OK
grep -c "AccountSessionsCard" apps/client/src/pages/settings/account.tsx  # 0 OK (Plan 03 scope)
grep -q "<AccountPasswordForm" apps/client/src/pages/settings/account.tsx  # OK
grep -q "const { data: session } = useSession()" apps/client/src/pages/settings/account.tsx  # OK
grep -q "Profil" apps/client/src/pages/settings/account.tsx  # OK
grep -q "Konto" apps/client/src/pages/settings/account.tsx  # OK
```

## Manual smoke results

Manual smoke not executed in this sequential run (no dev-server spun up — sequential executor mode, plan does not declare a checkpoint requiring manual verification before SUMMARY). The five scenarios listed in `<verification>` (mismatch → red banner without network call, wrong current → red banner after one round-trip, success → toast + form clear, etc.) are wired into the handler exactly per the plan and are deterministic from the code path. The single behavioral gate that cannot be inferred from code review — that browser autofill survives across page navigations on the three password inputs — is preserved by the uncontrolled + FormData pattern (MEMORY `feedback_react_autofill_uncontrolled`).

**Recommended next manual step (before merging into mainline use):** run `bun run dev`, log in, visit `/settings/account`, exercise the five scenarios in DevTools (Network tab) to confirm the request is suppressed on confirm-mismatch and toast renders on the success path.

## Deviations from Plan

None — Plan 01-02 executed exactly as written.

The plan acknowledged that `revokeOtherSessions` on the better-auth server defaults to `true` if unspecified; the plan instructed us to read it explicitly from the FormData (`=== 'on'`) since the checkbox is `defaultChecked`, so the runtime behavior is the same and the contract is explicit. No deviation.

No Rule 1 (bug), Rule 2 (missing critical functionality), Rule 3 (blocking issue), or Rule 4 (architectural) deviations applied.

## Known Stubs

None. Plan 01-02 ships a fully wired Profil card (read-only by design per D-18 — not a stub) and a fully functional Zmień hasło card. The Bezpieczeństwo card is explicitly Plan 01-03's contract — not a stub in this plan, an out-of-scope artifact.

## Deferred Issues

None added beyond what Plan 01-01 already logged in `.planning/phases/01-settings-shell-konto/deferred-items.md`:

1. Pre-existing TS errors in `games-mobile-list.tsx` (not touched by this plan).
2. Pre-existing Biome format violations in `apps/client/src/components/icons.tsx` (untouched by this plan).

## Threat Flags

None — Plan 01-02 stays inside the threat model declared by the planner:

- **T-02-01 (spoofing)** mitigated structurally: `/settings/*` gated by `<ProtectedRoute />`; better-auth's `/change-password` requires an active session cookie. Both gates in place.
- **T-02-02 (tampering — bypass confirm gate)** accepted: client-side gate is a UX nicety; better-auth has no `confirmPassword` concept.
- **T-02-03 (info disclosure)** mitigated: error messages are short, neutral Polish strings; no leak of remaining attempts, account state, or username.
- **T-02-04 (DoS)** mitigated: better-auth built-in rate-limit applies; 429 surfaced as user-friendly Polish copy.
- **T-02-05 (repudiation)** accepted: single-user app; logger middleware attaches userId to better-auth request logs.
- **T-02-06 (XSS)** mitigated: we render `mapChangePasswordError(error.code, error.status)` — never `error.message` — so server-influenced strings never reach the DOM.
- **T-02-07 (EoP — brute force)** mitigated: server-side currentPassword verification + better-auth rate-limit.

No new attack surface introduced outside the threat register. No new endpoints. No DB changes. No auth-config changes.

## Self-Check

Files (all FOUND):
- `apps/client/src/lib/auth-client.ts` FOUND — contains the destructured `changePassword`
- `apps/client/src/pages/settings/account-password-form.tsx` FOUND — 133 lines, named export
- `apps/client/src/pages/settings/account.tsx` FOUND — replaces stub, composes Profil + AccountPasswordForm

Commits (all FOUND in `git log --oneline`):
- `d426a0d` FOUND — Task 1 (auth-client changePassword export)
- `19a295a` FOUND — Task 2 (AccountPasswordForm)
- `42d174f` FOUND — Task 3 (AccountPage Profil + form)

## Self-Check: PASSED
