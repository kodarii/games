---
phase: 04-frontend-stability
verified: 2026-05-15T00:00:00Z
status: human_needed
score: 6/6 must-haves verified
overrides_applied: 0
human_verification:
  - test: "Plan 04-01 smoke: inject synthetic throw in games.tsx, visit /games?boom, confirm fallback UI renders (not blank screen), confirm 'Załaduj ponownie' navigates to / (not reload), confirm 'Wróć do logowania' navigates to /login."
    expected: "Fallback shows polish copy with two buttons. Primary assign('/') changes URL to /. Secondary assign('/login') changes URL to /login. No error.message or componentStack visible in DOM. DevTools console shows structured { event: 'render.error.boundary', error, componentStack }."
    why_human: "Render-error interception requires a running browser + React runtime. Source-pin tests confirm the class structure and key link wiring; only a live browser can confirm the boundary actually catches errors and renders the fallback."
  - test: "Plan 04-02 smoke: load /login with a browser password manager. Verify autofill populates email+password without manual input interaction. Submit and check DevTools Network sequence: POST /api/auth/sign-in/email (200) then GET /api/auth/get-session then redirect to /games."
    expected: "Password manager offers autofill immediately on page load (no controlled-input block). Session refetch fires before the route change. No flash from /login back to /login."
    why_human: "Autofill behavior and Network sequence require a live browser with a real credential store. Source-pin tests confirm the code invariants but cannot exercise browser autofill or the DevTools network panel."
  - test: "Plan 04-03 UAT (full 25-point script from 04-03-PLAN.md Task 7): (A) owned game view — dropdown opens on button click, Tab focuses trigger, ArrowDown/ArrowUp cycles items, Enter activates, Escape closes, click-outside closes, focus returns to trigger after close; (B) wishlist item — Move-to-collection button visible alongside dropdown, clicking Move navigates to /games/:id; (C) visual parity — covers, badges, FormatChip with Icon.disc/Icon.download render correctly; (E) run 'bunx vite build --mode production' from apps/client."
    expected: "All keyboard navigation works via Radix primitives. role='menu' present in DOM. No hand-rolled click-outside code. All files <250 LOC. Build succeeds without errors."
    why_human: "Keyboard navigation, focus management, ARIA role DOM inspection, and visual parity require a running browser. Vite build was blocked in the sandbox during executor run and must be verified post-merge."
  - test: "Plan 04-04 smoke: DevTools Network panel — add a game, record the Idempotency-Key UUID. Simulate offline via Network throttle, attempt another add-game mutation, restore network. Confirm TanStack Query retry sends the SAME UUID. Then complete a successful add-game and confirm the NEXT add-game mutation gets a different UUID (onSuccess reset working)."
    expected: "Retry replay within same component instance reuses cached useRef UUID. Successful completion rotates the key so next independent mutation gets a fresh UUID."
    why_human: "Per-mutation-instance useRef caching requires observing the Idempotency-Key headers in a live DevTools Network panel across retry scenarios. Source code confirms useRef is wired but cannot prove correct runtime behavior without a live browser."
---

# Phase 4: Frontend Stability — Verification Report

**Phase Goal:** SPA przeżywa render-time errors z czytelnym fallbackiem, credential forms idą przez wspólny driver, `game-view.tsx` rozbity na sensownie nazwane komponenty, regression-tests pinują dwa niedawne bugi
**Verified:** 2026-05-15
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|---------|
| 1 | Uncaught render error does NOT blank the SPA — global ErrorBoundary in main.tsx shows fallback UI with "Załaduj ponownie" button (SC1/FE-01) | ✓ VERIFIED | `error-boundary.tsx` has `class ErrorBoundary extends Component`, `getDerivedStateFromError`, `componentDidCatch`, `AppErrorFallback` with "Coś poszło nie tak" + two buttons using `window.location.assign`. `main.tsx` mounts `<ErrorBoundary fallback={<AppErrorFallback />}>` around `<RouterProvider>` between `<QueryClientProvider>` and `<Toaster>`. |
| 2 | `login.tsx` and `register.tsx` use shared `useCredentialsForm` hook; no `new FormData` duplication in the pages themselves (SC2/FE-02) | ✓ VERIFIED | Both pages import and use `useCredentialsForm`. `grep -c 'new FormData'` = 0 in both pages. FormData lives only in `use-credentials-form.ts`. |
| 3 | Action dropdown in game-view uses Radix `@radix-ui/react-dropdown-menu` — no hand-rolled click-outside (SC3/FE-03) | ✓ VERIFIED | `game-view-actions.tsx` imports from `@/components/ui/dropdown-menu` (Radix wrapper). Zero `addEventListener.*mousedown` in `game-view.tsx` and `game-view-actions.tsx`. |
| 4 | `game-view.tsx` split into header/actions/fields components each <250 LOC; URL state and mutation behavior preserved (SC4/FE-04) | ✓ VERIFIED | Orchestrator = 151 LOC, header = 77, actions = 81, fields = 211, fields-grid = 241 (extracted sibling per deviation #1 in SUMMARY). All <250 LOC cap. `<GameViewHeader>`, `<GameViewActions>`, `<GameViewFields>` all wired in orchestrator. |
| 5 | Inline SVGs removed from `game-view.tsx` — migrated to `Icon.disc`, `Icon.download`, `Icon.edit` (reuses `Icon.trash`) in icons registry (SC5/FE-05) | ✓ VERIFIED | `grep -c '<svg' apps/client/src/pages/game-view.tsx` = 0. `Icon.disc`, `Icon.download`, `Icon.edit` all present in `icons.tsx`. `game-view-fields-grid.tsx` (extracted sibling) uses `Icon.disc` and `Icon.download`. |
| 6 | Regression tests fail if `await refetchSession()` is moved after `navigate()` or if controlled `value={}` is added to credential inputs (SC6/FE-06) | ✓ VERIFIED | `login.test.tsx` and `register.test.tsx` pass 10/10 with 26 expect() calls. Tests use `source.search()` to assert `refetchIdx < navigateIdx`. `value={}` negations confirmed. |

**Score:** 6/6 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `apps/client/src/components/error-boundary.tsx` | ErrorBoundary class + AppErrorFallback | ✓ VERIFIED | 65 LOC, named exports only, class with getDerivedStateFromError + componentDidCatch, structured log payload, two assign() buttons |
| `apps/client/src/main.tsx` | ErrorBoundary wrapping RouterProvider | ✓ VERIFIED | Lines 73-75: ErrorBoundary > RouterProvider, Toaster sibling outside boundary on line 76 |
| `apps/client/src/hooks/use-credentials-form.ts` | Auth-agnostic FormData driver hook | ✓ VERIFIED | 97 LOC, named exports: useCredentialsForm, UseCredentialsFormArgs, UseCredentialsFormReturn, CredentialField; no signIn/signUp/navigate |
| `apps/client/src/pages/login.tsx` | Uses useCredentialsForm + signIn.email + refetchSession-before-navigate | ✓ VERIFIED | refetchIdx=987 < navigateIdx=1100 |
| `apps/client/src/pages/register.tsx` | Uses useCredentialsForm + signUp.email + refetchSession-before-navigate | ✓ VERIFIED | refetchIdx=1385 < navigateIdx=1415 |
| `apps/client/src/pages/__tests__/login.test.tsx` | FE-06 source-pin tests (5 cases) | ✓ VERIFIED | describe('LoginPage source-pin convention — FE-06'), readFileSync, refetchIdx ordering pin |
| `apps/client/src/pages/__tests__/register.test.tsx` | FE-06 source-pin tests (5 cases) | ✓ VERIFIED | describe('RegisterPage source-pin convention — FE-06'), analogous structure |
| `apps/client/src/components/ui/dropdown-menu.tsx` | shadcn Radix DropdownMenu wrapper | ✓ VERIFIED | 89 LOC, DropdownMenuPrimitive wired |
| `apps/client/src/components/icons.tsx` | Extended with disc, download, edit | ✓ VERIFIED | All three new entries present alongside existing Icon.trash |
| `apps/client/src/components/game-view/game-view-header.tsx` | Header region <250 LOC | ✓ VERIFIED | 77 LOC |
| `apps/client/src/components/game-view/game-view-actions.tsx` | Radix dropdown + wishlist button <250 LOC | ✓ VERIFIED | 81 LOC |
| `apps/client/src/components/game-view/game-view-fields.tsx` | Left panel + notes <250 LOC | ✓ VERIFIED | 211 LOC |
| `apps/client/src/components/game-view/game-view-fields-grid.tsx` | Grid helpers sibling (deviation) <250 LOC | ✓ VERIFIED | 241 LOC; extracted per deviation #1 in SUMMARY-03 to keep fields.tsx under cap |
| `apps/client/src/pages/game-view.tsx` | Orchestrator <250 LOC | ✓ VERIFIED | 151 LOC (was 669) |
| `apps/client/src/lib/api.ts` | 5 mutation fns accept optional idempotencyKey arg | ✓ VERIFIED | `idempotencyKey ?? newIdempotencyKey()` fallback present; createGame, createWishlistItem, uploadCover, moveToCollection, importData all refactored |
| `apps/client/src/lib/queries.ts` | 4 mutation hooks with useRef idempotency-key caching | ✓ VERIFIED | useRef(newIdempotencyKey()) in all 4 hooks; reset count ≥ 4 in onSuccess |
| `apps/client/src/hooks/use-igdb-integration.ts` | 2 IGDB hooks with useRef caching | ✓ VERIFIED | idempotencyKeyRef present in both hooks, reset on success |
| `apps/client/src/hooks/use-import.ts` | Out-of-scope decision comment | ✓ VERIFIED | "Plan 04-04" and "single-shot" comments present; no idempotencyKeyRef leaked |
| `apps/client/src/components/settings/igdb-integration-card.tsx` | Call-site no longer generates inline UUID | ✓ VERIFIED | No `crypto.randomUUID()` or `newIdempotencyKey()` at call site; disabled={...isPending} convention preserved |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `main.tsx` | `error-boundary.tsx` | named import + JSX wrap | ✓ WIRED | import { AppErrorFallback, ErrorBoundary } line 2; ErrorBoundary wraps RouterProvider lines 73-75 |
| `error-boundary.tsx` | componentDidCatch structured log | console.error with event: 'render.error.boundary' | ✓ WIRED | `render.error.boundary` string confirmed |
| `AppErrorFallback` | `window.location.assign('/')` | primary Button onClick | ✓ WIRED | `window.location.assign` present; `window.location.reload` absent |
| `AppErrorFallback` | `window.location.assign('/login')` | secondary Button onClick | ✓ WIRED | confirmed present |
| `login.tsx` | `use-credentials-form.ts` | named import | ✓ WIRED | import { useCredentialsForm } from '@/hooks/use-credentials-form' |
| `register.tsx` | `use-credentials-form.ts` | named import | ✓ WIRED | same pattern |
| `login.tsx` (onSubmit) | navigate() | await refetchSession() BEFORE navigate | ✓ WIRED | source index check: refetchIdx 987 < navigateIdx 1100 |
| `register.tsx` (onSubmit) | navigate() | await refetchSession() BEFORE navigate | ✓ WIRED | refetchIdx 1385 < navigateIdx 1415 |
| `login.test.tsx` | `login.tsx` | readFileSync source-pin | ✓ WIRED | readFileSync(resolve(__dirname, '../login.tsx')) |
| `register.test.tsx` | `register.tsx` | readFileSync source-pin | ✓ WIRED | readFileSync(resolve(__dirname, '../register.tsx')) |
| `game-view-actions.tsx` | `@/components/ui/dropdown-menu` | named import | ✓ WIRED | from '@/components/ui/dropdown-menu' confirmed |
| `game-view.tsx (GameViewBody)` | `game-view-header.tsx` | `<GameViewHeader` | ✓ WIRED | confirmed |
| `game-view.tsx (GameViewBody)` | `game-view-actions.tsx` | `<GameViewActions` | ✓ WIRED | confirmed |
| `game-view.tsx (GameViewBody)` | `game-view-fields.tsx` | `<GameViewFields` | ✓ WIRED | confirmed |
| `game-view-actions.tsx` | Icon.edit + Icon.trash | from @/components/icons | ✓ WIRED | `Icon.(edit\|trash)` confirmed |
| `game-view-fields-grid.tsx` | Icon.disc + Icon.download | from @/components/icons | ✓ WIRED | Icon.disc and Icon.download in fields-grid.tsx (SVGs migrated there per deviation #1) |
| `queries.ts` mutation hooks | `api.ts` mutation fns | idempotencyKey: idempotencyKeyRef.current | ✓ WIRED | All 4 hooks pass idempotencyKeyRef.current to createGame/createWishlistItem/uploadCover/moveToCollection |
| `use-igdb-integration.ts` hooks | `api.ts` saveIgdbIntegration/deleteIgdbIntegration | idempotencyKey from useRef | ✓ WIRED | idempotencyKeyRef.current passed in both IGDB hooks |

### Data-Flow Trace (Level 4)

Not applicable — Phase 4 changes are client-side form drivers, error boundaries, and UI component refactors. No new data-rendering pipelines were introduced. The mutation hook refactor is a behavioral-correctness change to an existing wired path.

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| FE-06 source-pin tests pass | `bun test apps/client/src/pages/__tests__/login.test.tsx apps/client/src/pages/__tests__/register.test.tsx` | 10 pass, 0 fail, 26 expect() calls | ✓ PASS |
| ErrorBoundary class structure | `grep -q "class ErrorBoundary extends Component" ...` | match | ✓ PASS |
| No inline SVG in game-view.tsx | `grep -c '<svg' apps/client/src/pages/game-view.tsx` | 0 | ✓ PASS |
| No hand-rolled mousedown in game-view | `grep -c 'addEventListener.*mousedown' game-view.tsx` | 0 | ✓ PASS |
| All game-view components <250 LOC | `wc -l` on all 5 game-view files | max=241 (fields-grid) | ✓ PASS |
| idempotencyKeyRef in all 4 queries.ts hooks | per-hook awk check | all 4 hooks match | ✓ PASS |
| onSuccess reset count in queries.ts | `grep -c 'idempotencyKeyRef.current = newIdempotencyKey'` | 4 | ✓ PASS |

### Probe Execution

No probes declared or applicable for this phase.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|---------|
| FE-01 | 04-01 | Global ErrorBoundary wraps RouterProvider; fallback UI with reload button | ✓ SATISFIED | error-boundary.tsx + main.tsx fully wired; behavioral smoke deferred to human verification |
| FE-02 | 04-02 | useCredentialsForm hook extracts login/register shared pattern; no FormData duplication | ✓ SATISFIED | hook exists, both pages use it, no FormData in pages |
| FE-03 | 04-03 | Radix dropdown-menu replaces hand-rolled click-outside | ✓ SATISFIED | game-view-actions.tsx imports shadcn wrapper; no mousedown listener |
| FE-04 | 04-03 | game-view.tsx decomposed into 3 named components each <250 LOC | ✓ SATISFIED | 4 component files all under cap (deviation: extra fields-grid sibling keeps files within constraint) |
| FE-05 | 04-03 | Inline SVGs in game-view.tsx moved to Icon registry | ✓ SATISFIED | SVG count=0 in game-view.tsx; Icon.disc/download/edit added |
| FE-06 | 04-02 | Regression tests pin refetchSession-before-navigate and uncontrolled inputs | ✓ SATISFIED | 10/10 tests pass; ordering and no-value= pins confirmed |
| T-04-21 (supplementary) | 04-04 | Idempotency-key cached per mutation instance via useRef | ✓ SATISFIED (code) | All 6 hooks refactored; behavioral verification (DevTools Network retry test) deferred to human |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `apps/client/src/pages/game-view.tsx` | (pre-existing) | `alert('Failed to delete: ...')` | ℹ️ Info | Pre-existing before Phase 4; explicitly preserved as out-of-scope per plan (FE-V2-01 backlog). Not a Phase 4 regression. |

No TBD/FIXME/XXX debt markers found in any Phase 4 modified files.

### Human Verification Required

#### 1. ErrorBoundary Live Smoke (FE-01 / SC1)

**Test:** Temporarily add `if (location.search.includes('boom')) throw new Error('synthetic render error')` at the top of `apps/client/src/pages/games.tsx`. Visit `http://localhost:5173/games?boom`.
**Expected:** Fallback UI renders (white background, "Coś poszło nie tak.", two buttons "Załaduj ponownie" + "Wróć do logowania"). Clicking "Załaduj ponownie" changes URL to `/` (not reload on same URL). Clicking "Wróć do logowania" navigates to `/login`. DevTools console shows `[ErrorBoundary] { event: 'render.error.boundary', error, componentStack }` (twice in StrictMode dev — expected). No error.message or componentStack visible in DOM. Remove the throw before committing.
**Why human:** Render-error interception and fallback rendering require a running React app in a browser.

#### 2. Login/Register Autofill + Session Sequence (FE-02 / FE-06)

**Test:** Open `http://localhost:5173/login` in a browser with a saved password. Observe whether password manager offers autofill immediately. Submit and watch DevTools Network panel.
**Expected:** Password manager autofills email+password without requiring manual field interaction. Network sequence after submit: `POST /api/auth/sign-in/email` (200) → `GET /api/auth/get-session` → redirect to `/games`. No bounce from `/games` back to `/login`.
**Why human:** Browser autofill behavior and DevTools Network sequence require a live browser with a real credential store.

#### 3. game-view Dropdown Keyboard Nav + Visual Parity (FE-03/FE-04/FE-05 / SC3/SC4/SC5)

**Test:** Open any owned game at `/games/:id`. (A) Click the actions dropdown trigger. (B) Press Escape — confirm it closes. (C) Tab focus to trigger, press Enter to open, ArrowDown/ArrowUp to cycle, Enter to activate Edit. (D) Open, click Delete, confirm AlertDialog appears, press Cancel — confirm focus returns to the dropdown trigger. (E) Open a wishlist item at `/wishlist/:id` — confirm "Move to collection" button AND dropdown are both visible. (F) Inspect dropdown DOM — confirm `role="menu"` on the menu element. (G) Verify visual parity: covers render, badge colors correct, FormatChip shows disc/download icon. (H) Run `cd apps/client && bunx vite build --mode production`.
**Expected:** All keyboard navigation works via Radix primitives. role="menu" in DOM. No hand-rolled click-outside code active. Build completes without errors. Visual regression: FormatChip icon size may differ from original 24x24 (16x16 stroke-1.4 accepted per plan deviation).
**Why human:** Keyboard navigation, focus management, ARIA role DOM inspection, visual parity, and production build require a browser and build tool invocation.

#### 4. Idempotency-Key useRef Retry Deduplication (T-04-21)

**Test:** Open DevTools Network panel. Click "Add game", fill title, save. Record the `Idempotency-Key` UUID in the POST header. Set Network throttle to "Offline", attempt another add-game, save (fails). Restore network — TanStack Query `retry: 1` should replay. Check the retry POST's `Idempotency-Key`.
**Expected:** Retry carries the SAME UUID as the first attempt. Subsequent successful mutation (next user click) uses a DIFFERENT UUID (onSuccess reset worked).
**Why human:** useRef caching verification requires observing HTTP request headers across retry scenarios in a live DevTools Network panel.

### Gaps Summary

No gaps. All 6 ROADMAP success criteria are verified at the code level. Four items require human verification (browser smoke tests) before the phase can be marked fully passed in user-acceptance terms. These are quality-assurance gates, not code defects — the implementations are complete and correctly wired.

---

_Verified: 2026-05-15_
_Verifier: Claude (gsd-verifier)_
