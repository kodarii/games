---
name: Wishlist Phase 5 Frontend list
description: Sidebar entry, /wishlist page (lista + add dialog), reuse GamesGrid/MobileList
type: plan
---

# Wishlist — Faza 5: Frontend — sidebar + lista wishlistu

## Goal
Dodać do frontendu:
1. Wpis "Wishlist" w sidebarze (ikona Heart, inline `+`, bez count badge), pod "Games"
2. Route `/wishlist` z listą gier wishlistowych (filtruje API przez `?kind=wishlist`)
3. Modal "Add to Wishlist" (`?add=1` na `/wishlist`) — bez pól status/hours/purchasedAt

Reuse `GamesGrid` i `GamesMobileList` bez modyfikacji (renderują to co dostaną — wishlistowe pozycje już renderują się czysto po fazie 3).

## Definition of Done
- [ ] Sidebar pokazuje "Wishlist" pod "Games" z ikoną serca + inline `+` button
- [ ] Klik w "Wishlist" otwiera `/wishlist`
- [ ] Klik w `+` przy "Wishlist" otwiera `AddWishlistDialog`
- [ ] `/wishlist` listuje TYLKO wishlistowe pozycje (API call z `?kind=wishlist`)
- [ ] Dodanie wishlist gry z samym `title` + `platform` działa, po sukcesie nawiguje do `/wishlist/:externalId`
- [ ] `bun --cwd apps/client run typecheck` → 0 błędów
- [ ] `bun run lint` → 0 błędów
- [ ] Smoke test w `bun run dev`: ścieżka opisana w DoD wyżej działa end-to-end

Agent kończy pracę WYŁĄCZNIE gdy powyższe są spełnione.

## Context
**Runtime:** Bun
**Stack:** React + react-router-dom + Radix UI + Tailwind, TanStack Query, TanStack Table
**Layout:** Aplikacja używa fullscreen Jira/Monday-style layout (NIE centered shell na grey background)
**Tabele:** Wszystkie tabele idą przez `@/components/data-table.tsx` + `useReactTable` (server-side paging/sorting). NIE pisz własnej tabeli.

### Step 0: Pobierz dokumentację
Użyj Context7:
- Radix UI: "Dialog primitive controlled open"
- lucide-react: "How to import individual icon (Heart)"

## Visual spec
**Sidebar entry:**
- Pozycja: między "Games" a "Dictionaries"
- Ikona: `Heart` z `lucide-react`, zarejestrowana jako `Icon.heart`
- Label: "Wishlist"
- Inline `+`: ten sam wzorzec co "Games" (przycisk po prawej stronie wpisu, otwiera `/wishlist?add=1`)
- BEZ count badge

**Lista `/wishlist`:**
- Layout: identyczny jak `/games` (toolbar góra, lista poniżej, infinite scroll)
- Toolbar: tytuł "Wishlist", ikona Heart obok tytułu, search input, przycisk "Add to wishlist"
- Lista (desktop): `GamesGrid` (reuse — renderuje karty bez badge'a statusu i bez hours dla wishlistowych pozycji dzięki fazie 3)
- Lista (mobile): `GamesMobileList` (reuse, j.w.)
- Pusta lista: placeholder "Nothing in your wishlist yet — add a game"

**Add to Wishlist dialog:**
- Tytuł: "Add to Wishlist"
- Pola: `title` (wymagane), `platform` (wymagane, select z dictionary), `developer` (opcjonalne)
- BEZ pól: `status`, `hoursPlayed`, `purchasedAt`, `format`, `genre`, `releaseYear`, `edition`, `coverImage`, `price` (te dodają się później przez edycję / move-to-collection)
- Submit: POST `/api/games` z payloadem `{ kind: 'wishlist', title, platform, developer? }`
- Po sukcesie: zamknij dialog, navigate do `/wishlist/:externalId`

## Relevant files (edit only these)
- `src/components/icons.tsx` — dodaj `heart` do `Icon`
- `src/components/layout/sidebar.tsx` — dodaj entry do `mainNav`
- `src/main.tsx` (lub gdzie są routes) — register `/wishlist`
- `src/lib/queries.ts` — `useInfiniteWishlistQuery` (lub rozszerz `useInfiniteGamesQuery` o param `kind`)
- `src/lib/api.ts` — funkcja fetch dla `?kind=wishlist`
- `src/pages/wishlist.tsx` — NOWY plik (kopia/adaptacja `games.tsx`)
- `src/pages/wishlist-columns.tsx` — NOWY plik (kopia `games-columns.tsx` minus status/hours/purchased + bez kolumny akcji w tej fazie; akcję "Move to collection" dorobi faza 6)
- `src/components/add-wishlist-dialog.tsx` — NOWY plik (uproszczona kopia `add-game-dialog.tsx`)

## Files to read but NOT edit
- `src/pages/games.tsx` — wzorzec strony z infinite scroll + toolbar
- `src/pages/games-columns.tsx` — wzorzec definicji kolumn (zaktualizowany w fazie 3)
- `src/pages/games-grid.tsx`, `src/pages/games-mobile-list.tsx` — REUSE bez zmian
- `src/components/add-game-dialog.tsx` — wzorzec form + submit + nawigacja
- `src/components/toolbar.tsx`, `src/components/search-input.tsx` — komponenty do reuse
- `src/types.ts` — `Game`, `GameKind` (z fazy 3)
- `src/lib/queries.ts` — wzorzec query keys i mutations

## Constraints
- Reuse `GamesGrid` i `GamesMobileList` BEZ zmian (renderują nullable pola od fazy 3)
- Tabela MUSI iść przez `@/components/data-table.tsx` (NIE pisz własnej)
- Layout fullscreen — NIE centered, NIE grey background, NIE okrojony do max-width container'a (zachowaj wzorzec z `/games`)
- Query key dla wishlistu: `['games', 'wishlist', ...]` (osobny od owned: `['games', 'owned', ...]` — owned zostanie odfiltrowany dopiero w fazie 6)
- Form: pola wymagane to TYLKO `title` i `platform` (developer opcjonalne, reszta nie istnieje na formularzu)
- Po sukcesie dodania — invaliduj `['games', 'wishlist']` query key
- Tailwind klasy: NIE pisz z głowy — kopiuj wzorce z `games.tsx` / `add-game-dialog.tsx`
- Ikona Heart: `import { Heart } from 'lucide-react'`, dodaj do `Icon` jako `heart: ({ size = 24, className }) => <Heart size={size} className={className} />`

## Steps

### Step 1: Sidebar entry + ikona Heart + route registration
**Co robimy:**
1. W `src/components/icons.tsx`:
   - Dodaj import `Heart` z `lucide-react` (do istniejącej listy importów)
   - W obiekcie `Icon` dodaj entry: `heart: ({ size = 24, className }: IconProps) => <Heart size={size} className={className} />` (dopasuj sygnaturę do reszty)
   - Sprawdź że typ `IconName` zawiera `'heart'` (jeśli jest derivowany z keys `Icon` — automatycznie; jeśli ręczny — dodaj)
2. W `src/components/layout/sidebar.tsx`:
   - W tablicy `mainNav` wstaw entry **bezpośrednio po "Games"**:
     ```ts
     { label: 'Wishlist', icon: 'heart', to: '/wishlist', addTo: '/wishlist?add=1' },
     ```
3. W miejscu gdzie zarejestrowane są routes (`src/main.tsx` lub `app-layout.tsx` — sprawdź jak działa `/games`):
   - Dodaj route `/wishlist` → `<WishlistPage />` (lazy lub direct import — naśladuj wzorzec `/games`)
   - Dodaj route `/wishlist/:id` → reuse `<GameViewPage />` (ten sam component co `/games/:id` — `kind` przyjdzie z danych)
   - Dodaj route `/wishlist/:id/edit` → reuse `<GameEditPage />` (mode prop dorobi faza 6 — w tej fazie wystarczy że route istnieje, edit owned działa, edit wishlist może być chwilowo z pełnym formularzem)
4. **Komponent `WishlistPage` jeszcze nie istnieje** — utwórz pusty stub w `src/pages/wishlist.tsx`:
   ```tsx
   export default function WishlistPage() { return <div>Wishlist (TODO step 2)</div>; }
   ```
   żeby route'y się skompilowały
5. `bun run dev`: sidebar pokazuje "Wishlist" z ikoną; `/wishlist` renderuje stub bez crashu

**Rezultat:** sidebar entry działa, route'y zarejestrowane, stub strony istnieje.

### Step 2: Query layer + WishlistPage + columns
**Co robimy:**
1. W `src/lib/api.ts`:
   - Znajdź funkcję która woła `GET /api/games` (np. `fetchGames`)
   - Dodaj opcjonalny param `kind?: 'owned' | 'wishlist'` i jeśli podany — dorzuć do query string `?kind=...`
2. W `src/lib/queries.ts`:
   - Wzoruj się na `useInfiniteGamesQuery`. Dodaj wariant z parametrem `kind` (przekazywanym do `fetchGames`) oraz w `queryKey` umieść `kind` jako element (np. `['games', kind, search, sort, dir]`)
   - Możesz refaktorować istniejący hook żeby przyjmował `kind` (default `'owned'` lub `undefined` = nie filtruj — uważaj żeby nie zepsuć `/games`; lepiej dodaj OPCJONALNY param i nie zmieniaj domyślnego zachowania w tej fazie)
3. Utwórz `src/pages/wishlist-columns.tsx`:
   - Skopiuj `games-columns.tsx`
   - Usuń kolumny: `status`, `hoursPlayed`, `purchasedAt`
   - Reszta (title, developer, genre, platform, format, releaseYear) zostaje
   - Linki w kolumnie title — zmień na `/wishlist/:externalId` (zamiast `/games/:externalId`)
4. Zastąp stub `src/pages/wishlist.tsx` pełnym komponentem:
   - Skopiuj strukturę z `games.tsx`
   - Zmień: query hook → użyj wariantu z `kind: 'wishlist'`
   - Toolbar: tytuł "Wishlist", ikona `Icon.heart` obok tytułu, przycisk "Add to wishlist" otwiera `/wishlist?add=1`
   - Tabela: użyj `wishlist-columns` zamiast `games-columns`
   - Reuse: `GamesGrid` i `GamesMobileList` BEZ ZMIAN (przekaż im te same propsy co w `/games`, tylko items są wishlistowe)
   - Empty state: "Nothing in your wishlist yet — add a game"
5. `bun --cwd apps/client run typecheck` → 0 błędów
6. Smoke: `/wishlist` listuje wishlistowe pozycje (uruchom seed jeśli trzeba — seed już generuje wishlistowe od fazy 2)

**Rezultat:** `/wishlist` pokazuje listę wishlistową, query izolowane od `/games`.

### Step 3: AddWishlistDialog + montowanie + nawigacja
**Co robimy:**
1. Utwórz `src/components/add-wishlist-dialog.tsx`:
   - Kopia struktury z `add-game-dialog.tsx`, **uproszczona** — tylko pola `title`, `platform` (Select z dictionary platform), `developer` (opcjonalne)
   - Zmień tytuł dialogu na "Add to Wishlist", przycisk submit "Add"
   - Submit handler — POST `/api/games` z payloadem:
     ```ts
     { kind: 'wishlist', title: title.trim(), platform: platform.trim(), developer: developer.trim() || undefined }
     ```
   - Dialog otwiera się gdy URL ma `?add=1` na ścieżce `/wishlist` (ten sam wzorzec co `add-game-dialog`)
   - Po sukcesie:
     - invaliduj query `['games', 'wishlist']`
     - zamknij dialog (usuń `?add=1` z URL)
     - navigate do `/wishlist/${response.externalId}` (lub jak nazywa się pole zwrócone w response)
2. W miejscu gdzie montuje się `AddGameDialog` (`app-layout.tsx` lub `main.tsx`):
   - Strategia A (prosta): zawsze montuj OBA dialogi. Każdy sam sprawdza `?add=1` na swojej ścieżce. `AddGameDialog` otwiera się tylko na `/games`, `AddWishlistDialog` tylko na `/wishlist`. **Sprawdź jak `AddGameDialog` decyduje że ma się otworzyć** — jeśli ma już warunek na pathname, dodaj analogiczny w `AddWishlistDialog`. Jeśli nie — dodaj go w obu.
   - Strategia B: warunkowo montuj na podstawie pathname (`useLocation`). Wybierz tę co jest mniej inwazyjna dla istniejącego kodu.
3. Smoke test:
   - Klik `+` przy "Wishlist" w sidebarze → dialog otwiera się
   - Wpisz "Test Game" + wybierz platformę → submit
   - Modal zamyka się, URL zmienia na `/wishlist/<id>`, gra widoczna na liście `/wishlist`
4. `bun --cwd apps/client run typecheck` + `bun run lint` → 0 błędów

**Rezultat:** End-to-end add wishlist działa, navigacja po sukcesie poprawna.

## If you get stuck
Jeśli po 2 próbach coś nie działa: ZATRZYMAJ. Napisz:
`STUCK at Step <N>: <co, jaki błąd, jaka hipoteza>`
Zakończ pracę.
