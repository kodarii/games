# Search Clear Button + Sidebar Trigger — Faza 1: Frontend

## Goal

Dwie poprawki UI:
1. Przycisk X w polu search — pojawia się gdy wpisano tekst (na wszystkich urządzeniach), czyści search i URL param.
2. SidebarTrigger w nagłówku widoku szczegółów gry — umożliwia otwarcie sidebaru na wszystkich urządzeniach.

## Definition of Done

- [ ] Wpisanie tekstu w search → pojawia się ikona X po prawej stronie inputa
- [ ] Kliknięcie X → pole puste, URL param `search` usunięty, focus wraca do inputa
- [ ] Na widoku szczegółów gry (`/games/:id`) → widoczny przycisk otwierania sidebaru (lewy górny róg)
- [ ] `bun run --cwd apps/client typecheck` bez błędów
- [ ] `bun run lint` bez błędów

Agent kończy pracę WYŁĄCZNIE gdy powyższe są spełnione.

## Context

**Runtime:** Bun (NIE Node.js, NIE npm)
**UI stack:** React + Tailwind CSS + shadcn/ui + lucide-react
**Stan searcha:** `searchInput` / `setSearchInput` w `useGamesListState()`.
Ustawienie `setSearchInput("")` automatycznie czyści URL param przez istniejący `useEffect` (debounced sync w `games-list-state.ts`).

## Design decisions

- `SearchInput` dostaje nowe opcjonalne prropy: `value` (destrukturyzowany wprost) i `onClear?: () => void`.
- Gdy `onClear` jest podany ORAZ `value` jest niepuste → renderuj `<button>` z ikoną `X` (lucide-react) po prawej stronie inputa.
- Przycisk X używa `onMouseDown={(e) => e.preventDefault()}` — zapobiega przejęciu focusa, input zostaje sfocusowany. Sama akcja czyszczenia w `onClick`.
- `shortcut` (`KbdChip`) chować gdy `onClear` podany i value niepuste (wzajemnie się wykluczają).
- X button widoczny na wszystkich urządzeniach (desktop + mobile) — brak klas responsywnych.
- W `game-view.tsx` header dodać `<SidebarTrigger>` po lewej — identyczny styl jak w `AppHeader`.
- NIE refaktoruj reszty nagłówka w `game-view.tsx` — minimum zmian.

## Relevant files (edit only these)

- `apps/client/src/components/search-input.tsx` — dodaj propsy `value`/`onClear`, renderuj X button
- `apps/client/src/pages/games.tsx` — przekaż `onClear={() => setSearchInput("")}` do `SearchInput`
- `apps/client/src/pages/game-view.tsx` — dodaj `SidebarTrigger` do headera

## Files to read but NOT edit

- `apps/client/src/lib/games-list-state.ts` linie 37-47 — jak działa `setSearchInput` i sync z URL
- `apps/client/src/components/layout/app-header.tsx` linia 8 — styl `SidebarTrigger` do skopiowania

## Constraints

- NIE używaj `npm` ani `node` — tylko `bun`
- NIE zmieniaj logiki debounce ani URL sync — `setSearchInput("")` wystarczy
- NIE dodawaj animacji ani custom CSS — tylko Tailwind utility classes
- X button to `<button type="button">` z `onMouseDown={(e) => e.preventDefault()}` i `onClick={onClear}`
- Import `X` z `lucide-react` (już w projekcie), NIE z innego pakietu
- Import `SidebarTrigger` z `@/components/ui/sidebar` (już w projekcie)
- Po destrukturyzacji `value` z propsów — podaj `value={value}` do `<input>` jawnie

---

## Steps

### Step 1: Dodaj propsy `value` i `onClear` do `SearchInput`

**Plik:** `apps/client/src/components/search-input.tsx`

Co zrobić:
1. Dodaj `onClear?: () => void` do typu `SearchInputProps`.
2. Importuj `X` z `lucide-react`.
3. Destrukturyzuj `value` i `onClear` wprost w sygnaturze funkcji (obok `shortcut`):
   ```tsx
   { shortcut, containerClassName, className, placeholder = 'Search...', value, onClear, ...props }
   ```
4. Wewnątrz `<div>` kontenera, za `<input>`, dodaj warunek:
   ```tsx
   {onClear && value ? (
     <button
       type="button"
       onMouseDown={(e) => e.preventDefault()}
       onClick={onClear}
       className="flex shrink-0 items-center text-apex-hint hover:text-apex-ink-2"
       aria-label="Clear search"
     >
       <X size={13} />
     </button>
   ) : shortcut ? (
     <KbdChip>{shortcut}</KbdChip>
   ) : null}
   ```
5. Przekaż `value` jawnie do `<input>` (bo nie jest już w `...props`):
   ```tsx
   <input
     ref={ref}
     value={value}
     placeholder={placeholder}
     className={cn(...)}
     {...props}
   />
   ```

**Rezultat:** komponent kompiluje się. X widoczny gdy value niepuste i onClear podany. Kliknięcie X nie kradnie focusa.

---

### Step 2: Podłącz `onClear` w `games.tsx`

**Plik:** `apps/client/src/pages/games.tsx`

Co zrobić:
1. Znajdź `<SearchInput` (okolice linii 80-85).
2. Dodaj prop `onClear={() => setSearchInput("")}`.

Gotowy fragment po zmianie:
```tsx
<SearchInput
  value={searchInput}
  onChange={(e) => setSearchInput(e.target.value)}
  onClear={() => setSearchInput("")}
  placeholder="Search games..."
  containerClassName="order-last w-full md:order-none md:w-[220px] lg:w-[300px]"
/>
```

**Rezultat:** wpisanie tekstu → X widoczny; kliknięcie → pole puste, URL param znika, focus zostaje w inpucie.

---

### Step 3: Dodaj `SidebarTrigger` do nagłówka w `game-view.tsx`

**Plik:** `apps/client/src/pages/game-view.tsx`

Co zrobić:
1. Dodaj import na górze pliku:
   ```tsx
   import { SidebarTrigger } from '@/components/ui/sidebar';
   ```
2. Znajdź header div (okolice linii 291-292):
   ```tsx
   <div className="flex h-[63px] flex-shrink-0 items-center justify-between border-b border-[#eee] bg-white px-4 lg:px-6">
     <div className="flex min-w-0 items-center gap-3">
   ```
3. Wstaw `<SidebarTrigger>` jako PIERWSZE dziecko wewnętrznego `<div className="flex min-w-0 items-center gap-3">` — przed ikoną gry:
   ```tsx
   <div className="flex h-[63px] flex-shrink-0 items-center justify-between border-b border-[#eee] bg-white px-4 lg:px-6">
     <div className="flex min-w-0 items-center gap-3">
       <SidebarTrigger className="shrink-0 text-apex-ink-3 hover:text-apex-ink" />
       <div
         className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg text-white"
   ```

**Rezultat:** widoczny przycisk otwierania/zamykania sidebaru w nagłówku szczegółów gry.

---

### Step 4: Weryfikacja

```bash
bun run --cwd apps/client typecheck
bun run lint
```

Oba muszą przejść bez błędów.

---

## If you get stuck

Jeśli po 2 próbach coś nie działa: ZATRZYMAJ się. Napisz:
`STUCK at Step <N>: <co, jaki błąd, jaka hipoteza>`
Zakończ pracę.
