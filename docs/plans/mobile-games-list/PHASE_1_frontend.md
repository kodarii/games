# Mobile Games List — Faza 1: Frontend

## BLOKER — sprawdź przed implementacją

Przed rozpoczęciem pracy sprawdź typ `releaseYear` w `apps/client/src/types.ts`:

```ts
releaseYear: number        // ← ZŁE — blokuje tę fazę
releaseYear: number | null // ← OK — można kontynuować
```

Jeśli `releaseYear: number` (bez `| null`) — **zatrzymaj się**. Oznacza to że hotfix
nullable releaseYear nie został jeszcze wykonany. Ten plan zakłada że `releaseYear`
jest `number | null` przez cały stos (DB, domain, API, frontend types).

Zrób hotfix najpierw (osobny plan), wróć tu po merge'u.

---

## Goal

Zamienić poziomy scroll tabeli gier na mobile (<md) na rozszerzalne karty.
Desktop (md+) bez zmian. Karta wygląda identycznie jak wiersz CardsTable.

## Definition of Done

- [ ] Na viewport <768px brak poziomego scrollu na stronie listy gier
- [ ] Toggle grid/list **ukryty** na mobile (zawsze list view)
- [ ] Karta collapsed: Avatar + tytuł + developer + chevron (identycznie jak Title cell)
- [ ] Karta expanded: Platform, Format, Release Year jako pary label/wartość
- [ ] Release Year null → wyświetla `—`
- [ ] Tap na kartę (nie chevron) → navigate do `/games/:id`
- [ ] Tap na chevron → toggle expand (nie navigate)
- [ ] Desktop (md+): wygląd i zachowanie bez zmian (grid i list działają)
- [ ] `bun run check` czyste

Agent kończy pracę WYŁĄCZNIE gdy powyższe są spełnione.

## Context

**Runtime:** Bun (NIE Node.js, NIE npm — `bun run check`)
**Framework:** React + react-router-dom (`useNavigate`)
**UI stack:** Tailwind CSS utility classes ONLY — NIE pisz custom CSS
**Responsywność:** breakpoint `md` = 768px (`hidden md:block` / `md:hidden`)

## Design decisions

To czysty frontend — zero zmian w domenie, API, DataTable.
`GamesMobileList` to nowy izolowany komponent, nie modyfikacja istniejących.
Stan expand trzymamy jako `Set<number>` (game.id) w `useState` wewnątrz komponentu.
Chevron robi `e.stopPropagation()` + toggle, reszta karty → navigate.
Na mobile toggle grid/list jest ukryty — zawsze renderujemy `GamesMobileList`.
Nie używamy żadnych dodatkowych bibliotek — tylko React + istniejące komponenty.

## Visual spec

**Karta (collapsed)**
```
┌──────────────────────────────────────────────────┐
│  [Avatar]  Tytuł gry          ↓                  │
│            Developer                             │
└──────────────────────────────────────────────────┘
```
Styl identyczny z wierszem CardsTable:
- `bg-white rounded-[10px] border border-apex-line-3`
- padding: `px-4 py-[9px]`
- spacing między kartami: `mb-1`
- Avatar: `shape="rect" size={40} name={game.title} color={game.coverColor}`
- Tytuł: `text-[13.5px] font-semibold leading-[1.35] text-apex-ink truncate`
- Developer: `text-[11.5px] leading-[1.35] text-apex-faint`
- Chevron: `Icon.chevdown` / `Icon.chevup` size=14 `text-apex-faint`

**Karta (expanded)**
```
┌──────────────────────────────────────────────────┐
│  [Avatar]  Tytuł gry          ↑                  │
│            Developer                             │
├──────────────────────────────────────────────────┤
│  PLATFORM       PlayStation 5                    │
│  FORMAT         Physical                         │
│  RELEASE YEAR   2023                             │
└──────────────────────────────────────────────────┘
```
Sekcja szczegółów:
- `border-t border-apex-line-3 px-4 py-[9px] space-y-[6px]`
- każdy wiersz: `flex items-center justify-between`
- label: `text-[11px] font-semibold uppercase tracking-[0.07em] text-apex-faint`
- wartość: `text-[13px] text-apex-ink`
- brak wartości (releaseYear null): `<span className="text-apex-hint">—</span>`

**Hover efekt karty** (żeby było spójne z desktop):
- `hover:bg-apex-surface-hover2` na głównym div karty (tak jak `group-hover` w CardsTable)

## Relevant files (edit only these)

- `apps/client/src/pages/games-mobile-list.tsx` — NOWY plik, tu cały komponent
- `apps/client/src/pages/games.tsx` — `PER_PAGE`, ukrycie toggle, restrukturyzacja viewMode bloku

### Files to read but NOT edit

- `apps/client/src/types.ts` — typ `Game`, `GameFormat`, `GamePlatform`
- `apps/client/src/components/avatar.tsx` — propsy Avatar
- `apps/client/src/components/icons.tsx` — dostępne ikony
- `apps/client/src/pages/games-columns.tsx` — Title cell do skopiowania wizualnie

## Constraints

- NIE modyfikuj `data-table.tsx`, `games-columns.tsx`, `games-grid.tsx`
- NIE dodawaj nowych zależności npm/bun
- NIE pisz custom CSS — Tailwind only
- `GamesMobileList` eksportuje TYLKO jeden named export: `GamesMobileList`
- format: `game.format === 'physical' ? 'Physical' : 'Digital'` (tak jak w columns)
- releaseYear może być null — obsłuż (pokaż `—`)
- Karta cała jest klikalną nawigacją — TYLKO chevron robi stopPropagation

## Steps

### Step 1: Utwórz `games-mobile-list.tsx`

**Co robimy:**

1. Utwórz plik `apps/client/src/pages/games-mobile-list.tsx`

2. Implementuj komponent:

```tsx
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Avatar } from '@/components/avatar';
import { Icon } from '@/components/icons';
import type { Game } from '@/types';

export function GamesMobileList({ items }: { items: Game[] }) {
  const navigate = useNavigate();
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  const toggle = (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpanded(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  return (
    <div>
      {items.map(game => {
        const isExpanded = expanded.has(game.id);
        return (
          <div
            key={game.id}
            className="mb-1 overflow-hidden rounded-[10px] border border-apex-line-3 bg-white transition-colors hover:bg-apex-surface-hover2 cursor-pointer"
            onClick={() => navigate(`/games/${game.id}`)}
          >
            {/* Header — identyczny z Title cell */}
            <div className="flex items-center gap-[11px] px-4 py-[9px]">
              <Avatar
                shape="rect"
                size={40}
                name={game.title}
                color={game.coverColor}
              />
              <div className="flex-1 min-w-0">
                <div className="text-[13.5px] font-semibold leading-[1.35] text-apex-ink truncate">
                  {game.title}
                </div>
                <div className="text-[11.5px] leading-[1.35] text-apex-faint">
                  {game.developer}
                </div>
              </div>
              <button
                type="button"
                onClick={(e) => toggle(game.id, e)}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md transition-colors hover:bg-apex-surface-head"
                aria-label={isExpanded ? 'Collapse' : 'Expand'}
              >
                {isExpanded
                  ? <Icon.chevup size={14} className="text-apex-faint" />
                  : <Icon.chevdown size={14} className="text-apex-faint" />
                }
              </button>
            </div>

            {/* Expanded details */}
            {isExpanded && (
              <div className="border-t border-apex-line-3 px-4 py-[9px] space-y-[6px]">
                <DetailRow label="Platform" value={game.platform} />
                <DetailRow
                  label="Format"
                  value={game.format === 'physical' ? 'Physical' : 'Digital'}
                />
                <DetailRow label="Release Year" value={game.releaseYear} />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string | number | null }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[11px] font-semibold uppercase tracking-[0.07em] text-apex-faint">
        {label}
      </span>
      {value != null
        ? <span className="text-[13px] text-apex-ink">{value}</span>
        : <span className="text-[13px] text-apex-hint">—</span>
      }
    </div>
  );
}
```

3. Uruchom `bun run check` — zero błędów typecheck.

**Rezultat:** plik istnieje, kompiluje się, eksportuje `GamesMobileList`.

---

### Step 2: Zaktualizuj `games.tsx`

**Co robimy:**

1. Zmień `PER_PAGE` z `7` na `10` (linia 21):
```tsx
const PER_PAGE = 10;
```

2. Dodaj import na górze pliku:
```tsx
import { GamesMobileList } from './games-mobile-list';
```

3. Znajdź div z przyciskami grid/list toggle (zawiera dwa `<button>` z SVG, linia ~87).
   Dodaj `hidden md:flex` do klasy wrappera tego diva:
```tsx
<div className="hidden md:flex overflow-hidden rounded-[7px] border border-[#eee]">
```

4. Znajdź blok renderowania widoku (linia ~193-200):
```tsx
{viewMode === 'grid' ? (
  <GamesGrid items={items} />
) : (
  <DataTable
    table={table}
    variant="cards"
    onRowClick={(row) => navigate(`/games/${row.original.id}`)}
  />
)}
```

5. Zastąp go nową strukturą — mobile zawsze karty, desktop grid lub lista:
```tsx
{/* Mobile: zawsze rozszerzalne karty */}
<div className="md:hidden">
  <GamesMobileList items={items} />
</div>

{/* Desktop: grid lub lista bez zmian */}
<div className="hidden md:block">
  {viewMode === 'grid' ? (
    <GamesGrid items={items} />
  ) : (
    <DataTable
      table={table}
      variant="cards"
      onRowClick={(row) => navigate(`/games/${row.original.id}`)}
    />
  )}
</div>
```

6. Uruchom `bun run check` — zero błędów.

**Rezultat:** `games.tsx` kompiluje się, oba warianty wyrenderowane pod właściwymi breakpointami, toggle niewidoczny na mobile.

---

### Step 3: Weryfikacja wizualna

**Co robimy:**

1. Uruchom dev server: `bun run dev` (lub sprawdź jak jest skonfigurowany w package.json)
2. Otwórz browser, DevTools → ustaw viewport 390px (iPhone 14)
3. Przejdź na `/games`
4. Sprawdź:
   - [ ] Brak poziomego scrollu
   - [ ] Toggle grid/list niewidoczny
   - [ ] Karty widoczne, styl jak tabela (białe, zaokrąglone, border)
   - [ ] Klik chevron → expand/collapse szczegółów (bez navigate)
   - [ ] Klik na kartę (poza chevronem) → navigate do `/games/:id`
   - [ ] Release Year null → wyświetla `—`
5. Ustaw viewport 1280px (desktop)
6. Sprawdź:
   - [ ] Toggle grid/list widoczny
   - [ ] List view: tabela widoczna jak przed zmianami
   - [ ] Grid view: siatka kart widoczna jak przed zmianami
   - [ ] Karty mobilne NIE widoczne

**Rezultat:** oba widoki działają, DoD spełniony.

---

## If you get stuck

Jeśli po 2 próbach coś nie działa: ZATRZYMAJ się. Napisz:
`STUCK at Step <N>: <co, jaki błąd, jaka hipoteza>`
Zakończ pracę.
