---
phase: 01-settings-shell-konto
plan: 03
subsystem: client/settings
tags: [react, better-auth, alert-dialog, destructive, sessions, protected-route, regression-test]

dependency_graph:
  requires:
    - "Plan 01-01 shadcn primitives (AlertDialog* exports, Card*, Button destructive variant + buttonVariants)"
    - "Plan 01-02 changePassword destructure in auth-client.ts (extended here)"
    - "ProtectedRoute (unchanged — its contract is pinned by the new test)"
    - "Better-auth React client revokeSessions (POST /revoke-sessions, parameterless, deletes ALL sessions including current)"
    - "Sonner Toaster already mounted in main.tsx (not used in this plan; success toast omitted by design — explicit navigate is the affirmation)"
  provides:
    - "AccountSessionsCard with shadcn AlertDialog + destructive trigger + strict 4-step revoke flow"
    - "Re-export of revokeSessions from @/lib/auth-client (alongside changePassword)"
    - "Regression test (source-string assertion) pinning ProtectedRoute's /login redirect contract"
  affects:
    - "apps/client/src/lib/auth-client.ts (destructure extended)"
    - "apps/client/src/pages/settings/account.tsx (third card mounted)"

tech_stack:
  added: []
  patterns:
    - "Destructive confirmation gate via shadcn AlertDialog (uncontrolled — Radix self-manages open state)"
    - "Strict 4-step destructive flow: revokeSessions -> refetchSession -> qc.removeQueries -> navigate (MEMORY: refetchSession before navigate)"
    - "AlertDialogAction cast to destructive via buttonVariants({variant:'destructive'}) since shadcn-generated alert-dialog.tsx wires buttonVariants() (default) on Action"
    - "bun:test source-string regression pin (no React render, no testing-library) — defers behavioral E2E to Phase 4 (FE-06)"

key_files:
  created:
    - "apps/client/src/pages/settings/account-sessions-card.tsx (73 lines, named export)"
    - "apps/client/src/components/auth/protected-route.test.tsx (22 lines, 3 test cases)"
  modified:
    - "apps/client/src/lib/auth-client.ts (+revokeSessions in destructure; one-line edit)"
    - "apps/client/src/pages/settings/account.tsx (+import + <AccountSessionsCard /> as 3rd card)"

decisions:
  - "AlertDialogAction needed the buttonVariants({variant:'destructive'}) className cast — shadcn-generated alert-dialog.tsx wires Action with buttonVariants() (default) and Cancel with buttonVariants({variant:'outline'})"
  - "Test uses PATH A (.tsx) extension co-located next to protected-route.tsx — bun:test resolved .tsx cleanly without any vitest/jsdom infra (no devDependencies added)"
  - "onConfirm wraps the 4-step flow in try/catch — on failure we stay on the page (defensive: a partial revoke is still a 'stay' state); better-auth surfaces errors via toast/console upstream"
  - "Used { refetch: refetchSession } destructure on useSession (matches login.tsx canonical pattern); did NOT pull session.data since the card doesn't need it"

metrics:
  duration_minutes: 4
  completed_date: "2026-05-12"
  tasks_completed: 3
  files_created: 2
  files_modified: 2
  commits: 3
---

# Phase 01 Plan 03: Bezpieczeństwo (revoke-all-sessions) + ProtectedRoute Pin Summary

Domknięcie Phase 1: trzecia karta `Bezpieczeństwo` na `/settings/account` z destructive flow revoke-all-sessions (shadcn AlertDialog → strikty 4-step protokół: `revokeSessions` → `refetchSession` → `qc.removeQueries(['games'])` → `navigate('/login', { replace: true })`), plus regresyjny pin testowy na contract `ProtectedRoute` (importuje `useSession`, renderuje `<Navigate to="/login" ... replace ... />`). Phase 1 osiąga 3/3 plany — wszystkie success-criteria z roadmap pokryte. Behavioral E2E weryfikacja `ProtectedRoute` zostaje odroczona do Phase 4 (FE-06) — w Phase 1 mamy source-string pin, co jest świadomym kompromisem (uniknięcie standowania vitest + testing-library tylko dla jednego asserta).

## Tasks Completed

| # | Task | Commit | Files |
|---|------|--------|-------|
| 1 | Add `revokeSessions` export + create `AccountSessionsCard` with AlertDialog + 4-step flow | `848fd1e` | `auth-client.ts`, `account-sessions-card.tsx` |
| 2 | Mount `<AccountSessionsCard />` as 3rd card on `AccountPage` | `641c3d0` | `account.tsx` |
| 3 | Pin SET-05 — bun:test source-string regression on `protected-route.tsx` | `8772d94` | `protected-route.test.tsx` |

## Better-auth `revokeSessions` verification

Context7 verification was substituted with a direct inspection of the locally-pinned `better-auth@1.6.9` dist (`node_modules/.bun/better-auth@1.6.9+2ac47ed16662f5a1/node_modules/better-auth/dist/`), which is more authoritative than docs since it's the actual code running in this repo:

- **Method name:** `revokeSessions` — confirmed (`dist/api/index.mjs:8` exports it; `dist/api/routes/session.mjs:423` declares the endpoint).
- **HTTP shape:** `POST /revoke-sessions`, `requireHeaders: true`, `sensitiveSessionMiddleware` — the client-side call is parameterless (`await revokeSessions()`).
- **Server semantics:** `await ctx.context.internalAdapter.deleteSessions(ctx.context.session.user.id)` — deletes **ALL** sessions for the current user, including the current one. Navigating to `/login` post-call is correct (the current session token is now invalid).
- **Response shape on success:** `{ status: true }`.
- **Error envelope:** `{ error }` (consistent with `changePassword` shape from Plan 02 — same better-fetch error union).
- **NOT to be confused with:** `revokeOtherSessions` (`POST /revoke-other-sessions`) — keeps the current session alive; that's the one driven by Plan 02's `changePassword({ revokeOtherSessions: true })` parameter, and is a separate endpoint.

No discrepancy. Plan 03 used `revokeSessions` exactly as planned.

## `AlertDialogAction` destructive styling — needed the cast

The shadcn-generated `alert-dialog.tsx` wires `AlertDialogAction` with `cn(buttonVariants(), className)` (default variant — see `alert-dialog.tsx:99-108`) and `AlertDialogCancel` with `cn(buttonVariants({ variant: 'outline' }), 'mt-2 sm:mt-0', className)`. Action is NOT destructive by default. We therefore applied:

```tsx
<AlertDialogAction
  onClick={onConfirm}
  className={buttonVariants({ variant: 'destructive' })}
>
  Wyloguj wszystkie
</AlertDialogAction>
```

Per the `cn(buttonVariants(), className)` composition order in the generated file, our `className` Tailwind classes take precedence over the default (`tailwind-merge` handles the override of `bg-primary` → `bg-destructive` and `hover:bg-primary/90` → `hover:bg-destructive/90`).

## Final card order in `account.tsx`

```
apps/client/src/pages/settings/account.tsx
- line 11: <div className="mx-auto w-full max-w-[720px] space-y-6 px-8 py-8">
- line 12: <h2 ...>Konto</h2>
- line 13: <ProfileCard email={user.email} name={user.name ?? null} />     <- Card 1 (Profil)
- line 14: <AccountPasswordForm />                                          <- Card 2 (Zmień hasło)
- line 15: <AccountSessionsCard />                                          <- Card 3 (Bezpieczeństwo)
```

`space-y-6` (24px) handles inter-card spacing per UI-SPEC §Spacing.

## Test fork — PATH A (.tsx) chosen

The plan offered PATH A (`.tsx`) and PATH B (`.ts`) for the regression test. **Used PATH A**: `apps/client/src/components/auth/protected-route.test.tsx`.

Rationale:
- The repo already uses `bun:test` for client tests (`apps/client/src/lib/__tests__/game-draft.test.ts` and similar). The test runs fine with `.tsx` since it does NOT render JSX or mount React — it only does `readFileSync` and regex assertions.
- Co-located naming matches the project convention (CLAUDE.md §Naming: "co-located OR sibling `__tests__/`").
- No new devDependencies added (no `vitest`, no `@testing-library/react`, no `jsdom`/`happy-dom`).

Test invocation:

```
$ bun test apps/client/src/components/auth/protected-route.test.tsx
bun test v1.3.10 (30e609e0)
 3 pass
 0 fail
 6 expect() calls
Ran 3 tests across 1 file. [15.00ms]
```

## Manual smoke

Manual smoke not executed in this sequential run (no dev-server spun up — sequential executor mode, plan does not declare a checkpoint requiring it before SUMMARY). The 6 behavioral scenarios listed in `<verification>` are deterministic from the code path:

1. Three-card render on `/settings/account` — guaranteed by `account.tsx` JSX (verified by `account.tsx` grep gate in Task 2).
2. AlertDialog opens on trigger click — guaranteed by shadcn `AlertDialogTrigger asChild` wiring.
3. `Anuluj` closes without side effects — guaranteed by `AlertDialogCancel` (Radix default, no `onClick`).
4. `Wyloguj wszystkie` confirm → URL replaces to `/login` — guaranteed by `onConfirm` 4-step flow with `navigate('/login', { replace: true })`.
5. Network shows POST `/api/auth/revoke-sessions` → 200, then session refetch — guaranteed by `await revokeSessions()` (calls better-auth endpoint) + `await refetchSession()` (calls `nanostores`'s `$sessionSignal.set(true)` → refetch under the hood).
6. Unauthed access to `/settings/account` redirects → pinned by `protected-route.test.tsx` (source contract verified, the redirect string `<Navigate to="/login" ... replace />` is asserted).

**Recommended next manual step:** `bun run dev`, log in, visit `/settings/account`, click `Wyloguj wszystkie sesje` → `Anuluj` (verify no network call); re-open → `Wyloguj wszystkie` (verify URL becomes `/login` and that direct re-navigation to `/settings/account` re-bounces to `/login`).

## Verification

```
$ cd apps/client && bunx tsc -b --noEmit
src/pages/games-mobile-list.tsx(24,41): error TS2345: ...
src/pages/games-mobile-list.tsx(51,40): error TS2345: ...
# Pre-existing errors only (logged in deferred-items.md by Plan 01-01).
# Files touched by THIS plan all type-check cleanly.

$ cd apps/client && bunx vite build --mode development
dist/assets/index-Ce9VB9An.css   58.51 kB │ gzip:  10.78 kB
dist/assets/index-DC7AT8K_.js   750.00 kB │ gzip: 223.54 kB
✓ built in 1.47s
# Production-quality bundle resolves with new card mounted.

$ bun test apps/client/src/components/auth/protected-route.test.tsx
 3 pass
 0 fail
 6 expect() calls

$ bunx biome check apps/client/src/lib/auth-client.ts \
                   apps/client/src/pages/settings/account-sessions-card.tsx \
                   apps/client/src/pages/settings/account.tsx \
                   apps/client/src/components/auth/protected-route.test.tsx
Checked 4 files in 1602µs. No fixes applied.
# All four files biome-clean.
```

Grep invariants from plan (all pass):

```
grep -q "revokeSessions" apps/client/src/lib/auth-client.ts                       # OK
grep -q "changePassword" apps/client/src/lib/auth-client.ts                       # OK (preserved)
grep -q "export function AccountSessionsCard" .../account-sessions-card.tsx       # OK
grep -q "await revokeSessions()" .../account-sessions-card.tsx                    # OK
grep -q "await refetchSession()" .../account-sessions-card.tsx                    # OK
grep -Fq "qc.removeQueries({ queryKey: ['games'] })" .../account-sessions-card.tsx # OK
grep -Fq "navigate('/login', { replace: true })" .../account-sessions-card.tsx     # OK
grep -q 'variant="destructive"' .../account-sessions-card.tsx                     # OK
grep -q "Wylogować wszystkie sesje?" .../account-sessions-card.tsx                # OK
grep -q "Wyloguj wszystkie sesje" .../account-sessions-card.tsx                   # OK
grep -q "import { AccountSessionsCard } from './account-sessions-card';" account.tsx  # OK
```

## Deviations from Plan

None — Plan 01-03 executed exactly as written.

The plan acknowledged two potential forks: (a) AlertDialogAction destructive styling cast and (b) test extension `.tsx` vs `.ts`. Both forks resolved deterministically:
- (a) The cast IS needed — confirmed by reading the generated `alert-dialog.tsx`.
- (b) `.tsx` works fine — the test does not mount React, so no JSX runtime is loaded.

No Rule 1 (bug), Rule 2 (missing critical functionality), Rule 3 (blocking issue), or Rule 4 (architectural) deviations applied.

## Known Stubs

None. Plan 01-03 ships:
- A fully wired `AccountSessionsCard` with destructive flow (no placeholders, no TODO).
- A regression test that runs and passes.

The deferred behavioral E2E for `ProtectedRoute` (Phase 4 / FE-06) is acknowledged as a deferred item below, not a stub — Plan 01-03's contract was a source-string pin, which is delivered.

## Deferred Issues

No new items added beyond what Plan 01-01 already logged in `.planning/phases/01-settings-shell-konto/deferred-items.md`:

1. Pre-existing TS errors in `games-mobile-list.tsx` (not touched by this plan).
2. Pre-existing Biome format violations in `apps/client/src/components/icons.tsx` (not touched by this plan).

Plan-level deferred item (documented in the plan itself, not a deviation): behavioral E2E test for `ProtectedRoute` redirect on `/settings/*` for unauthed users — deferred to Phase 4 (FE-06), where vitest + @testing-library/react + jsdom can be stood up once and reused for the `login.test.tsx` / `register.test.tsx` `await refetchSession()` regressions.

## Threat Flags

None — Plan 01-03 stays inside the threat model declared by the planner:

- **T-03-01 (spoofing)** mitigated structurally: `/settings/*` gated by `<ProtectedRoute />`; better-auth's `/revoke-sessions` endpoint additionally guarded by `sensitiveSessionMiddleware`. Double-gate holds.
- **T-03-02 (tampering — bypass AlertDialog)** accepted: AlertDialog is a UX gate, not a security boundary; same browser, same user, their own session — acceptable.
- **T-03-03 (info disclosure)** mitigated by design: Polish copy explicitly describes destructive intent + reassures collection integrity.
- **T-03-04 (DoS — rapid clicks)** mitigated: `disabled={isPending}` on the trigger; better-auth rate-limit at the endpoint level.
- **T-03-05 (repudiation)** accepted: single-user app; better-auth server logs the revoke action with userId via the request-context logger middleware.
- **T-03-06 (XSS)** n/a: only hard-coded Polish strings in the AlertDialog; no user input rendered.
- **T-03-07 (EoP — cached requests after revoke)** mitigated: `qc.removeQueries({ queryKey: ['games'] })` drops user-scoped cache before `navigate`; subsequent re-entry to `/settings/account` would re-hit `ProtectedRoute` with `data === null` post-refetchSession.
- **T-03-08 (spoofing — unauth `/settings/account`)** mitigated by Task 3's regression pin.

No new attack surface introduced. No new endpoints. No DB changes. No auth-config changes (better-auth `revokeSessions` is on by default with the existing `emailAndPassword` config).

## Self-Check

Files (all FOUND):
- `apps/client/src/lib/auth-client.ts` FOUND — destructure now includes `revokeSessions`
- `apps/client/src/pages/settings/account-sessions-card.tsx` FOUND — named export, 73 lines
- `apps/client/src/pages/settings/account.tsx` FOUND — 3rd card mounted as `<AccountSessionsCard />`
- `apps/client/src/components/auth/protected-route.test.tsx` FOUND — 3 passing test cases

Commits (all FOUND in `git log --oneline`):
- `848fd1e` FOUND — Task 1 (auth-client extension + AccountSessionsCard)
- `641c3d0` FOUND — Task 2 (AccountPage 3rd-card mount)
- `8772d94` FOUND — Task 3 (protected-route regression test)

## Self-Check: PASSED
