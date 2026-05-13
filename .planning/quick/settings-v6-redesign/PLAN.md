# Settings Page Redesign — v6 Alignment

## 1. Goal & Non-Goals

**Goal.** Bring `apps/client/src/pages/settings/account.tsx` and its sub-components in line with
the visual language of `Game Detail v6.html` (settings section ~lines 1732–2160) — Linear/Raycast
density, sectioned cards with hairline dividers, inline-expand pattern for sensitive actions,
disabled-with-tooltip placeholders for capabilities the backend does not yet expose.

**Non-goals.**

- No new backend endpoints. No DB migrations. No better-auth plugin additions (2FA, additionalFields).
- No new user-preferences storage. Preferences section is **deferred** entirely.
- No integrations UI (IGDB credentials are env vars on the server, not user-supplied — out of scope).
- No avatar upload pipeline (UploadThing today only handles game covers).
- No sidebar nav restructure. "Konto" stays the only active item; "Integracje / Dane / Wygląd"
  remain "Wkrótce" placeholders.
- No mobile layout changes. Existing `Sheet`-based mobile nav stays.

## 2. Design References

- Canonical HTML: `/Users/kodari/Downloads/Games (1)/Game Detail v6.html` lines 1732–2180
  (`SettingsCard`, `SettingsRow`, `PasswordField`, `ToggleBlock`, `SettingsPage`).
- Screenshots:
  - `/Users/kodari/Downloads/Games (1)/screenshots/settings-now.png`
  - `/Users/kodari/Downloads/Games (1)/screenshots/settings-full.png`
  - `/Users/kodari/Downloads/Games (1)/screenshots/settings-integ.png`
  - `/Users/kodari/Downloads/Games (1)/screenshots/settings-scroll.png`

## 3. Section-by-Section Decisions

### 3.1 Page shell (`settings-layout.tsx`)

**Keep as-is.** Header (mono icon tile + "Ustawienia" title), side nav with `Sheet` on mobile,
`Outlet` for sections — already matches v6 chrome. The single visual tweak: ensure the content
column constrains to `max-w-[680px]` and uses `bg-[#fafafa]` (arbitrary literal — matches v6
exactly; precedent: `add-game-modal.tsx:112`) as page bg. Currently `account.tsx` clamps to
`max-w-[720px]` on a white shell — needs to move bg color to `settings-layout.tsx`'s outlet
wrapper. The `apex-surface-hover` token (`#f5f5f5`) is reserved for the read-only "muted box"
treatment inside rows — different surface, different value.

### 3.2 Side nav (`settings-nav.tsx`)

**Keep copy and structure.** Polish labels "KONTO"/"POZOSTAŁE" and disabled items stay. v6's
English labels are mockup copy, not a directive. No changes.

### 3.3 Account section — `KONTO`

**Change.** Replace current `Card` + `dl` block with:

- Section label `KONTO` (uppercase, tracked, 10.5px) above the card.
- One `SettingsCard` containing:
  - **Profile row** (custom header layout): 46×46 round avatar via `<SettingsAvatar>` —
    `seed = user.name?.trim() || user.email.split('@')[0]`, glyph via existing `initials(seed)`
    helper (1–2 chars, uppercased), fallback `·` when first char is not a Unicode letter
    (`/\p{L}/u`); fixed gradient `linear-gradient(135deg, #4F6EF7, #9b5de5)` (single-user app —
    identity-derived color adds no value, fixed gradient matches v6 1:1). Name + email stacked,
    right-aligned `"Edytuj awatar"` rendered via shared `<DisabledWithTooltip>` primitive
    (`aria-disabled=true`, `tabIndex=0`, Radix Tooltip on hover/focus, sonner toast `"Wkrótce"`
    on tap as touch fallback). Rationale: no avatar upload route exists; never render a button
    that lies, but stay a11y-honest about its unavailable state.
  - **Name row** (`SettingsRow label="Nazwa"`): right-aligned read-only `<div>` (NOT `<input>`)
    with `select-text cursor-default` showing `user.name ?? '—'`. No `aria-readonly` (it's not
    a form field). Rationale: better-auth client does not expose `updateUser`; no inline rename
    plumbing today.
  - **Email row** (`SettingsRow label="Email"`): right-aligned read-only `<div>` (same treatment
    as Name) showing `user.email`. Rationale: same — no email-change endpoint, and changing
    email touches sessions.

Both rows render values with the v6 "muted box" treatment (`bg-apex-surface-hover`,
`border-apex-line-4`, rounded 6px, 6×10 padding, max-w 260px, text-right) — so they read as
inputs visually but are not editable. This honours v6 layout without faking writeability.

### 3.4 Security section — `BEZPIECZEŃSTWO`

**Change.** Replace `AccountPasswordForm` + `AccountSessionsCard` with one `SettingsCard`:

- **Password row** (`SettingsRow label="Hasło" desc="Aktualizuj swoje hasło logowania."`):
  right-side ghost button `"Zmień hasło"` ↔ `"Anuluj"` toggles `SettingsInlineToggle`,
  **collapsed by default**. Reuses better-auth `changePassword({ currentPassword, newPassword,
  revokeOtherSessions })` already wired in `auth-client.ts`. `revokeOtherSessions` checkbox
  stays inside the form with `defaultChecked=true` — this is the "I'm rotating my password
  because I think it leaked" path; the standalone Sign-out row below handles the orthogonal
  "log out my other devices without changing my password" path. Two paths, both honest. UX
  details:
  - **Animation:** pure CSS `grid-template-rows: 0fr → 1fr` + `overflow: hidden` on the
    wrapper (animates to auto-height without JS measurement; no new deps).
  - **Trigger a11y:** `aria-expanded={open}` + `aria-controls={bodyId}` on the ghost button;
    `useId()` for the body id. No `role="region"` on the body — disclosure pattern, not landmark.
  - **Focus on open:** `useEffect(() => { if (open) firstInputRef.current?.focus(); }, [open])`
    targets `currentPassword`. Triggers password manager autofill prompts.
  - **Focus on close:** `requestAnimationFrame(() => triggerRef.current?.focus())` after
    `setOpen(false)` — waits one frame so the trigger label flip (`Anuluj` → `Zmień hasło`)
    commits before SR announces the focus.
  - **Esc handling:** `onKeyDown` on the `<form>` element only (not global window listener).
    Esc-while-focused-in-form → close + reset. Esc from anywhere else does nothing —
    acceptable for v1 (inline expand, not a modal). Promote to window listener only if a
    keyboard user complains.
  - **No click-outside dismiss.** Linear precedent: inline expand stays open until explicit
    Anuluj / Esc / success. Spójne z resztą aplikacji.
  - **Cancel:** `setOpen(false)` + `form.reset()` — clears password fields from DOM (small
    security bonus, zero cost). No dirty-state confirm dialog — Linear/Raycast style, single
    user, low cost of re-typing.
  - **Success:** toast (existing `sonner` flow in form body) → `onSuccess` callback bubbles
    up → parent closes expand + resets form.
  - **Error:** existing inline error banner stays at top of form body. For `INVALID_PASSWORD`,
    refocus `currentPassword`. Other errors (rate-limit, generic) leave focus alone.
- **2FA row** (`SettingsRow label="Uwierzytelnianie dwuskładnikowe" desc="Dodatkowa warstwa
  zabezpieczeń przy logowaniu."`): status text `"Niedostępne"` + ghost button `"Włącz"`
  rendered via shared `<DisabledWithTooltip>` (same primitive as "Edytuj awatar"). Rationale:
  no `twoFactor` plugin in `apps/api/src/infrastructure/auth/auth.ts`; rendered for visual
  rhythm matching v6. Rule that justifies rendering this row (vs. deferring like Integracje):
  Security section has ≥1 working action (password change + sign-out), so 2FA glues in as a
  placeholder row. Sections with zero working actions are deferred entirely.
- **Sign-out-other-devices row** (`SettingsRow label="Wyloguj inne urządzenia"
  desc="Zakończ aktywne sesje na innych przeglądarkach i urządzeniach."`): right-side
  **ghost** button `"Wyloguj"` (NOT destructive — the action is "leave me logged in here, kill
  my other sessions", not destructive on the current device; destructive red is reserved for
  Strefa Niebezpieczna). Calls `revokeOtherSessions()` (NOT `revokeSessions`) from
  `auth-client.ts` — keeps current session alive, no `navigate('/login')`, no
  `removeQueries({ queryKey: ['games'] })` (the cache belongs to the still-logged-in user).
  Confirms via existing `AlertDialog` with softer copy:
  `"Pozostaniesz zalogowany na tym urządzeniu. Inne sesje zostaną zakończone."` Toast on
  success: `"Wylogowano inne urządzenia."` **No device list drawer** — better-auth client
  does not export `listSessions`; would require backend wiring out of scope. v6 row + button
  preserved; expand block omitted.

### 3.5 Integrations — `INTEGRACJE`

**Defer entirely.** IGDB credentials live in server env vars (`IGDB_CLIENT_ID`,
`IGDB_CLIENT_SECRET`). Exposing them as per-user settings would require new schema, a secrets
store, and a settings-write authorization model. Not in scope of a visual redesign. The
`settings-nav.tsx` already shows "Integracje" as disabled "Wkrótce" — that placeholder is honest.

### 3.6 Preferences — `PREFERENCJE`

**Defer entirely.** No `user_preferences` table; list defaults live in URL via `useUrlState`.
Adding writable settings would be a backend feature, not a redesign.

### 3.7 Danger Zone — `STREFA NIEBEZPIECZNA`

**Defer.** No account-close route exists. Surfacing a destructive button without backing
endpoint violates the "never fake an action" rule.

## 4. New / Changed Files

**New (shared primitives):**

- `apps/client/src/components/settings/settings-card.tsx` — wrapper `<section>` with optional
  title/description header, `danger` variant.
- `apps/client/src/components/settings/settings-row.tsx` — row with `label` + `desc` + control
  slot. Carries its own `border-b border-apex-line-4 last:border-b-0` — the `last:` Tailwind
  variant auto-suppresses the divider on the final DOM sibling. **No `last` prop**;
  conditional rendering, Tooltip wrappers, and reorders all "just work" without consumer
  bookkeeping. JSDoc note: "must be a direct child of `SettingsCard` body — `last:` resolves
  against immediate DOM siblings."
- `apps/client/src/components/settings/settings-section-label.tsx` — tiny uppercase header
  rendered above each card group.
- `apps/client/src/components/settings/settings-inline-toggle.tsx` — pure-CSS collapsible body
  using `grid-template-rows: 0fr → 1fr` + `overflow: hidden` (no max-height magic-number,
  animates to auto-height). Takes `open: boolean`. Mirrors v6 `ToggleBlock`.
- `apps/client/src/components/settings/settings-avatar.tsx` — 46×46 round avatar with fixed
  v6 gradient. Glyph: `initials(seed)` with `seed = name?.trim() || email.split('@')[0]`;
  fallback `·` when the first character isn't a Unicode letter (`/\p{L}/u`).
- `apps/client/src/components/settings/disabled-with-tooltip.tsx` — shared primitive for
  "feature not yet available" controls. Renders a visually-disabled button via
  `aria-disabled="true"` + `tabIndex={0}` (NOT native `disabled`, which swallows pointer
  events and kills Radix Tooltip). Wraps the trigger in `<Tooltip>` (desktop hover/focus) and
  fires `toast.info('Wkrótce')` via `sonner` on click/tap (touch fallback — no hover on iOS).
  Consumed by "Edytuj awatar" and 2FA "Włącz". Note: lives under `components/settings/` for
  now; promote to `components/ui/` if reused elsewhere.

**Changed:**

- `apps/client/src/pages/settings/settings-layout.tsx` — move outlet bg to `bg-[#fafafa]`
  (arbitrary literal, matches v6); constrain content padding to v6 rhythm (`32px 24px 80px`).
- `apps/client/src/pages/settings/account.tsx` — rewrite to compose new primitives. Drops
  `Card`+`dl` profile block; composes Account `SettingsCard` + Security `SettingsCard`.
- `apps/client/src/pages/settings/account-password-form.tsx` — **no rename**, keep file name
  and component name (`AccountPasswordForm`). Implementation rewrite only: drop external
  `Card`/`CardHeader`/`CardFooter` wrappers, accept new props `{ open: boolean; onCancel:
  () => void; onSuccess: () => void }`. The component owns its own `firstInputRef` (focus on
  `open`-flip), parent owns `triggerRef` + state. Strength meter from v6 is **omitted** for
  v1 (out of scope; can land later).
- `apps/client/src/pages/settings/account-sessions-card.tsx` — **no rename**, keep file name.
  Strip `Card`/`CardHeader`/`CardFooter` chrome; export a single `SignOutOtherDevicesRow`
  (named export) that returns the row + AlertDialog. Switch the better-auth call from
  `revokeSessions()` → `revokeOtherSessions()`; drop `navigate('/login')` and
  `qc.removeQueries({ queryKey: ['games'] })` (current session survives). Rewrite the
  AlertDialog body copy to match the new semantics.

**Deleted:** none (all files refactored in place to preserve git blame).

## 5. Shared Primitives — Props Sketch

```ts
// settings-card.tsx
type SettingsCardProps = {
  title?: string;
  description?: string;
  danger?: boolean;
  children: React.ReactNode;
};

// settings-row.tsx
type SettingsRowProps = {
  label: React.ReactNode;
  desc?: React.ReactNode;
  /** Right-aligned control slot (button, select, read-only value box, status text). */
  children: React.ReactNode;
};
// Note: no `last` prop. Divider via `border-b border-apex-line-4 last:border-b-0` —
// the `last:` Tailwind variant resolves at runtime against `:last-child` so conditional
// rendering, Tooltip wrappers, and reorders all "just work". Constraint: SettingsRow MUST
// be a direct child of SettingsCard's body (verified by JSDoc).

// settings-section-label.tsx
type SettingsSectionLabelProps = {
  children: React.ReactNode;
  /** Renders in apex destructive red — for "STREFA NIEBEZPIECZNA". */
  danger?: boolean;
};

// settings-inline-toggle.tsx
type SettingsInlineToggleProps = {
  open: boolean;
  children: React.ReactNode;
};

// settings-avatar.tsx
type SettingsAvatarProps = {
  name: string | null;
  email: string;
  size?: number; // default 46
};

// disabled-with-tooltip.tsx
type DisabledWithTooltipProps = {
  /** Tooltip / toast copy. Defaults to "Wkrótce". */
  tooltip?: string;
  /** Visual content of the disabled button. */
  children: React.ReactNode;
  /** Optional override for the button variant (defaults to ghost). */
  variant?: 'ghost' | 'outline';
};
```

Tailwind tokens used: `bg-white`, `bg-[#fafafa]` (page bg, arbitrary literal),
`border-apex-line-4`, `border-apex-line-5`, `bg-apex-surface-hover` (read-only "muted box"
chips inside rows), `text-apex-ink`, `text-apex-ink-6`, `text-apex-muted`, `text-apex-hint`,
`text-apex-accent`. Radii: `rounded-[10px]` for cards, `rounded-[7px]` for rows' input chips.
Section label: `text-[10.5px] font-bold uppercase tracking-[0.1em] text-apex-hint`.

## 6. Backend Surface Impact

**Zero.** All decisions deliberately route around missing endpoints:

- `updateUser` / avatar / email change → fields rendered read-only.
- `twoFactor` → button disabled with tooltip.
- `listSessions` → device list deferred; only `revokeSessions` (already wired) used.
- `closeAccount` → section deferred.

If any of those endpoints later land, the primitives can absorb them without changing layout.

## 7. Atomic Commit Sequence (3 commits)

The original 5-commit sequence would have left 2 commits on `main` with mixed visual language
(v6-styled Account card above legacy `Card`-chrome password+sessions). Since `main` deploys on
every push, those interim states would ship to production. Collapsed to 3 commits — each one
visually coherent end-to-end.

1. **feat(settings): introduce shared SettingsCard / SettingsRow / SettingsSectionLabel /
   SettingsInlineToggle / SettingsAvatar / DisabledWithTooltip primitives.** Adds files under
   `apps/client/src/components/settings/`. No call sites yet. **No smoke test** — the client
   codebase has no jsdom/RTL infrastructure (see `apps/client/src/components/add-game-modal.test.tsx`
   for the existing source-grep pattern). `last:border-b-0` is CSS pseudo-class behaviour, not
   testable via source-grep anyway. Gate: `bun run lint` + `apps/client` `tsc -b` green.
   Commit compiles standalone.

2. **refactor(settings): move page background and content padding into settings-layout.tsx.**
   Outlet wrapper switches to `bg-[#fafafa]`. `account.tsx` loses its outer container padding
   (will be reapplied in commit 3). One-file diff; visually a small bg shift only.

3. **feat(settings): rebuild Account + Security cards with v6 primitives.** Atomic rewrite —
   `account.tsx` swaps fully to composed `SettingsCard`/`SettingsRow`/`SettingsAvatar`,
   Account section (avatar + Nazwa + Email + disabled "Edytuj awatar") and Security section
   (inline-expand password row + disabled 2FA row + Sign-out-other-devices row) land
   together. In the same commit:
   - `account-password-form.tsx` strips Card chrome, accepts `{ open, onCancel, onSuccess }`,
     mounts Esc handler on `<form>`, owns `firstInputRef`. Component name preserved.
   - `account-sessions-card.tsx` strips Card chrome, exports `SignOutOtherDevicesRow`,
     switches `revokeSessions()` → `revokeOtherSessions()`, drops `navigate('/login')` and
     `removeQueries`, rewrites AlertDialog copy. File name preserved.

Each commit lints + typechecks + `bun test` clean before the next. Single PR, but each commit
on `main` is a coherent visual state.

## 8. Verification Checklist

**Visual (run dev, compare against screenshots):**

- Account card: avatar gradient matches `linear-gradient(135deg, #4F6EF7, #9b5de5)`, 1–2
  initials centered (via `initials(seed)` helper), name + email stacked tightly. `"Edytuj
  awatar"` rendered via `<DisabledWithTooltip>` — visually disabled (50% opacity), tooltip on
  hover, focusable via Tab.
- Name + Email rows: right-aligned muted-box treatment using `<div>` (not `<input>`), text is
  selectable (`select-text`), hairline divider between rows via `last:border-b-0` — no
  divider under Email (last child).
- Section labels "KONTO" / "BEZPIECZEŃSTWO" sit ~10px above each card, tracked, hint-grey.
- Security card: Password row inline-expands via grid-rows animation on "Zmień hasło";
  trigger has `aria-expanded` + `aria-controls`; first input (`currentPassword`) autofocuses
  on open. 2FA row shows `Niedostępne` + `<DisabledWithTooltip>` "Włącz". Sign-out row uses
  ghost button (not destructive red) and opens AlertDialog with softened copy.
- Page bg = `#fafafa` (arbitrary literal in `settings-layout.tsx`); content column constrained
  to ~680px.
- Compare side-by-side with `/Users/kodari/Downloads/Games (1)/screenshots/settings-now.png`.

**Manual flows:**

- Open `/settings/account`, click `Zmień hasło` → form expands inline, `currentPassword`
  autofocuses; submit valid password → toast + auto-collapse + form reset; focus returns to
  `"Zmień hasło"` trigger. Submit invalid current password → error banner inside expand,
  refocus on `currentPassword`. Press Esc while focused in form → collapse + reset.
- Click `Wyloguj` on Sign-out row → AlertDialog ("Pozostaniesz zalogowany na tym
  urządzeniu…") → confirm → toast "Wylogowano inne urządzenia.", **no redirect**, user stays
  on `/settings/account`.
- Hover/focus disabled `Edytuj awatar` / `Włącz` 2FA → tooltip "Wkrótce". Tap on
  touch device → toast "Wkrótce".
- Mobile (`< 768px`): hamburger opens nav sheet (unchanged behaviour).

**Automated:**

- `bun run lint`
- `bun run --filter @apex/client typecheck` (or `tsc -b` in `apps/client`)
- `bun test` in `apps/api` (no settings tests there; just confirm nothing broke)

No new client tests added — the existing source-grep convention (see
`apps/client/src/components/add-game-modal.test.tsx`) gates structural regressions; visual
divider behaviour is pure CSS (`last:border-b-0`) and verified in manual review against v6
screenshots.

## 9. Open Questions & Known Follow-ups

None blocking. Follow-ups to flag in the PR description (for future phases, not this one):

- **Avatar upload pipeline** — would require extending UploadThing usage to user profile
  images + a `user.image` column read path. Not part of v6 visual fidelity once "Edytuj
  awatar" is disabled.
- **Strength meter on inline password change** — v6 has it; deliberately omitted in v1 to
  keep commit 3 small. Can land as a follow-up if desired.
- **Esc-from-anywhere-while-expand-open** — current implementation binds Esc on the `<form>`
  element only; Esc fired while focus is on a sibling row (e.g. Sign-out button after
  Tabbing out of the form) does nothing. Promote to gated `window` listener only if a
  keyboard-only user reports it during dogfooding.
- **`<DisabledWithTooltip>` reuse** — lives under `components/settings/` for now. Promote to
  `components/ui/` when a second feature area needs the same pattern.
