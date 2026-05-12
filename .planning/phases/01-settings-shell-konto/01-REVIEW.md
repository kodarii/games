---
phase: 01-settings-shell-konto
reviewed: 2026-05-12T00:00:00Z
depth: standard
files_reviewed: 14
files_reviewed_list:
  - apps/client/src/components/auth/protected-route.test.tsx
  - apps/client/src/components/icons.tsx
  - apps/client/src/components/ui/alert-dialog.tsx
  - apps/client/src/components/ui/button.tsx
  - apps/client/src/components/ui/card.tsx
  - apps/client/src/components/ui/label.tsx
  - apps/client/src/lib/auth-client.ts
  - apps/client/src/main.tsx
  - apps/client/src/pages/settings/account-password-form.tsx
  - apps/client/src/pages/settings/account-sessions-card.tsx
  - apps/client/src/pages/settings/account.tsx
  - apps/client/src/pages/settings/settings-layout.tsx
  - apps/client/src/pages/settings/settings-nav.tsx
  - apps/client/package.json
  - CLAUDE.md
findings:
  critical: 1
  warning: 6
  info: 5
  total: 12
status: issues_found
---

# Phase 01: Code Review Report

**Reviewed:** 2026-05-12
**Depth:** standard
**Files Reviewed:** 14
**Status:** issues_found

## Summary

Settings shell + Konto delivers a working Account page with password change and a
"revoke all sessions" action, behind a sidebar nav. Implementation is concise and
generally on brand. However review surfaces one BLOCKER around session cache hygiene
on logout (other-user data left in TanStack Query cache), several WARNINGs about
robustness (missing finally for isPending, silently-swallowed errors with no logging,
tooltip on non-focusable disabled item, brittle test using regex against source
text, dependent-field validation timing), plus a handful of polish items.

The shadcn `ui/` files (`alert-dialog.tsx`, `button.tsx`, `card.tsx`, `label.tsx`)
are biome-ignored per `biome.json` and follow the upstream shadcn style — they
are reviewed for behavior, not formatting.

## Critical Issues

### CR-01: Session revoke leaves other-user data in TanStack Query cache

**File:** `apps/client/src/pages/settings/account-sessions-card.tsx:25-37`
**Issue:** On "Wyloguj wszystkie sesje" the code only clears the `['games']`
query key:

```ts
qc.removeQueries({ queryKey: ['games'] });
navigate('/login', { replace: true });
```

The TanStack cache however holds every key the SPA fetched in this session
(dictionaries, platforms, genres, developers, wishlist, possibly /export
snapshots — see `apps/client/src/lib/queries.ts` and `wiring.ts` component
list in CLAUDE.md). After logout-and-relogin into a *different* account (or
even into the same account where the server-side data has been mutated), the
client will hydrate views from the stale cache of the previous session before
re-fetching, briefly leaking the previous user's data into the UI of the new
one. Even in the documented single-user-per-deploy model this is wrong:
a session revoke is the canonical "trust no client state" boundary and the
single-tenant assumption is only enforced server-side — the client cache is
not user-scoped.

It also makes the call asymmetric: revoking sessions purges server sessions
but the client keeps queryable, possibly-mutating cache entries (mutations
queued in a different tab could still flush stale optimistic state).

**Fix:** Clear the entire query cache, not just `['games']`. Order matters —
clear before navigate so React doesn't re-render guarded pages off stale
data:

```ts
const onConfirm = async () => {
  setIsPending(true);
  try {
    await revokeSessions();
    qc.clear();              // drop ALL cached queries
    await refetchSession();  // force session re-eval before navigate
    navigate('/login', { replace: true });
  } catch (err) {
    setIsPending(false);
    toast.error('Nie udało się wylogować wszystkich sesji. Spróbuj ponownie.');
  }
};
```

`qc.clear()` is the supported TanStack v5 API for full cache reset (see
TanStack Query v5 docs — `QueryClient.clear`). The same fix applies anywhere
else in the app where signOut/revoke happens; consider extracting a
`resetSessionState()` helper if a second call site appears (per CLAUDE.md
"no regex/sed DRY hacks; helper at >2× repetition").

## Warnings

### WR-01: `isPending` is not reset on success path in AccountSessionsCard

**File:** `apps/client/src/pages/settings/account-sessions-card.tsx:25-37`
**Issue:** In the happy path `setIsPending(true)` is never paired with a
reset. The success path navigates away (so unmount handles it), but if
`refetchSession()` or `navigate` ever throws synchronously, or if the
component is kept mounted (e.g. because of a future router guard that
intercepts the redirect), the button stays disabled forever. The catch
branch also leaves the user with a disabled button and no toast/error UI —
the comment claims "better-auth surfaces error via toast/console" but
`revokeSessions()` from `better-auth/react` does NOT auto-toast; it
returns a Result-like object or throws depending on transport. The user
silently sees nothing happen.

**Fix:** Use `finally` and surface the error explicitly:

```ts
const onConfirm = async () => {
  setIsPending(true);
  try {
    await revokeSessions();
    qc.clear();
    await refetchSession();
    navigate('/login', { replace: true });
  } catch {
    toast.error('Nie udało się wylogować wszystkich sesji.');
  } finally {
    setIsPending(false);
  }
};
```

(If you keep the "don't navigate on failure" intent, that's still fine —
just make sure `isPending` clears and the user sees a toast.)

### WR-02: Misleading comment — `console` is forbidden, better-auth does not auto-toast

**File:** `apps/client/src/pages/settings/account-sessions-card.tsx:34`
**Issue:** Comment reads "better-auth surfaces error via toast/console".
better-auth/react does not own a toaster and does not log to console on
behalf of the consumer; even if it did, the project rule (CLAUDE.md /
Logging) is "No `console.*` in API production code" and on the client side
we use `sonner` (`<Toaster>` is mounted in `main.tsx:80`). The comment
will mislead future readers into assuming feedback is handled when it isn't.
Combined with WR-01, the user gets no signal that revoke failed.

**Fix:** Replace the comment with an actual `toast.error(...)` call (see
WR-01 patch) and drop the misleading note.

### WR-03: Password mismatch validated only at submit — confirm field has no live signal

**File:** `apps/client/src/pages/settings/account-password-form.tsx:37-40`
**Issue:** The "new password / confirm password" mismatch check fires only
on submit, and the error is rendered above the form, not next to the
confirm input. With `noValidate` on the `<form>` and `required` on inputs,
the browser doesn't help either. On a slow `changePassword` round-trip the
user can spend several seconds before learning their confirm field doesn't
match. Lower friction with an `onChange`-driven (or `onBlur`-driven) check,
or at minimum render the mismatch error against `aria-describedby` on the
confirm field for screen-reader users.

This is not a bug per se but it deviates from the Linear/Raycast "precision"
brand directive (CLAUDE.md): the form should fail fast next to the offending
field, not at the top.

**Fix:** Either pre-validate `confirmPassword` against `newPassword` before
calling `changePassword()` (already done — only the placement is wrong) or
introduce a `useState` for `confirmError` attached via `aria-describedby` to
the confirm `<Input>`. Keep autofill semantics intact — both inputs stay
uncontrolled via FormData (per project rule:
`feedback_react_autofill_uncontrolled.md`).

### WR-04: Disabled nav items in SettingsNav are not focusable — Tooltip + accessibility gap

**File:** `apps/client/src/pages/settings/settings-nav.tsx:23-37`
**Issue:** `DisabledNavItem` renders a `<span aria-disabled="true">` as the
`TooltipTrigger`. A `<span>` is not focusable by default; without
`tabIndex={0}` keyboard users cannot reach the trigger and will never see
the "Wkrótce" tooltip. Mouse users see it, keyboard users don't — a
real-world accessibility regression. Also: `aria-disabled` on a non-button
non-link is semantically weak; screen readers may not announce "disabled"
at all because the element is not in the tab order.

Secondary issue: `select-none` is set on the span, which is fine, but
`cursor-not-allowed` does not visually communicate "coming soon" — combined
with no focus indicator it makes the items look broken rather than reserved.

**Fix:** Make it focusable and announce a proper role:

```tsx
<span
  role="link"
  aria-disabled="true"
  tabIndex={0}
  className="... focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-apex-line-4"
>
  ...
</span>
```

Or, more idiomatically, render a `<button type="button" disabled>` styled
like a nav-link (Radix Tooltip works fine on focusable buttons, and
`disabled` puts it in a "skip on tab" mode that some teams prefer — pick one
and document it in `01-PATTERNS.md`).

### WR-05: Brittle regex-based "test" against source text in protected-route.test.tsx

**File:** `apps/client/src/components/auth/protected-route.test.tsx:5-22`
**Issue:** This file is not a test of behavior; it's a `readFileSync` +
regex match against the source code:

```ts
const source = readFileSync(resolve(__dirname, 'protected-route.tsx'), 'utf-8');
expect(source).toMatch(/<Navigate[^>]*to="\/login"/);
expect(source).toMatch(/replace/);
```

That is exactly the anti-pattern called out in CLAUDE.md
("Regex/sed-as-DRY-bandage") and in the user-memory rule
`feedback_no_regex_hacks.md`. The test:

1. **Will silently pass even if the component is broken.** Any string
   `<Navigate to="/login"` anywhere in the file — including a comment, a
   string literal, or a dead code path — satisfies the matcher. There is
   no actual render-and-assert.
2. **Will silently fail on benign refactors.** Renaming `replace` to the
   functionally-equivalent `replace={true}` still matches; switching to a
   `to={'/login'}` braced literal breaks the regex.
3. **Couples a behavioral guarantee (SET-05 redirect) to formatting** —
   exactly the coupling Linear/Raycast precision is supposed to avoid.

A real test renders `<ProtectedRoute>` inside a `MemoryRouter` with a
mocked `useSession` and asserts the resulting `<Navigate>` element (or
asserts on `screen.location.pathname` after navigation). Bun does not
have a built-in DOM renderer; if RTL/jsdom is too heavy for this phase,
delete the regex test and accept that SET-05 is covered by manual QA —
but do not ship a test that pretends to verify behavior while only
checking string presence.

**Fix:** Replace with a proper render-based test using
`@testing-library/react` + `happy-dom` (Bun supports happy-dom via
`bun test --preload`), or remove the file entirely until a real test
harness is added. Document the decision in `01-PATTERNS.md`.

### WR-06: `lucide-react` pinned to an outdated/incorrect version `^1.14.0`

**File:** `apps/client/package.json:28`
**Issue:** Current lucide-react releases are in the `0.4xx.x` range
(reset to 0.x several years ago). `1.14.0` resolves to a very old release
(the bun lockfile confirms `lucide-react@1.14.0`). The phase imports `Heart`
from this package (`apps/client/src/components/icons.tsx:1`), which happens
to exist in 1.14.0, but:

- Any future icon added from lucide will hit "named export not found"
  surprises (the API surface differs heavily between 1.x and 0.4xx.x).
- CLAUDE.md / stack lists `lucide-react ^1.14.0` so this is *intentional*
  pinning to the wrong major — but it should be called out as tech debt
  before more icons accrete against this version.

This is not a bug today, but it is a latent footgun for the next icon
addition. If 1.14.0 is intentional (e.g. licence/API reasons), pin it
exactly (`"lucide-react": "1.14.0"`) and add a TSDoc comment on the import
line explaining why. If unintentional, upgrade to the current `^0.4xx.x`
line before more icons are added.

**Fix:** Either pin exactly (`"lucide-react": "1.14.0"`) and document, or
plan an upgrade to current lucide as a follow-up issue in
`deferred-items.md`.

## Info

### IN-01: `useSession()` is called twice in the Account page tree

**File:** `apps/client/src/pages/settings/account.tsx:7`, `apps/client/src/pages/settings/account-sessions-card.tsx:20`
**Issue:** `useSession()` is invoked once in `AccountPage` (for email/name) and
again in `AccountSessionsCard` (for `refetch`). better-auth's `useSession`
returns a stable identity tied to a shared store so this is not a
correctness bug, but it does mean two subscriptions to the same store and a
duplicated "is loading / is signed in" surface. Consider passing
`refetchSession` (or just the `user` object) down as a prop and keeping the
hook call at the page level — same pattern used for `ProfileCard`.

**Fix:** Either lift the hook into a single parent (`AccountPage` already
qualifies) and pass `refetchSession` down, or accept the duplication and
add a comment noting the intentional dual subscription.

### IN-02: `AccountPage` returns `null` while session is loading — flash of empty content

**File:** `apps/client/src/pages/settings/account.tsx:9`
**Issue:** `if (!user) return null;` will render nothing during the brief
moment between mount and `useSession()` resolving (and again during the
post-revoke transition). Because `ProtectedRoute` already guards on
`isPending` upstream, this branch is technically unreachable on initial
load — but if a parent ever re-renders without `ProtectedRoute` (or the
better-auth store is invalidated mid-session), the user sees a blank panel
with no skeleton or spinner. Minor polish gap vs. Linear-grade UX.

**Fix:** Either render a small skeleton (`<Skeleton className="h-24" />`)
or assert via TypeScript that `user` is non-null (e.g. via a context
provided by `ProtectedRoute`) and delete the runtime check.

### IN-03: Magic dimensions / arbitrary Tailwind values repeated across SettingsNav

**File:** `apps/client/src/pages/settings/settings-nav.tsx:8, 27, 29, 51, 62`
**Issue:** Several arbitrary values appear inline:
- `text-[10px]` (label)
- `tracking-[0.08em]` (label)
- `rounded-[7px]` (3 places)
- `text-[13px]` (3 places)
- `h-[17px] w-[17px]` (icon box, 2 places)
- `mx-[6px]` (4 places)
- `bg-[oklch(95%_0.02_220)]` (active state)

Per CLAUDE.md ("no regex/sed DRY hacks; helpers when pattern repeats >2×")
and the Linear/Raycast brand directive ("precision"), these should either
be promoted to Tailwind theme tokens (`apex-radius-nav`, `apex-text-nav`,
`apex-bg-nav-active`) or extracted into a `NavItem` component that
encapsulates the styling. Right now changing the active background colour
requires editing one place; changing the rounded radius requires editing
three.

**Fix:** Extract a shared `NavItem` helper (or both `NavItem` +
`DisabledNavItem`) in this file or in
`apps/client/src/components/layout/` and route all settings nav links
through it. Move the OKLCH colour into the Tailwind config under
`apex.nav.active` (consistent with existing `apex-accent`, `apex-line-4`
tokens).

### IN-04: Commented-out icon SVG bodies left in `icons.tsx`

**File:** `apps/client/src/components/icons.tsx:233-244, 351-368`
**Issue:** Two icons (`settings`, `gamepad`) have their previous SVG body
left in as a commented block right next to the new implementation. CLAUDE.md
discourages commented-out code (under Anti-Patterns / Comments — comments
exist to explain *why*, not to preserve dead snippets). Git history is the
right place for the old shapes.

**Fix:** Delete lines 233-244 and 351-368. If there's a reason the old
shapes might be re-used, capture that in `01-PATTERNS.md` or a
`deferred-items.md` entry instead of comment-graveyard.

### IN-05: `Icon.heart` ignores `aria-hidden` styling consistent with other icons

**File:** `apps/client/src/components/icons.tsx:489`
**Issue:** Every other `Icon.*` is rendered through the `svg(...)` helper
which injects `aria-hidden`, `style={{ display: 'block', flexShrink: 0 }}`,
and a consistent `viewBox`. `Icon.heart` instead reaches directly into
`lucide-react`'s `<Heart />`, which has its own defaults (no
`aria-hidden`, different stroke width). Result: a heart icon placed next
to one of the inline SVGs in a row will be slightly mis-aligned and will
be announced to screen readers as `img` (lucide adds `role="img"` and a
title slot by default). Inconsistent with the rest of the icon set.

Also: `Icon.settings` and `Icon.gamepad` (lines 214-232, 329-350) wrap
their SVGs in a `<>` fragment with no need for the wrapper — the children
of the icon API are typed `ReactNode` so a bare `<svg>` would do. Cosmetic.

**Fix:** Either route `Heart` through the `svg()` factory (paste its path
data manually) or, if keeping the lucide import, add `aria-hidden` and the
shared `style` block at the call site. Drop the unnecessary `<>` wrappers
around `<svg>` returns in `settings` and `gamepad`.

---

_Reviewed: 2026-05-12_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
