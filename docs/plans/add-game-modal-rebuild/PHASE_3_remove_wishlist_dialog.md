# Add Game Modal Rebuild — Faza 3: Sprzątanie + smoke test

## Goal

Sprzątanie po fazie 2:

1. Usunąć **`AddWishlistDialog`** i jego wpięcie z `app-layout.tsx`.
2. Usunąć **`useAddGameWithMetadata`**, jeśli nikt już go nie używa.
3. Usunąć **`MetadataMatchPicker`**, jeśli nikt już go nie używa.
4. Zaktualizować `sidebar.tsx` (link "Add to wishlist") tak, żeby otwierał
   ujednolicony modal poprawnie. Dziś sidebar ma:
   `{ label: 'Wishlist', icon: 'heart', to: '/wishlist', addTo: '/wishlist?add=1' }`
   — to wystarczy (modal sam wykryje `kind` z `pathname`). Sprawdzamy tylko, że
   klikanie tego przycisku przy wejściu z `/games` najpierw nawiguje na
   `/wishlist?add=1`, a nie tylko ustawia `?add=1`.
5. Ręczny smoke test obu trybów + ścieżki "IGDB off".

## Pliki

- `apps/client/src/components/add-wishlist-dialog.tsx` (usunięcie)
- `apps/client/src/components/layout/app-layout.tsx` (usunięcie importu i usage'u)
- `apps/client/src/hooks/use-add-game-with-metadata.ts` (warunkowe usunięcie)
- `apps/client/src/components/metadata-match-picker.tsx` (warunkowe usunięcie)
- `apps/client/src/components/layout/sidebar.tsx` (weryfikacja — bez zmian
  jeśli `addTo: '/wishlist?add=1'` już prowadzi przez `navigate(...)` zamiast
  `update({ add: '1' })`; jeśli używa `update`, dodaj `navigate('/wishlist?add=1')`)

## Hard constraints

- **Nie usuwaj nic na ślepo.** Każdy plik kandydat do usunięcia musi przejść
  `grep` po importach. Jeśli ma konsumenta poza usuwanym z tej fazy zakresem —
  zostaw, raportuj jako follow-up.
- Bez sed/perl. `Edit`/`Write` w dedykowanych plikach.
- `tsc --noEmit` musi przejść bez nowych błędów.
- Smoke test wykonuje operator (autor planu) — w raporcie zostawiasz checklistę.

## Kroki

### Krok 1. Audit konsumentów

```bash
grep -rn "AddWishlistDialog\|useAddGameWithMetadata\|MetadataMatchPicker" \
  apps/client/src --include="*.ts" --include="*.tsx"
```

Oczekiwane referencje **po fazie 2**:

- `AddWishlistDialog` — tylko import + render w `layout/app-layout.tsx`
  oraz sam plik komponentu. Jeśli tylko tutaj → usuwamy.
- `useAddGameWithMetadata` — nigdzie poza własnym plikiem (faza 2 powinna
  była odpiąć go z `add-game-dialog.tsx`). Jeśli tak → usuwamy plik.
- `MetadataMatchPicker` — jeśli tylko własny plik, usuwamy. Jeśli ktoś
  jeszcze importuje (np. inne strony) — zostawiamy i raportujemy.

### Krok 2. Usunięcie `AddWishlistDialog`

1. Usuń import + render z `apps/client/src/components/layout/app-layout.tsx`
   (`Edit` na istniejących liniach — `AddWishlistDialog` import i instancja
   JSX znikają, nic więcej w pliku nie ruszamy).
2. Usuń plik `apps/client/src/components/add-wishlist-dialog.tsx`
   (`rm` przez `Bash` — jedyna dozwolona destrukcja w tej fazie; przed `rm`
   pokaż `git status` żeby było widać że plik jest tracked).

### Krok 3. Usunięcie `useAddGameWithMetadata` (warunkowe)

Jeśli krok 1 potwierdził brak konsumentów:

```bash
rm apps/client/src/hooks/use-add-game-with-metadata.ts
```

W przeciwnym razie — zostaw, dopisz follow-up do raportu.

### Krok 4. Usunięcie `MetadataMatchPicker` (warunkowe)

Analogicznie do kroku 3. Plik to
`apps/client/src/components/metadata-match-picker.tsx`. Jeśli używany tylko
przez `add-game-dialog.tsx` w starej wersji (a faza 2 już go odpięła) —
usuwamy. Inaczej — zostaw, follow-up.

### Krok 5. Weryfikacja sidebara

```bash
grep -n "addTo" apps/client/src/components/layout/sidebar.tsx
```

Sprawdź, że klik w "Add to wishlist" w sidebarze faktycznie nawiguje na
`/wishlist?add=1` (a nie zostawia użytkownika na `/games` z `?add=1`).
Jeśli korzysta z helpera, który nie zmienia `pathname` — popraw na
`navigate('/wishlist?add=1')` (lub odpowiednik z react-router-dom).

### Krok 6. Smoke test (manual checklist)

W raporcie zostaw listę do odhaczenia przez operatora. Skrypt:

```
[ ] /games → przycisk "Add game" otwiera modal w trybie owned.
    Pole Platform jest pierwsze. Wpisanie ≥2 znaków w Title pokazuje
    dropdown z kandydatami IGDB (debounce ~300ms). Wybór kandydata
    hydratuje cover image (tytuł aktualizuje się do nazwy z IGDB).
    Klik "Add to collection" tworzy grę, redirect na /games/:id.
[ ] /wishlist → przycisk "Add to wishlist" otwiera ten sam modal w
    trybie wishlist. Brak sekcji Cover Color. Po wyborze kandydata
    submit "Add" tworzy wishlist item z developerem z IGDB
    (gdy podany), redirect na /wishlist/:id.
[ ] IGDB off (ustaw IGDB_CLIENT_ID="" w API i restart) → modal nadal
    działa, Title jest zwykłym inputem (brak dropdownu). Submit
    tworzy grę bez metadataRef.
[ ] Edycja tytułu po wybraniu kandydata zrywa selekcję — submit
    NIE doklei `metadataRef`. (Można sprawdzić w devtools Network.)
[ ] Cancel / outside-click zamyka modal i czyści stan; reopen
    otwiera czysty modal.
```

### Krok 7. Raport

Format z briefingu. Sekcje:

- `FILES` z listą zmienionych / usuniętych plików.
- `CHECKS`: `tsc --noEmit`, `git status` (czysty diff), wynik audytu z kroku 1.
- `NEXT-PHASE-NEEDS-TO-KNOW`: n/a (ostatnia faza). Wpisz tu **listę follow-upów**
  — np. "MetadataMatchPicker nie usunięty: nadal używany w X" — jeśli były.
