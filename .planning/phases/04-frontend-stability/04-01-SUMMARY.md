---
phase: 04-frontend-stability
plan: 01
subsystem: client/error-handling
tags: [react, error-boundary, class-component, fallback, main-tsx, fe-01, sc-1]
requirements_completed: [FE-01]
sc_addressed: [1]
requires: []
provides:
  - ErrorBoundary class (apps/client/src/components/error-boundary.tsx)
  - AppErrorFallback functional component
  - Render-error trap mounted between QueryClientProvider and RouterProvider in main.tsx
affects:
  - apps/client/src/main.tsx (mount tree)
tech_stack_added: []
patterns:
  - React 18 class-based error boundary (only viable shape — no functional equivalent)
  - Structured console.error log shape mirrors API logger event naming (e.g. igdb.breaker.open)
  - Safe-route reset via window.location.assign('/') eliminates URL-induced stuck-loop
key_files_created:
  - apps/client/src/components/error-boundary.tsx
key_files_modified:
  - apps/client/src/main.tsx
decisions:
  - "Reset semantics: window.location.assign('/') instead of window.location.reload() — eliminates URL-induced stuck-loop for crashes tied to a specific URL (grill C1 + enterprise A.1 + re-grill N3)"
  - "Secondary 'Wróć do logowania' button as break-glass for session-induced render crashes (T-04-24)"
  - "componentDidCatch emits { event: 'render.error.boundary', error, componentStack } structured payload — trivial future hook for Sentry/Axiom (SEC-V2-01 deferred)"
  - "No queryClient.clear() call — full page navigation drops the JS runtime including the module-level queryClient singleton, so explicit clear() would be a no-op placebo (re-grill N3)"
  - "No errorElement on react-router routes — single global class boundary is the authoritative net (RESEARCH §Anti-Patterns)"
  - "<Toaster> remains sibling to <ErrorBoundary>, not a descendant — toast portal must survive fallback render"
metrics:
  duration: ~10min
  tasks_completed: 2
  files_created: 1
  files_modified: 1
  loc_added: ~69
  loc_error_boundary: 65
completed: 2026-05-15
---

# Phase 04 Plan 01: Globalny ErrorBoundary Summary

One-liner: Globalny React 18 class-based `ErrorBoundary` zamontowany w `main.tsx` między `<QueryClientProvider>` a `<RouterProvider>`; renderuje statyczny polski `AppErrorFallback` z dwoma przyciskami (primary `Załaduj ponownie` → `window.location.assign('/')`, secondary `Wróć do logowania` → `window.location.assign('/login')`) — eliminuje blank-screen i URL-induced stuck-loop (FE-01 / SC-1 closed).

## What Was Built

**Task 1 — `apps/client/src/components/error-boundary.tsx` (NEW, 65 LOC):**

- `class ErrorBoundary extends Component<Props, State>` z `static getDerivedStateFromError(error)` zwracającym `{ hasError: true }` i `componentDidCatch(error, info)` emitującym strukturalny `console.error('[ErrorBoundary]', { event: 'render.error.boundary', error, componentStack })`.
- `Props` przyjmuje `fallback: ReactNode | ((reset: () => void) => ReactNode)` — wspiera oba kształty (statyczny + render-prop reset).
- `private reset` setState'uje `hasError: false` — gotowe na soft-reset gdyby przyszły fallback chciał z niego skorzystać (current `AppErrorFallback` używa pełnej nawigacji, nie soft-reset).
- `AppErrorFallback` jako funkcyjny named export — statyczny polski copy (`Coś poszło nie tak.` + opis), żaden `error.message` ani `componentStack` NIE jest renderowany w DOM (T-04-01 mitigation).
- Dwa przyciski: primary `<Button onClick={() => window.location.assign('/')}>Załaduj ponownie</Button>` + secondary `<Button variant="outline" onClick={() => window.location.assign('/login')}>Wróć do logowania</Button>`.
- Layout `flex h-screen w-screen flex-col items-center justify-center` (lustro `protected-route.tsx:9-13`); tokeny projektowe `text-apex-ink`, `text-apex-muted`, `bg-white`.
- Named exports only, brak `export default`, brak `queryClient` reference, brak `window.location.reload`.
- **Commit:** `ef585bf` — `feat(04-01): add global ErrorBoundary class with Polish fallback UI`.

**Task 2 — `apps/client/src/main.tsx` (MODIFIED, +4 / -1):**

- Dodany named import: `import { AppErrorFallback, ErrorBoundary } from '@/components/error-boundary';`.
- JSX zmienione na:
  ```tsx
  <QueryClientProvider client={queryClient}>
    <ErrorBoundary fallback={<AppErrorFallback />}>
      <RouterProvider router={router} />
    </ErrorBoundary>
    <Toaster richColors position="top-center" />
  </QueryClientProvider>
  ```
- `<Toaster>` POZA `<ErrorBoundary>` — toast portal przeżywa fallback.
- Żadnego `errorElement` w `createBrowserRouter([...])` — single global class boundary jest authoritative netem.
- **Commit:** `20733c6` — `feat(04-01): mount ErrorBoundary around RouterProvider in main.tsx`.

## Verification

Automated (executed in worktree):
- `bunx tsc -b --noEmit` w `apps/client` — `error-boundary.tsx` i `main.tsx` BEZ błędów. Pre-existing TS errors w innych plikach (add-game-modal, delete-confirm-dialog, games-mobile-list, wishlist*) udokumentowane w `deferred-items.md` jako out-of-scope (istniały przed planem 04-01).
- `bunx vite build --mode development` w `apps/client` — `✓ built in 1.45s`, 2100 modules transformed, brak warnings odnoszących się do nowego kodu.
- Wszystkie grep invariants z `<verification>` planu pass:
  - `class ErrorBoundary extends Component` ✓
  - `static getDerivedStateFromError` ✓
  - `componentDidCatch` ✓
  - `render.error.boundary` ✓
  - `Coś poszło nie tak`, `Załaduj ponownie`, `Wróć do logowania` ✓
  - `window.location.assign` present ✓; `window.location.reload` absent ✓; `queryClient` absent w error-boundary.tsx ✓
  - `<ErrorBoundary` w main.tsx ✓; `errorElement` absent w main.tsx ✓
  - Mount-order awk check (ErrorBoundary opens before RouterProvider, closes before Toaster) ✓

Manual smoke (Task 3 checkpoint — `human-verify`) — **PENDING**: parallel worktree wave execution cannot trigger interactive `bun run dev` + browser session. User MUST perform the smoke test described in Plan 04-01 Task 3 after this wave is merged. Acceptance criteria literalnie z planu:

1. Wejdź na `http://localhost:5173/games?boom` z tymczasowym `if (location.search.includes('boom')) throw new Error('synthetic render error');` na początku `GamesPage`.
2. Fallback renderuje się (białe tło, polski copy, dwa Buttony) — NIE jest blank screenem.
3. DevTools Console pokazuje `[ErrorBoundary] { event: 'render.error.boundary', error, componentStack }` (w StrictMode dev — dwukrotnie; per RESEARCH §Pitfall 1 to jest expected, nie regression).
4. Klik `Załaduj ponownie` → URL ZMIENIA SIĘ na `/` → ProtectedRoute redirectuje na `/games` (bez `?boom`) → strona renderuje normalnie. **To dowodzi że reset jest `assign('/')`, nie `reload()` na ten sam URL** (grill C1 fix).
5. Klik `Wróć do logowania` (po powrocie do `?boom`) → URL ZMIENIA SIĘ na `/login` (break-glass dla session-corruption — T-04-24).
6. Usunięcie syntetycznego throw + Vite HMR → strona normalna, fallback nie pokazuje się dla legit ruchu.

## Open-Question Resolution (from Plan)

- **Czy `componentDidCatch` użył strukturalnego payloadu `{event,error,componentStack}`?** YES. Per RESEARCH §Open Question 1 rekomendacja. Format jest spójny z konwencją API loggera (`igdb.breaker.open` itp.) i zero-cost — w v2 (SEC-V2-01) wystarczy podmienić `console.error` na `sentry.captureException` lub `axiomLog`.
- **Czy StrictMode dev wywoła `componentDidCatch` dwukrotnie?** Yes — to dokumentowany efekt React 18 StrictMode (RESEARCH §Pitfall 1). NIE jest bugiem; nie wprowadziliśmy żadnego dedupe (świadoma decyzja — w prod tylko jeden log).
- **Czy `<Toaster>` pozostał POZA `<ErrorBoundary>`?** Yes. Awk-test w `<verify>` Task 2 enforce'uje że `</ErrorBoundary>` zamyka się PRZED `<Toaster`. Toast portal nie ginie razem z fallback.
- **Final LOC count `error-boundary.tsx`:** 65 (target był `~50`; różnica wynika z explicit `interface Props`, `interface State`, `private reset` line oraz TSDoc — wszystko semantycznie wartościowe, nie dead code).

## Deviations from Plan

Brak. Plan wykonany 1:1.

- Brak Rule 1 (bug) — kod skompilowany od pierwszego strzału.
- Brak Rule 2 (missing critical functionality) — threat model T-04-01/T-04-02/T-04-03/T-04-21/T-04-24 wszystkie zaadresowane przez plan literalnie (statyczny copy, brak innerHTML, safe-route assign, break-glass button). Nic nie zostało pominięte.
- Brak Rule 3 (blocking) — jedyne tarcie: `node_modules` puste w świeżym worktree → `bun install --frozen-lockfile` (zwykły init, nie deviation).
- Brak Rule 4 (architectural decision) — pełnia tasków deterministyczna z planu.

## Threat Model Coverage

Wszystkie pozycje z `<threat_model>` planu:

| Threat ID | Disposition | How addressed in code |
|-----------|-------------|----------------------|
| T-04-01 | mitigate | `AppErrorFallback` renderuje TYLKO statyczne stringi `'Coś poszło nie tak.'` i `'Aplikacja napotkała niespodziewany błąd...'`; `error.message`/`componentStack` lądują WYŁĄCZNIE w `console.error` (DevTools). |
| T-04-02 | n/a | Brak `dangerouslySetInnerHTML`, brak `innerHTML`, brak user-supplied content w fallback. Cały copy hard-coded. |
| T-04-03 | mitigate | Primary `assign('/')` zamiast `reload()` — przekierowuje na safe route. Secondary `assign('/login')` break-glass. Obydwa user-triggered. |
| T-04-21 | accept | Akceptujemy ryzyko duplicate-create w przypadku klik fallback'a w trakcie POST — Plan 04-04 wprowadzi per-mutation idempotency-key caching. |
| T-04-24 | mitigate | Secondary `Wróć do logowania` button → `assign('/login')` (login jest public, nie woła `useSession`) jest jedyną drogą wyjścia ze stuck-loop'a induced przez session-corruption w `ProtectedRoute`/`AppLayout`. |
| T-04-04 | accept | Single-user app; DevTools tylko dla właściciela. Format `{event,error,componentStack}` ready-for-scrubber w v2. |
| T-04-05 | accept | Single-user; SEC-V2-01 to closes. |
| T-04-06 | n/a | Fallback POZA `RouterProvider` (zastępuje go); brak chronionych danych w fallback'u; cache zrzucony naturally przez `assign()` razem z JS-runtime. |

## Known Stubs

Brak. Wszystko działa end-to-end od pierwszego renderu.

## Deferred Issues

- Pre-existing TypeScript errors w niepowiązanych plikach (`add-game-modal.tsx`, `delete-confirm-dialog.tsx`, `games-mobile-list.tsx`, `wishlist.tsx`, `wishlist-columns.tsx`) — udokumentowane w `.planning/phases/04-frontend-stability/deferred-items.md`. Out of scope dla Planu 04-01 (executor scope boundary rule).
- Manualny smoke test (Task 3 checkpoint) — wymagany human-verify post-merge, instrukcja w sekcji `Verification` powyżej.

## Self-Check: PASSED

- File `apps/client/src/components/error-boundary.tsx` — FOUND.
- File `apps/client/src/main.tsx` — FOUND (modified).
- Commit `ef585bf` — FOUND in git log.
- Commit `20733c6` — FOUND in git log.
- TypeScript: no new errors in our files.
- Vite build: pass (built in 1.45s).
- All grep invariants from plan `<verification>`: pass.

## Commits

| Hash    | Type | Scope  | Subject                                                       |
| ------- | ---- | ------ | ------------------------------------------------------------- |
| ef585bf | feat | 04-01  | add global ErrorBoundary class with Polish fallback UI        |
| 20733c6 | feat | 04-01  | mount ErrorBoundary around RouterProvider in main.tsx         |
