# Sidebar → shadcn — Faza 1: Instalacja i podpięcie SidebarProvider

## Goal
Zainstalować shadcn `sidebar` component i opakować `AppLayout` w `SidebarProvider` tak,
żeby layout wizualny nie zmienił się — sidebar nadal 248 px, fullscreen, bez collapse.

## Definition of Done
- [ ] Plik `apps/client/src/components/ui/sidebar.tsx` istnieje
- [ ] `AppLayout` opakowany `SidebarProvider` i renderuje się bez błędów
- [ ] `SIDEBAR_WIDTH` w `sidebar.tsx` = `"248px"`
- [ ] `bun run check` w `apps/client` czyste (zero TS errors)
- [ ] Strona wygląda identycznie jak przed zmianą

Agent kończy pracę WYŁĄCZNIE gdy powyższe są spełnione.

## Context
**Runtime:** Bun. CLI shadcn: `bunx shadcn@latest add sidebar -c apps/client`
**Framework:** Vite + React, Tailwind v3, styl new-york
**Layout:** fullscreen `h-screen w-screen overflow-hidden` — NIE używaj `SidebarInset`
**Collapse:** NIE chcemy collapse sidebar. Ustaw `defaultOpen={true}` i nie montuj `SidebarTrigger`

## Design decisions
- `SidebarProvider` zastępuje outer `<div className="flex h-screen ...">` w AppLayout
- Przekaż `className="flex h-screen w-screen overflow-hidden bg-white"` do `SidebarProvider`
  żeby zachować layout fullscreen
- `SIDEBAR_WIDTH` w `apps/client/src/components/ui/sidebar.tsx` zmień z `"16rem"` na `"248px"`
- Sidebar nie ma collapse — `defaultOpen` locked to `true`, nie potrzeba `SidebarRail`

## Files to read
- `apps/client/src/components/layout/app-layout.tsx` — current layout (opakuj SidebarProvider)
- `apps/client/src/components/layout/sidebar.tsx` — obecna implementacja (FAZA 2 ją przepisze)

## Relevant files (edit only these)
- `apps/client/src/components/ui/sidebar.tsx` — po instalacji: zmień `SIDEBAR_WIDTH`
- `apps/client/src/components/layout/app-layout.tsx` — dodaj SidebarProvider

---

## Steps

### Step 1: Zainstaluj shadcn sidebar
**Co robimy:**
```bash
cd /Users/kodari/projects/games
bunx shadcn@latest add sidebar -c apps/client
```
Poczekaj na zakończenie. Plik `apps/client/src/components/ui/sidebar.tsx` musi istnieć.

**Rezultat:** `sidebar.tsx` zainstalowany.

---

### Step 2: Skonfiguruj szerokość
**Co robimy:**
Otwórz `apps/client/src/components/ui/sidebar.tsx`.
Znajdź stałą `SIDEBAR_WIDTH` i zmień:
```ts
// PRZED
const SIDEBAR_WIDTH = "16rem"

// PO
const SIDEBAR_WIDTH = "248px"
```

**Rezultat:** stała ustawiona.

---

### Step 3: Opakuj AppLayout w SidebarProvider
**Co robimy:**
Przepisz `apps/client/src/components/layout/app-layout.tsx`:

```tsx
import { AddGameDialog } from '@/components/add-game-dialog';
import { SidebarProvider } from '@/components/ui/sidebar';
import { Outlet } from 'react-router-dom';
import { Sidebar } from './sidebar';

export function AppLayout() {
  return (
    <SidebarProvider
      defaultOpen={true}
      className="flex h-screen w-screen overflow-hidden bg-white"
    >
      <Sidebar />
      <main className="flex min-w-0 flex-1 flex-col overflow-hidden bg-white">
        <Outlet />
      </main>
      <AddGameDialog />
    </SidebarProvider>
  );
}
```

Następnie: `bun run check` w `apps/client`. Zero błędów TS wymagane.

**Rezultat:** AppLayout renderuje się. Layout wygląda identycznie (sidebar 248 px, fullscreen).

---

## If you get stuck
Jeśli po 2 próbach coś nie działa: ZATRZYMAJ się. Napisz:
`STUCK at Step <N>: <co, jaki błąd, jaka hipoteza>`
Zakończ pracę.
