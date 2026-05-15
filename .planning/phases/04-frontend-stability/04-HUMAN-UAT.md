---
status: partial
phase: 04-frontend-stability
source: [04-VERIFICATION.md]
started: 2026-05-15T07:50:45Z
updated: 2026-05-15T07:50:45Z
---

## Current Test

[awaiting human testing]

## Tests

### 1. Plan 04-01 — ErrorBoundary live smoke
expected: Synthetic throw in a routed page (e.g. inject `throw new Error('boom')` into a Games page) navigated via `/games?boom` renders the AppErrorFallback with Polish copy and two buttons. Primary "Załaduj ponownie" → `window.location.assign('/')`. Secondary "Wróć do logowania" → `window.location.assign('/login')`. No `error.message` / `componentStack` text in DOM (XSS mitigation). DevTools console shows the structured event `{ event: 'render.error.boundary', error, componentStack }`.
result: [pending]

### 2. Plan 04-02 — Login/register autofill + session sequence
expected: Load `/login` with a browser password manager wired to a saved credential. Autofill populates email+password immediately on page load (no user interaction required — controlled inputs would block this). Submit; DevTools Network shows sequence: `POST /api/auth/sign-in/email` (200) → `GET /api/auth/get-session` → redirect to `/games` (no /login → /login flash). Repeat for `/register`.
result: [pending]

### 3. Plan 04-03 — game-view 25-point UAT
expected: Full script from `04-03-PLAN.md` §how-to-verify Task 7. Highlights: (A) owned game `/games/:id` — `...` opens dropdown with Edit + separator + red Delete; Esc closes, Arrows cycle, Enter activates, Tab exits; click outside closes; `role="menu"` present in DOM; edit→save flow works; delete→AlertDialog→Cancel returns focus to trigger; `focus-visible:ring-1` outline on Tab. (B) wishlist `/wishlist/:id` — Move + dropdown both visible; Move navigates to `/games/:id`. (C) visual parity vs baseline; FormatChip uses `Icon.disc`/`Icon.download`. (E) `bunx vite build --mode production` from `apps/client/` succeeds.
result: [pending]

### 4. Plan 04-04 — Idempotency-key retry replay
expected: DevTools Network panel — add a game, record the `Idempotency-Key` UUID header. Simulate offline (DevTools Network throttle → Offline), retry the mutation, restore network; TanStack Query retry sends the SAME UUID. Then complete one successful add-game (onSuccess reset) and confirm the NEXT add-game gets a different UUID. Verify against routes that use mutation hooks: createGame, updateGame, deleteGame, moveToCollection, wishlist parity.
result: [pending]

## Summary

total: 4
passed: 0
issues: 0
pending: 4
skipped: 0
blocked: 0

## Gaps
