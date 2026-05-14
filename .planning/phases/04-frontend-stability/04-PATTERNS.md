# PATTERNS.md — Phase 04 Frontend Stability

**Mapped:** 2026-05-14
**Files analyzed:** 13 (5 NEW + 5 MODIFIED + 3 NEW tests)
**Analogs found:** 12 / 13 (one "no precedent" — class component)

Phase 4 is a pure frontend refactor. Every new file (except ErrorBoundary, which has no class-component precedent in the repo) maps to an existing analog with concrete file path + line range. This file tells the planner which `src/...` file to point each task at.

## File Classification

| New / Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---------------------|------|-----------|----------------|---------------|
| `apps/client/src/components/error-boundary.tsx` (NEW) | component (React class) | render-error trap | none in repo — fallback to react.dev docs | NO ANALOG |
| `apps/client/src/hooks/use-credentials-form.ts` (NEW) | hook | uncontrolled-form driver | `apps/client/src/pages/settings/account-password-form.tsx` (inline pattern — promote into hook) + `apps/client/src/hooks/use-add-game-with-metadata.ts` (hook shape) | exact (logic) + exact (shape) |
| `apps/client/src/components/ui/dropdown-menu.tsx` (NEW, via shadcn CLI) | UI primitive | event-driven | `apps/client/src/components/ui/alert-dialog.tsx` | exact (shadcn wrapper structure) |
| `apps/client/src/components/game-view/game-view-header.tsx` (NEW) | component (split) | request-response (props in, callbacks out) | `apps/client/src/pages/settings/settings-page.tsx:47-62` (`AccountSection`) — sub-section extraction | role-match |
| `apps/client/src/components/game-view/game-view-actions.tsx` (NEW) | component (split, hosts dropdown) | event-driven | `apps/client/src/pages/settings/settings-page.tsx:192-229` (`PasswordRow` — leaf with internal state + parent callbacks) | role-match |
| `apps/client/src/components/game-view/game-view-fields.tsx` (NEW) | component (split, hosts form fields) | request-response (props in, set callback bubbled up) | `apps/client/src/components/settings/igdb-integration-card.tsx` (large composed card — verify size on read) OR `apps/client/src/pages/settings/settings-page.tsx` section pattern | role-match |
| `apps/client/src/pages/__tests__/login.test.tsx` (NEW) | test (source-pin) | file-I/O | `apps/client/src/components/auth/protected-route.test.tsx` + `apps/client/src/components/add-game-modal.test.tsx` | exact |
| `apps/client/src/pages/__tests__/register.test.tsx` (NEW) | test (source-pin) | file-I/O | same as above | exact |
| `apps/client/src/main.tsx` (MOD) | composition root | bootstrap | self (current `main.tsx`) — only mount-tree change | n/a |
| `apps/client/src/pages/login.tsx` (MOD) | page | request-response | `apps/client/src/pages/settings/account-password-form.tsx` (FormData pattern stays; useState lifted into hook) | exact |
| `apps/client/src/pages/register.tsx` (MOD) | page | request-response | same as login | exact |
| `apps/client/src/pages/game-view.tsx` (MOD, slim down to orchestrator) | page | composition shell | `apps/client/src/pages/settings/settings-page.tsx` (orchestrator composing N sections) | role-match |
| `apps/client/src/components/icons.tsx` (MOD, append 3 entries) | registry extension | n/a | self (`apps/client/src/components/icons.tsx:11-25` factory + `:451-479` `trash` entry) | exact (extend in place) |

## Pattern Assignments

### `apps/client/src/components/error-boundary.tsx` (NEW)

**Analog:** **No class component exists in this repo.** All existing components are function components or shadcn `forwardRef` wrappers. The planner MUST use the React 18 docs pattern from RESEARCH.md `## Pattern 1` (lines 153-189) verbatim — that snippet is the authoritative source.

**What to mirror from the codebase regardless:**
- File-level conventions: kebab-case filename, named exports only (no `export default`), import `cn` from `@/lib/utils` only if needed, import `Button` from `@/components/ui/button` for the fallback CTA.
- Polish UI copy: "Coś poszło nie tak.", "Spróbuj odświeżyć stronę.", "Załaduj ponownie" (per CLAUDE.md UI-language rule + ROADMAP SC1).
- Tailwind tokens: `text-apex-ink`, `text-apex-muted`, `bg-white` (apex palette, not Tailwind defaults). Reference: `apps/client/src/pages/settings/settings-page.tsx:31` (`bg-[#fafafa]`) and `apps/client/src/components/auth/protected-route.tsx:10` for full-screen centering pattern:

```tsx
// protected-route.tsx:9-13 — full-screen centered loading state. Mirror the LAYOUT for fallback.
return (
  <div className="flex h-screen w-screen items-center justify-center">
    <div className="h-6 w-6 animate-spin rounded-full border-2 border-apex-line-3 border-t-apex-ink" />
  </div>
);
```

- Fallback button uses `<Button>` from `@/components/ui/button` (NOT a raw `<button>`) — see `apps/client/src/pages/settings/account-password-form.tsx:151-159` for `<Button variant="primary" size="sm" onClick={...}>` shape.

**No `cn()` import is required** if the class string is static — `apps/client/src/components/auth/protected-route.tsx` proves the project is fine with bare `className=""`.

---

### `apps/client/src/hooks/use-credentials-form.ts` (NEW)

**Analog A (logic to extract):** `apps/client/src/pages/settings/account-password-form.tsx:37-70` — canonical uncontrolled+FormData submit handler.

```tsx
// account-password-form.tsx:37-50 — this is the EXACT shape to lift into the hook.
const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
  e.preventDefault();
  const form = e.currentTarget;
  const data = new FormData(form);
  const currentPassword = String(data.get('currentPassword') ?? '');
  const newPassword = String(data.get('newPassword') ?? '');
  const confirmPassword = String(data.get('confirmPassword') ?? '');
  const revokeOther = data.get('revokeOtherSessions') === 'on';
  setError(null);
  if (newPassword !== confirmPassword) {
    setError('Nowe hasło i potwierdzenie muszą być identyczne.');
    return;
  }
  setIsPending(true);
  // ... await better-auth ...
};
```

Note `e.currentTarget` captured synchronously BEFORE `await` — preserve this; pitfall 4 from RESEARCH.md.

**Analog B (hook signature/shape):** `apps/client/src/hooks/use-add-game-with-metadata.ts:54-145` — closest existing hook that returns an object (NOT a tuple) with action + state.

```tsx
// use-add-game-with-metadata.ts:11-31 — interface/result-type pattern to mirror.
export interface UseAddGameWithMetadataResult {
  mode: AddGameMode;
  title: string;
  setTitle: (v: string) => void;
  // ...
  submit: (opts: { onSuccess: (game: { id: string }) => void }) => void;
  reset: () => void;
}

export function useAddGameWithMetadata(
  opts: UseAddGameWithMetadataOptions,
): UseAddGameWithMetadataResult {
  // ...
}
```

Conventions to copy:
- Named export `export function useXxx`.
- Two interfaces: `UseXxxArgs` (or `Options`) + `UseXxxResult` exported alongside.
- `useCallback`-wrapped stable callbacks where they will be passed to children/effects (`set`, `reset` in `use-game-draft.ts:52-59`).
- TSDoc block above the function explaining behavioral invariants (`use-game-draft.ts:23-35` is a strong precedent).

**Analog C (per-field validators in pure helpers):** `apps/client/src/lib/game-draft.ts` (referenced by `use-game-draft.ts:1-9` imports). Hook delegates validation to pure-function helpers; planner should follow the same split if validators get non-trivial. For login+register the validators are inline (length + confirmPassword match).

**Critical invariants to preserve from MEMORY rules:**
- NEVER inject `value=`/`onChange=` into form inputs — the caller renders bare `<Input name="..." />`. Source pin in regression test: search for `value=\{` next to `name="email"|"password"` and expect NO match.
- `await refetchSession()` lives in the page's `onSubmit` callback (NOT the hook). Hook stays auth-agnostic. Current `login.tsx:32` is the pinned location; after refactor it moves into the page-level `onSubmit` callback passed to `useCredentialsForm`.

---

### `apps/client/src/components/ui/dropdown-menu.tsx` (NEW via `npx shadcn@latest add dropdown-menu`)

**Analog:** `apps/client/src/components/ui/alert-dialog.tsx` — same shadcn primitive shape.

```tsx
// alert-dialog.tsx:1-12 — import + Root/Trigger/Portal aliases.
import * as React from "react"
import * as AlertDialogPrimitive from "@radix-ui/react-alert-dialog"

import { cn } from "@/lib/utils"
import { buttonVariants } from "@/components/ui/button"

const AlertDialog = AlertDialogPrimitive.Root
const AlertDialogTrigger = AlertDialogPrimitive.Trigger
const AlertDialogPortal = AlertDialogPrimitive.Portal
```

```tsx
// alert-dialog.tsx:13-26 — forwardRef + cn() merge pattern for sub-components.
const AlertDialogOverlay = React.forwardRef<
  React.ElementRef<typeof AlertDialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof AlertDialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <AlertDialogPrimitive.Overlay
    className={cn(
      "fixed inset-0 z-50 bg-black/80 data-[state=open]:animate-in ...",
      className
    )}
    {...props}
    ref={ref}
  />
))
AlertDialogOverlay.displayName = AlertDialogPrimitive.Overlay.displayName
```

```tsx
// alert-dialog.tsx:127-139 — explicit named exports (NO default).
export {
  AlertDialog,
  AlertDialogPortal,
  AlertDialogOverlay,
  AlertDialogTrigger,
  AlertDialogContent,
  // ...
}
```

**Style note — drift to flag:** `alert-dialog.tsx` was generated by shadcn CLI before the project Biome config was applied: it uses **double quotes** and **no trailing comma on the final export-list element**, which deviates from `biome.json` (single quotes, trailing commas all). The shadcn CLI will likely emit the same dialect for `dropdown-menu.tsx`. **Per Biome's `ignore` rule, `**/components/ui/**` is ignored** (CLAUDE.md formatting block) — so the shadcn-flavored output is tolerated. Planner: do NOT manually re-format the generated file; leave it as shadcn emits.

**Workspace path quirk** (STATE.md, Pitfall 5 in RESEARCH.md): expect the CLI to write to `apps/client/@/components/ui/dropdown-menu.tsx`. The plan must `mv` it to `apps/client/src/components/ui/dropdown-menu.tsx` and `rm -rf apps/client/@` afterwards.

---

### `apps/client/src/components/game-view/game-view-header.tsx` (NEW)

**Analog:** `apps/client/src/pages/settings/settings-page.tsx:47-62` (`AccountSection`) — a leaf component that takes props, renders presentational layout, defines no state. Closest in the repo to "header-bar component with props in, callbacks out".

```tsx
// settings-page.tsx:47-62 — props-only sub-component pattern.
function AccountSection({ email, name }: { email: string; name: string | null }) {
  return (
    <section>
      <SettingsSectionLabel>KONTO</SettingsSectionLabel>
      <SettingsCard>
        <ProfileHeaderRow email={email} name={name} />
        <SettingsRow label="Nazwa">
          <ReadonlyValue value={name ?? '—'} />
        </SettingsRow>
        <SettingsRow label="Email">
          <ReadonlyValue value={email} />
        </SettingsRow>
      </SettingsCard>
    </section>
  );
}
```

**Source to extract from (verbatim slice, modulo prop names):** `apps/client/src/pages/game-view.tsx:306-357` — the entire header bar including `SidebarTrigger`, breadcrumb nav, edit-mode CTA cluster.

**Props interface to expose** (from RESEARCH.md `## Pattern Decomposed game-view child signature` lines 629-662):

```tsx
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
```

**Note:** Use `interface Props` (no name suffix) like `account-password-form.tsx:8-12` does (`type AccountPasswordFormProps`) — both forms are acceptable; pick one and be consistent. Recommendation: use `interface GameViewHeaderProps` to make the type discoverable across the 3-file split (DDD reviewer rule from skills).

---

### `apps/client/src/components/game-view/game-view-actions.tsx` (NEW)

**Analog:** `apps/client/src/pages/settings/settings-page.tsx:192-229` (`PasswordRow`) — leaf with internal `useState(open)` + ref + parent callbacks.

```tsx
// settings-page.tsx:192-229 — sub-component owns local UI state (open + triggerRef), receives no callbacks for state.
function PasswordRow() {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const bodyId = useId();
  // ...
}
```

**Source to extract:** `apps/client/src/pages/game-view.tsx:75-169` (`ActionsDropdown`) plus the wishlist "Move to collection" Button at `:342-352`. The new `<GameViewActions>` is the union of both.

**Critical migration:** the hand-rolled click-outside (`game-view.tsx:85-92`) MUST be deleted — Radix Portal collision handles it. Pin in source verification:

```tsx
// DELETE this block — Radix replaces it.
useEffect(() => {
  if (!open) return;
  const handler = (e: MouseEvent) => {
    if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
  };
  document.addEventListener('mousedown', handler);
  return () => document.removeEventListener('mousedown', handler);
}, [open]);
```

**Dropdown usage pattern:** see RESEARCH.md `## Pattern 4` (lines 354-388) — `DropdownMenuTrigger asChild` wrapping the existing trigger button preserves styling.

**Props interface:**

```tsx
interface GameViewActionsProps {
  kind: 'owned' | 'wishlist';
  isMovePending: boolean;
  onMove: () => void;
  onEdit: () => void;
  onDelete: () => void;
}
```

---

### `apps/client/src/components/game-view/game-view-fields.tsx` (NEW)

**Analog:** No exact single-file analog. Closest in spirit is the AccountSection / SecuritySection pattern in `settings-page.tsx:47-73` (sub-component receives data + delegates rendering to row primitives). For the `<dl>` grid + `FieldItem` shape, the existing inline implementation in `game-view.tsx:467-620` IS the source of truth — copy it wholesale, only changing the wrapping function signature.

**Source to extract:** `apps/client/src/pages/game-view.tsx:361-651` — the entire two-column body (left-panel cover/badges/format/UploadCoverButton + right-panel `<dl>` grid + Notes section). Also pulls in `FieldItem` (lines 171-204), `SectionLabel` (206-212), and `FormatChip` (35-73) as local sub-components OR as helpers in the same file.

```tsx
// game-view.tsx:171-204 — FieldItem leaf to keep co-located.
function FieldItem({
  label, value, editMode, numeric, children,
}: {
  label: string;
  value?: string | null;
  editMode?: boolean;
  numeric?: boolean;
  children?: ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-[5px]">
      <dt className="text-[10px] font-semibold uppercase tracking-[0.07em] text-apex-muted">{label}</dt>
      {editMode ? children : (
        <dd className={cn('text-[13.5px] font-medium leading-snug', numeric && 'tabular-nums', value && value !== '—' ? 'text-apex-ink' : 'text-apex-hint')}>
          {value || '—'}
        </dd>
      )}
    </div>
  );
}
```

**Critical invariants (RESEARCH.md `## Pattern 5`):**
- `useGameDraft(game)` stays in the parent (`GameViewBody` in `game-view.tsx`). The destructured `{ draft, set, reset, toPayload }` flow down as props.
- `notesRef` autosize effect (`game-view.tsx:250-255`) **moves into `<GameViewFields>`** — ref + effect colocated with the textarea it controls.
- Cover left-panel `style={{ background: color-mix(...) }}` (line 364) — keep inside `<GameViewFields>` per the decision in RESEARCH.md "Risk" subsection. Do NOT spawn a 4th component.

**Props interface (likely shape):**

```tsx
interface GameViewFieldsProps {
  game: Game;
  draft: GameDraft;
  set: <K extends keyof GameDraft>(key: K, value: GameDraft[K]) => void;
  editMode: boolean;
  platforms: Platform[];
  platformsLoading: boolean;
  onAddPlatform: () => void;
}
```

---

### `apps/client/src/pages/__tests__/login.test.tsx` & `register.test.tsx` (NEW)

**Analog A (canonical pin shape):** `apps/client/src/components/auth/protected-route.test.tsx:1-22` — three-section describe + readFileSync at top level.

```tsx
// protected-route.test.tsx:1-22 — copy verbatim except for paths and assertions.
import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('ProtectedRoute regression — SET-05', () => {
  const source = readFileSync(resolve(__dirname, 'protected-route.tsx'), 'utf-8');

  test('imports useSession from @/lib/auth-client', () => {
    expect(source).toMatch(/from '@\/lib\/auth-client'/);
    expect(source).toMatch(/useSession/);
  });
  // ...
});
```

**Path resolution note:** `protected-route.test.tsx` is **co-located** (`__dirname` resolves the sibling source). The new Phase 4 tests live under `pages/__tests__/` so the path becomes `resolve(__dirname, '../login.tsx')`. The `add-game-modal.test.tsx` precedent (which IS co-located) at `:16-22` uses the same idiom for cross-folder reads:

```tsx
// add-game-modal.test.tsx:16-22 — readFileSync with ../ for cross-folder source.
const modalSrc = readFileSync(resolve(__dirname, 'add-game-modal.tsx'), 'utf-8');
const hookSrc = readFileSync(
  resolve(__dirname, '../hooks/use-add-game-with-metadata.ts'),
  'utf-8',
);
```

**Analog B (multi-assertion ordered pins):** `add-game-modal.test.tsx:24-33` — ordered position checks via `indexOf`.

```tsx
// add-game-modal.test.tsx:24-33 — ordered-position pin (use for refetchSession-BEFORE-navigate).
const platformIdx = modalSrc.indexOf('>Platform<');
const titleIdx = modalSrc.indexOf('>Title<');
expect(platformIdx).toBeGreaterThan(-1);
expect(titleIdx).toBeGreaterThan(-1);
expect(platformIdx).toBeLessThan(titleIdx);
```

For FE-06 use `source.search(/await\s+refetchSession\s*\(\s*\)/)` < `source.search(/navigate\s*\(/)` per RESEARCH.md code example (lines 596-603).

**Filename convention check:** project allows BOTH co-located (`protected-route.test.tsx`) AND `__tests__/` (`add-game-modal.test.tsx` is co-located actually — but CLAUDE.md says "new tests prefer `__tests__/`"). Place new tests at `apps/client/src/pages/__tests__/login.test.tsx` and `…/register.test.tsx` (matches RESEARCH.md suggested structure).

---

### `apps/client/src/main.tsx` (MOD)

**Analog:** self. Only structural change is wrapping `<RouterProvider>` with `<ErrorBoundary>` INSIDE `<QueryClientProvider>` (RESEARCH.md `## Pattern 2`, line 222-232).

```tsx
// main.tsx:69-76 — current mount tree.
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
      <Toaster richColors position="top-center" />
    </QueryClientProvider>
  </React.StrictMode>,
);
```

After: wrap `<RouterProvider>` in `<ErrorBoundary fallback={<AppErrorFallback />}>`; keep `<Toaster>` OUTSIDE the boundary so toast portal survives fallback render.

---

### `apps/client/src/pages/login.tsx` & `register.tsx` (MOD)

**Analog:** self + `apps/client/src/pages/settings/account-password-form.tsx`. Current login/register already use FormData + uncontrolled inputs — the refactor lifts the `useState(error)`, `useState(isPending)`, `setFieldErrors` into the new hook. The page-level code becomes ~60 LOC (RESEARCH.md `## Pattern 3` caller shape, lines 546-583).

**MUST preserve from `login.tsx:14-36`:**
- Sync capture of `form` and `data` BEFORE any `await` (line 16-17 currently).
- `await refetchSession()` BEFORE `navigate` (line 32-35) — the entire reason for the regression test.
- Error code mapping (`signInError.code === 'INVALID_EMAIL_OR_PASSWORD'`) — passes through as `onSubmit` return value.

**MUST preserve from `register.tsx:21-57`:**
- Client-side validators (name required, password length 8, password === confirm) — these become validators on the `CredentialField[]` array.
- `USER_ALREADY_EXISTS` → `fieldErrors.email` mapping.

---

### `apps/client/src/pages/game-view.tsx` (MOD, slim down)

**Analog:** `apps/client/src/pages/settings/settings-page.tsx:17-45` — orchestrator that mounts N sub-sections and owns no field-level state.

```tsx
// settings-page.tsx:17-45 — orchestrator shape to mirror.
export function SettingsPage() {
  const { data: session } = useSession();
  const user = session?.user;
  if (!user) return null;

  return (
    <TooltipProvider delayDuration={150}>
      <div className="flex h-full min-h-0 flex-1 flex-col">
        <AppHeader>...</AppHeader>
        <div className="...">
          <div className="space-y-8">
            <AccountSection email={user.email} name={user.name ?? null} />
            <SecuritySection />
            <IntegrationsSection />
            <PreferencesSection />
            <DangerZoneSection />
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}
```

After refactor `game-view.tsx` keeps `GameViewPage` (query + error gate, lines 214-229 — KEEP AS-IS) and `GameViewBody` (lines 231-668 — SHRINK to ~150 LOC orchestrator), with the three sub-components moved out.

---

### `apps/client/src/components/icons.tsx` (MOD)

**Analog:** self. Use the existing `svg(children, vb)` factory at `icons.tsx:11-25`. Three new entries: `disc`, `download`, `edit`. (Existing `trash` at `:451-479` is REUSED for the dropdown delete icon — do not add a duplicate.)

```tsx
// icons.tsx:11-25 — factory.
const svg = (children: ReactNode, vb = '0 0 16 16'): Svg => {
  return ({ size = 16, className }) => (
    <svg width={size} height={size} viewBox={vb} fill="none" className={className} style={{ display: 'block', flexShrink: 0 }} aria-hidden>
      {children}
    </svg>
  );
};
```

```tsx
// icons.tsx:451-479 — existing trash entry shows the stroke-1.4 / 0 0 16 16 viewBox convention to mirror.
trash: svg(
  <>
    <path d="M3 4.5h10" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    <path d="M5.5 4.5V3.5a.5.5 0 01.5-.5h4a.5.5 0 01.5.5v1" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    // ...
  </>,
),
```

**Source SVG paths to migrate:**
- `disc` ← `game-view.tsx:39-42` (two concentric circles). Note: source viewBox is `0 0 24 24` and stroke 1.8 — adapt to `0 0 16 16` + stroke 1.4 per `Icon.coffee` style at `icons.tsx:103-120`.
- `download` ← `game-view.tsx:44-68` (polyline + line + path). Adapt viewBox + stroke similarly.
- `edit` ← `game-view.tsx:117-130` (pencil over square). Adapt viewBox + stroke similarly.

**Convention drift to honor:** RESEARCH.md Open Question 4 — most icons hand-rolled with `svg(...)` factory, only `Heart` (line 1, 489) + `settings` (214) + `gamepad` (329) use lucide-react or 24x24 viewBox. **Recommendation: hand-roll** the three new icons matching the dominant 16x16 stroke-1.4 pattern.

## Shared Patterns

### Pattern: Uncontrolled form + FormData driver
**Source:** `apps/client/src/pages/settings/account-password-form.tsx:37-70`
**Apply to:** `useCredentialsForm` (extract), `login.tsx`, `register.tsx` (consume)

Sync capture of `form` and `data` BEFORE any `await`. No `value=`/`onChange=` on inputs. `data.get('field')` per field. Hook owns `useState(error)`, `useState(isPending)`, `useState(fieldErrors)`.

### Pattern: bun:test source-pin regression
**Source:** `apps/client/src/components/auth/protected-route.test.tsx:1-22` (canonical) + `apps/client/src/components/add-game-modal.test.tsx:16-22, 24-33` (path + ordered-pin idioms)
**Apply to:** `login.test.tsx`, `register.test.tsx`

Top-of-file `readFileSync(resolve(__dirname, '../source.tsx'), 'utf-8')`. `describe('Foo regression — <REQ-ID>')`. Each `test` is one `expect(source).toMatch(/.../)` or `indexOf`-ordering check. NO jsdom, NO RTL, NO render.

### Pattern: shadcn primitive wrapper
**Source:** `apps/client/src/components/ui/alert-dialog.tsx:1-12, 13-26, 127-139`
**Apply to:** `apps/client/src/components/ui/dropdown-menu.tsx`

Import `* as Primitive from '@radix-ui/react-X'`. Alias `Root`, `Trigger`, `Portal` directly. `React.forwardRef` wrappers for sub-components with `className` merged via `cn()`. Explicit named-export list at bottom. Double quotes + missing trailing comma in shadcn-generated files is tolerated (Biome `ignore`).

### Pattern: Hook signature
**Source:** `apps/client/src/hooks/use-add-game-with-metadata.ts:11-31, 54-58` + `apps/client/src/hooks/use-game-draft.ts:13-21, 36`
**Apply to:** `useCredentialsForm`

Two exported interfaces (`UseXxxArgs`/`Options` + `UseXxxResult`). Named export `function useXxx(args): Result`. Stable callbacks via `useCallback`. TSDoc block above the function describing behavioral invariants.

### Pattern: Page orchestrator + leaf sub-components
**Source:** `apps/client/src/pages/settings/settings-page.tsx:17-45` (orchestrator), `:47-62` (props-only section), `:192-229` (section with internal state)
**Apply to:** `game-view.tsx` slim-down + the three new `game-view/*.tsx` children

Orchestrator owns query + global state. Sub-components are either pure (props in, callbacks out) or own local UI state (open/close, refs) and call parent callbacks for cross-cutting effects.

### Pattern: Polish UI copy, English code
**Source:** CLAUDE.md "Język UI" rule + `account-password-form.tsx` Polish error messages
**Apply to:** ErrorBoundary fallback ("Coś poszło nie tak.", "Załaduj ponownie"). All other identifiers/comments/commits in English.

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `apps/client/src/components/error-boundary.tsx` | React class component | render-error trap | Repository has **zero** class components. All UI is function components or shadcn `forwardRef` wrappers. Class component is mandatory here (React 18 has no hook equivalent for `getDerivedStateFromError`). Planner uses the docs pattern from RESEARCH.md `## Pattern 1` lines 153-189 verbatim. |

## Convention Highlights (for the planner)

- **Hook signatures:** named export, `UseXxxArgs` + `UseXxxResult` interfaces exported alongside, `useCallback` for outbound callbacks, TSDoc block. Reference: `use-add-game-with-metadata.ts:11-58`, `use-game-draft.ts:13-36`.
- **Test setup:** `import { describe, expect, test } from 'bun:test'`, `readFileSync(resolve(__dirname, ...), 'utf-8')`, single top-level `const source = ...`. No jsdom. Reference: `protected-route.test.tsx`, `add-game-modal.test.tsx`.
- **Component splitting:** orchestrator at top of file, leaf components below (either same file or extracted). Local UI state stays in leaves; cross-cutting state stays in orchestrator. Reference: `settings-page.tsx` (single-file 369 LOC with 12+ local components — proves co-location is fine when leaves are tiny).
- **File naming:** `kebab-case.tsx` everywhere. Co-located tests OR `__tests__/` — both work; new tests prefer `__tests__/` (CLAUDE.md). The `game-view/` subfolder is consistent with `components/settings/`, `components/auth/`, `components/layout/`.
- **shadcn primitives:** live in `components/ui/`; biome ignores that folder; do NOT manually reformat generated files. Reference: `biome.json` ignores + `alert-dialog.tsx` style drift.
- **Polish UI copy** only inside JSX/strings rendered to user. Identifiers, props, types, comments in English. Reference: `settings-page.tsx` ("KONTO", "BEZPIECZEŃSTWO") with English prop names.

## Anti-Patterns Observed (preserve as warnings to the planner)

- **Hand-rolled click-outside + Escape** at `game-view.tsx:85-92` — Radix replaces this; the regression for FE-03 is "no `useEffect.*mousedown` in actions". Don't keep it "for safety".
- **Inline 24x24 SVG with stroke 1.8** at `game-view.tsx:39-68, 117-162` — drifts from the icon registry's 16x16 stroke-1.4 convention. New `Icon.disc/download/edit` MUST be normalized.
- **Per-page form state with `useState(error)` + `useState(isPending)` + `useState(fieldErrors)`** at `login.tsx:11-12` and `register.tsx:17-19` — duplication is exactly what `useCredentialsForm` removes.
- **No `errorElement` per route** — RESEARCH.md `## Pattern 2` explicitly says don't sprinkle these; project has no `loader`/`action`. Single class boundary in `main.tsx`. The planner should NOT modify route definitions in `main.tsx:21-58`.
- **`alert()` for delete errors** at `game-view.tsx:285` (`alert(\`Failed to delete: ${err.message}\`)`) — pre-existing; OUT OF SCOPE for Phase 4 (FE-04 is "preserve existing mutation behavior"). Flag but DO NOT FIX.
- **shadcn workspace path quirk** (`apps/client/@/components/ui/...`) — STATE.md known issue; the dropdown-install task MUST `mv` and `rm -rf apps/client/@`.

## Metadata

**Analog search scope:** `apps/client/src/{components,hooks,lib,pages}/` (excluded `components/ui/` from convention scan but read `alert-dialog.tsx` as shadcn precedent).
**Files scanned:** 11 read in full, ~6 directory listings.
**Pattern extraction date:** 2026-05-14
**Confidence:** HIGH — every assignment has a concrete file:line range in the existing tree, except the class-component ErrorBoundary which is honestly flagged as "no precedent; use docs pattern".

## PATTERN MAPPING COMPLETE

**Phase:** 4 — Frontend Stability
**Files classified:** 13
**Analogs found:** 12 / 13

### Coverage
- Files with exact analog: 8 (`dropdown-menu`, `useCredentialsForm` shape + logic, both regression tests, `login.tsx`, `register.tsx`, `main.tsx`, `icons.tsx`)
- Files with role-match analog: 4 (the three `game-view/*` splits + `game-view.tsx` orchestrator slim-down)
- Files with no analog: 1 (`error-boundary.tsx` — no class component exists in repo; use react.dev docs pattern in RESEARCH.md)

### Key Patterns Identified
- Uncontrolled form + FormData submit handler is already proven in `account-password-form.tsx:37-70` — `useCredentialsForm` is a clean extraction.
- shadcn primitive wrapper pattern is fully crystallized in `alert-dialog.tsx`; `dropdown-menu.tsx` will mirror it 1:1.
- bun:test source-pin regression pattern has two precedents (`protected-route.test.tsx` simple-three-tests, `add-game-modal.test.tsx` multi-file cross-folder reads with ordered-position checks) — Phase 4 tests blend both.
- Page orchestrator + leaf sub-components is the dominant decomposition style in `settings-page.tsx`; `game-view.tsx` slim-down follows the same shape but extracts leaves into a sibling folder for the 250-LOC cap.

### Ready for Planning
Pattern mapping complete. Planner can now reference analog patterns in PLAN.md files. Suggested mapping to the three-plan split from RESEARCH.md:

- **Plan P1 (ErrorBoundary + main.tsx wire-up):** uses no-analog `error-boundary.tsx` (docs pattern) + `main.tsx` self-edit + Polish-copy convention from `account-password-form.tsx` + `protected-route.tsx:10` for centered-fullscreen layout.
- **Plan P2 (useCredentialsForm + regression tests):** logic from `account-password-form.tsx:37-70`, hook shape from `use-add-game-with-metadata.ts:11-58`, tests from `protected-route.test.tsx` + `add-game-modal.test.tsx`.
- **Plan P3 (dropdown-menu primitive + game-view decomposition + icons extension):** dropdown wrapper from `alert-dialog.tsx` template + orchestrator pattern from `settings-page.tsx:17-45` + `FieldItem`/`SectionLabel` co-located leaves carried into `game-view-fields.tsx` + icons factory from `icons.tsx:11-25, 451-479`.
