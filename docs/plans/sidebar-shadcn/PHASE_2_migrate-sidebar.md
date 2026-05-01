# Sidebar → shadcn — Faza 2: Migracja sidebar internals

## Goal
Przepisać `layout/sidebar.tsx` używając shadcn primitives zachowując identyczny wygląd.
Ustawić CSS token żeby shadcn sidebar był biały.

## Definition of Done
- [ ] `layout/sidebar.tsx` używa `ShadcnSidebar`, `SidebarHeader`, `SidebarContent`,
  `SidebarFooter`, `SidebarMenu`, `SidebarMenuItem`, `SidebarMenuButton`
- [ ] `collapsible="offcanvas"` — sidebar chowa się na mobile i po kliknięciu triggera
- [ ] NavLink active state działa przez `useLocation().pathname.startsWith(entry.to)`
- [ ] UserCard z Radix DropdownMenu działa bez zmian
- [ ] Sidebar jest biały (nie szary z `bg-sidebar`)
- [ ] `bun run typecheck` w `apps/client` czyste

Agent kończy pracę WYŁĄCZNIE gdy powyższe są spełnione.

## Context
**Runtime:** Bun. `bun run typecheck` = `tsc -b --noEmit`.
**Router:** `react-router-dom` — `useLocation` do active state (NIE render prop `({ isActive })`)
**Naming conflict:** `Sidebar` eksportowany z tego pliku koliduje z `Sidebar` z `ui/sidebar`.
  Rozwiązanie: `import { Sidebar as ShadcnSidebar, ... } from '@/components/ui/sidebar'`
  Eksport `export function Sidebar()` zostaje bez zmian — żaden inny plik nie widzi różnicy.
**collapsible:** NIE używaj `collapsible="none"` — chcemy pełny offcanvas z animacją.

## Design decisions
- `<ShadcnSidebar collapsible="offcanvas">` zastępuje `<aside>`. Nie przekazuj border ani bg
  na `<ShadcnSidebar>` — te style idą przez CSS token i wewnętrzny `data-sidebar` div.
- Border-right: dodaj `group-data-[side=left]:border-apex-line-3` przez className na `<ShadcnSidebar>`
  albo zostaw domyślny border shadcn (cienki, akceptowalny).
- `SidebarHeader` wraps logo — identyczna treść, dodaj `className="border-b border-apex-line-5 px-4 pb-[14px] pt-4 h-auto"` żeby wyzerować domyślny padding shadcn.
- `SidebarContent` wraps main nav — domyślnie scrollowalny (overflow-auto), OK bo tylko 3 itemy.
- `SidebarFooter` wraps bottomNav + separator + UserCard — `className="pb-1"`.
- `SidebarMenu` + `SidebarMenuItem` + `SidebarMenuButton asChild` + `<NavLink>` — NavLink
  renderowany jako element button przez shadcn Slot.
- Klasy apex-* na `SidebarMenuButton`: `className={cn('rounded-[7px] px-4 py-[10px] text-[13.5px] select-none h-auto', active ? 'bg-[oklch(95%_0.02_220)] font-semibold text-apex-accent' : 'text-apex-ink-3 hover:bg-apex-surface-hover hover:text-apex-ink')}`.
  Prop `isActive={active}` też przekazuj — shadcn ustawia `data-active` który może być użyty w CSS.
- `addTo` Link zostaje absolutnie pozycjonowany wewnątrz `SidebarMenuItem` (relative).
- `SectionLabel` zostaje jako custom `<div>` — nie ma shadcn odpowiednika.
- `UserCard` — zero zmian, zostaje z Radix DropdownMenu.

## Files to read (before editing)
- `apps/client/src/components/ui/sidebar.tsx` — sprawdź dokładne eksporty
- `apps/client/src/components/layout/sidebar.tsx` — obecna impl

## Relevant files (edit only these)
- `apps/client/src/index.css` — dodaj CSS token
- `apps/client/src/components/layout/sidebar.tsx` — przepisz w całości

---

## Step 1: Ustaw CSS token dla białego tła
**Co robimy:**
Otwórz `apps/client/src/index.css`. Znajdź blok `:root {` i dodaj:
```css
--sidebar-background: 0 0% 100%;
--sidebar-foreground: var(--apex-ink, 222 47% 11%);
```
Jeśli nie ma `:root` — dodaj blok na początku pliku.

**Rezultat:** `bg-sidebar` = biały. Sidebar nie będzie szary.

---

## Step 2: Przepisz sidebar.tsx
**Co robimy:**
Zastąp cały plik. Schemat:

```tsx
import { Icon, type IconName } from '@/components/icons';
import { signOut, useSession } from '@/lib/auth-client';
import { cn } from '@/lib/utils';
import {
  Sidebar as ShadcnSidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { useQueryClient } from '@tanstack/react-query';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';

// NavEntry, mainNav, bottomNav — bez zmian

function NavRow({ entry }: { entry: NavEntry }) {
  const Svg = Icon[entry.icon];
  const { pathname } = useLocation();
  const active = pathname.startsWith(entry.to);

  return (
    <SidebarMenuItem className="relative mx-[6px]">
      <SidebarMenuButton
        asChild
        isActive={active}
        className={cn(
          'h-auto rounded-[7px] px-4 py-[10px] text-[13.5px] select-none',
          active
            ? 'bg-[oklch(95%_0.02_220)] font-semibold text-apex-accent'
            : 'text-apex-ink-3 hover:bg-apex-surface-hover hover:text-apex-ink',
        )}
      >
        <NavLink to={entry.to}>
          <span className={cn('flex h-[17px] w-[17px] shrink-0 items-center justify-center', active ? 'text-apex-accent' : 'opacity-55')}>
            <Svg size={14} />
          </span>
          <span className="flex-1">{entry.label}</span>
          {entry.addTo && <span className="w-[18px] shrink-0" />}
        </NavLink>
      </SidebarMenuButton>
      {entry.addTo && (
        <Link
          to={entry.addTo}
          className="absolute right-4 top-1/2 flex h-[18px] w-[18px] -translate-y-1/2 items-center justify-center rounded-[4px] bg-apex-accent text-white hover:bg-apex-accent/90"
          aria-label="Add new"
        >
          <Icon.plus size={11} />
        </Link>
      )}
    </SidebarMenuItem>
  );
}

// SectionLabel — bez zmian
// UserCard — bez zmian (Radix DropdownMenu)

export function Sidebar() {
  return (
    <ShadcnSidebar collapsible="offcanvas">
      <SidebarHeader className="h-auto border-b border-apex-line-5 px-4 pb-[14px] pt-4">
        {/* logo content — bez zmian */}
      </SidebarHeader>

      <SidebarContent>
        <SectionLabel>Main</SectionLabel>
        <SidebarMenu>
          {mainNav.map((n) => <NavRow key={n.label} entry={n} />)}
        </SidebarMenu>
      </SidebarContent>

      <SidebarFooter className="pb-1">
        <SidebarMenu>
          {bottomNav.map((n) => <NavRow key={n.label} entry={n} />)}
        </SidebarMenu>
        <div className="mx-[14px] mb-1 mt-[6px] h-px bg-apex-line-4" />
        <UserCard />
      </SidebarFooter>
    </ShadcnSidebar>
  );
}
```

**Rezultat:** sidebar.tsx kompiluje się.

---

## Step 3: Sprawdź
**Co robimy:**
```bash
cd apps/client && bun run typecheck
```
Typowe błędy i rozwiązania:
- `useLocation` wywołany poza `NavRow` → upewnij się że jest wewnątrz komponentu
- TS nie może znaleźć `SidebarGroupLabel` → nie importuj jeśli nie używasz
- `SidebarMenuButton` nie akceptuje `h-auto` → sprawdź czy className idzie przez `cn()`

**Rezultat:** zero TS errors.

---

## If you get stuck
Jeśli po 2 próbach coś nie działa: ZATRZYMAJ się. Napisz:
`STUCK at Step <N>: <co, jaki błąd, jaka hipoteza>`
Zakończ pracę.
