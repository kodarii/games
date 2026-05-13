# IGDB integration tile — Phase 6: Frontend card + form

## Goal
Replace the fake `IntegrationCard` for IGDB in `settings-page.tsx` with a
real, fully-stateful component. Add the query + mutation hooks for the new
`/api/integrations/igdb` endpoints. Implement collapsed and expanded
states with the Save flow (form-level dirty tracking, FormData submit,
inline error mapping). The "Rozłącz" / AlertDialog interaction lands in
Phase 7 — this phase focuses on the happy path.

## Definition of Done
- [ ] `bun --filter @apex/client run typecheck` clean
- [ ] `bun --filter @apex/client run lint` clean
- [ ] Manual smoke test in browser passes (see Step 4 — dev server checklist)
- [ ] On a fresh DB the settings page shows the IGDB tile collapsed with a
      "Konfiguruj" button; clicking it expands the form with empty inputs,
      a DISABLED toggle, and a DISABLED Save button
- [ ] Typing valid Twitch credentials and clicking Save calls
      `PUT /api/integrations/igdb`; on success the card collapses-then-re-expands
      with the CONNECTED badge, masked Client ID, dotted secret, and the
      toggle becomes clickable and ON

## Context
**Runtime:** Bun. `bun --filter @apex/client run dev` / `... typecheck` / `... lint`.
**UI stack:** React 18 + TanStack Query + Tailwind + shadcn/ui (style `new-york`).
**Routing:** React Router v6 (not relevant here — we live inside `/settings`).
**State:** TanStack Query for server state. Local React state for form dirty
flag + collapsed/expanded toggle. NO Redux/zustand/jotai.

## Visual spec (locked, derived from designs)

### Tile shell — collapsed
```
┌─────────────────────────────────────────────────────────────────────────┐
│ [IG]  IGDB  Internet Game Database                       [ Konfiguruj ] │
│ □    Auto-uzupełnianie metadanych, okładek i dat premier z…             │
└─────────────────────────────────────────────────────────────────────────┘
```
- 10px border radius, 1px `border-apex-line-4`, bg-white, px-4 py-3.5
- Mark = 36×36 rounded-[8px] purple gradient with "IG"
- Right slot = outline button "Konfiguruj" (variant outline, size sm — 8px height)

### Tile shell — collapsed + CONNECTED (after saved + enabled)
Same shell, but:
- IG mark gets a 14×14 green check badge bottom-right corner (already
  implemented in the existing `IntegrationCard`)
- Right slot = outline button "Konfiguruj"
- Add a `CONNECTED` badge inline with the name + tagline row:
  `IGDB · Internet Game Database  [CONNECTED]`
  Badge: bg-emerald-100, text-emerald-800, text-[10px], font-bold,
  tracking-wide, px-2 py-0.5, rounded-md

### Tile shell — expanded
The whole tile gains an inline body (use `SettingsInlineToggle` to animate
the expansion, matching `PasswordRow`). Header right slot becomes a "Hide"
outline button. Inside the body:

```
┌──────────────────────────────────────────────────────────────────────┐
│ ┌──────────────────────────────────────────────────────────────────┐ │
│ │  Integration enabled                                       (●)    │ │  ← inner card-in-card
│ │  Apex zapyta IGDB przy dodawaniu lub synchronizacji gier.         │ │
│ └──────────────────────────────────────────────────────────────────┘ │
│                                                                      │
│  Client ID                                                           │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │ apex-public-…d9f2                                            │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                                                                      │
│  Client secret                                                       │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │ ●●●●●●●●●●●                                                  │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                                                                      │
│  [API documentation ↗]                       [ Cancel ] [ Save ]    │
└──────────────────────────────────────────────────────────────────────┘
```

Body styles:
- Inner toggle card: `rounded-[8px] border border-apex-line-4 bg-white px-4 py-3`,
  toggle on the right (shadcn `Switch`, size default)
- Toggle label text: 13px font-semibold; description: 12px text-apex-muted
- Field labels: 12px font-semibold text-apex-ink, lowercase-style
- Input: shadcn `Input`, full width, height 36px, text-[13px], font-mono for
  the values (it's a credential field)
- Bottom row: flex justify-between. Left: link "API documentation ↗" to
  `https://api-docs.igdb.com/`, target _blank, text-apex-accent text-[13px].
  Right: outline "Cancel" + primary "Save changes" buttons, gap-2.
- Disconnect button: lives BELOW the Cancel/Save row, full width or
  left-aligned, variant=ghost with red text. (Implementation lands in Phase 7.)

### State matrix
| State | Toggle | Cancel | Save |
|-------|--------|--------|------|
| `not-configured`, form pristine, fields empty | disabled (off) | disabled | disabled |
| `not-configured`, fields filled | disabled (off, with tooltip "Zapisz dane API, aby aktywować") | enabled | enabled |
| `configured`, form pristine | enabled (reflects DB enabled flag) | disabled | disabled |
| `configured`, dirty | enabled (clickable, dirty bit) | enabled | enabled |
| submitting | locked, spinner overlay | hidden | spinner |
| submit error | unlocked, inline error under failing field | enabled | enabled |

### Inline error mapping
Map `PUT` problem+json types → field-level message:
- `/errors/invalid-credentials` with `reason: 'client_id'` →
  show under Client ID: `Twitch nie rozpoznał tego Client ID.`
- `/errors/invalid-credentials` with `reason: 'client_secret'` →
  show under Client secret: `Twitch odrzucił Client secret.`
- `/errors/invalid-credentials` with `reason: 'unknown'` →
  show under Client secret: `Twitch odrzucił dane logowania.`
- `/errors/twitch-unavailable` → top-of-body banner:
  `IGDB jest chwilowo niedostępne. Spróbuj ponownie za chwilę.`
- `/errors/twitch-timeout` → top-of-body banner:
  `Nie udało się skontaktować z IGDB. Sprawdź połączenie i spróbuj ponownie.`
- `/errors/invalid-input` → use Zod issues, map to fields by path
- `/errors/storage-corrupt` → top-of-body banner:
  `Zapisane dane uwierzytelniające są uszkodzone. Wpisz Client secret ponownie.`

Use `sonner` toast for success: `toast.success('Zapisano. IGDB połączone.')`.

## Relevant files (edit only these)
- `apps/client/src/lib/api.ts` — ADD `fetchIgdbIntegration`, `saveIgdbIntegration`, `deleteIgdbIntegration` functions
- `apps/client/src/hooks/use-igdb-integration.ts` — new: `useIgdbIntegrationQuery`, `useSaveIgdbIntegrationMutation` (clearMutation lands in Phase 7)
- `apps/client/src/components/settings/igdb-integration-card.tsx` — new component
- `apps/client/src/pages/settings/settings-page.tsx` — replace IGDB tile usage with the new component
- `apps/client/src/components/ui/switch.tsx` — if shadcn's `Switch` is not yet installed in this project, add it via `bunx shadcn@latest add switch` BEFORE writing the component

## Files to read but NOT edit
- `apps/client/src/components/settings/settings-card.tsx`, `settings-row.tsx`, `settings-inline-toggle.tsx` — existing primitives
- `apps/client/src/pages/settings/account-password-form.tsx` — canonical inline form pattern with uncontrolled inputs + FormData + apiFetch
- `apps/client/src/lib/api-fetch.ts` — `apiFetch` wrapper + `ApiError` problem-json parsing
- `apps/client/src/lib/query-client.ts` — staleTime defaults
- `apps/client/src/components/ui/dialog.tsx`, `button.tsx`, `input.tsx` — existing shadcn primitives
- The current `settings-page.tsx:75-140` `IntegrationsSection` for context

## Constraints
- Form inputs are UNCONTROLLED. Submit via `<form>` + `FormData`. This is
  REQUIRED — controlled inputs lose browser autofill until the user interacts.
  (This is project convention; see `account-password-form.tsx`.)
- Use TanStack Query for server state. Mutation returns the response body
  so the optimistic UI update is trivial (set query data on success).
- DO NOT call `fetch` directly. Always use `apiFetch` from `lib/api-fetch.ts`.
- DO NOT write Tailwind classes from memory if uncertain. The existing
  `IntegrationCard` shows the spacing/colors; reuse them.
- The mutation MUST send a fresh `Idempotency-Key` per click (use
  `crypto.randomUUID()`). On retry of the same click (e.g. network blip),
  same key. The simplest way: regenerate on each form submit and reset
  on success/error.
- Toggle's `disabled` state lives in the form, not the server. The server
  doesn't enforce "you can't enable without secret" — the UI does.
- On Cancel: re-fetch the query (`queryClient.invalidateQueries`) and reset
  form to that data, then close the editor body but keep the tile expanded.
  Cancel does NOT collapse the tile; "Hide" does.
- The "Hide" button collapses the tile. If there are unsaved changes,
  show a shadcn `AlertDialog` confirm: "Odrzucić zmiany?" (don't implement
  the dialog mechanics in this phase if you're crunched — just check
  `formDirty` and, if true, ask via `window.confirm` as a placeholder.
  Replace with shadcn `AlertDialog` in Phase 7 alongside the Disconnect dialog.)

## Steps

### Step 1: API client + query/mutation hooks
**Files:**
- `apps/client/src/lib/api.ts` — APPEND three exports
- `apps/client/src/hooks/use-igdb-integration.ts` — new

In `api.ts`, mirror the shape of existing helpers (`fetchMetadataStatus` etc.):
```ts
export type IgdbIntegrationStatusResponse = {
  status: 'not-configured' | 'configured';
  enabled: boolean;
  clientIdMasked: string | null;
  hasSecret: boolean;
  lastVerifiedAt: string | null;
  updatedAt: string | null;
};

export async function fetchIgdbIntegration(signal?: AbortSignal): Promise<IgdbIntegrationStatusResponse> {
  return apiFetch('/api/integrations/igdb', { signal });
}

export async function saveIgdbIntegration(input: {
  clientId: string;
  clientSecret: string | null;
  enabled: boolean;
  idempotencyKey: string;
}): Promise<IgdbIntegrationStatusResponse> {
  return apiFetch('/api/integrations/igdb', {
    method: 'PUT',
    headers: { 'Idempotency-Key': input.idempotencyKey },
    body: JSON.stringify({
      clientId: input.clientId,
      clientSecret: input.clientSecret,
      enabled: input.enabled,
    }),
  });
}

export async function deleteIgdbIntegration(idempotencyKey: string): Promise<void> {
  await apiFetch('/api/integrations/igdb', {
    method: 'DELETE',
    headers: { 'Idempotency-Key': idempotencyKey },
    parseAs: 'text', // expect 204 no-content
  });
}
```
(Use whatever `apiFetch` exposes for "don't parse json" — read the helper first.)

In `use-igdb-integration.ts`:
```ts
export const igdbIntegrationQueryKey = ['integrations', 'igdb'] as const;

export function useIgdbIntegrationQuery() {
  return useQuery({
    queryKey: igdbIntegrationQueryKey,
    queryFn: ({ signal }) => fetchIgdbIntegration(signal),
    staleTime: 30_000,
  });
}

export function useSaveIgdbIntegrationMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: saveIgdbIntegration,
    onSuccess: (data) => {
      qc.setQueryData(igdbIntegrationQueryKey, data);
      // Status endpoint surface used elsewhere (add-game-modal etc.) — invalidate it too
      qc.invalidateQueries({ queryKey: ['igdb-status'] });
    },
  });
}
```
(The clear mutation comes in Phase 7.)

Type-check: `bun --filter @apex/client run typecheck`. Clean.

### Step 2: `IgdbIntegrationCard` skeleton — collapsed state only
**File:** `apps/client/src/components/settings/igdb-integration-card.tsx`

Build the collapsed view first. Reuse the existing `IntegrationCard`
inner layout but turn it into a self-contained component that reads from
`useIgdbIntegrationQuery`. Skeleton:
```tsx
export function IgdbIntegrationCard() {
  const { data, isLoading } = useIgdbIntegrationQuery();
  const [expanded, setExpanded] = useState(false);
  // ... loading skeleton when isLoading and no data
  const connected = data?.status === 'configured' && data.enabled && data.lastVerifiedAt !== null;

  return (
    <div className="rounded-[10px] border border-apex-line-4 bg-white">
      <div className="flex items-start gap-4 px-4 py-3.5">
        {/* mark + connected badge + name + tagline + description */}
        <div className="shrink-0 self-center">
          <Button variant="outline" size="sm" onClick={() => setExpanded((v) => !v)}>
            {expanded ? 'Hide' : 'Konfiguruj'}
          </Button>
        </div>
      </div>
      <SettingsInlineToggle open={expanded} id={...}>
        {/* form body — Step 3 */}
      </SettingsInlineToggle>
    </div>
  );
}
```

Then update `settings-page.tsx`:
- Replace the first `IntegrationCard` (the IGDB one, lines ~88-108 in the
  current file) with `<IgdbIntegrationCard />`.
- Keep the RAWG and MobyGames `IntegrationCard` instances and the "Więcej
  integracji wkrótce" card untouched.
- Remove the local `useIgdbStatusQuery` import in `IntegrationsSection` if
  it's no longer used (the new card has its own query).

Smoke test: dev server up, `/settings` shows the new tile collapsed.

### Step 3: Form body — fields, toggle, Save/Cancel
Build the expanded body. Use a `<form>` element with `onSubmit`. Inputs
have `name="clientId"` and `name="clientSecret"` (the secret input has
`type="password"`, `autoComplete="off"`).

State:
- `formDirty: boolean` — set true on any input change OR toggle change OR
  click-to-edit on the masked ClientID input.
- `clientIdEditing: boolean` — when `data.clientIdMasked` is present, the
  ClientID input shows the mask as a placeholder/value. On focus/change,
  flip to `clientIdEditing = true` so the input becomes fully editable.
- `pendingEnabled: boolean` — local copy of the toggle, initialized from
  `data.enabled`, reset on data refresh.
- `submitError: { type, fieldErrors, banner } | null` — set from mutation
  onError handler.
- `idempotencyKey: string` — `useState(() => crypto.randomUUID())`;
  regenerate on each submit attempt before calling mutate.

Submit handler:
1. `e.preventDefault()`; build a `FormData` from the form.
2. Determine the secret value: if `formData.get('clientSecret')` is an
   empty string AND `data.hasSecret`, send `clientSecret: null` (keep).
   Otherwise send the string.
3. Determine the ClientID value: if `clientIdEditing` is false, send
   `data.clientIdMasked` would be wrong — when not editing, send the
   currently-stored Client ID. The simplest way: keep the unmasked Client
   ID in the GET response? No — secret is encrypted, but ClientID is
   plaintext. **Update the GET response shape** (back in Phase 5 if not
   already done) to ALSO include `clientId: string | null` (the full
   unmasked Client ID — it's not a secret). The masked version is only for
   display. If the response doesn't include this, fall back to sending
   the masked value; this will fail validation and the user must re-enter.
   Prefer fixing Phase 5 — return both `clientId` and `clientIdMasked`.
4. Call `mutation.mutate({ clientId, clientSecret, enabled: pendingEnabled, idempotencyKey })`.

On success:
- `toast.success('Zapisano. IGDB połączone.')`.
- Reset `formDirty = false`, `clientIdEditing = false`, secret input
  value cleared (the placeholder dots will come from the fresh GET data).

On error:
- Read `ApiError.body.type` from the thrown ApiError to drive `submitError`
  per the Inline Error Mapping table in Visual spec.

Cancel handler:
- `formRef.current?.reset()`, set `formDirty = false`, set
  `pendingEnabled = data?.enabled ?? false`, set `clientIdEditing = false`.

Save button `disabled` rule:
- `!formDirty || mutation.isPending || !clientIdHasValue || (data.hasSecret === false && !secretHasValue)`

Toggle `disabled` rule:
- `data?.hasSecret !== true` → disabled with tooltip "Zapisz dane API, aby aktywować"
- Otherwise enabled.

### Step 4: Manual smoke test in browser
Spin up both servers in parallel:
```
bun --filter @apex/api run dev
bun --filter @apex/client run dev
```
Open `http://localhost:5173/settings`.

Walk through:
1. Fresh DB → IGDB tile is collapsed, Konfiguruj button visible. No CONNECTED badge.
2. Click Konfiguruj → expands, toggle disabled with tooltip, Save disabled.
3. Type a junk Client ID + junk secret → Save enabled, click → 422 inline
   error under the Client secret field. No toast. Form stays open.
4. Replace with real Twitch creds (use a personal test app — DO NOT commit them).
   Click Save → toast "Zapisano. IGDB połączone.", form refreshes with
   masked Client ID + dotted secret, toggle becomes enabled and ON,
   CONNECTED badge shows in collapsed-view preview (collapse + reopen to verify).
5. Re-open form, flip toggle OFF, click Save → toast success, CONNECTED
   badge disappears in collapsed preview (since `enabled === false`).
6. Re-open form, flip toggle ON, change nothing else, click Save → success.
7. Re-open form, click on the masked Client ID → input clears, type a new
   value, leave secret empty, Save → success (secret was kept).
8. Browser DevTools network tab: confirm every PUT has a unique
   `Idempotency-Key` header.

If any of the above fails, debug at the network level first
(`/api/integrations/igdb` request/response in DevTools), then at the
component level.

## If you get stuck
If the autofill behavior breaks (Chrome stops filling the credential field
on subsequent loads), check that inputs stay UNCONTROLLED and the form
uses `<form>` + FormData — controlled `useState`-driven inputs are the
known regression cause (project memory: `feedback_react_autofill_uncontrolled`).

If after 2 attempts something fails:
```
STUCK at Step <N>: <what failed, what error, what hypothesis>
```
Do not invent a custom autofill workaround; do not switch to a different
form library.
