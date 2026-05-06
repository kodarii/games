---
name: Wishlist Phase 3 Frontend Cleanup
description: Frontend types + warunkowy render status/hours/developer (bez nowego UI)
type: plan
---

# Wishlist — Faza 3: Frontend cleanup po refaktorze

## Goal
Dostosować frontend do nowego kontraktu z faz 1-2: usunąć `'Wishlist'` ze `GameStatus`, dodać `GameKind`, zmienić `status`/`hoursPlayed`/`developer` na nullable w typie `Game`, warunkowo renderować te pola w listach i widoku gry. ŻADNEGO nowego UI dla wishlistu — to faza 5/6.

Po tej fazie `/games` dalej pokazuje wszystko (owned + wishlist), ale wishlistowe pozycje renderują się BEZ badge'a statusu i BEZ kolumny godzin. Aplikacja nie crashuje na `null`.

## Definition of Done
- [ ] `bun --cwd apps/client run typecheck` (lub główny `tsc --noEmit` z root) → 0 błędów
- [ ] `bun run lint` → 0 błędów w `apps/client`
- [ ] `apps/client/src/types.ts` eksportuje `GameKind = 'owned' | 'wishlist'`; `Game.kind: GameKind`
- [ ] `Game.status: GameStatus | null`, `Game.hoursPlayed: number | null`, `Game.developer: string | null`
- [ ] `GameStatus` w `apps/client/src/types.ts` ma 4 wartości (bez `'Wishlist'`)
- [ ] `bun run dev`: `/games` nie crashuje gdy są pozycje wishlistowe (wishlist row pokazuje pusty status, pusty hours)
- [ ] `add-game-dialog.tsx` NIE wysyła `developer: 'Unknown'` (puste pole = `undefined`/`null`)

Agent kończy pracę WYŁĄCZNIE gdy powyższe są spełnione.

## Context
**Runtime:** Bun (NIE npm)
**Stack:** React + react-router-dom + Radix UI + Tailwind
**Stan:** TanStack Query (`@/lib/queries.ts`)
**Tabele:** TanStack Table przez `@/components/data-table.tsx`

## Design decisions
- W tej fazie NIE dodajemy żadnego nowego komponentu, route'a ani entry w sidebarze
- Wishlistowe pozycje są nadal częścią `/games` — filtr `?kind=owned` doda dopiero faza 4/6
- Komórki tabeli z `null` renderują pusty string `''` (NIE `'-'`, NIE `'N/A'` — minimalizujemy zmiany kosmetyczne)
- W `game-view.tsx` sekcje status/hours/purchased są renderowane warunkowo (jeśli `null` — nie ma sekcji w ogóle, NIE pokazujemy "Brak danych")
- `add-game-dialog` dalej tworzy `kind: 'owned'` (default backendu) — formularz wishlistu doda faza 5

## Relevant files (edit only these)
- `src/types.ts`
- `src/lib/game-status.ts` (jeśli ma case `'Wishlist'` — usuń)
- `src/components/status-badge.tsx`
- `src/components/game-form.tsx` — TYLKO usunięcie `'Wishlist'` z tablicy `STATUS` (mode prop doda faza 6)
- `src/components/add-game-dialog.tsx` — usunąć hardcode `developer: 'Unknown'`
- `src/pages/games-columns.tsx`
- `src/pages/games-grid.tsx`
- `src/pages/games-mobile-list.tsx`
- `src/pages/game-view.tsx`

## Files to read but NOT edit
- `src/lib/queries.ts` — żeby wiedzieć jak typowane są API responses
- `src/components/data-table.tsx` — wzorzec użycia TanStack Table (info dla planisty: tabele już używają tego komponentu, NIE pisz własnej)

## Constraints
- NIE dodawaj nowych komponentów ani plików (cała faza to update istniejących)
- NIE wprowadzaj `?kind=` filtra po stronie API call w tej fazie
- NIE pisz Tailwind klas z głowy — jeśli nie znasz, czytaj sąsiednie pliki dla wzorca lub pobierz docs (Context7) — ale tu raczej nie potrzeba, zmiany są minimalne
- Komórki tabeli z `null` renderuj jako pusty string (`''` lub fragment `<></>`), NIE jako placeholder
- Nie zmieniaj layoutu / kolejności kolumn
- W `game-view.tsx` jeśli sekcja jest warunkowa — wzorzec: `{game.status != null && <Section>...</Section>}`

## Steps

### Step 1: Aktualizacja typów + helpers
**Co robimy:**
1. W `src/types.ts`:
   - `GameStatus` → `'Playing' | 'Completed' | 'Backlog' | 'Dropped'` (bez `'Wishlist'`)
   - Dodaj: `export type GameKind = 'owned' | 'wishlist';`
   - W interfejsie `Game`:
     - Dodaj `kind: GameKind;`
     - `developer: string | null;`
     - `hoursPlayed: number | null;`
     - `status: GameStatus | null;`
2. W `src/lib/game-status.ts`:
   - Jeżeli istnieje case `'Wishlist'` — usuń go (label, color, ikona — co tam jest)
   - Jeżeli helper zakłada że status jest zawsze stringiem — dodaj overload albo akceptuj `GameStatus | null` zwracając pusty obiekt/undefined dla null (sprawdź jak jest używany w status-badge i tabelach)
3. W `src/components/status-badge.tsx`:
   - Jeżeli pobiera `status: GameStatus` — zmień na `status: GameStatus | null` i return `null` dla null (komponent w ogóle się nie renderuje)
4. W `src/components/game-form.tsx`:
   - Znajdź tablicę `STATUS` (lub `STATUSES`) i usuń wartość `'Wishlist'`
   - NIE dotykaj reszty (mode prop dorobi faza 6)
5. `bun --cwd apps/client run typecheck` — przeczytaj błędy i przejdź do step 2

**Rezultat:** core types zaktualizowane, badge ogarnia null, helpers spójne.

### Step 2: Listy — warunkowy render status/hours/developer
**Co robimy:**
1. `src/pages/games-columns.tsx`:
   - Kolumna `status`: `cell: ({ row }) => row.original.status != null ? <StatusBadge status={row.original.status} /> : null`
   - Kolumna `hoursPlayed`: `cell: ({ row }) => row.original.hoursPlayed != null ? row.original.hoursPlayed : ''`
   - Kolumna `developer`: `cell: ({ row }) => row.original.developer ?? ''`
   - Kolumna `purchasedAt` (jeśli istnieje): `cell: ({ row }) => row.original.purchasedAt ?? ''`
2. `src/pages/games-grid.tsx`:
   - Jeżeli karta gry pokazuje status badge — owijaj w `{game.status != null && <StatusBadge status={game.status} />}`
   - Jeżeli pokazuje hours — `{game.hoursPlayed != null && <span>{game.hoursPlayed}h</span>}`
   - Developer — `{game.developer ?? ''}` lub warunkowy render sekcji jeśli null
3. `src/pages/games-mobile-list.tsx`:
   - Analogicznie do grid: warunkowy render badge, hours, developer

**Rezultat:** listy renderują się dla wishlistowych pozycji bez crashu.

### Step 3: `game-view.tsx` + `add-game-dialog.tsx`
**Co robimy:**
1. `src/pages/game-view.tsx`:
   - Znajdź `STATUSES` (jeśli istnieje lokalna kopia) — usuń `'Wishlist'`
   - Sekcja "Status" / "Hours played" / "Purchased at" / "Developer":
     - dla `status` — warunkowy render: `{game.status != null && <StatusSection ... />}` (lub odpowiednik)
     - dla `hoursPlayed` — `{game.hoursPlayed != null && <HoursSection ... />}`
     - dla `purchasedAt` — analogicznie
     - dla `developer` — analogicznie
   - Jeśli komponent ma editable inline status/hours — pomiń edycję na widoku jeśli pole jest null (zostawmy edycję na osobnej stronie edit; tutaj tylko display)
2. `src/components/add-game-dialog.tsx`:
   - Znajdź miejsce gdzie wysyła payload do `POST /api/games`
   - Usuń hardcode `developer: 'Unknown'` — przekaż `developer: developerInput?.trim() || undefined` (lub po prostu nie wysyłaj pola jeśli puste; backend Zod schema oczekuje opcjonalnie)
   - Dialog dalej tworzy `kind: 'owned'` (DOMYŚLNE w backendzie — możesz ALE NIE MUSISZ jawnie podać `kind: 'owned'` w payloadzie)
3. `bun --cwd apps/client run typecheck` → 0 błędów
4. `bun run lint` → 0 błędów
5. Manualny smoke (jeśli dev działa lokalnie): `bun run dev`, otwórz `/games` z mieszanym datasetem (uruchom seed jeśli trzeba). Wishlistowe pozycje powinny renderować się bez crashu.

**Rezultat:** widok gry obsługuje nullable, dialog nie wysyła "Unknown".

## If you get stuck
Jeśli po 2 próbach coś nie działa: ZATRZYMAJ. Napisz:
`STUCK at Step <N>: <co, jaki błąd, jaka hipoteza>`
Zakończ pracę.
