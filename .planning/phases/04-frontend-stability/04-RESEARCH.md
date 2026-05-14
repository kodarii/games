# Phase 4: Frontend Stability — Research

**Researched:** 2026-05-14
**Domain:** React 18 SPA stabilization (error boundary, form-driver hook extraction, component decomposition, Radix dropdown migration, regression tests)
**Confidence:** HIGH

## Summary

Phase 4 to czysto frontendowy refactor — żadnych nowych ficzerów, żadnych nowych zależności (`@radix-ui/react-dropdown-menu ^2.1.2` już w `package.json`). Sześć success criteria układa się w trzy semantyczne grupy: (1) **odporność na błędy renderu** (ErrorBoundary), (2) **dedup powtarzających się wzorców** (`useCredentialsForm`, dekompozycja `game-view`, migracja inline SVG do `Icon`), (3) **regression-pin na bugach z MEMORY** (autofill + refetchSession). Wszystkie zmiany są lokalne dla `apps/client/src/` — backend bez zmian.

Dwie rzeczy do potwierdzenia w trakcie planowania: **(a)** dropdown shadcn primitive nie jest jeszcze w `components/ui/` (Radix dep TAK, plik shadcn NIE — instalacja przez shadcn CLI z manualnym mv per STATE quirk), **(b)** stack testów klienta to source-grep przez `bun:test` + `node:fs.readFileSync` — bez jsdom/RTL — co oznacza że regression test FE-06 jest pinem na zawartość source, nie behavioral.

**Primary recommendation:** Idź vertical-slice: jeden plan na grupę. (P1) ErrorBoundary + cleanup main.tsx → (P2) `useCredentialsForm` + regression tests dla login/register → (P3) dropdown migration + `game-view` dekompozycja + SVG extract. Każdy plan kończy się manualnym smoke UAT happy-path.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Render-error fallback (ErrorBoundary) | Browser / Client | — | Pure React lifecycle — jedyne miejsce gdzie można złapać render error w React 18 to class component w drzewie reactowym |
| Credential form driver (uncontrolled + FormData) | Browser / Client | — | DOM-natywne FormData; better-auth wywoływany z klienta (cookie-auth), żadnej logiki backendowej tu nie ma |
| Dropdown menu (keyboard nav, click-outside, escape) | Browser / Client | — | Radix Portal-based UI, czyste client-side a11y |
| `game-view` dekompozycja | Browser / Client | — | Refactor wewnątrz strony — bez zmian w API, repo, hookach danych |
| Inline SVG → Icon registry | Browser / Client | — | Pure presentation |
| Regression tests (source-pin) | Build / Test | — | `bun:test` w trybie source-grep — czyta pliki przez `node:fs`, bez render |

## Standard Stack

### Core (already installed — confirm, do not add)
| Library | Version (installed) | Latest | Purpose | Why Standard |
|---------|---------------------|--------|---------|--------------|
| react | ^18.3.1 | 19.2.6 [VERIFIED: npm registry 2026-05-14] | UI runtime, class-component ErrorBoundary | Project on 18.3, do NOT bump in this phase |
| react-router-dom | ^6.28.0 | 7.15.0 [VERIFIED: npm registry] | `createBrowserRouter` + `errorElement` route option | Project on v6 data-router API — `errorElement` is the v6 native error boundary |
| @radix-ui/react-dropdown-menu | ^2.1.2 | 2.1.16 [VERIFIED: npm registry] | Accessible dropdown primitive | Already present — shadcn-style wrapper required in `components/ui/dropdown-menu.tsx` (NOT YET INSTALLED) |
| bun:test | runtime built-in | — | Test runner | Project rule — no Jest/Vitest |
| sonner | ^1.7 | — | Toast (already wired in `main.tsx`) | Use for ErrorBoundary recovery toast if needed, but not required by SC1 |

### Supporting (already installed)
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @tanstack/react-query | ^5.99.2 | Cache state | Untouched in this phase — preserve query cache identity across error fallback |
| clsx + tailwind-merge (`cn`) | n/a | Class composition | Use in new components — convention is `cn()` from `@/lib/utils` |

### Alternatives Considered
| Instead of | Could Use | Tradeoff — Why Rejected |
|------------|-----------|-------------------------|
| Class-component ErrorBoundary | `react-error-boundary` library | Adds dep; project doesn't have it; class component is ~30 lines — not worth adding library [CITED: react.dev/reference/react/Component#catching-rendering-errors-with-an-error-boundary] |
| React Router v6 `errorElement` on every route | Single class ErrorBoundary wrapping `<RouterProvider>` in `main.tsx` | SC1 mandates `main.tsx`-level boundary. `errorElement` only catches errors during route data loading/action, NOT arbitrary render errors in deep children [CITED: reactrouter.com/6.30.3/route/error-element]. Use class component AS the outer boundary; `errorElement` is complementary but optional in this phase |
| `react-hook-form` for `useCredentialsForm` | Lightweight custom hook | RHF re-introduces controlled inputs by default — kills autofill (MEMORY rule). Custom hook stays uncontrolled-first |
| Headless UI / Reach UI for dropdown | Radix | Project already standardizes on Radix; `@radix-ui/react-dropdown-menu` is already a dep |
| Manual SVG `<svg>` inline in components | `Icon.x` registry | Project convention — `icons.tsx` is the single registry; reduces visual noise in `game-view.tsx` |

**Installation:** No new packages. ONE shadcn wrapper file to add:

```bash
# From apps/client/
npx shadcn@latest add dropdown-menu
# WARNING per STATE.md "Plan 01-01 shadcn CLI workspace quirk":
# files land at apps/client/@/components/ui/, manual `mv` required to apps/client/src/components/ui/
mv apps/client/@/components/ui/dropdown-menu.tsx apps/client/src/components/ui/
rm -rf apps/client/@
```

**Version verification:** `npm view @radix-ui/react-dropdown-menu version` → `2.1.16` (installed: `2.1.2` via caret — `^2.1.2` resolves to current latest within `2.x.x`, sufficient).

## Architecture Patterns

### System Architecture Diagram

```text
Request enters SPA (/login, /register, /games/:id)
        │
        ▼
ReactDOM.createRoot(...).render
        │
        ▼
<StrictMode>
    │
    ▼
<QueryClientProvider>
    │
    ▼
<ErrorBoundary fallback={<AppErrorFallback />}>   ← NEW (SC1)
    │
    ▼
<RouterProvider router={router}>
    │
    ├── /login, /register  →  AuthLayout → LoginPage / RegisterPage
    │                                          │
    │                                          ▼
    │                                  useCredentialsForm({...}) ← NEW (SC2)
    │                                          │
    │                                  uncontrolled <Input/> + FormData
    │                                          │
    │                                  signIn.email / signUp.email
    │                                          │
    │                                  await refetchSession() ← PINNED (SC6 regression)
    │                                          │
    │                                  navigate(target)
    │
    └── /games/:id, /wishlist/:id → ProtectedRoute → AppLayout → GameViewPage
                                                                       │
                                                                       ▼
                                                             ┌─ GameViewHeader   ← NEW (SC4)
                                                             ├─ GameViewActions  ← NEW (SC4)
                                                             │      │
                                                             │      └─ <DropdownMenu> ← NEW (SC3, Radix)
                                                             └─ GameViewFields   ← NEW (SC4)
                                                                    │
                                                                    └─ Icon.{edit,trash,disc,download} ← MOVED (SC5)
                                                                                 │
                                                                                 ▼
                                                                       icons.tsx registry

Any render error in subtree → ErrorBoundary.getDerivedStateFromError → fallback UI
        │
        ▼
"Załaduj ponownie" button → window.location.reload()
```

### Recommended Project Structure

```
apps/client/src/
├── components/
│   ├── error-boundary.tsx         # NEW — class component + fallback
│   ├── icons.tsx                  # EXTEND — add edit, trash, disc, download
│   ├── ui/
│   │   └── dropdown-menu.tsx      # NEW — shadcn wrapper around Radix
│   └── game-view/                 # NEW — folder co-locates decomposed children
│       ├── game-view-header.tsx
│       ├── game-view-actions.tsx
│       └── game-view-fields.tsx
├── hooks/
│   └── use-credentials-form.ts    # NEW — shared driver for login + register
├── pages/
│   ├── login.tsx                  # REFACTOR — uses useCredentialsForm
│   ├── register.tsx               # REFACTOR — uses useCredentialsForm
│   ├── game-view.tsx              # SHRINK — orchestrator <250 LOC, delegates to children
│   └── __tests__/                 # NEW
│       ├── login.test.tsx         # NEW — source-pin (SC6)
│       └── register.test.tsx      # NEW — source-pin (SC6)
└── main.tsx                       # WRAP — <ErrorBoundary> around <RouterProvider>
```

**Naming note:** Project convention prefers `__tests__/` over co-located for new tests (per CLAUDE.md). Existing `protected-route.test.tsx` is co-located — keep both patterns coexisting.

### Pattern 1: React 18 Class ErrorBoundary

**What:** Class component implementing `static getDerivedStateFromError` (sets fallback state) + `componentDidCatch` (logs). React 18 has NO function-component equivalent — class is the only path. React 19 does not change this.
**When to use:** As the outermost render-error trap; wraps the whole `<RouterProvider>` per SC1.
**Example** [CITED: react.dev/reference/react/Component#catching-rendering-errors-with-an-error-boundary]:

```tsx
// apps/client/src/components/error-boundary.tsx
import { type ErrorInfo, type ReactNode, Component } from 'react';

interface Props {
  fallback: ReactNode | ((reset: () => void) => ReactNode);
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(_error: Error): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Single-user, no Sentry — log to console only. v2 may add external sink (SEC-V2-01 deferred).
    console.error('[ErrorBoundary]', error, info.componentStack);
  }

  private reset = (): void => {
    this.setState({ hasError: false });
  };

  render(): ReactNode {
    if (this.state.hasError) {
      const { fallback } = this.props;
      return typeof fallback === 'function' ? fallback(this.reset) : fallback;
    }
    return this.props.children;
  }
}
```

Fallback UI per SC1 — komunikat + "Załaduj ponownie":

```tsx
function AppErrorFallback() {
  return (
    <div className="flex h-screen w-screen flex-col items-center justify-center gap-4 bg-white text-apex-ink">
      <h1 className="text-xl font-semibold">Coś poszło nie tak.</h1>
      <p className="max-w-md text-center text-sm text-apex-muted">
        Aplikacja napotkała niespodziewany błąd. Spróbuj odświeżyć stronę.
      </p>
      <Button onClick={() => window.location.reload()}>Załaduj ponownie</Button>
    </div>
  );
}
```

**Reset semantics decision:** `window.location.reload()` (full reload) — najbezpieczniejszy reset. Resetuje React tree + query cache + URL state hooków. SC1 mówi "przycisk Załaduj ponownie" — to literalne wymaganie pełnego reload. Soft reset (setState false) ma sens tylko wtedy gdy chcemy retry pojedynczego komponentu, czego SC1 nie wymaga.

### Pattern 2: Mount Location — `main.tsx` Outer Boundary vs React Router v6 `errorElement`

**Co łapie co:**
| Mechanism | Catches | Doesn't catch |
|-----------|---------|---------------|
| Class ErrorBoundary wrapping `<RouterProvider>` | Render errors anywhere in tree (including layouts, pages, descendants) | Async errors in event handlers, setTimeout, async loaders (must `throw` in render) |
| Route-level `errorElement` [CITED: reactrouter.com/6.30.3/route/error-element] | Errors thrown by `loader`/`action`/route module render | Not strictly needed since project doesn't use route loaders |

**Project doesn't use route `loader`/`action`** (data fetching goes through TanStack Query inside components, not via React Router data APIs). Therefore: **class ErrorBoundary in `main.tsx` is sufficient and required by SC1**. Do NOT add `errorElement` per-route — adds noise without coverage gain.

**Mount placement** — wrap INSIDE `<QueryClientProvider>` so the query client survives fallback render, OUTSIDE `<RouterProvider>` so router state errors are caught:

```tsx
// apps/client/src/main.tsx (after refactor)
<React.StrictMode>
  <QueryClientProvider client={queryClient}>
    <ErrorBoundary fallback={<AppErrorFallback />}>
      <RouterProvider router={router} />
    </ErrorBoundary>
    <Toaster richColors position="top-center" />
  </QueryClientProvider>
</React.StrictMode>
```

`<Toaster>` stays outside the boundary — never want a toast portal taken down by a page error.

### Pattern 3: `useCredentialsForm` — uncontrolled + FormData driver

**What:** Hook accepts a list of field descriptors + an async `onSubmit(values)` and returns `{ onSubmit, isPending, error, setError, fieldErrors, setFieldErrors }`. Form stays uncontrolled; inputs declare `name="..."` only. Driver extracts values via `new FormData(form)` inside the submit handler.
**When to use:** Login + register only. Don't generalize prematurely — Settings password form has different shape (already shipped with its own pattern; out of scope for FE-02).

**Signature:**

```tsx
// apps/client/src/hooks/use-credentials-form.ts
import { type FormEvent, useCallback, useState } from 'react';

export interface CredentialField {
  name: string;
  /** Optional client-side validator. Return string = error message, null/undefined = ok. */
  validate?: (value: string, all: Record<string, string>) => string | null | undefined;
}

export interface UseCredentialsFormArgs<T extends Record<string, string>> {
  fields: readonly CredentialField[];
  onSubmit: (values: T) => Promise<{ error?: string; fieldErrors?: Partial<Record<keyof T, string>> } | void>;
}

export interface UseCredentialsFormReturn<T> {
  handleSubmit: (e: FormEvent<HTMLFormElement>) => Promise<void>;
  isPending: boolean;
  error: string | null;
  fieldErrors: Partial<Record<keyof T, string>>;
  resetErrors: () => void;
}

export function useCredentialsForm<T extends Record<string, string>>(
  args: UseCredentialsFormArgs<T>,
): UseCredentialsFormReturn<T> {
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<keyof T, string>>>({});

  const resetErrors = useCallback(() => {
    setError(null);
    setFieldErrors({});
  }, []);

  const handleSubmit = useCallback(
    async (e: FormEvent<HTMLFormElement>): Promise<void> => {
      e.preventDefault();
      const form = e.currentTarget;
      const data = new FormData(form);

      // Build values map
      const values = {} as Record<string, string>;
      for (const f of args.fields) {
        values[f.name] = String(data.get(f.name) ?? '').trim();
      }

      // Run validators
      const errs: Record<string, string> = {};
      for (const f of args.fields) {
        if (!f.validate) continue;
        const msg = f.validate(values[f.name], values);
        if (msg) errs[f.name] = msg;
      }
      if (Object.keys(errs).length > 0) {
        setFieldErrors(errs as Partial<Record<keyof T, string>>);
        return;
      }

      resetErrors();
      setIsPending(true);
      const result = await args.onSubmit(values as T);
      setIsPending(false);

      if (result?.error) setError(result.error);
      if (result?.fieldErrors) setFieldErrors(result.fieldErrors);
    },
    [args, resetErrors],
  );

  return { handleSubmit, isPending, error, fieldErrors, resetErrors };
}
```

**Critical invariants (regression-pin in test):**
- Form values come from `new FormData(form)`, NOT React state (autofill rule from MEMORY).
- The hook does NOT inject `value=`/`onChange=` props onto inputs — caller renders bare `<Input name="..." />` without `value`.
- Caller awaits `refetchSession()` BEFORE `navigate(...)` (handled in the page's `onSubmit` callback, not in the hook — hook is auth-agnostic).

**Caller shape (login.tsx after refactor):**

```tsx
const { handleSubmit, isPending, error, fieldErrors } = useCredentialsForm({
  fields: [
    { name: 'email' },
    { name: 'password' },
  ],
  onSubmit: async ({ email, password }) => {
    const { error: signInError } = await signIn.email({ email, password });
    if (signInError) {
      return {
        error: signInError.code === 'INVALID_EMAIL_OR_PASSWORD'
          ? 'Invalid email or password.'
          : 'Something went wrong. Try again.',
      };
    }
    await refetchSession();                                        // MEMORY rule pinned
    const from = (location.state as { from?: string } | null)?.from ?? '/games';
    navigate(from, { replace: true });
  },
});
```

### Pattern 4: Radix DropdownMenu (shadcn wrapper)

**What:** shadcn CLI generates `apps/client/src/components/ui/dropdown-menu.tsx` — a thin wrapper exporting `DropdownMenu`, `DropdownMenuTrigger`, `DropdownMenuContent`, `DropdownMenuItem`, `DropdownMenuSeparator`, etc. (`DropdownMenu = DropdownMenuPrimitive.Root`).
**When to use:** Replace `ActionsDropdown` in `game-view.tsx`. Radix handles ALL of: keyboard nav (Arrow/Tab/Escape), click-outside, focus management, `role="menu"`, `aria-*` attributes — eliminating the hand-rolled `useEffect(() => addEventListener('mousedown'))` pattern currently in `game-view.tsx:85-92`.

**Example usage** [CITED: radix-ui.com/primitives/docs/components/dropdown-menu]:

```tsx
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

function ActionsDropdown({ onEdit, onDelete }: { onEdit: () => void; onDelete: () => void }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="flex h-8 w-8 items-center justify-center rounded-[7px] border border-apex-line-4 bg-white hover:bg-apex-surface-hover"
          aria-label="Actions"
        >
          <Icon.more size={15} className="text-apex-ink-6" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[160px]">
        <DropdownMenuItem onSelect={onEdit}>
          <Icon.edit size={13} className="mr-2" />
          Edit game
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={onDelete} className="text-[#e63946] focus:bg-[#fff5f5] focus:text-[#e63946]">
          <Icon.trash size={13} className="mr-2" />
          Delete game
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
```

**Why `asChild` on Trigger:** preserves existing styling on the `<button>`. shadcn default wrapper is `forwardRef` over `DropdownMenuPrimitive.Trigger`, so `asChild` delegates to child element.

### Pattern 5: `game-view.tsx` Decomposition

Current shape: **669 lines, single file**, contains:
- `FormatChip` (lines 35–73) — small leaf component
- `ActionsDropdown` (75–169) — hand-rolled, replace with Radix
- `FieldItem` (171–204) — leaf
- `SectionLabel` (206–212) — leaf
- `GameViewPage` (214–229) — wrapper, query + error gate
- `GameViewBody` (231–668) — the monster (437 lines on its own)

**Proposed split (each <250 LOC):**

```
pages/game-view.tsx              (orchestrator)
├── GameViewPage                 — useParams + useGameQuery + error gate (~30 LOC)
└── GameViewBody                 — useState (editMode, dialogs) + useGameDraft + mutations + layout shell (~150 LOC)
        │
        ├── <GameViewHeader />              — top bar: SidebarTrigger, breadcrumb (backLabel · liveTitle), edit-mode CTA buttons
        ├── <GameViewActions />             — wishlist "Move" button + <ActionsDropdown> (Radix)
        └── <GameViewFields />              — left panel cover/badges/format + right panel <dl> grid + notes textarea

components/game-view/
├── game-view-header.tsx        (~80 LOC)  — props: backPath, backLabel, liveTitle, editMode, onCancel, onSave, isSaving
├── game-view-actions.tsx       (~60 LOC)  — props: game.kind, onMove, onEdit, onDelete, isMovePending
└── game-view-fields.tsx        (~200 LOC) — props: game, draft, set, editMode, platforms, platformsLoading, onAddPlatform, notesRef
                                            — keeps FieldItem, SectionLabel, FormatChip as local sub-components OR extracts them too
```

**Critical invariants to preserve:**
- `useGameDraft(game)` returns `{ draft, set, reset, toPayload }` — must be called in `GameViewBody` (parent) and the `set`/`draft` flowed down to children. NOT duplicated.
- `useUrlState` — `game-view.tsx` currently does NOT use `useUrlState` (URL state lives on `/games` list page). Decomposition is risk-free here.
- Mutation hooks (`useUpdateGameMutation`, `useDeleteGameMutation`, `useMoveToCollectionMutation`) — keep them in `GameViewBody`; pass `mutate` callbacks down. Don't sprinkle `useMutation` calls in children.
- `notesRef` autosize effect (line 250–255) — stays in `GameViewBody` OR moves with `<GameViewFields>` (preferred — ref + effect colocated with the textarea it controls).
- `editMode`/`addPlatformOpen`/`deleteDialogOpen` state — in `GameViewBody`; modals (`<DeleteConfirmDialog>`, `<AddPlatformDialog>`) render at body level.

**Risk:** the cover image's left-panel `style={{ background: color-mix(...) }}` (line 364) is tightly coupled to `liveCoverColor`. Either:
- Move the entire left-panel into `<GameViewFields>` (recommended — it's a "field" in spirit, holds cover/status/format/rematch).
- Or split into `<GameViewLeftPanel>` (4th component — violates "3 components" wording in SC4).

**Decision:** put left-panel inside `<GameViewFields>` since the cover IS a field (editable in edit mode via `CoverColorPicker` + `UploadCoverButton`). Three-component target preserved.

### Pattern 6: Inline SVG → `Icon` registry

`game-view.tsx` has **3 inline `<svg>` blocks**:
1. **Disc icon** (physical format chip, lines 39–42): circle + inner circle — `Icon.disc` candidate.
2. **Download/cloud icon** (digital format chip, lines 44–68): polyline + line + path — `Icon.download` candidate.
3. **Pencil/edit icon** (dropdown Edit item, lines 117–130): pencil path — `Icon.edit` candidate.
4. **Trash icon** (dropdown Delete item, lines 142–162): trash bin — `Icon.trash` candidate. NOTE: `Icon.trash` already exists in `icons.tsx` (line 451) — REUSE, do not duplicate.

**Action items for `icons.tsx`:**
- Add `disc` (16x16 viewBox: two concentric circles — adapt from `coffee` icon style).
- Add `download` (or `cloudDown`) — 16x16 viewBox.
- Add `edit` (pencil over square — common shape).
- Reuse existing `trash` (already 16x16 stroke-based).

Use the existing `svg(children, vb)` factory pattern (line 11–25 in `icons.tsx`). Default viewBox `0 0 16 16` matches existing icons.

### Anti-Patterns to Avoid

- **Adding `errorElement` to every route** — bloat without benefit; project doesn't use loaders. ONE class ErrorBoundary in `main.tsx` is the entire story.
- **Generalizing `useCredentialsForm` to "useForm"** — out of scope. Only login + register. Settings password form already shipped with its own pattern.
- **Controlled inputs in login/register** — kills autofill (MEMORY). Hook MUST stay uncontrolled.
- **Skipping `await refetchSession()`** — guard-bounce bug (MEMORY). The regression test pins this.
- **Mocking better-auth in a regression test** — project test stack is source-grep only, no jsdom/RTL. Behavioral mock-based assertion is impossible here; use string-pin.
- **Hand-rolling click-outside after migrating to Radix** — Radix Portal + outside-click is built-in; don't keep the old `useEffect` for "safety". Delete it.
- **Touching `useGameDraft` while decomposing `game-view`** — pure refactor; do NOT change semantics of the draft hook or `toPayload`.
- **Inline `<svg>` left anywhere in `game-view.tsx` after SC5** — SC5 wording is absolute ("brak inline `<svg>`"). Every existing inline SVG must be moved.
- **shadcn CLI run from repo root** — STATE.md warns files land in `apps/client/@/components/ui/`. Run from `apps/client/` AND verify destination, then `mv` if needed.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Render-error trap | Function-component error catcher with try/catch around `<Children/>` | Class `ErrorBoundary` (React requires class — no hook equivalent in 18 OR 19) | Only `getDerivedStateFromError` + `componentDidCatch` can catch render-phase errors [CITED: react.dev] |
| Dropdown click-outside / Escape / focus return | `useEffect(addEventListener('mousedown'))` + manual `tabIndex` + manual Escape handler | `@radix-ui/react-dropdown-menu` (already a dep) | Radix handles outside-click via Portal collision, Escape, focus trap-and-return, `aria-haspopup`, `role="menu"`, arrow-key roving tabindex — all for free |
| Form value extraction | `useState` per input + onChange wiring + manual reset | `new FormData(e.currentTarget)` | Project rule (MEMORY): controlled inputs lose browser autofill until user interacts |
| Toast for global errors | Custom div in `main.tsx` | `sonner` already wired | Out of scope for SC1 — fallback is a static page, not a toast |
| Pending/disabled state | Manual `useState(isPending)` in each form | Hook-owned `isPending` returned by `useCredentialsForm` | Removes duplication; same shape as `useMutation` consumers expect |

**Key insight:** Every pattern in this phase has a built-in or already-installed solution. Phase 4 is mostly *deletion of hand-rolled code in favor of existing primitives* — net LOC should DECREASE.

## Common Pitfalls

### Pitfall 1: React 18 StrictMode double-invokes ErrorBoundary in dev
**What goes wrong:** `componentDidCatch` fires twice in development under `<React.StrictMode>`.
**Why it happens:** StrictMode intentionally double-renders to surface side-effect bugs.
**How to avoid:** Don't dedup errors in `componentDidCatch`. If you log to an external service, accept double-log in dev. Production won't double-fire.
**Warning signs:** "Why is my error console-log appearing twice?" — that's StrictMode, not a bug. [CITED: react.dev]

### Pitfall 2: ErrorBoundary outside QueryClientProvider loses cache after recovery
**What goes wrong:** If you wrap `<ErrorBoundary>` AROUND `<QueryClientProvider>`, a soft reset would remount the provider and nuke cache. With `window.location.reload()` (this phase's choice) the cache is wiped anyway — but the placement still matters for hypothetical soft reset.
**How to avoid:** Mount order: `StrictMode > QueryClientProvider > ErrorBoundary > RouterProvider`. Cache provider stays parent.
**Warning signs:** After fallback recovery, all queries refetch from scratch.

### Pitfall 3: Radix DropdownMenu inside a CSS `transform` ancestor positions wrong
**What goes wrong:** Radix uses `position: fixed` portal by default. If the trigger is inside an element with `transform: ...`, Floating UI's anchor math sometimes mispositions.
**How to avoid:** `game-view.tsx` header bar has NO transforms — confirmed safe. If positioning misbehaves, use `<DropdownMenuContent collisionPadding={8} sideOffset={4}>`.
**Warning signs:** Dropdown opens off-screen or in the corner.

### Pitfall 4: `e.currentTarget` becomes null in async handler
**What goes wrong:** Inside `async onSubmit`, after the first `await`, `e.currentTarget` is null because React pools synthetic events (mostly fixed in React 17+, but the pattern is still fragile).
**How to avoid:** Capture `e.currentTarget` synchronously BEFORE any `await`:
```tsx
const form = e.currentTarget;          // sync
const data = new FormData(form);       // sync
const email = String(data.get('email') ?? '');  // sync
setIsPending(true);
await signIn.email({...});             // async — form/data already captured
```
This is exactly what current `login.tsx:16-19` does — preserve the pattern in the hook.
**Warning signs:** "Cannot read properties of null (reading 'elements')" after submit.

### Pitfall 5: shadcn CLI workspace path quirk
**What goes wrong:** STATE.md decision log [Phase 1 plan 01-01]: shadcn CLI writes files to `apps/client/@/components/ui/dropdown-menu.tsx` (literal `@` directory), not `apps/client/src/components/ui/`.
**How to avoid:** After `npx shadcn@latest add dropdown-menu`, run `mv apps/client/@/components/ui/dropdown-menu.tsx apps/client/src/components/ui/ && rm -rf apps/client/@`. Verify the final path before committing.
**Warning signs:** `import { DropdownMenu } from '@/components/ui/dropdown-menu'` fails with "Cannot find module".

### Pitfall 6: `useCallback` deps including `args` object causes hook to recreate every render
**What goes wrong:** In `useCredentialsForm`, declaring `[args]` as `useCallback` dep recreates handler each render because parent passes a new object literal each render.
**How to avoid:** Either accept the recreation (cheap — handler is rarely re-bound to DOM in this design) OR destructure args at hook top and depend on individual primitives. For this phase, accept the recreation — it doesn't matter at form-submit cadence.
**Warning signs:** Excessive re-renders or "function changes every render" warnings in React DevTools.

### Pitfall 7: Test stack has no DOM — RTL/jsdom unavailable
**What goes wrong:** Tempting to write `render(<LoginPage />); fireEvent.submit(...)` — fails because there's no jsdom, no `@testing-library/react`, no DOM globals.
**How to avoid:** Follow `protected-route.test.tsx` precedent: `readFileSync(source)` + regex pin assertions. Manual UAT documented in plan for behavioral coverage.
**Warning signs:** `ReferenceError: document is not defined` when running tests.

### Pitfall 8: Decomposed children re-render too often if state lives in parent
**What goes wrong:** Lifting `editMode` to `GameViewBody` and passing as prop to `<GameViewFields>` re-renders ALL fields on every keystroke if `draft` is also passed.
**How to avoid:** This is acceptable in current design (no measurable perf issue). If it bites, memoize fields with `React.memo`, but DO NOT optimize prematurely — phase is refactor, not perf work.
**Warning signs:** Visible input lag on slow devices.

## Code Examples

### Mount ErrorBoundary in main.tsx (SC1)

```tsx
// apps/client/src/main.tsx — relevant excerpt after refactor
import { ErrorBoundary } from '@/components/error-boundary';
// ...
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <ErrorBoundary fallback={<AppErrorFallback />}>
        <RouterProvider router={router} />
      </ErrorBoundary>
      <Toaster richColors position="top-center" />
    </QueryClientProvider>
  </React.StrictMode>,
);
```

### useCredentialsForm wiring in login.tsx (SC2)

```tsx
// apps/client/src/pages/login.tsx — after refactor (~60 LOC target)
export function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { refetch: refetchSession } = useSession();

  const { handleSubmit, isPending, error, fieldErrors } = useCredentialsForm({
    fields: [{ name: 'email' }, { name: 'password' }],
    onSubmit: async ({ email, password }) => {
      const { error: signInError } = await signIn.email({ email, password });
      if (signInError) {
        return {
          error: signInError.code === 'INVALID_EMAIL_OR_PASSWORD'
            ? 'Invalid email or password.'
            : 'Something went wrong. Try again.',
        };
      }
      await refetchSession();
      const from = (location.state as { from?: string } | null)?.from ?? '/games';
      navigate(from, { replace: true });
    },
  });

  return (
    <div>
      <h1 className="text-2xl font-semibold text-apex-ink">Welcome back</h1>
      <p className="mt-2 text-sm text-apex-muted">Sign in to your Apex account.</p>
      {error && <div className="mt-6 ...">{error}</div>}
      <form onSubmit={handleSubmit} className="mt-8 space-y-4">
        <Input name="email" type="email" required autoComplete="email" />
        <Input name="password" type="password" required autoComplete="current-password" />
        <Button type="submit" disabled={isPending}>{isPending ? 'Signing in…' : 'Sign in'}</Button>
      </form>
    </div>
  );
}
```

### Source-pin regression test (SC6)

```tsx
// apps/client/src/pages/__tests__/login.test.tsx
import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('LoginPage regression — FE-06', () => {
  const source = readFileSync(resolve(__dirname, '../login.tsx'), 'utf-8');

  test('refetchSession is awaited BEFORE navigate (MEMORY: feedback_better_auth_session_refetch)', () => {
    // Both calls must be present AND in order
    const refetchIdx = source.search(/await\s+refetchSession\s*\(\s*\)/);
    const navigateIdx = source.search(/navigate\s*\(/);
    expect(refetchIdx).toBeGreaterThan(-1);
    expect(navigateIdx).toBeGreaterThan(-1);
    expect(refetchIdx).toBeLessThan(navigateIdx);
  });

  test('form uses uncontrolled inputs (FormData driver, no controlled useState) — MEMORY: feedback_react_autofill_uncontrolled', () => {
    // useCredentialsForm hook is imported and used
    expect(source).toMatch(/useCredentialsForm/);
    // No raw useState on email/password fields (controlled-input antipattern)
    // (allow useState only if absent — strongest signal: source declares form fields by name= only)
    expect(source).toMatch(/<Input[^>]*name="email"/);
    expect(source).toMatch(/<Input[^>]*name="password"/);
    // No `value={...}` on the email/password Inputs (controlled antipattern)
    expect(source).not.toMatch(/<Input[^>]*name="email"[^>]*value=\{/);
    expect(source).not.toMatch(/<Input[^>]*name="password"[^>]*value=\{/);
  });

  test('signIn.email is called from auth-client (better-auth integration intact)', () => {
    expect(source).toMatch(/from '@\/lib\/auth-client'/);
    expect(source).toMatch(/signIn\.email/);
  });
});
```

Equivalent test for `register.test.tsx` swaps `signIn.email`→`signUp.email` and pins `name`, `email`, `password`, `confirmPassword` fields.

### Decomposed game-view child signature (SC4)

```tsx
// apps/client/src/components/game-view/game-view-header.tsx
import { SidebarTrigger } from '@/components/ui/sidebar';
// ...
interface Props {
  backPath: string;
  backLabel: string;
  liveTitle: string;
  editMode: boolean;
  isSaving: boolean;
  onCancel: () => void;
  onSave: () => void;
  onNavigate: (to: string) => void;
}

export function GameViewHeader({ backPath, backLabel, liveTitle, editMode, isSaving, onCancel, onSave, onNavigate }: Props) {
  return (
    <div className="flex h-[52px] shrink-0 items-center gap-3 border-b border-apex-line-3 bg-white px-4 lg:px-5">
      <SidebarTrigger className="shrink-0 text-apex-ink-3 hover:text-apex-ink" />
      <nav className="flex min-w-0 items-center gap-[6px] text-[13px]">
        <button type="button" onClick={() => onNavigate(backPath)} className="shrink-0 font-medium text-apex-accent hover:underline">
          {backLabel}
        </button>
        <span className="shrink-0 text-apex-line-1 select-none">·</span>
        <span className="truncate text-apex-ink-3">{liveTitle}</span>
      </nav>
      {editMode && (
        <div className="ml-auto flex shrink-0 items-center gap-2">
          <button type="button" onClick={onCancel} className="...">Cancel</button>
          <button type="button" onClick={onSave} disabled={isSaving} className="...">{isSaving ? 'Saving…' : 'Save'}</button>
        </div>
      )}
    </div>
  );
}
```

## Runtime State Inventory

Phase 4 is **pure frontend refactor** — no rename, no migration, no string-replacement in stored data. Inventory for completeness:

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | None | None — phase touches no DB, no key naming |
| Live service config | None | None — phase touches no integrations |
| OS-registered state | None | None — no daemons/scheduled tasks affected |
| Secrets/env vars | None | None |
| Build artifacts | None — Vite rebuild reload-only | None; `bun run build` produces fresh `apps/client/dist/` after refactor |

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `componentWillCatch` (deprecated) | `static getDerivedStateFromError` + `componentDidCatch` | React 16 | Project on 18.3 — use modern pair only [CITED: react.dev] |
| `errorElement` on every route | One outer class ErrorBoundary | React Router v6 introduced `errorElement` for loader errors — not a replacement for class boundary | Use class boundary as primary; `errorElement` only when using route loaders |
| Hand-rolled dropdown with `useEffect(addEventListener)` | Radix Primitives | Since 2021 — Radix has been the React community a11y standard | Project already standardizes on Radix |
| Controlled inputs everywhere | Uncontrolled + FormData for credential forms | Project-specific MEMORY rule | Browser autofill works with uncontrolled inputs natively |

**Deprecated/outdated:**
- `componentWillCatch` — removed; do not use.
- Function-component "ErrorBoundary" via `useEffect` — does not catch render errors. Class is the only correct path in React 18 AND 19.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Project does NOT use React Router v6 `loader`/`action` (data-router data APIs) anywhere in routes | Pattern 2 | Low — if loaders exist, route-level `errorElement` should be added IN ADDITION to class boundary. Verify via `rg "loader:|action:" apps/client/src/main.tsx` during planning |
| A2 | `useGameDraft(game)` returns stable callbacks (`set`, `reset`, `toPayload`) safe to flow through prop drilling without memo | Pattern 5 | Low — current `game-view.tsx` already passes `set` to multiple children (`CoverColorPicker`, `UploadCoverButton`) without issue; decomposition extends this without new risk |
| A3 | Existing `game-view.tsx` has no inline `<svg>` elements OUTSIDE the 4 enumerated above | Pattern 6 / SC5 | Low — manual scan during research confirmed lines 39, 44, 117, 142; planner should `rg -n "<svg" apps/client/src/pages/game-view.tsx` to verify before declaring SC5 done |
| A4 | `bun:test` with `node:fs.readFileSync` on `.tsx` files works without TypeScript type-erasure issues because the test reads source as a string, not as code | SC6 / Pattern | None — proven precedent in `protected-route.test.tsx` (SET-05) and `add-game-modal.test.tsx` (260513-ds2) |
| A5 | Mounting `<ErrorBoundary>` inside `<QueryClientProvider>` but outside `<RouterProvider>` is the correct order for this codebase | Pattern 2 | Low — standard React Query + Router composition; verified order matches official examples |

## Open Questions

1. **Should the ErrorBoundary's `componentDidCatch` log to anything beyond `console.error`?**
   - What we know: SC1 requires fallback UI only. SEC-V2-01 (Sentry/Axiom) is explicitly deferred.
   - What's unclear: should we structure the log payload so a future Sentry hook is trivial to add (e.g., `console.error({ event: 'render-error', error, componentStack })`)?
   - Recommendation: Yes — log structured `{ event, error, componentStack }` shape. Zero cost now, easy hook later. Mirror the structured-logger event-name convention from the API side ("igdb.breaker.open" style).

2. **Should `useCredentialsForm` also support the Settings password form?**
   - What we know: FE-02 wording scopes to login + register. Settings password form already shipped with its own pattern (uncontrolled per Plan 01-02 decision in STATE.md).
   - What's unclear: nothing — out of scope per phase boundary.
   - Recommendation: Defer. If a future settings-form refactor wants it, generalize then.

3. **Does the dropdown migration require updating any tests beyond FE-06?**
   - What we know: `game-view.tsx` has no existing test file. ActionsDropdown is internal.
   - What's unclear: nothing — no test to update.
   - Recommendation: Manual UAT in the plan covers keyboard nav (Tab/Arrow/Escape) and screen-reader `role="menu"` exposure via DevTools.

4. **`Icon.edit` vs reusing lucide-react?**
   - What we know: `icons.tsx` imports `Heart` from `lucide-react` for one icon (line 1, 489). The rest are hand-rolled SVG.
   - What's unclear: convention drift — should we add `Icon.edit = lucide-react Edit` or hand-roll like the others?
   - Recommendation: Hand-roll to match the dominant pattern (most icons in registry are `svg(...)`). Hand-roll preserves stylistic consistency (stroke-width 1.4, 16x16 viewBox). Reserve `lucide-react` for icons that already exist there only when adding new ones is genuinely hard.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| `@radix-ui/react-dropdown-menu` | SC3 | ✓ | `^2.1.2` installed; `2.1.16` latest on npm | — |
| `react` 18+ class component support | SC1 | ✓ | `^18.3.1` | — |
| `bun:test` | SC6 | ✓ | runtime built-in | — |
| `node:fs.readFileSync` | SC6 | ✓ | runtime built-in | — |
| shadcn CLI (`npx shadcn@latest`) | SC3 (dropdown-menu wrapper) | ✓ | `npx` available | If shadcn CLI fails (network or workspace quirk), copy `dropdown-menu.tsx` manually from shadcn docs — it's ~80 LOC of forwardRef wrappers |
| sonner | SC1 (optional, not required) | ✓ | `^1.7` | — |

**Missing dependencies with no fallback:** None.
**Missing dependencies with fallback:** None.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | `bun:test` (Bun built-in, no Jest/Vitest) |
| Config file | None — convention-only; tests resolved by file pattern |
| Quick run command | `bun test apps/client/src/pages/__tests__/login.test.tsx` |
| Full suite command | `bun test` (from repo root or workspace root) |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|--------------|
| FE-01 | ErrorBoundary mounted in main.tsx around RouterProvider | source-pin | `bun test apps/client/src/components/__tests__/error-boundary.test.tsx` (optional) | ❌ Wave 0 — optional, primary verification is manual UAT (throw in a page, see fallback) |
| FE-02 | useCredentialsForm exists; login/register import it | source-pin (covered by FE-06 tests) | included in FE-06 test commands | ❌ Wave 0 |
| FE-03 | game-view.tsx imports DropdownMenu from `@/components/ui/dropdown-menu`; no `useEffect.*mousedown` in ActionsDropdown | source-pin | `bun test apps/client/src/pages/__tests__/game-view.test.tsx` | ❌ Wave 0 — optional source-pin |
| FE-04 | Three new files exist under `components/game-view/`; each <250 LOC | manual + `wc -l` | `wc -l apps/client/src/components/game-view/*.tsx apps/client/src/pages/game-view.tsx` (assert all <250) | ❌ filesystem check, no test file needed |
| FE-05 | No `<svg` in `game-view.tsx` | source-pin | `! rg -q '<svg' apps/client/src/pages/game-view.tsx` (bash assertion in plan verification) | ❌ filesystem grep, no test file needed |
| FE-06 | login.test.tsx + register.test.tsx pin (a) `await refetchSession()` before `navigate`, (b) inputs are uncontrolled | source-pin | `bun test apps/client/src/pages/__tests__/login.test.tsx apps/client/src/pages/__tests__/register.test.tsx` | ❌ Wave 0 — REQUIRED |
| FE-06 (manual) | Happy-path login + register flow + game-view edit | manual UAT | documented in plan `<verification>` | n/a |

### Sampling Rate
- **Per task commit:** `bun test apps/client/src/pages/__tests__/login.test.tsx apps/client/src/pages/__tests__/register.test.tsx` (~1s)
- **Per wave merge:** `bun test` (full repo — includes API tests too, ~10s)
- **Phase gate:** `bun test` green + manual UAT signed off in plan

### Wave 0 Gaps
- [ ] `apps/client/src/pages/__tests__/login.test.tsx` — pins FE-06 (a) refetchSession-before-navigate, (b) uncontrolled inputs
- [ ] `apps/client/src/pages/__tests__/register.test.tsx` — same pattern as login
- [ ] `apps/client/src/components/__tests__/error-boundary.test.tsx` (optional) — pins class structure (`getDerivedStateFromError`, `componentDidCatch`)

No framework install needed — `bun:test` is built-in.

## Project Constraints (from CLAUDE.md)

These constraints have the same authority as locked CONTEXT.md decisions:

1. **Tech stack frozen:** Bun + Hono + Drizzle + SQLite + React + Tailwind + shadcn + Better Auth + UploadThing + IGDB — DO NOT add dependencies in this phase.
2. **Test framework:** `bun:test` only (no Jest/Vitest, no testing-library/jsdom). Regression tests use source-grep pattern.
3. **React autofill rule:** uncontrolled inputs + FormData. Controlled `useState` + `onChange` breaks autofill until user interaction.
4. **better-auth refetchSession rule:** `await refetchSession()` MUST precede `navigate()` into a `useSession`-guarded route — else guard bounces back to `/login`.
5. **File naming:** `kebab-case.tsx`; tests `<name>.test.tsx` co-located OR in `__tests__/` (new tests prefer `__tests__/`).
6. **shadcn style:** `new-york`; base color `neutral`. CLI quirk: files land in `apps/client/@/components/ui/`, `mv` to `apps/client/src/components/ui/` required.
7. **UI language:** Polish (UI copy). Code, comments, identifiers: English.
8. **No barrel `index.ts`:** Named exports only; every import names the exact file.
9. **No regex/sed hacks for DRY:** if a change repeats >2×, stop and propose a helper.
10. **`enterprise-web-expert` chain rule:** N/A here (frontend phase); chain rule applies after grill-me runs on backend.
11. **Tables:** All via `@/components/data-table.tsx` — N/A in this phase (no new tables).
12. **Components <250 LOC preferred** — SC4 makes it a hard cap for new `game-view` children.
13. **Toasts:** Sonner; destructive confirms: AlertDialog — already in use, do not change.

## Security Domain

**security_enforcement:** absent → treated as enabled. Frontend stability phase has minimal security surface — listing applicable ASVS controls for completeness.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes (touch-only — refactoring login/register UI) | better-auth (already integrated, untouched) |
| V3 Session Management | yes (touch-only — `refetchSession()` flow) | better-auth session cookie (SameSite=Strict shipped in Phase 3) |
| V4 Access Control | no — no new endpoints, no per-user data flows added | — |
| V5 Input Validation | partial — credential fields validated via `useCredentialsForm` validators | Trust better-auth server-side validation as primary; client validators are UX-only |
| V6 Cryptography | no | — |

### Known Threat Patterns for Frontend Refactor

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| XSS via ErrorBoundary fallback echoing user content | Tampering | Do NOT render `error.message` directly in fallback — fixed copy only ("Coś poszło nie tak. Spróbuj odświeżyć stronę.") |
| Stale session after sign-in (guard-bounce) | Repudiation / IDOR-adjacent | `await refetchSession()` before `navigate()` — pinned by FE-06 regression test |
| Credential leak via uncontrolled FormData | Information disclosure | Submit handler never logs `password` — confirm in code review |
| Autofill failure → user reuses weaker known passwords | Authentication (V2) | Uncontrolled-inputs rule preserves browser password-manager autofill |

## Sources

### Primary (HIGH confidence)
- Context7 `/reactjs/react.dev` — "ErrorBoundary getDerivedStateFromError componentDidCatch class component" (fetched 2026-05-14)
- Context7 `/websites/reactrouter_6_30_3` — "errorElement route createBrowserRouter root error boundary" (fetched 2026-05-14)
- Context7 `/websites/radix-ui_primitives` — "DropdownMenu Root Trigger Content Item keyboard navigation, Separator usage" (fetched 2026-05-14)
- Context7 `/shadcn-ui/ui` — "dropdown-menu install CLI npx new-york" (fetched 2026-05-14)
- npm registry — `npm view @radix-ui/react-dropdown-menu version` → `2.1.16`; `react` → `19.2.6`; `react-router-dom` → `7.15.0` (verified 2026-05-14)
- `/Users/kodari/projects/games/CLAUDE.md` — project conventions
- `/Users/kodari/projects/games/.planning/REQUIREMENTS.md` — FE-01..FE-06 wording
- `/Users/kodari/projects/games/.planning/ROADMAP.md` — Phase 4 success criteria
- `/Users/kodari/projects/games/.planning/STATE.md` — Plan 01-01 shadcn CLI quirk, Plan 01-03 `bun:test` .tsx resolution note

### Secondary (MEDIUM confidence)
- Direct read of `apps/client/src/pages/game-view.tsx` (669 LOC inventory)
- Direct read of `apps/client/src/components/auth/protected-route.test.tsx` and `add-game-modal.test.tsx` (test-stack precedent)
- Direct read of `apps/client/package.json` (dep availability)

### Tertiary (LOW confidence)
- None — every claim either verified via Context7, npm registry, or local source code.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — every package version verified against npm registry; every recommendation cross-checked against installed `package.json`
- Architecture (ErrorBoundary placement, dropdown wrapper, game-view split): HIGH — Context7 docs + direct source-code inventory
- Pitfalls: HIGH — pitfalls 1, 2, 3, 4, 7 verified against docs; pitfall 5 verified against STATE.md decision log
- Test strategy: HIGH — precedent files (`protected-route.test.tsx`, `add-game-modal.test.tsx`) directly read and match proposed pattern

**Research date:** 2026-05-14
**Valid until:** 2026-06-13 (30 days — stable refactor scope, no fast-moving deps)

## RESEARCH COMPLETE

**Phase:** 4 — Frontend Stability
**Confidence:** HIGH

### Key Findings
- Class-component ErrorBoundary in `main.tsx` is the only correct path in React 18 (and 19) — `errorElement` per-route is unnecessary because project doesn't use loaders.
- `@radix-ui/react-dropdown-menu ^2.1.2` already installed; only the shadcn wrapper (`components/ui/dropdown-menu.tsx`) needs to be added — beware the workspace path quirk from STATE.md.
- Test stack is source-grep only (`bun:test` + `node:fs.readFileSync`) — regression tests pin behavior by asserting against source strings, not by rendering. Two precedent files (`protected-route.test.tsx`, `add-game-modal.test.tsx`) prove the pattern.
- `game-view.tsx` is 669 LOC across `FormatChip`, `ActionsDropdown`, `FieldItem`, `SectionLabel`, `GameViewPage`, `GameViewBody`. Three-way split (`header`, `actions`, `fields`) with left-panel absorbed into `fields` hits the <250 LOC target without spawning a 4th component.
- `useCredentialsForm` must stay auth-agnostic — `await refetchSession()` lives in the page's `onSubmit` callback, not the hook. This keeps both MEMORY rules pinnable in source.

### File Created
`/Users/kodari/projects/games/.planning/phases/04-frontend-stability/04-RESEARCH.md`

### Confidence Assessment
| Area | Level | Reason |
|------|-------|--------|
| Standard Stack | HIGH | Versions verified via `npm view` + Context7 + local package.json |
| Architecture | HIGH | Patterns verified against React docs, React Router 6.30.3 docs, Radix primitives docs |
| Pitfalls | HIGH | All 8 pitfalls have either docs citation or local code/STATE.md precedent |
| Test strategy | HIGH | Two precedent test files directly read; pattern is straightforward to replicate |

### Open Questions
1. ErrorBoundary log shape — structured `{event, error, componentStack}` recommended for future Sentry hook (zero cost now).
2. `useCredentialsForm` scope strictly login+register — Settings password form deferred.
3. `Icon.edit` hand-rolled vs lucide-react — recommend hand-rolled to match dominant registry pattern.

### Ready for Planning
Research complete. Planner can now create PLAN.md files. Suggested split: P1 ErrorBoundary (SC1), P2 useCredentialsForm + regression tests (SC2 + SC6), P3 dropdown + game-view decomposition + SVG extract (SC3 + SC4 + SC5).
