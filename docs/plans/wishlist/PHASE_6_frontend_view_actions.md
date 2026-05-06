---
name: Wishlist Phase 6 Frontend view + actions
description: game-form mode prop, game-view kind-aware, useMoveToCollectionMutation, akcja Move z listy i widoku, /games filtruje owned
type: plan
---

# Wishlist — Faza 6: Frontend — view, edycja i akcja Move to Collection

## Goal
Domknąć feature wishlist po stronie frontendu:
1. `GameForm` dostaje prop `mode: 'owned' | 'wishlist'` — w trybie wishlist chowa pola `status`, `hoursPlayed`, `purchasedAt`
2. `GameView` (`/games/:id` i `/wishlist/:id` używają tego samego komponentu) — gdy `game.kind === 'wishlist'`: breadcrumb "Wishlist / {title}", sekcje status/hours/purchased nie renderują się, toolbar ma przycisk "Move to collection"
3. Hook `useMoveToCollectionMutation` w `queries.ts` — invaliduje obie listy (owned + wishlist)
4. Akcja "Move to collection" — kolumna akcji w `wishlist-columns.tsx` (per-row, optimistic update) + przycisk w toolbarze widoku
5. `/games` filtruje TYLKO `kind=owned` (od tego momentu wishlistowe pozycje znikają z `/games`)

## Definition of Done
- [ ] Edycja wishlistowej gry (`/wishlist/:id/edit`) NIE pokazuje pól status/hours/purchasedAt
- [ ] Edycja owned (`/games/:id/edit`) pokazuje wszystkie pola jak wcześniej
- [ ] Widok `/wishlist/:id`: breadcrumb "Wishlist / Title", brak sekcji status/hours/purchased, w toolbarze przycisk "Move to collection"
- [ ] Klik "Move to collection" (z listy LUB z widoku): pozycja znika z `/wishlist`, pojawia się w `/games` ze statusem `Backlog`, hours `0`. Jedno kliknięcie, bez modala
- [ ] `/games` listuje TYLKO owned (wishlistowe NIE widoczne)
- [ ] Toast lub feedback po move (jeśli aplikacja używa toastów — naśladuj wzorzec; jeśli nie — pomiń)
- [ ] `bun --cwd apps/client run typecheck` → 0 błędów
- [ ] `bun run lint` → 0 błędów

Agent kończy pracę WYŁĄCZNIE gdy powyższe są spełnione.

## Context
**Runtime:** Bun
**Stack:** React + react-router-dom + TanStack Query + Radix UI + Tailwind
**Layout:** Fullscreen Jira/Monday-style — zachowaj wzorzec
**Endpoint move-to-collection:** `POST /api/games/:externalId/move-to-collection` — istnieje od fazy 4

### Step 0: Pobierz dokumentację
Użyj Context7:
- TanStack Query: "useMutation with optimistic update and invalidateQueries on multiple keys"
- Radix UI: "Tooltip primitive" (do tooltipa na przycisku Move w kolumnie)

## Visual spec
**Wishlist row — kolumna akcji "Move to collection":**
- Pozycja: ostatnia kolumna w `wishlist-columns.tsx`
- Wygląd: ikona-button (np. `Icon.arrowRight` lub strzałka w prawo z `lucide-react`), ghost button (transparent bg, hover surface)
- Tooltip: "Move to collection"
- Klik: wywołuje `useMoveToCollectionMutation`, optimistic — usuwa wiersz z listy lokalnie, on success pokazuje toast (jeśli toasty są), on error przywraca wiersz + error toast

**Game view (wishlist mode):**
- Breadcrumb: "Wishlist / {title}" (zamiast "Games / {title}") — wykryj po `game.kind`
- Sekcje status/hoursPlayed/purchasedAt: NIE renderuj wcale
- Toolbar (góra widoku, obok przycisków Edit/Delete): dodaj przycisk **"Move to collection"** (primary button z ikoną strzałki)
- Po move success: navigate do `/games/${externalId}` (gra teraz jest owned — pokazujemy ją w nowym kontekście)

**Game form (wishlist mode):**
- Pola widoczne: title, platform, developer, genre, releaseYear, format, edition, coverColor, coverImage, price (price OK — wishlist może mieć, np. obserwowana cena)
- Pola UKRYTE w mode='wishlist': status, hoursPlayed, purchasedAt
- Submit payload: w mode='wishlist' — wyślij `kind: 'wishlist'` + pomiń ukryte pola; w mode='owned' — wyślij `kind: 'owned'` + wszystkie pola

## Relevant files (edit only these)
- `src/components/game-form.tsx` — dodaj prop `mode`
- `src/pages/game-view.tsx` — kind-aware breadcrumb, conditional sections, button "Move to collection"
- `src/pages/game-edit.tsx` — przekazuj prop `mode` do `GameForm` (na podstawie `game.kind` lub URL prefix)
- `src/lib/queries.ts` — `useMoveToCollectionMutation`
- `src/lib/api.ts` — funkcja `moveToCollection(externalId)` (POST endpoint)
- `src/pages/wishlist-columns.tsx` — dodaj kolumnę akcji "Move to collection"
- `src/pages/games.tsx` — w query call dodaj `kind: 'owned'`

## Files to read but NOT edit
- `src/types.ts` — `Game.kind` (z fazy 3)
- `src/components/icons.tsx` — żeby wybrać/dodać ikonę dla move
- `src/components/breadcrumb.tsx` — wzorzec użycia
- `src/components/icon-button.tsx` — wzorzec icon button do reuse
- `src/components/toolbar.tsx` — wzorzec przycisku w toolbarze widoku

## Constraints
- `GameForm` dostaje `mode` jako prop — NIE czytaj `kind` z context'u Reacta ani z URL inside form
- Decyzja `mode` w `game-edit.tsx`: priorytet `game.kind` z danych (jeśli loaded), fallback URL prefix (`/wishlist/` → wishlist, `/games/` → owned) podczas loading
- `useMoveToCollectionMutation` MUSI invalidować OBIE query keys: `['games', 'wishlist']` i `['games', 'owned']`
- Optimistic update na liście wishlist: w `onMutate` usuń wiersz z cache `['games', 'wishlist', ...]`; w `onError` przywróć
- Z `/games` od tej fazy: wywołanie API musi mieć `kind: 'owned'` — to BREAKING dla użytkowników którzy mieli wcześniej wszystko na `/games`. To zaplanowana zmiana — wishlist ma swoją zakładkę.
- Przycisk "Move to collection" w widoku — primary, NIE destructive (akcja korzystna)
- NIE wprowadzaj modala potwierdzającego — jedno kliknięcie wykonuje (decyzja projektowa)
- Tailwind: kopiuj wzorce z istniejących toolbarów / kolumn akcji — NIE pisz z głowy

## Steps

### Step 1: API + mutation hook
**Co robimy:**
1. W `src/lib/api.ts`:
   - Dodaj `export async function moveToCollection(externalId: string): Promise<{ game: Game }> { ... }` — POST do `/api/games/${externalId}/move-to-collection`, no body, parse JSON response
2. W `src/lib/queries.ts`:
   - Dodaj hook `useMoveToCollectionMutation`:
     ```ts
     export function useMoveToCollectionMutation() {
       const qc = useQueryClient();
       return useMutation({
         mutationFn: (externalId: string) => moveToCollection(externalId),
         onMutate: async (externalId) => {
           await qc.cancelQueries({ queryKey: ['games', 'wishlist'] });
           const snapshot = qc.getQueriesData({ queryKey: ['games', 'wishlist'] });
           // Optimistic: remove the row from all wishlist pages
           qc.setQueriesData({ queryKey: ['games', 'wishlist'] }, (old: any) => {
             if (!old?.pages) return old;
             return {
               ...old,
               pages: old.pages.map((p: any) => ({
                 ...p,
                 items: p.items.filter((g: Game) => g.externalId !== externalId),
               })),
             };
           });
           return { snapshot };
         },
         onError: (_err, _externalId, ctx) => {
           if (ctx?.snapshot) ctx.snapshot.forEach(([key, data]) => qc.setQueryData(key, data));
         },
         onSettled: () => {
           qc.invalidateQueries({ queryKey: ['games', 'wishlist'] });
           qc.invalidateQueries({ queryKey: ['games', 'owned'] });
         },
       });
     }
     ```
   - **UWAGA:** dopasuj kształt cache (`old.pages`, `items`) do tego co faktycznie zwraca `useInfiniteGamesQuery` w tym repo — przeczytaj go zanim wkleisz
3. `bun --cwd apps/client run typecheck` → 0 błędów

**Rezultat:** API + mutation gotowe.

### Step 2: GameForm `mode` prop + game-edit + game-view
**Co robimy:**
1. W `src/components/game-form.tsx`:
   - Dodaj prop: `mode: 'owned' | 'wishlist'` (wymagany, bez default'u — wszystkie call site'y muszą jawnie podać)
   - W ciele komponentu: gdy `mode === 'wishlist'`:
     - NIE renderuj inputów: `status`, `hoursPlayed`, `purchasedAt`
     - W submit handlerze: pomiń te pola w payloadzie, dorzuć `kind: 'wishlist'`
   - Gdy `mode === 'owned'`: zachowaj obecne zachowanie, dorzuć `kind: 'owned'` w payloadzie (lub pozwól default backendowi go ustawić — sprawdź czy istniejące calls działają bez `kind`)
2. W `src/pages/game-edit.tsx`:
   - Wylicz `mode = game?.kind ?? (location.pathname.startsWith('/wishlist/') ? 'wishlist' : 'owned')` (lub tylko z `game.kind` jeśli zawsze loaded przed renderem `GameForm`)
   - Przekaż `mode={mode}` do `<GameForm />`
3. W `src/pages/game-view.tsx`:
   - Breadcrumb: użyj `game.kind === 'wishlist' ? 'Wishlist' : 'Games'` jako parent label, target route odpowiednio `/wishlist` lub `/games`
   - Sekcje status / hoursPlayed / purchasedAt: warunkowy render (są już warunkowe od fazy 3, ale upewnij się że przy `kind='wishlist'` nie ma pustych "Status: —" — najlepiej `{game.kind === 'owned' && <StatusSection ... />}`)
   - Toolbar: gdy `game.kind === 'wishlist'`, dodaj przycisk **"Move to collection"** (primary, ikona strzałki). Klik:
     ```ts
     const moveMut = useMoveToCollectionMutation();
     const onMove = () => moveMut.mutate(game.externalId, {
       onSuccess: () => navigate(`/games/${game.externalId}`),
     });
     ```
   - Przycisk disabled gdy `moveMut.isPending`
4. `bun --cwd apps/client run typecheck` → 0 błędów
5. Smoke:
   - `/wishlist/:id/edit` — formularz bez status/hours/purchased
   - `/wishlist/:id` — breadcrumb "Wishlist", przycisk "Move to collection" widoczny

**Rezultat:** form mode-aware, view kind-aware z akcją Move.

### Step 3: Kolumna akcji w wishlist-columns + filtr `kind=owned` na /games
**Co robimy:**
1. W `src/pages/wishlist-columns.tsx`:
   - Dodaj na końcu nową kolumnę:
     ```ts
     {
       id: 'actions',
       header: '',
       cell: ({ row }) => <MoveToCollectionButton externalId={row.original.externalId} />,
       size: 48,
     }
     ```
   - Inline lub w osobnym pliku zdefiniuj `MoveToCollectionButton`:
     ```tsx
     function MoveToCollectionButton({ externalId }: { externalId: string }) {
       const mut = useMoveToCollectionMutation();
       return (
         <Tooltip content="Move to collection">
           <IconButton
             variant="ghost"
             disabled={mut.isPending}
             onClick={(e) => { e.stopPropagation(); mut.mutate(externalId); }}
           >
             <Icon.arrowRight size={16} />
           </IconButton>
         </Tooltip>
       );
     }
     ```
     - **Dopasuj** do istniejących wzorców `IconButton` / Tooltipa w repo (sprawdź `icon-button.tsx` i czy jest jakiś Tooltip wrapper). Jeśli nie ma Tooltipa — pomiń (nie dodawaj nowej zależności)
     - Jeśli `Icon.arrowRight` nie istnieje — dodaj go w `icons.tsx` (import `ArrowRight` z `lucide-react`)
   - `e.stopPropagation()` ważne — w listach często cały wiersz to link do `/wishlist/:id`; nie chcemy nawigować przy kliknięciu Move
2. W `src/pages/games.tsx`:
   - W wywołaniu query (przez hook z `queries.ts`) przekaż `kind: 'owned'`
   - Query key powinno być teraz `['games', 'owned', ...]` (jeśli refaktorowałeś hook w fazie 5 — już jest; jeśli nie — uważaj na overlap z `['games', 'wishlist']`)
3. Smoke end-to-end:
   - Otwórz `/wishlist`, klik strzałkę przy pozycji → wiersz znika z listy
   - Otwórz `/games` → ta sama gra widoczna ze statusem Backlog, 0h
   - Otwórz `/wishlist/:id` na owned grze (bezpośredni link) — gra ma `kind='owned'`, więc widok pokazuje sekcje status/hours; **opcjonalnie**: dodaj redirect `if (game.kind === 'owned' && location.pathname.startsWith('/wishlist/')) navigate('/games/' + game.externalId, { replace: true })` — jeśli proste do zaimplementowania, dodaj; jeśli komplikuje — pomiń (acceptable jako follow-up)
4. `bun --cwd apps/client run typecheck` + `bun run lint` → 0 błędów

**Rezultat:** akcja Move działa z listy i z widoku, `/games` filtruje owned.

## If you get stuck
Jeśli po 2 próbach coś nie działa: ZATRZYMAJ. Napisz:
`STUCK at Step <N>: <co, jaki błąd, jaka hipoteza>`
Zakończ pracę.
