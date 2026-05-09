# Games Filter & Sort — Faza 7: Frontend Components

## Goal
Zbuduj prezentacyjne komponenty: `PillToggle`, `YearRangeSlider`, `FilterPopover`, `SortPopover`. Komponenty są bezstanowe (controlled), stan trzymany na zewnątrz przez `useGamesListState` (z Fazy 6). Wsparcie mobile przez Vaul Drawer (< 768px) zamiast Popover.

## Definition of Done
- [ ] `apps/client/src/components/pill-toggle.tsx` — `<button role="checkbox" aria-checked>` z 2 wariantami (active/inactive)
- [ ] `apps/client/src/components/year-range-slider.tsx` — Radix Slider (dual thumb) + 2 numeric inputs, controlled, `onCommit`
- [ ] `apps/client/src/components/games-filters.tsx` — Popover (desktop) / Drawer (mobile) z sekcjami PLATFORM, FORMAT, RELEASE YEAR, "Reset all"
- [ ] `apps/client/src/components/games-sort.tsx` — Popover/Drawer z listą pól + asc/desc toggle
- [ ] Wszystkie komponenty controlled (props in, callbacks out — ZERO useState dla danych)
- [ ] `bun run --cwd apps/client typecheck` zielone
- [ ] `bun run lint` zielone

Agent kończy pracę WYŁĄCZNIE gdy powyższe są spełnione.

## Context
**Runtime:** Bun (`bun run`, NIE npm)
**Stack:** React 18 + Tailwind + Radix UI + vaul + sonner
**Pakiety dostępne:** `@radix-ui/react-popover`, `@radix-ui/react-slider`, `vaul`, `sonner`, `@radix-ui/react-tooltip`
**Use mobile detection:** istniejący hook `apps/client/src/hooks/use-mobile.tsx` — sprawdź jego API; jeśli to `useIsMobile()` zwracające bool, użyj go

### Step 0: Pobierz dokumentację
Użyj Context7:
- @radix-ui/react-popover: "controlled open state, anchor positioning, custom trigger"
- @radix-ui/react-slider: "two thumbs range slider, onValueCommit, controlled"
- vaul: "Drawer component basic usage, controlled open"
- sonner: "Toaster setup, toast.warning"

## Visual spec

### PillToggle
- Inactive: `border border-apex-line-2 bg-white text-apex-ink-2 hover:bg-apex-surface-hover2`
- Active: `border-blue-500 bg-blue-50 text-blue-600` (outlined, NIE filled)
- Wszystkie: `inline-flex items-center px-[11px] py-[6px] rounded-[7px] text-[12.5px] transition-colors active:scale-[0.97] cursor-pointer`
- ARIA: `role="checkbox"`, `aria-checked={selected}`, `tabIndex={0}`, keyboard `Space/Enter` toggluje
- Dla długich nazw: `max-w-[200px] truncate` + Radix Tooltip z pełną wartością

### YearRangeSlider
- Wrapper: `flex flex-col gap-2`
- Radix Slider track: `relative flex h-1 w-full rounded-full bg-apex-line-2`
- Range fill: `absolute h-full rounded-full bg-blue-500`
- Thumb (×2): `block h-4 w-4 rounded-full border-2 border-blue-500 bg-white hover:ring-4 ring-blue-500/20 focus-visible:ring-4 focus-visible:outline-none`
- Pod sliderem: 2 numeric inputy w gridzie `grid grid-cols-[1fr_auto_1fr] items-center gap-2`, separator "–"
- Inputy: `w-full text-center px-2 py-1 border border-apex-line-2 rounded-[6px] text-[13px]` + `inputMode="numeric"` + `pattern="[0-9]*"`
- Suffix "h" lub "y" zależnie od kontekstu — tutaj YEAR, brak suffixu, bo lata są same w sobie czytelne
- Walidacja: `onCommit({ from, to })` — jeśli `from > to`, swap z `toast.warning("Switched range")` (sonner)
- Slider używa `onValueCommit` (NIE `onValueChange` do update'u URL — perf!). Lokalny state slidera jest `useState`, commit do parenta tylko na end-drag

### FilterPopover
- Trigger: `<FilterButton chevron>Filter</FilterButton>` → gdy `activeFilterCount > 0` zmiana stylu:
  - `border-blue-500 text-blue-600 hover:bg-blue-50/50`
  - Badge: `<span className="ml-1 inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-blue-500 px-[5px] text-[11px] font-semibold text-white animate-in zoom-in-50 duration-200">{activeFilterCount}</span>`
- Popover content (desktop, ≥ md):
  - `w-[420px] max-h-[80vh] overflow-y-auto p-5 bg-white rounded-[10px] shadow-md border border-apex-line-2`
  - Header: `flex items-center justify-between mb-4`
    - Left: `text-[15px] font-semibold text-apex-ink`Filters`</span>`
    - Right: `Reset all` → `text-[12px] text-red-600 hover:text-red-700` (TYLKO jeśli `activeFilterCount > 0`)
  - Sekcje (kolejno: PLATFORM, FORMAT, RELEASE YEAR):
    - Label: `text-[10.5px] font-semibold uppercase tracking-wider text-apex-muted mb-2`
    - PILLS container: `flex flex-wrap gap-2`
- Drawer (mobile, < md): identyczna zawartość jak popover, ale w Vaul `<Drawer.Content>` z bottom-sheet, swipe-to-close

### SortPopover
- Trigger: `<FilterButton chevron>Sort</FilterButton>`
- Content: lista pól (`title`, `releaseYear`, `platform`, `format`, `status`, `hoursPlayed`, `genre`)
- Każde pole: button row `flex items-center justify-between px-3 py-2 hover:bg-apex-surface-hover2`
  - Left: label (`Title`, `Release Year`, ...)
  - Right: jeśli aktywny → ikona `↑` lub `↓` + niebieski tekst
- Klik na pole: jeśli już aktywne → toggle dir (asc/desc); jeśli nieaktywne → ustaw to pole asc
- Brak "Reset" — sortowanie zawsze coś znaczy lub jest wyłączone (klik 3-tym razem czyści)
- Width: `w-[220px]`

### Mobile fallback
- W obu popoverach: użyj `useIsMobile()`. Jeśli mobile → render Vaul Drawer zamiast Radix Popover, z tym samym contentem.

### Relevant files (edit only these)
- `apps/client/src/components/pill-toggle.tsx` (NOWY)
- `apps/client/src/components/year-range-slider.tsx` (NOWY)
- `apps/client/src/components/games-filters.tsx` (NOWY)
- `apps/client/src/components/games-sort.tsx` (NOWY)

### Files to read but NOT edit
- `apps/client/src/components/filter-button.tsx` — istniejący trigger, reuse
- `apps/client/src/components/icons.tsx` — `Icon.chevdown` itp.
- `apps/client/src/lib/utils.ts` — `cn(...)`
- `apps/client/src/types.ts` — `GameFormat`, `GAME_FORMATS`, `GameSortField`, `GAME_SORT_FIELDS`, `SortDir`, `GameFilters`
- `apps/client/src/hooks/use-mobile.tsx` — hook detekcji mobile

## Constraints
- Komponenty są **prezentacyjne / controlled** — przyjmują wartości w props, emitują zmiany przez callbacks (`onChange`, `onReset`)
- ZERO useState dla danych biznesowych (filtry/sort) — tylko UI state (open/closed popover, lokalny slider drag)
- NIE używaj `cmdk` ani `lucide-react` jeśli icony są w `icons.tsx`
- Nazwy platform pochodzą z hooka `usePlatformsQuery()` — NIE hardcoduj listy
- `GAME_FORMATS` i `GAME_SORT_FIELDS` z `types.ts` — single source of truth
- Toast tylko przy swap (inverted range), NIE przy każdym kliknięciu pilla
- Slider używa `onValueCommit`, NIE `onValueChange` do propagowania do parenta

## Steps

### Step 1: PillToggle
**Co robimy:**
1. Utwórz `apps/client/src/components/pill-toggle.tsx`:
   ```tsx
   import { cn } from '@/lib/utils';

   export interface PillToggleProps {
     selected: boolean;
     onToggle: () => void;
     children: React.ReactNode;
     title?: string; // pełna nazwa do tooltipa
     disabled?: boolean;
   }

   export function PillToggle({ selected, onToggle, children, title, disabled }: PillToggleProps) {
     return (
       <button
         type="button"
         role="checkbox"
         aria-checked={selected}
         disabled={disabled}
         onClick={onToggle}
         onKeyDown={(e) => {
           if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggle(); }
         }}
         title={title}
         className={cn(
           'inline-flex items-center px-[11px] py-[6px] rounded-[7px] text-[12.5px]',
           'transition-colors active:scale-[0.97] cursor-pointer max-w-[200px] truncate',
           'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40',
           selected
             ? 'border border-blue-500 bg-blue-50 text-blue-600'
             : 'border border-apex-line-2 bg-white text-apex-ink-2 hover:bg-apex-surface-hover2',
           disabled && 'opacity-50 cursor-not-allowed',
         )}
       >
         {children}
       </button>
     );
   }
   ```
2. Typecheck zielony.

**Rezultat:** komponent gotowy.

### Step 2: YearRangeSlider
**Co robimy:**
1. Utwórz `apps/client/src/components/year-range-slider.tsx` z Radix Slider:
   ```tsx
   import * as Slider from '@radix-ui/react-slider';
   import { useEffect, useState } from 'react';
   import { toast } from 'sonner';

   export interface YearRangeSliderProps {
     min: number;
     max: number;
     value: [number, number];
     onCommit: (range: [number, number]) => void;
   }

   export function YearRangeSlider({ min, max, value, onCommit }: YearRangeSliderProps) {
     const [local, setLocal] = useState<[number, number]>(value);
     useEffect(() => setLocal(value), [value[0], value[1]]); // eslint-disable-line

     const handleInputCommit = (idx: 0 | 1, raw: string) => {
       const n = Number(raw);
       if (!Number.isInteger(n) || n < min || n > max) {
         setLocal(value); // reset to last committed
         return;
       }
       let next: [number, number] = idx === 0 ? [n, local[1]] : [local[0], n];
       if (next[0] > next[1]) {
         next = [next[1], next[0]];
         toast.warning('Switched range');
       }
       setLocal(next);
       onCommit(next);
     };

     return (
       <div className="flex flex-col gap-3">
         <Slider.Root
           className="relative flex w-full items-center select-none touch-none h-5"
           min={min}
           max={max}
           step={1}
           value={local}
           onValueChange={(v) => setLocal(v as [number, number])}
           onValueCommit={(v) => onCommit(v as [number, number])}
         >
           <Slider.Track className="relative flex-1 h-1 rounded-full bg-apex-line-2">
             <Slider.Range className="absolute h-full rounded-full bg-blue-500" />
           </Slider.Track>
           <Slider.Thumb className="block h-4 w-4 rounded-full border-2 border-blue-500 bg-white hover:ring-4 ring-blue-500/20 focus-visible:ring-4 focus-visible:outline-none" />
           <Slider.Thumb className="block h-4 w-4 rounded-full border-2 border-blue-500 bg-white hover:ring-4 ring-blue-500/20 focus-visible:ring-4 focus-visible:outline-none" />
         </Slider.Root>
         <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
           <input
             type="text"
             inputMode="numeric"
             pattern="[0-9]*"
             value={local[0]}
             onChange={(e) => setLocal([Number(e.target.value) || min, local[1]])}
             onBlur={(e) => handleInputCommit(0, e.target.value)}
             className="w-full text-center px-2 py-1 border border-apex-line-2 rounded-[6px] text-[13px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40"
             aria-label="Year from"
           />
           <span className="text-apex-muted">–</span>
           <input
             type="text"
             inputMode="numeric"
             pattern="[0-9]*"
             value={local[1]}
             onChange={(e) => setLocal([local[0], Number(e.target.value) || max])}
             onBlur={(e) => handleInputCommit(1, e.target.value)}
             className="w-full text-center px-2 py-1 border border-apex-line-2 rounded-[6px] text-[13px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40"
             aria-label="Year to"
           />
         </div>
       </div>
     );
   }
   ```
2. Upewnij się że `<Toaster />` jest mountowany w app rooto-wych komponentach (sprawdź `apps/client/src/main.tsx` lub `App.tsx`). Jeśli brak — dodaj `import { Toaster } from 'sonner'; ... <Toaster richColors position="top-center" />` w app shell. Jeśli nie ma czasu w tej fazie — odłóż na Fazę 8 jako TODO.

**Rezultat:** Slider działa, swap działa, focus-visible OK.

### Step 3: GamesFilters (Popover + Drawer)
**Co robimy:**
1. Utwórz `apps/client/src/components/games-filters.tsx`:
   - Importuj `Popover` z `@radix-ui/react-popover`, `Drawer` z `vaul`
   - Importuj `usePlatformsQuery` z `@/lib/queries`
   - Props:
     ```ts
     interface Props {
       filters: GameFilters;
       activeFilterCount: number;
       onChange: (patch: Partial<GameFilters>) => void;
       onReset: () => void;
     }
     ```
   - Render trigger: `FilterButton` (z `chevron`) ze stylem warunkowym + badge gdy `activeFilterCount > 0`
   - Content (helper `<FiltersBody />`):
     - Header z `Filters` + `Reset all` (warunkowo)
     - Sekcja PLATFORM: `usePlatformsQuery() → loading? skeleton pills (3× szare bloki) : platforms.map(p => <PillToggle ...>)`
     - Sekcja FORMAT: `GAME_FORMATS.map(f => <PillToggle ...>)`
     - Sekcja RELEASE YEAR: `<YearRangeSlider min={2000} max={2030} ...>`
   - Mobile: `useIsMobile()` → render Vaul Drawer; Desktop → render Radix Popover
2. Skeleton pills:
   ```tsx
   {[0,1,2].map(i => (
     <span key={i} className="h-[28px] w-[80px] rounded-[7px] bg-apex-surface-head animate-pulse" />
   ))}
   ```
3. Sortuj sekcje top-down: PLATFORM → FORMAT → RELEASE YEAR (zgodnie ze screenami).

**Rezultat:** komponent renderuje się desktop i mobile.

### Step 4: GamesSort (Popover + Drawer)
**Co robimy:**
1. Utwórz `apps/client/src/components/games-sort.tsx`:
   - Props:
     ```ts
     interface Props {
       sort?: GameSortField;
       dir: SortDir;
       onChange: (sort: GameSortField | undefined, dir: SortDir) => void;
     }
     ```
   - Trigger: `FilterButton`Sort`</FilterButton>`
   - Content (lista):
     ```tsx
     const FIELDS: Array<{ id: GameSortField; label: string }> = [
       { id: 'title', label: 'Title' },
       { id: 'releaseYear', label: 'Release year' },
       { id: 'platform', label: 'Platform' },
       { id: 'format', label: 'Format' },
       { id: 'status', label: 'Status' },
       { id: 'hoursPlayed', label: 'Hours played' },
       { id: 'genre', label: 'Genre' },
     ];
     ```
     Każdy row: button `w-full flex items-center justify-between px-3 py-2 text-[13px] hover:bg-apex-surface-hover2 rounded-[6px]`
     Klik logika:
       - jeśli `sort === field && dir === 'asc'` → toggle `dir='desc'`
       - jeśli `sort === field && dir === 'desc'` → wyłącz (`onChange(undefined, 'asc')`)
       - inaczej → `onChange(field, 'asc')`
     Right-side ikona `↑` lub `↓` (`Icon.arrow-up` jeśli istnieje, inaczej raw `↑`/`↓`) — w niebieskim, gdy aktywne pole. `transition-transform` przy zmianie kierunku.
2. Mobile: Vaul Drawer, ten sam content.

**Rezultat:** komponent sortowania gotowy.

## If you get stuck
Jeśli po 2 próbach coś nie działa: ZATRZYMAJ się. Napisz:
`STUCK at Step <N>: <co, jaki błąd, jaka hipoteza>`
Zakończ pracę.
