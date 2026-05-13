# Settings Page Redesign — v6 Alignment (SUMMARY)

Phase landed via `/gsd-execute-phase settings-v6-redesign` (single isolated `typescript-principal-agent` run, fast-forward merged onto `main`).

## Outcome

`apps/client/src/pages/settings/account.tsx` and its sub-components now follow the
`Game Detail v6.html` settings language: sectioned cards with hairline dividers,
inline-expand for the password change, disabled-with-tooltip placeholders for
backend-less capabilities, `#fafafa` page bg, ~680px content column.

Zero backend surface change. Zero new deps. Polish copy preserved.

## Commits (3, atomic, each lint+typecheck clean)

1. `aaa3da1` feat(settings): introduce shared SettingsCard / SettingsRow / SettingsSectionLabel / SettingsInlineToggle / SettingsAvatar / DisabledWithTooltip primitives
2. `366d73f` refactor(settings): move page background and content padding into settings-layout.tsx
3. `14951f6` feat(settings): rebuild Account + Security cards with v6 primitives

## Files

**New** (under `apps/client/src/components/settings/`):

- `settings-card.tsx`
- `settings-row.tsx` (divider via `last:border-b-0`, no `last` prop)
- `settings-section-label.tsx`
- `settings-inline-toggle.tsx` (pure-CSS `grid-template-rows: 0fr → 1fr`)
- `settings-avatar.tsx` (46×46, fixed v6 gradient, `initials()` from `lib/avatar.ts`)
- `disabled-with-tooltip.tsx`

**Modified:**

- `apps/client/src/pages/settings/settings-layout.tsx` — outlet bg `#fafafa`, padding rhythm
- `apps/client/src/pages/settings/account.tsx` — full rewrite over new primitives
- `apps/client/src/pages/settings/account-password-form.tsx` — strip Card chrome, accept `{ open, onCancel, onSuccess }`, refocus on `INVALID_PASSWORD`, Esc on `<form>` only
- `apps/client/src/pages/settings/account-sessions-card.tsx` — strip Card chrome, export `SignOutOtherDevicesRow`, switch to `revokeOtherSessions()`, drop `navigate('/login')` and cache eviction, ghost variant
- `apps/client/src/lib/auth-client.ts` — added `revokeOtherSessions` re-export

## Deviations from plan

- **`DisabledWithTooltip`** uses a real `<button type="button" aria-disabled="true">` (Biome's `useSemanticElements` rejected the `<span role="button">` form). Native `disabled` is still avoided so pointer/focus events fire and the toast fallback works on touch.
- **Password row in `account.tsx`** does not consume `<SettingsRow>` directly. The trigger row + inline expansion must share one divider boundary; using `SettingsRow` would have drawn a line between trigger and toggle body. Inline-replicated the row layout (~12 lines) inside the wrapper that owns the divider. Same visual result.
- **`initials()` helper** already lives at `apps/client/src/lib/avatar.ts` — reused, no new file.

## Gates (deltas vs `main` baseline before this phase)

- `bun run lint`: zero new errors in changed files (baseline: 43 errors / 7 warnings, identical after).
- `bunx tsc -p apps/client/tsconfig.app.json --noEmit`: zero new errors (baseline 5, all pre-existing in `add-game-modal.tsx` / `games-mobile-list.tsx`).
- `cd apps/api && bun test`: identical to baseline (351 pass / 36 fail / 2 errors — pre-existing logger init issue, unrelated).

## Better-auth confirmation

`revokeOtherSessions` is the correct export (better-auth 1.6.9 ships `revokeSession`, `revokeSessions`, and `revokeOtherSessions` server-side; the React proxy client auto-derives the method from the server route, so destructuring works without further wiring).

## Deferred (per plan §3.5–3.7, §9)

- Avatar upload pipeline (no UploadThing user-image route)
- 2FA (no `twoFactor` plugin in `auth.ts`)
- Integrations / Preferences / Danger Zone sections
- Inline-password strength meter
- Esc-from-anywhere while expand is open (Esc on `<form>` only for v1)
- Promotion of `<DisabledWithTooltip>` to `components/ui/` (single-feature consumer for now)
