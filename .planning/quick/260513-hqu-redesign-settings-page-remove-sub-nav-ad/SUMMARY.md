---
quick_id: 260513-hqu
slug: redesign-settings-page-remove-sub-nav-ad
date: 2026-05-13
status: complete
---

# Summary — Redesign settings page

## Result

Settings page now matches Image #1 reference. Removed the in-page sub-navigation
column and consolidated everything into a single full-width page rendered inside
the main app shell. Header uses a lighter inline icon (no dark chip background)
to match the design.

## Sections

1. **KONTO** — functional (avatar / name / email; edit-avatar disabled).
2. **BEZPIECZEŃSTWO** — functional (password form inline-toggle, 2FA disabled,
   sign-out other devices alert dialog).
3. **INTEGRACJE** — placeholder. IGDB row reads `useIgdbStatusQuery` and renders
   the green "connected" dot when `igdbConfigured === true`. Configure/Disconnect
   for IGDB and Connect for RAWG / MobyGames / "Request" tile are all disabled
   with "Wkrótce" tooltips and toast fallback.
4. **PREFERENCJE** — placeholder. Default view + Default status + Email
   notifications are disabled custom-styled controls (faux Select, faux Toggle)
   with "Wkrótce" tooltips.
5. **STREFA NIEBEZPIECZNA** — placeholder. Close account button disabled.

## Files

- `apps/client/src/pages/settings/settings-page.tsx` — NEW unified page.
- `apps/client/src/pages/settings/account.tsx` — DELETED.
- `apps/client/src/pages/settings/settings-layout.tsx` — DELETED.
- `apps/client/src/pages/settings/settings-nav.tsx` — DELETED.
- `apps/client/src/main.tsx` — single `/settings` route; `/settings/account` →
  redirect to `/settings` for backward compat.

Reused primitives (no changes): `SettingsCard`, `SettingsRow`,
`SettingsSectionLabel`, `SettingsAvatar`, `SettingsInlineToggle`,
`DisabledWithTooltip`, `AccountPasswordForm`, `SignOutOtherDevicesRow`.

## Verification

- `bunx biome check src/pages/settings/ src/main.tsx` — clean.
- `bunx vite build` — succeeds (full 2097 modules transformed).
- Pre-existing TS errors in `add-game-modal.tsx` and `games-mobile-list.tsx`
  are unrelated to this change.

## Out of scope (deferred)

- Implementing RAWG / MobyGames / HowLongToBeat / Steam / GOG integrations.
- Persisting user preferences (`user_preferences` table not built).
- Account closure flow.
- Avatar upload.
