# Sidebar → shadcn — Faza 3: AppHeader + migracja stron

## Goal
Stworzyć `AppHeader` — jeden shared komponent headera ze stylem GamesPage.
Zastąpić nim `PageHeader` i inline header w GamesPage. Dodać `SidebarTrigger`.

## Definition of Done
- [ ] `AppHeader` istnieje w `components/layout/app-header.tsx`
- [ ] `SidebarTrigger` jest pierwszym elementem `AppHeader`
- [ ] `GamesPage` używa `AppHeader` zamiast inline `<div className="flex h-[63px]...">`
- [ ] `DataPage` i `DictionariesPage` używają `AppHeader` zamiast `PageHeader`
- [ ] `PageHeader` (`components/page-header.tsx`) usunięty
- [ ] `bun run typecheck` czyste

Agent kończy pracę WYŁĄCZNIE gdy powyższe są spełnione.

## Context
**Runtime:** Bun. `bun run typecheck` = `tsc -b --noEmit`.
**SidebarTrigger:** importowany z `@/components/ui/sidebar`. Renderuje button z ikoną PanelLeft.
  Domyślny rozmiar OK — nie stylizuj nadmiernie.
**Styl headera:** skopiowany z GamesPage: `flex h-[63px] shrink-0 items-center gap-3 border-b border-apex-line-3 bg-white px-4 lg:px-5`
**AppHeader nie zarządza tytułem/ikoną** — to children slot. Każda strona sama dostarcza content.

## Design decisions
- `AppHeader` = wrapper z `SidebarTrigger` + `{children}`. Zero logiki. Zero props poza `children` i opcjonalnym `className`.
- `SidebarTrigger` musi być używany wewnątrz drzewa `SidebarProvider` — jest już w `AppLayout`, więc OK.
- GamesPage: obecny inline header `<div className="flex h-[63px]...">` zastąpiony przez `<AppHeader>`. Cała wewnętrzna treść (icon, title, badge, search, actions) zostaje jako children — nie ruszaj jej.
- DataPage / DictionariesPage: `<PageHeader icon={...} title="..." />` zastąpiony przez:
  ```tsx
  <AppHeader>
    <span className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-[8px] bg-apex-ink text-white">
      <Icon.rows size={15} className="text-white" />
    </span>
    <span className="text-[15px] font-bold text-apex-ink">{title}</span>
  </AppHeader>
  ```
  Dopasuj styl icon+title do GamesPage (rounded-[8px] bg-apex-ink text-white, nie shadow-apex-1).
- `DictionariesPlatformsPage` — sprawdź czy używa `PageHeader`, jeśli tak to też zaktualizuj.
- Po migracji: usuń `components/page-header.tsx`. Upewnij się że żaden plik już go nie importuje.

## Files to read (before editing)
- `apps/client/src/pages/games.tsx` — linia ~65, obecny inline header
- `apps/client/src/pages/data.tsx` — użycie PageHeader
- `apps/client/src/pages/dictionaries.tsx` — użycie PageHeader
- `apps/client/src/pages/dictionaries-platforms.tsx` — sprawdź czy używa PageHeader
- `apps/client/src/components/page-header.tsx` — stary komponent do usunięcia

## Relevant files (edit only these)
- `apps/client/src/components/layout/app-header.tsx` — utwórz nowy
- `apps/client/src/pages/games.tsx` — podmień header
- `apps/client/src/pages/data.tsx` — podmień PageHeader
- `apps/client/src/pages/dictionaries.tsx` — podmień PageHeader
- `apps/client/src/pages/dictionaries-platforms.tsx` — podmień jeśli używa PageHeader
- `apps/client/src/components/page-header.tsx` — usuń plik

---

## Step 1: Utwórz AppHeader
**Co robimy:**
Utwórz `apps/client/src/components/layout/app-header.tsx`:

```tsx
import { SidebarTrigger } from '@/components/ui/sidebar';
import { cn } from '@/lib/utils';
import type { ReactNode } from 'react';

export function AppHeader({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn('flex h-[63px] shrink-0 items-center gap-3 border-b border-apex-line-3 bg-white px-4 lg:px-5', className)}>
      <SidebarTrigger className="shrink-0 text-apex-ink-3 hover:text-apex-ink" />
      {children}
    </div>
  );
}
```

**Rezultat:** plik istnieje, kompiluje się.

---

## Step 2: Zaktualizuj GamesPage
**Co robimy:**
W `apps/client/src/pages/games.tsx`:
1. Dodaj import: `import { AppHeader } from '@/components/layout/app-header';`
2. Znajdź `<div className="flex h-[63px] shrink-0 items-center gap-3 border-b border-apex-line-3 bg-white px-4 lg:px-5">` — zastąp otwierający i zamykający tag przez `<AppHeader>` / `</AppHeader>`.
3. Cała zawartość (icon, title, badge, search, view toggle, actions) zostaje bez zmian jako children.

**Rezultat:** GamesPage renderuje się z triggerem jako pierwszym elementem headera.

---

## Step 3: Zaktualizuj pozostałe strony + usuń PageHeader
**Co robimy:**

**data.tsx, dictionaries.tsx, dictionaries-platforms.tsx (jeśli używa PageHeader):**
Zastąp `<PageHeader icon={<Icon.X size={20} />} title="Y" />` przez:
```tsx
<AppHeader>
  <span className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-[8px] bg-apex-ink text-white">
    <Icon.X size={15} className="text-white" />
  </span>
  <span className="text-[15px] font-bold text-apex-ink">Y</span>
</AppHeader>
```
Dodaj import `AppHeader`, usuń import `PageHeader` i import `Icon` jeśli nie był wcześniej.

**Usuń stary komponent:**
```bash
rm apps/client/src/components/page-header.tsx
```

**Sprawdź typecheck:**
```bash
cd apps/client && bun run typecheck
```
Zero errors wymagane.

**Rezultat:** wszystkie strony mają spójny header. PageHeader nie istnieje.

---

## If you get stuck
Jeśli po 2 próbach coś nie działa: ZATRZYMAJ się. Napisz:
`STUCK at Step <N>: <co, jaki błąd, jaka hipoteza>`
Zakończ pracę.
