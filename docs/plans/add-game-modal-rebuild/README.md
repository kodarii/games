# Plan: Add Game / Wishlist Modal Rebuild

Przebudowa modala **`AddGameDialog`** (`apps/client/src/components/add-game-dialog.tsx`)
i unifikacja flow dodawania do kolekcji oraz do wishlisty w jeden komponent.

## Cel

1. **Jeden wspólny modal** zamiast dwóch (`AddGameDialog` + `AddWishlistDialog`).
   Tryb (`kind: 'owned' | 'wishlist'`) wynika z `pathname` — `/games?add=1` →
   `owned`, `/wishlist?add=1` → `wishlist`. `AddWishlistDialog` zostaje usunięty.
2. **Jednoetapowy modal** (likwidacja step 2 / `MetadataMatchPicker` z tego flow):
   - Platforma na górze.
   - Pole "Title" z inline dropdownem podpowiedzi z IGDB (debounce 300ms).
   - Wybór kandydata hydratuje stan modala (cover image / developer / release year)
     i odkłada `metadataRef`, który leci do API w submicie.
   - Gdy IGDB nieskonfigurowane → `Title` jest zwykłym inputem (dropdown
     pozostaje zwinięty na poziomie `GameTitleAutocomplete`).
3. **Submit per kind**:
   - `owned` → `useCreateGameMutation` (`CreateGameInput`, status `Backlog`,
     format `physical`, opcjonalny `metadataRef`, redirect `/games/:id`).
   - `wishlist` → `useCreateWishlistMutation` (`CreateWishlistInput`,
     `kind: 'wishlist'`, opcjonalny `developer` z kandydata IGDB; **bez**
     `metadataRef` — payload wishlisty go nie obsługuje, redirect `/wishlist/:id`).

## Co już jest gotowe (z poprzedniego planu)

- `GET /api/games/metadata/status` → `{ igdbConfigured }`.
- `useIgdbStatusQuery()` (`@/hooks/use-igdb-status`).
- `useGameTitleAutocomplete()` (`@/hooks/use-game-title-autocomplete`).
- Komponent `GameTitleAutocomplete` (`@/components/game-title-autocomplete`)
  z combobox + dropdown + keyboard nav. **Reużywamy 1:1.**

## Fazy

1. **[PHASE 1](./PHASE_1_modal_state_hook.md)** — hook stanu modala:
   `useAddGameModalState({ kind })` zastępujący `useAddGameWithMetadata`.
   Bez step state, z `selectedCandidate` + hydratacją + branchem `submit`
   dla `owned`/`wishlist`. Stary hook usuwamy w fazie 3 (po przepięciu UI).
2. **[PHASE 2](./PHASE_2_modal_ui_rebuild.md)** — przebudowa UI
   `AddGameDialog`: Platform → Title (z `<GameTitleAutocomplete>`) → Cover Color.
   Detekcja `kind` z `pathname`. Tytuły / submit-label adaptują się do trybu.
   Wpięcie pojedynczego modala w `app-layout.tsx` dla obu sekcji.
3. **[PHASE 3](./PHASE_3_remove_wishlist_dialog.md)** — usunięcie
   `AddWishlistDialog` i `useAddGameWithMetadata` (jeśli nikt nie używa).
   Aktualizacja `sidebar.tsx`, `app-layout.tsx`. Smoke test ręczny obu trybów
   i ścieżki "IGDB off".

Każdą fazę odpalaj w osobnej sesji (czysty kontekst). Output fazy N zakłada,
że pliki z fazy N-1 są na dysku.

## Założenia / hard constraints

- Brak harness'a testowego w `apps/client` (potwierdzone w poprzednim planie).
  Tam gdzie testy są możliwe (pure logika hooka, integracyjne na backendzie) —
  TDD. UI weryfikowany manualnie w fazie 3.
- Bez `any`, `@ts-ignore`, `eslint-disable`. Bez sed/perl/node -e do edycji.
- Vertical slice: jedna ścieżka — Add Modal — przebudowana end-to-end.
- Nie ruszamy `game-form.tsx` (został z poprzedniej iteracji), nie ruszamy
  `MetadataMatchPicker` (nadal może być używany gdzie indziej — sprawdzamy
  w fazie 3, ale w tym flow już go nie wołamy).
