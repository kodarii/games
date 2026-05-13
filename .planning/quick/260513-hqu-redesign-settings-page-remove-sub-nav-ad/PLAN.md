---
quick_id: 260513-hqu
slug: redesign-settings-page-remove-sub-nav-ad
date: 2026-05-13
project: Apex — Game Collection Tracker
---

# Redesign settings page: remove sub-nav + add placeholder sections

## Goal

Align `/settings` with Image #1 reference: a single full-width settings page (no
sub-navigation) inside the main app shell. Sections stacked vertically:

1. **ACCOUNT** — keeps current avatar / name / email rows (functional).
2. **SECURITY** — keeps current password / 2FA / sign-out-other rows (functional).
3. **INTEGRATIONS** — NEW placeholder: IGDB (live status from `useIgdbStatusQuery`,
   Configure + Disconnect disabled), RAWG (Connect disabled), MobyGames (Connect
   disabled), "More integrations coming soon" tile (Request disabled).
4. **PREFERENCES** — NEW placeholder: Default view, Default status,
   Email notifications — all disabled with "Wkrótce" tooltip.
5. **DANGER ZONE** — NEW placeholder: Close account button (red), disabled.

## Out of scope

- Actually implementing RAWG / MobyGames integrations (no backing in API).
- Persisting preferences (no `user_preferences` table).
- Account closing (no use case).
- Avatar upload (already disabled).

## Files to change

- `apps/client/src/pages/settings/settings-layout.tsx` — drop sidebar + Sheet; flatten.
- `apps/client/src/pages/settings/account.tsx` — rename concept: this becomes
  the single settings page; move content into a new `settings-page.tsx` or
  rename in place. Add the 3 new sections inline (one-file for now; each
  section is small).
- `apps/client/src/pages/settings/settings-nav.tsx` — DELETE.
- `apps/client/src/main.tsx` — drop nested `/settings/account` route, point
  `/settings` directly at the page.

## Task breakdown

### Task 1 — Restructure settings-layout
- Remove `SettingsNav`, `Sheet`, mobile trigger, aside.
- Header: replace dark-square `Icon.settings` mark with light/ink-3 plain icon
  (no chip) to match design. Title remains. (Polish copy: keep "Ustawienia".)
- Content container: single column, `max-w-[720px]` centered, `bg-[#fafafa]`
  unchanged.
- Replace `<Outlet />` with direct `<SettingsPage />` import.

### Task 2 — Build Integrations section
- Card list (each row = bordered tile with logo / name / description / action).
- IGDB: read `useIgdbStatusQuery`. If `igdbConfigured` → green dot + "Connected",
  Configure (disabled) + Disconnect (disabled, red text). If false → "Not
  connected", Connect (disabled).
- RAWG, MobyGames: static, Connect (disabled).
- "More coming soon" tile: dashed border, Request (disabled).

### Task 3 — Build Preferences section
- Card with 3 rows: Default view (Select disabled), Default status (Select
  disabled), Email notifications (Switch disabled). Each wrapped with tooltip
  "Wkrótce".

### Task 4 — Build Danger Zone section
- Red-bordered card. Row: "Zamknij konto" + "Trwale usuń konto..." desc +
  red "Zamknij konto..." button disabled.

### Task 5 — Router cleanup
- `main.tsx`: replace nested settings routes with `{ path: 'settings', element: <SettingsPage /> }`.
- Delete `settings-nav.tsx`.
- Delete `account.tsx` after extracting profile/security sections into
  `settings-page.tsx`.

### Task 6 — Lint + typecheck + commit
- `bun run lint`, `tsc -b` per workspace.
- Single atomic commit.

## Success criteria

- No sub-navigation visible on `/settings`.
- All 5 sections render top-to-bottom.
- IGDB status reflects real env config (green when `IGDB_CLIENT_ID` set).
- All placeholder controls (RAWG, MobyGames, Preferences, Danger Zone) are
  disabled with "Wkrótce" tooltips and a toast fallback.
- Account + Security rows remain functional (change password, sign-out other
  devices).
- `bun run lint` clean, no TS errors.
