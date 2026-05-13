# IGDB integration tile — Phase 7: Disconnect dialog + cross-feature wiring

## Goal
Wrap up the frontend:
1. Add the "Rozłącz" red button + shadcn `AlertDialog` confirmation that
   calls `DELETE /api/integrations/igdb`.
2. Replace the placeholder `window.confirm` for "discard unsaved changes"
   (from Phase 6) with a proper shadcn `AlertDialog`.
3. Invalidate every TanStack Query that depends on IGDB state so that
   add-game-modal, metadata-match-picker, and the title autocomplete
   correctly reflect the new connected/disconnected status.
4. Final manual e2e click-through against a real Twitch test app.

## Definition of Done
- [ ] `bun --filter @apex/client run typecheck` clean
- [ ] `bun --filter @apex/client run lint` clean
- [ ] After disconnecting in Settings, opening the "Add game" modal shows
      the manual entry flow (no autocomplete / no rematch), with no console errors
- [ ] After reconnecting, the "Add game" modal autocomplete works again
- [ ] The full e2e checklist below passes

## Context
**Runtime:** Bun. `bun --filter @apex/client run dev` / `... typecheck` / `... lint`.
**UI:** shadcn `AlertDialog` is already in this project (see uses around
delete-confirm-dialog, recent commits `19c7710`, `8f28143`).

## Design decisions
- Disconnect button placement: inside the expanded form body, BELOW the
  Cancel/Save row, separated by a 12px gap and a 1px top divider line.
  Styling: ghost variant, red text (`text-red-600`), full width on mobile,
  left-aligned on desktop, label "Rozłącz".
- Disconnect AlertDialog copy:
  - Title: `Rozłączyć IGDB?`
  - Body: `Usuniemy zapisane dane uwierzytelniające. Aby ponownie korzystać z autouzupełniania, podaj je jeszcze raz.`
  - Cancel button: `Anuluj`
  - Confirm button: `Rozłącz` (variant destructive)
- After confirm:
  - `deleteMutation.mutate()` with a fresh idempotency key
  - On success: collapse the tile, toast `Rozłączono.`, invalidate queries
  - On error: keep the form open, surface a top-of-body banner: `Nie udało się rozłączyć. Spróbuj ponownie.`
- Discard-changes AlertDialog (separate dialog instance):
  - Title: `Odrzucić zmiany?`
  - Body: `Wprowadzone dane nie zostaną zapisane.`
  - Cancel button: `Wróć do edycji`
  - Confirm button: `Odrzuć` (variant destructive)
  - On confirm: form reset + collapse the tile
- Queries to invalidate after Save/Delete:
  - `['integrations', 'igdb']` — the card's own query
  - `['igdb-status']` — used by `use-igdb-status.ts`, consumed by
    `add-game-modal`, `title-autocomplete`, `metadata-match-picker`,
    `rematch-button`. Invalidating this is THE bridge so the rest of the
    app updates without a hard refresh.
  - Optionally: the `useIgdbStatusQuery` `staleTime: Infinity` setting is
    still safe as long as we always invalidate it on save/delete here.

## Relevant files (edit only these)
- `apps/client/src/components/settings/igdb-integration-card.tsx` — extend with disconnect + alert dialogs
- `apps/client/src/hooks/use-igdb-integration.ts` — add `useClearIgdbIntegrationMutation`
- `apps/client/src/hooks/use-igdb-status.ts` — verify the query is invalidated correctly (read-only check, no edit if already fine)
- `apps/client/src/components/ui/alert-dialog.tsx` — should already exist; if not, `bunx shadcn@latest add alert-dialog`

## Files to read but NOT edit
- `apps/client/src/components/delete-confirm-dialog.tsx` (or whatever the recent commits added) — canonical `AlertDialog` usage in this codebase
- `apps/client/src/components/add-game-modal.tsx` — how `useIgdbStatusQuery` is consumed
- `apps/client/src/components/title-autocomplete.tsx` — same
- `apps/client/src/components/metadata-match-picker.tsx` — same
- `apps/client/src/components/rematch-button.tsx` — same
- Phase 6 output: `igdb-integration-card.tsx`

## Constraints
- DO NOT change the API contracts (`DELETE /api/integrations/igdb` is final).
- DO NOT bypass `apiFetch` — the DELETE call goes through it.
- A fresh `crypto.randomUUID()` idempotency key per disconnect click.
- The disconnect dialog is INDEPENDENT of the discard-changes dialog —
  they are two `<AlertDialog>` instances with their own `open` state.
- Avoid focus traps: after either dialog closes, return focus to the
  trigger button (`AlertDialog` handles this automatically when you use
  `AlertDialogTrigger asChild`).
- DO NOT eager-invalidate `['games']` or other unrelated queries on
  save/delete — only IGDB-related ones.

## Steps

### Step 1: clear mutation hook + integrate query invalidation
**File:** `apps/client/src/hooks/use-igdb-integration.ts` (extend)

```ts
export function useClearIgdbIntegrationMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (idempotencyKey: string) => deleteIgdbIntegration(idempotencyKey),
    onSuccess: () => {
      qc.setQueryData(igdbIntegrationQueryKey, {
        status: 'not-configured',
        enabled: false,
        clientId: null,
        clientIdMasked: null,
        hasSecret: false,
        lastVerifiedAt: null,
        updatedAt: null,
      } satisfies IgdbIntegrationStatusResponse);
      qc.invalidateQueries({ queryKey: ['igdb-status'] });
    },
  });
}
```
(Adjust the optimistic data shape to match exactly what `GET` returns.)

Also revisit `useSaveIgdbIntegrationMutation`: ensure it ALSO invalidates
`['igdb-status']` (added in Phase 6 — verify, don't duplicate).

Typecheck clean.

### Step 2: Disconnect button + AlertDialog
**File:** `apps/client/src/components/settings/igdb-integration-card.tsx` (extend)

Add two new pieces of state:
```ts
const [disconnectOpen, setDisconnectOpen] = useState(false);
const [discardOpen, setDiscardOpen] = useState(false);
const clearMutation = useClearIgdbIntegrationMutation();
```

Below the Cancel/Save row, conditionally (only when `data?.status === 'configured'`):
```tsx
<div className="mt-3 border-t border-apex-line-4 pt-3">
  <AlertDialog open={disconnectOpen} onOpenChange={setDisconnectOpen}>
    <AlertDialogTrigger asChild>
      <Button variant="ghost" className="text-red-600 hover:text-red-700">
        Rozłącz
      </Button>
    </AlertDialogTrigger>
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>Rozłączyć IGDB?</AlertDialogTitle>
        <AlertDialogDescription>
          Usuniemy zapisane dane uwierzytelniające. Aby ponownie korzystać z autouzupełniania, podaj je jeszcze raz.
        </AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel disabled={clearMutation.isPending}>Anuluj</AlertDialogCancel>
        <AlertDialogAction
          disabled={clearMutation.isPending}
          onClick={(e) => {
            e.preventDefault(); // don't auto-close while mutation is in flight
            clearMutation.mutate(crypto.randomUUID(), {
              onSuccess: () => {
                toast.success('Rozłączono.');
                setDisconnectOpen(false);
                setExpanded(false);
              },
              onError: () => {
                // banner is set via mutation error state; dialog stays open until user dismisses
              },
            });
          }}
          className="bg-red-600 text-white hover:bg-red-700"
        >
          Rozłącz
        </AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
</div>
```

The error banner: in the form body header, render
```tsx
{clearMutation.isError && <FormBanner>Nie udało się rozłączyć. Spróbuj ponownie.</FormBanner>}
```
(`FormBanner` = small inline div, bg-red-50 text-red-700 px-3 py-2 rounded text-[12.5px]; you can inline it.)

### Step 3: Replace `window.confirm` with AlertDialog for "discard changes"
Hook the "Hide" button (header right slot when expanded) into the
`discardOpen` state instead of an immediate collapse:
```tsx
const handleHideClick = () => {
  if (formDirty) {
    setDiscardOpen(true);
    return;
  }
  setExpanded(false);
};
```

Wrap the dialog mirror of the disconnect one — title "Odrzucić zmiany?",
body "Wprowadzone dane nie zostaną zapisane.", buttons "Wróć do edycji" / "Odrzuć".
On confirm: `formRef.current?.reset()`, reset all local state to data, set
`formDirty = false`, `setDiscardOpen(false)`, `setExpanded(false)`.

Remove any `window.confirm(...)` calls left over from Phase 6.

### Step 4: Final e2e checklist
With a real Twitch test app, walk through (DO NOT commit creds anywhere):
1. Fresh DB, fresh client → settings shows IGDB collapsed, "Konfiguruj"
2. Configure → form → enter junk creds → 422 inline error
3. Enter real creds → success toast → collapsed tile shows CONNECTED badge
4. Open "Add game" modal → title autocomplete works (proves
   `['igdb-status']` was invalidated)
5. Back to settings → expand IGDB → click Rozłącz → AlertDialog appears →
   click Anuluj → dialog closes, no network call
6. Click Rozłącz → confirm → success toast → tile collapses, no CONNECTED badge
7. Open "Add game" modal → autocomplete is gone, form falls back to manual
   entry (proves `['igdb-status']` was invalidated again)
8. Reconfigure in Settings → flow repeats successfully
9. Expand IGDB → start typing in Client ID → click Hide → AlertDialog
   "Odrzucić zmiany?" appears → click "Wróć do edycji" → dialog closes,
   form intact
10. Click Hide → AlertDialog → click "Odrzuć" → form resets, tile collapses

DevTools network tab spot-checks:
- Every `PUT /api/integrations/igdb` has a unique Idempotency-Key
- Every `DELETE /api/integrations/igdb` has a unique Idempotency-Key
- `GET /api/games/metadata/status` is re-fetched after each save/delete
  (look for it in the network panel — not just from cache)

If everything in this list passes, the feature is done.

## If you get stuck
Most likely failure: the `useIgdbStatusQuery` returns stale data because
its `staleTime` is `Infinity`. The cure is `qc.invalidateQueries({ queryKey: ['igdb-status'] })`
in BOTH save and clear mutations — verify both call it.

If after 2 attempts something fails:
```
STUCK at Step <N>: <what failed, what error, what hypothesis>
```
