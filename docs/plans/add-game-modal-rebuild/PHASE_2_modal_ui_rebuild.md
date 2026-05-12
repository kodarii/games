# Add Game Modal Rebuild — Faza 2: Przebudowa UI modala

## Goal

Przebudować `apps/client/src/components/add-game-dialog.tsx`:

1. **Jednoetapowy** modal (likwidacja `step` i `MetadataMatchPicker` w tym flow).
2. Kolejność sekcji: **Platform → Title (z autocomplete) → Cover Color (tylko gdy `kind === 'owned'`)**.
3. Tryb wynika z `pathname`: `/games` → `owned`, `/wishlist` → `wishlist`.
4. Header / submit-label / redirect adaptują się do trybu.
5. Stan i submit zarządzany przez `useAddGameModalState` z fazy 1.
6. Title używa `<GameTitleAutocomplete>` (`@/components/game-title-autocomplete`).
   Edycja inputu po wybraniu kandydata musi wywołać `clearCandidate()` w hooku.

## Pliki

- `apps/client/src/components/add-game-dialog.tsx` (refaktor / przepisanie)

## Hard constraints

- Nie ruszamy `GameTitleAutocomplete` ani `useGameTitleAutocomplete`/`useIgdbStatusQuery`.
- `MetadataMatchPicker` może zostać w kodzie (sprzątanie w fazie 3 — jeśli nikt
  go nie używa). W tym modalu **nie wywołujemy** już `MetadataMatchPicker`.
- Bez `any`, `@ts-ignore`, `eslint-disable` (poza istniejącymi `biome-ignore`
  na `role="listbox"`/`role="option"` wewnątrz `GameTitleAutocomplete`).
- Cover Color renderujemy **wyłącznie** w trybie `owned` — wishlist nie używa
  `coverColor` w API.
- `AddPlatformDialog` zostaje wpięty tak jak dziś (klikalne "+ Add platform"
  otwiera dialog dodawania platformy; po dodaniu `setPlatform(p.name)`).
- Submit: po sukcesie zamknij modal (`update({ add: null }, { replace: true })`),
  zresetuj hook, nawiguj na `/games/:id` lub `/wishlist/:id` zgodnie z `kind`.

## Kroki

### Krok 1. Zbierz konteksty z poprzednich plików

```bash
grep -n "useUrlState\|usePlatformsQuery\|AddPlatformDialog\|CoverColorPicker" \
  apps/client/src/components/add-game-dialog.tsx
```

Wszystkie te zależności zostają. Przeczytaj też `GameTitleAutocomplete` —
sygnatura propsów ( `value`, `onChange`, `onPick`, `platform`, `enabled`,
`placeholder?` ).

### Krok 2. Przepisz `add-game-dialog.tsx`

Szkielet (skrócony — finalna implementacja ma uzupełnić labelki / class-name'y
zgodnie z istniejącym wyglądem; nie wprowadzaj nowych klas Tailwindowych
poza tym co już było):

```tsx
import { AddPlatformDialog } from '@/components/add-platform-dialog';
import { CoverColorPicker } from '@/components/cover-color-picker';
import { GameTitleAutocomplete } from '@/components/game-title-autocomplete';
import { Icon } from '@/components/icons';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import {
  type AddGameKind,
  useAddGameModalState,
} from '@/hooks/use-add-game-modal-state';
import { usePlatformsQuery } from '@/lib/queries';
import { useUrlState } from '@/lib/url-state';
import * as AlertDialog from '@radix-ui/react-alert-dialog';
import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

function resolveKind(pathname: string): AddGameKind | null {
  if (pathname.startsWith('/wishlist')) return 'wishlist';
  if (pathname.startsWith('/games')) return 'owned';
  return null;
}

export function AddGameDialog() {
  const { get, update } = useUrlState();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const kind = resolveKind(pathname);
  const open = kind !== null && get('add') === '1';

  const { data: platforms = [], isLoading: platformsLoading } = usePlatformsQuery();
  const [addPlatformOpen, setAddPlatformOpen] = useState(false);

  const state = useAddGameModalState({
    kind: kind ?? 'owned',
    initialPlatform: platforms[0]?.name ?? '',
  });

  useEffect(() => {
    if (!open) state.reset();
  }, [open]); // intencjonalnie tylko `open` w deps — reset przy zamknięciu

  const firstPlatformName = platforms[0]?.name ?? '';
  useEffect(() => {
    if (state.platform === '' && firstPlatformName !== '') {
      state.setPlatform(firstPlatformName);
    }
  }, [state.platform, firstPlatformName]);

  if (kind === null) return null; // modal nigdy nie powinien się otworzyć poza /games i /wishlist

  const close = () => update({ add: null }, { replace: true });

  const onSuccess = (game: { id: string }) => {
    close();
    state.reset();
    navigate(kind === 'wishlist' ? `/wishlist/${game.id}` : `/games/${game.id}`);
  };

  const canSubmit =
    state.title.trim().length > 0 &&
    state.platform !== '' &&
    !state.isSubmitting;

  const onSubmit = () => {
    if (!canSubmit) return;
    state.submit({ onSuccess });
  };

  const headerTitle = kind === 'wishlist' ? 'Add to Wishlist' : 'Add Game';
  const submitLabel = kind === 'wishlist' ? 'Add' : 'Add to collection';

  return (
    <>
      <AlertDialog.Root open={open} onOpenChange={(v) => !v && close()}>
        <AlertDialog.Portal>
          <AlertDialog.Overlay className="…" />
          <AlertDialog.Content
            onOpenAutoFocus={(e) => e.preventDefault()}
            className="…"
          >
            <AlertDialog.Title className="…">{headerTitle}</AlertDialog.Title>
            <AlertDialog.Description className="sr-only">
              {kind === 'wishlist'
                ? 'Add a game to your wishlist.'
                : 'Add a new game to your collection.'}
            </AlertDialog.Description>

            {/* PLATFORM — sekcja pierwsza */}
            <div className="mt-5">
              <FieldLabel>Platform</FieldLabel>
              {platformsLoading ? (
                <Select disabled value=""><option value="">Loading…</option></Select>
              ) : platforms.length === 0 ? (
                <div className="…">
                  <span className="…">No platforms — add one first</span>
                  <Button type="button" variant="outline" size="sm" onClick={() => setAddPlatformOpen(true)}>
                    <Icon.plus size={12} /> Add platform
                  </Button>
                </div>
              ) : (
                <>
                  <Select value={state.platform} onChange={(e) => state.setPlatform(e.target.value)}>
                    {platforms.map((p) => (<option key={p.id} value={p.name}>{p.name}</option>))}
                  </Select>
                  <button type="button" onClick={() => setAddPlatformOpen(true)} className="…">
                    + Add platform
                  </button>
                </>
              )}
            </div>

            {/* TITLE — z autocomplete IGDB */}
            <div className="mt-4">
              <FieldLabel>Title</FieldLabel>
              <GameTitleAutocomplete
                value={state.title}
                onChange={(next) => {
                  state.setTitle(next);
                  if (state.selectedCandidate) state.clearCandidate();
                }}
                onPick={(candidate) => state.pickCandidate(candidate)}
                platform={state.platform}
                enabled
                placeholder="Game title..."
              />
            </div>

            {/* COVER COLOR — tylko owned */}
            {kind === 'owned' && (
              <div className="mt-4">
                <FieldLabel>Cover Color</FieldLabel>
                <CoverColorPicker value={state.color} onChange={state.setColor} className="pt-[2px]" />
              </div>
            )}

            {state.submitError && (
              <div className="mt-3 text-[12px] text-red-600">{state.submitError.message}</div>
            )}

            <div className="mt-7 flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={close} disabled={state.isSubmitting}>
                Cancel
              </Button>
              <Button variant="primary" size="sm" onClick={onSubmit} disabled={!canSubmit}>
                {submitLabel}
              </Button>
            </div>
          </AlertDialog.Content>
        </AlertDialog.Portal>
      </AlertDialog.Root>
      <AddPlatformDialog
        open={addPlatformOpen}
        onOpenChange={setAddPlatformOpen}
        onCreated={(p) => state.setPlatform(p.name)}
      />
    </>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-[6px] text-[10.5px] font-semibold uppercase tracking-[0.08em] text-apex-hint">
      {children}
    </div>
  );
}
```

**Uwagi do classname'ów oznaczonych `…`**: skopiuj wartości 1:1 z obecnego
`add-game-dialog.tsx` (Overlay, Content, Title, FieldLabel wrappery, "No
platforms" fallback) — wygląd nie ma się zmienić, tylko struktura.

### Krok 3. Wpięcie w `app-layout.tsx`

Sprawdź jak modal jest dziś renderowany:

```bash
grep -n "AddGameDialog\|AddWishlistDialog" apps/client/src/components/layout/app-layout.tsx
```

Cel: w `app-layout.tsx` zostaje **jeden** `<AddGameDialog />` — sam wykryje
`kind` z `pathname`. `<AddWishlistDialog />` nie jest jeszcze usuwany w fazie 2
(zachowujemy kompatybilność), ale `<AddGameDialog />` musi być wyrenderowany
także dla ścieżek `/wishlist` (dziś jest renderowany bezwarunkowo — sprawdź).
Jeśli istnieje warunek `pathname.startsWith('/games')` blokujący render dla
wishlisty — usuń go (modal sam się otwiera/zamyka).

### Krok 4. Sanity check

```bash
cd apps/client && bunx tsc --noEmit
```

Brak nowych błędów. Pre-existing `games-mobile-list.tsx` może zostać.

```bash
git diff --stat apps/client/src
```

Spodziewane modyfikacje: `add-game-dialog.tsx`, ewentualnie `app-layout.tsx`.
Brak edycji w `GameTitleAutocomplete`, `game-form.tsx`, `add-wishlist-dialog.tsx`.

### Krok 5. Raport

Format z briefingu. W `NEXT-PHASE-NEEDS-TO-KNOW`:

- Czy `AddWishlistDialog` nadal jest renderowany w `app-layout.tsx`
  (do usunięcia w fazie 3) i jego trigger w `sidebar.tsx`.
- Czy `MetadataMatchPicker` ma jeszcze konsumentów po tym refaktorze.
- Czy detekcja `kind` po `pathname` poprawnie pokrywa wszystkie ścieżki
  (np. `/games/:id`, `/wishlist/:id` — modal nie powinien się tam otwierać
  bez `?add=1`, ale render powinien być zezwolony).
