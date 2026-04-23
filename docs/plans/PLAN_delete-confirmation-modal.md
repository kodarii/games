# Add delete confirmation modal replacing browser confirm()

## Goal
Replace browser `window.confirm()` in GameViewPage with a proper Radix UI AlertDialog modal component for delete confirmation. This provides better UX with styled buttons, escape key handling, and accessible focus management.

## Definition of Done
- [ ] `@radix-ui/react-alert-dialog` installed (`bun add @radix-ui/react-alert-dialog`)
- [ ] `DeleteConfirmDialog` component created in `src/components/`
- [ ] GameViewPage uses DeleteConfirmDialog instead of window.confirm()
- [ ] Modal displays game title, shows cancel and delete buttons
- [ ] Delete button shows loading state during mutation
- [ ] `bun run lint` clean
- [ ] `bun test` all pass
- [ ] `bunx tsc --noEmit` clean

## Context
**Stack:** Bun, React, react-router-dom, Radix UI AlertDialog, Tailwind CSS
**Runtime:** Bun
**Konwencje:**
- Komponent dialogowy w `src/components/delete-confirm-dialog.tsx`
- GameViewPage deleguje logikę do dialogu
- NIE wrzucaj logiki biznesowej do komponentu — logika jest w queries.ts (useDeleteGameMutation)

### Relevant files (edit only these)
- `apps/client/package.json` — add dependency
- `apps/client/src/components/delete-confirm-dialog.tsx` — NEW component
- `apps/client/src/pages/game-view.tsx` — use Dialog instead of window.confirm()

### Files to read but NOT edit
- `apps/client/src/lib/queries.ts` — useDeleteGameMutation
- `apps/client/src/components/form-footer.tsx` — existing Button styles
- `apps/client/src/components/icon-button.tsx` — existing Button styles
- `tailwind.config.ts` — existing colors

## Constraints
- NIE dodawaj innych zależności
- NIE refaktoruj istniejących komponentów
- NIE twórz nowych testów (YAGNI — prosty UI component)

## Implementation plan

### Step 1: Install dependency
**Co robimy:** `bun add @radix-ui/react-alert-dialog`
**Rezultat:** Package added to package.json

### Step 2: Create DeleteConfirmDialog component
**Co robimy:** Utwórz `src/components/delete-confirm-dialog.tsx`:
- Import: AlertDialog from `@radix-ui/react-alert-dialog`
- Props: `{ open, onOpenChange, gameTitle, onConfirm, isDeleting }`
- Structure (from Context7 docs):
  ```tsx
  <AlertDialog.Root open={open} onOpenChange={onOpenChange}>
    <AlertDialog.Portal>
      <AlertDialog.Overlay className="fixed inset-0 bg-black/50" />
      <AlertDialog.Content className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-lg bg-white p-6 shadow-lg">
        <AlertDialog.Title className="text-lg font-semibold">
          Delete "{gameTitle}"?
        </AlertDialog.Title>
        <AlertDialog.Description className="mt-2 text-sm text-gray-600">
          This action cannot be undone.
        </AlertDialog.Description>
        <div className="mt-4 flex justify-end gap-2">
          <AlertDialog.Cancel className="rounded-md border px-4 py-2">Cancel</AlertDialog.Cancel>
          <AlertDialog.Action className="rounded-md bg-red-600 px-4 py-2 text-white" disabled={isDeleting}>
            {isDeleting ? 'Deleting...' : 'Delete'}
          </AlertDialog.Action>
        </div>
      </AlertDialog.Content>
    </AlertDialog.Portal>
  </AlertDialog.Root>
  ```
- Tailwind classes per existing design system (neutral scale)
**Rezultat:** Component exists and compiles

### Step 3: Integrate in GameViewPage
**Co robimy:** W `game-view.tsx`:
1. Import DeleteConfirmDialog
2. Add local state: `[deleteDialogOpen, setDeleteDialogOpen] = useState(false)`
3. Replace `window.confirm()` with `setDeleteDialogOpen(true)`
4. Add DeleteConfirmDialog at end of JSX:
  ```tsx
  <DeleteConfirmDialog
    open={deleteDialogOpen}
    onOpenChange={setDeleteDialogOpen}
    gameTitle={game.title}
    isDeleting={deleteMutation.isPending}
    onConfirm={async () => {
      try {
        await deleteMutation.mutateAsync(Number(id));
        navigate('/games');
      } catch (e) {
        alert(`Failed to delete: ${e}`);
      }
    }}
  />
  ```
**Rezultat:** Page uses modal instead of browser confirm

### Step 4: Final check
**Co robimy:** `bun run lint` + `bun test` + `bunx tsc --noEmit`
**Rezultat:** All clean

## Out of scope
- NIE dodawaj animacji/transition Radix
- NIE twórz reusable Dialog primitive (YAGNI — tylko delete confirmation)
- NIE dodawaj innych localization strings
- NIE dodawaj testów E2E dla modal