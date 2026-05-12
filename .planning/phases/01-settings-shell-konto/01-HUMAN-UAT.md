---
status: partial
phase: 01-settings-shell-konto
source: [01-VERIFICATION.md]
started: 2026-05-12T22:00:00Z
updated: 2026-05-12T22:00:00Z
---

## Current Test

[awaiting human testing]

## Tests

### 1. Visual parity with AppLayout (side-nav left, content right, shadcn neutral palette, typography per UI-SPEC)
expected: `/settings` page visually matches the rest of the app — same neutral palette, same density, no dark-gamer cues; SettingsNav uses verbatim active-state classes from `sidebar.tsx` so should look identical.
result: [pending]

### 2. Toast renders in browser after successful password change
expected: Submit valid current+new+confirm against a real session → sonner toast `Hasło zmienione` appears top-center; form resets; URL stays at `/settings/account`.
result: [pending]

### 3. Unauth redirect fires in a real browser session for `/settings/account`
expected: Open `/settings/account` in a fresh browser (no session cookie) → `ProtectedRoute` renders `<Navigate to="/login" replace>` → URL becomes `/login`.
result: [pending]

### 4. Mobile responsive layout for `/settings` on a phone-width viewport
expected: On <768px viewport, settings shell remains usable: side-nav either collapses or scrolls; password form fields remain tappable; AlertDialog renders without overflow.
result: [pending]

## Summary

total: 4
passed: 0
issues: 0
pending: 4
skipped: 0
blocked: 0

## Gaps
